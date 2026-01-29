// backend/src/appium/actions/image.ts

import type { Browser } from 'webdriverio';
import type { ActionResult, RetryOptions, DriverProvider, ImageMatchResult } from './types';
import { ActionsBase, isRetryableError, isSessionCrashedError } from './utils';
import { imageMatchService } from '../../services/imageMatch';
import { imageMatchEmitter } from '../../services/screenshotEventService';
import type { ImageMatchOptions } from '../../types';

/**
 * 이미지 관련 액션 (tapImage, waitUntilImage, imageExists 등)
 */
export class ImageActions extends ActionsBase {
  private driverProvider: DriverProvider;

  constructor(driverProvider: DriverProvider, deviceId: string) {
    super(deviceId);
    this.driverProvider = driverProvider;
  }

  private async getDriver(): Promise<Browser> {
    return await this.driverProvider();
  }

  /**
   * 백엔드에서 이미지 매칭 수행 (스크린샷 캡처 후 OpenCV 매칭 + 하이라이트)
   */
  private async matchOnBackend(
    templateId: string,
    options: ImageMatchOptions = {}
  ): Promise<ImageMatchResult> {
    const { threshold = 0.8, region } = options;
    const startTime = Date.now();

    try {
      const driver = await this.getDriver();
      const screenshot = await driver.takeScreenshot();
      const screenshotBuffer = Buffer.from(screenshot, 'base64');

      // 컨텍스트가 있을 때만 하이라이트 생성 (에디터 테스트에서는 스킵)
      const hasContext = imageMatchEmitter.hasContext(this.deviceId);

      if (hasContext) {
        // 전체 시나리오 실행: 하이라이트 포함 매칭
        const result = await imageMatchService.matchAndHighlight(
          screenshotBuffer,
          templateId,
          { threshold, region }
        );

        const matchTime = Date.now() - startTime;

        return {
          found: result.matchResult.found,
          x: result.centerX,
          y: result.centerY,
          width: result.matchResult.width,
          height: result.matchResult.height,
          confidence: result.matchResult.confidence,
          matchTime,
          highlightedBuffer: result.highlightedBuffer || undefined,
        };
      } else {
        // 에디터 테스트: 하이라이트 없이 매칭만
        const matchResult = await imageMatchService.matchTemplate(
          screenshotBuffer,
          templateId,
          { threshold, region }
        );

        const matchTime = Date.now() - startTime;

        return {
          found: matchResult.found,
          x: matchResult.x + Math.floor(matchResult.width / 2),
          y: matchResult.y + Math.floor(matchResult.height / 2),
          width: matchResult.width,
          height: matchResult.height,
          confidence: matchResult.confidence,
          matchTime,
          highlightedBuffer: undefined, // 에디터 테스트에서는 하이라이트 없음
        };
      }
    } catch (error) {
      console.log(`[${this.deviceId}] 백엔드 매칭 오류: ${(error as Error).message}`);
      return {
        found: false,
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        confidence: 0,
      };
    }
  }

  /**
   * 이미지 탭
   */
  async tapImage(
    templateId: string,
    options: ImageMatchOptions & RetryOptions & { nodeId?: string } = {}
  ): Promise<ActionResult> {
    const { threshold = 0.8, region, retryCount = 3, retryDelay = 1000, nodeId } = options;
    const template = imageMatchService.getTemplate(templateId);
    const templateName = template?.name || templateId;
    let maxConfidence = 0;
    let attempts = 0;

    console.log(`[${this.deviceId}] 이미지 탭 시도: ${templateName} (threshold: ${(threshold * 100).toFixed(0)}%)`);

    return this.withRetry(
      async () => {
        this.checkStop();
        attempts++;

        const result = await this.matchOnBackend(templateId, { threshold, region });

        if (result.confidence > maxConfidence) {
          maxConfidence = result.confidence;
        }

        if (result.found) {
          console.log(`[${this.deviceId}] 이미지 발견: ${templateName} at (${result.x}, ${result.y}), confidence: ${(result.confidence * 100).toFixed(1)}%`);

          if (nodeId && result.highlightedBuffer) {
            imageMatchEmitter.emitMatchSuccess({
              deviceId: this.deviceId,
              nodeId,
              templateId,
              confidence: result.confidence,
              highlightedBuffer: result.highlightedBuffer,
              matchRegion: {
                x: result.x - Math.floor(result.width / 2),
                y: result.y - Math.floor(result.height / 2),
                width: result.width,
                height: result.height,
              },
              timestamp: new Date().toISOString(),
            });
          }

          // 탭 수행
          const driver = await this.getDriver();
          await driver
            .action('pointer', { parameters: { pointerType: 'touch' } })
            .move({ x: Math.floor(result.x), y: Math.floor(result.y) })
            .down()
            .up()
            .perform();

          return {
            success: true,
            action: 'tapImage',
            templateId,
            x: result.x,
            y: result.y,
            confidence: result.confidence,
            matchTime: result.matchTime,
          };
        }

        const thresholdPercent = (threshold * 100).toFixed(0);
        const currentPercent = (result.confidence * 100).toFixed(1);
        const maxPercent = (maxConfidence * 100).toFixed(1);
        throw new Error(`이미지를 찾을 수 없음: ${templateName} (필요: ${thresholdPercent}%, 현재: ${currentPercent}%, 최대: ${maxPercent}%, 시도: ${attempts}회)`);
      },
      {
        retryCount,
        retryDelay,
        shouldRetry: (error) => {
          return error.message.includes('이미지를 찾을 수 없음') || isRetryableError(error);
        },
      }
    );
  }

  /**
   * 이미지가 나타날 때까지 대기
   */
  async waitUntilImage(
    templateId: string,
    timeout: number = 30000,
    interval: number = 1000,
    options: ImageMatchOptions & { tapAfterWait?: boolean; nodeId?: string } = {}
  ): Promise<ActionResult> {
    const { threshold = 0.8, region, tapAfterWait = false, nodeId } = options;
    const template = imageMatchService.getTemplate(templateId);
    const templateName = template?.name || templateId;
    let maxConfidence = 0;
    let attempts = 0;

    const actionDesc = tapAfterWait ? '이미지 대기 후 탭' : '이미지 나타남 대기';
    console.log(`[${this.deviceId}] ${actionDesc}: ${templateName} (threshold: ${(threshold * 100).toFixed(0)}%)`);

    const pollResult = await this.pollUntil<ImageMatchResult>(
      async () => {
        attempts++;
        try {
          const result = await this.matchOnBackend(templateId, { threshold, region });
          if (result.confidence > maxConfidence) {
            maxConfidence = result.confidence;
          }

          if (result.found) {
            return { found: true, result };
          }

          return { found: false };
        } catch (err) {
          const error = err as Error;
          if (isSessionCrashedError(error)) {
            throw new Error(`세션 오류: ${templateName} 이미지 검색 중 세션이 종료됨 (${error.message})`);
          }
          return { found: false };
        }
      },
      { timeout, interval }
    );

    if (pollResult.success && pollResult.result) {
      const result = pollResult.result;

      if (nodeId && result.highlightedBuffer) {
        imageMatchEmitter.emitMatchSuccess({
          deviceId: this.deviceId,
          nodeId,
          templateId,
          confidence: result.confidence,
          highlightedBuffer: result.highlightedBuffer,
          matchRegion: {
            x: result.x - Math.floor(result.width / 2),
            y: result.y - Math.floor(result.height / 2),
            width: result.width,
            height: result.height,
          },
          timestamp: new Date().toISOString(),
        });
      }

      if (tapAfterWait && result.x !== undefined && result.y !== undefined) {
        await new Promise(resolve => setTimeout(resolve, 500));
        console.log(`[${this.deviceId}] 이미지 발견, 탭 실행: ${templateName} (${result.x}, ${result.y})`);

        const driver = await this.getDriver();
        await driver
          .action('pointer', { parameters: { pointerType: 'touch' } })
          .move({ x: Math.floor(result.x), y: Math.floor(result.y) })
          .down()
          .up()
          .perform();
      }

      console.log(`[${this.deviceId}] ${actionDesc} 완료: ${templateName} (${pollResult.waited}ms, confidence: ${(result.confidence * 100).toFixed(1)}%)`);

      return {
        success: true,
        action: tapAfterWait ? 'waitUntilImageAndTap' : 'waitUntilImage',
        templateId,
        waited: pollResult.waited,
        x: result.x,
        y: result.y,
        confidence: result.confidence,
        matchTime: result.matchTime,
        tapped: tapAfterWait,
      };
    }

    const thresholdPercent = (threshold * 100).toFixed(0);
    const maxConfidencePercent = (maxConfidence * 100).toFixed(1);
    throw new Error(`타임아웃: ${templateName} 이미지가 ${timeout}ms 내에 나타나지 않음 (필요: ${thresholdPercent}%, 최대 매칭률: ${maxConfidencePercent}%, 시도: ${attempts}회)`);
  }

  /**
   * 이미지가 사라질 때까지 대기
   */
  async waitUntilImageGone(
    templateId: string,
    timeout: number = 30000,
    interval: number = 1000,
    options: ImageMatchOptions = {}
  ): Promise<ActionResult> {
    const { threshold = 0.8, region } = options;
    const template = imageMatchService.getTemplate(templateId);
    const templateName = template?.name || templateId;
    let lastConfidence = 0;
    let attempts = 0;

    console.log(`[${this.deviceId}] 이미지 사라짐 대기: ${templateName} (threshold: ${(threshold * 100).toFixed(0)}%)`);

    const pollResult = await this.pollUntil<{ lastConfidence: number }>(
      async () => {
        attempts++;
        try {
          const result = await this.matchOnBackend(templateId, { threshold, region });
          lastConfidence = result.confidence;

          if (!result.found) {
            return { found: true, result: { lastConfidence } };
          }

          return { found: false };
        } catch (err) {
          const error = err as Error;
          if (isSessionCrashedError(error)) {
            throw new Error(`세션 오류: ${templateName} 이미지 검색 중 세션이 종료됨 (${error.message})`);
          }
          return { found: true, result: { lastConfidence } };
        }
      },
      { timeout, interval }
    );

    if (pollResult.success) {
      console.log(`[${this.deviceId}] 이미지 사라짐 확인: ${templateName} (${pollResult.waited}ms, 마지막 매칭률: ${(lastConfidence * 100).toFixed(1)}%)`);
      return {
        success: true,
        action: 'waitUntilImageGone',
        templateId,
        waited: pollResult.waited,
      };
    }

    const thresholdPercent = (threshold * 100).toFixed(0);
    const lastConfidencePercent = (lastConfidence * 100).toFixed(1);
    throw new Error(`타임아웃: ${templateName} 이미지가 ${timeout}ms 내에 사라지지 않음 (threshold: ${thresholdPercent}%, 마지막 매칭률: ${lastConfidencePercent}%, 시도: ${attempts}회)`);
  }

  /**
   * 이미지 존재 여부 확인
   */
  async imageExists(
    templateId: string,
    options: ImageMatchOptions = {}
  ): Promise<{ success: boolean; exists: boolean; confidence: number; x?: number; y?: number }> {
    const { threshold, region } = options;
    const template = imageMatchService.getTemplate(templateId);
    const templateName = template?.name || templateId;

    try {
      const result = await this.matchOnBackend(templateId, { threshold, region });

      console.log(`[${this.deviceId}] 이미지 존재 확인: ${templateName} = ${result.found} (confidence: ${(result.confidence * 100).toFixed(1)}%)`);

      return {
        success: true,
        exists: result.found,
        confidence: result.confidence,
        x: result.found ? result.x : undefined,
        y: result.found ? result.y : undefined,
      };
    } catch (err) {
      const error = err as Error;
      if (isSessionCrashedError(error)) {
        throw new Error(`세션 오류: ${templateName} 이미지 확인 중 세션이 종료됨 (${error.message})`);
      }
      console.log(`[${this.deviceId}] 이미지 확인 실패: ${error.message}`);
      return { success: true, exists: false, confidence: 0 };
    }
  }
}
