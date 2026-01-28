// backend/src/appium/actions/text.ts

import type { Browser } from 'webdriverio';
import type { ActionResult, DriverProvider, SelectorStrategy } from './types';
import { ActionsBase, buildSelector, isRetryableError, isSessionCrashedError } from './utils';
import { textMatcher } from '../../services/textMatcher';
import { imageMatchEmitter } from '../../services/screenshotEventService';
import type { TextMatchType, SearchRegion } from '../../services/textMatcher/types';

/**
 * 텍스트 관련 액션 (inputText, clearText, tapText, tapTextOcr 등)
 */
export class TextActions extends ActionsBase {
  private driverProvider: DriverProvider;

  constructor(driverProvider: DriverProvider, deviceId: string) {
    super(deviceId);
    this.driverProvider = driverProvider;
  }

  private async getDriver(): Promise<Browser> {
    return await this.driverProvider();
  }

  /**
   * 현재 포커스된 요소의 텍스트 클리어
   */
  async clearText(): Promise<ActionResult> {
    const driver = await this.getDriver();

    try {
      const focusedElement = await driver.$('*:focus');
      if (await focusedElement.isExisting()) {
        await focusedElement.clearValue();
        console.log(`[${this.deviceId}] 텍스트 클리어`);
      } else {
        console.log(`[${this.deviceId}] 활성 요소 없음, 클리어 스킵`);
      }
    } catch {
      console.log(`[${this.deviceId}] 활성 요소 없음, 클리어 스킵`);
    }

    return { success: true, action: 'clearText' };
  }

  /**
   * 요소에 텍스트 입력 (selector 기반)
   */
  async inputText(
    selector: string,
    text: string,
    strategy: SelectorStrategy = 'id'
  ): Promise<ActionResult> {
    const driver = await this.getDriver();
    const element = await driver.$(buildSelector(selector, strategy));

    await element.setValue(text);

    console.log(`[${this.deviceId}] 텍스트 입력: "${text}"`);
    return { success: true, action: 'inputText', text };
  }

  /**
   * 현재 포커스된 요소에 텍스트 입력 (selector 없이)
   */
  async typeText(text: string): Promise<ActionResult> {
    const driver = await this.getDriver();

    try {
      const focusedElement = await driver.$('*:focus');
      if (await focusedElement.isExisting()) {
        await focusedElement.setValue(text);
      } else {
        await driver.keys(text.split(''));
      }
    } catch {
      await driver.keys(text.split(''));
    }

    console.log(`[${this.deviceId}] 텍스트 타이핑: "${text}"`);
    return { success: true, action: 'typeText', text };
  }

  /**
   * 랜덤 문자열 생성
   */
  private generateRandomString(
    length: number,
    charset: 'alphanumeric' | 'alpha' | 'numeric' = 'alphanumeric'
  ): string {
    const charsets = {
      alphanumeric: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
      alpha: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
      numeric: '0123456789',
    };
    const chars = charsets[charset];
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * 랜덤 텍스트 생성 후 입력
   * @param options.prefix - 접두사 (예: "Player_")
   * @param options.suffix - 접미사 (예: "_KR")
   * @param options.length - 랜덤 부분 길이 (기본: 6)
   * @param options.charset - 문자셋 ('alphanumeric' | 'alpha' | 'numeric')
   */
  async typeRandomText(options: {
    prefix?: string;
    suffix?: string;
    length?: number;
    charset?: 'alphanumeric' | 'alpha' | 'numeric';
  } = {}): Promise<ActionResult & { generatedText: string }> {
    const {
      prefix = '',
      suffix = '',
      length = 6,
      charset = 'alphanumeric',
    } = options;

    const randomPart = this.generateRandomString(length, charset);
    const generatedText = `${prefix}${randomPart}${suffix}`;

    console.log(`[${this.deviceId}] 랜덤 텍스트 생성: "${generatedText}"`);

    // typeText 로직 재사용
    const driver = await this.getDriver();

    try {
      const focusedElement = await driver.$('*:focus');
      if (await focusedElement.isExisting()) {
        await focusedElement.setValue(generatedText);
      } else {
        await driver.keys(generatedText.split(''));
      }
    } catch {
      await driver.keys(generatedText.split(''));
    }

    console.log(`[${this.deviceId}] 랜덤 텍스트 입력 완료: "${generatedText}"`);
    return {
      success: true,
      action: 'typeRandomText',
      generatedText,
      prefix,
      suffix,
      length,
      charset,
    };
  }

  /**
   * 텍스트가 포함된 요소 탭
   */
  async tapText(text: string): Promise<ActionResult> {
    const driver = await this.getDriver();

    const selector = `android=new UiSelector().textContains("${text}")`;
    const element = await driver.$(selector);

    if (!element || !(await element.isExisting())) {
      throw new Error(`텍스트 "${text}"를 포함한 요소를 찾을 수 없습니다.`);
    }

    await element.click();

    console.log(`[${this.deviceId}] 텍스트 탭: "${text}"`);
    return { success: true, action: 'tapText', text };
  }

  /**
   * OCR로 텍스트를 찾아 탭
   */
  async tapTextOcr(
    text: string,
    options: {
      matchType?: TextMatchType;
      caseSensitive?: boolean;
      region?: SearchRegion;
      index?: number;
      offset?: { x: number; y: number };
      retryCount?: number;
      retryDelay?: number;
      nodeId?: string;
    } = {}
  ): Promise<ActionResult> {
    const {
      matchType = 'contains',
      caseSensitive = false,
      region,
      index = 0,
      offset = { x: 0, y: 0 },
      retryCount = 3,
      retryDelay = 1000,
      nodeId,
    } = options;

    console.log(`[${this.deviceId}] 텍스트 탭 (OCR): "${text}"`);

    return this.withRetry(
      async () => {
        this.checkStop();

        const driver = await this.getDriver();
        const screenshot = await driver.takeScreenshot();
        const screenshotBuffer = Buffer.from(screenshot, 'base64');

        const result = await textMatcher.findTextAndHighlight(screenshotBuffer, text, {
          matchType,
          caseSensitive,
          region,
          index,
          offset,
        });

        if (!result.found || !result.tapX || !result.tapY || !result.match) {
          throw new Error(`텍스트를 찾을 수 없음: "${text}"`);
        }

        console.log(`[${this.deviceId}] 텍스트 발견: "${text}" at (${result.tapX}, ${result.tapY})`);

        if (nodeId && result.highlightedBuffer) {
          imageMatchEmitter.emitTextMatchSuccess({
            deviceId: this.deviceId,
            nodeId,
            searchText: text,
            foundText: result.match.text,
            confidence: result.match.confidence,
            highlightedBuffer: result.highlightedBuffer,
            matchRegion: result.match.boundingBox,
            centerX: result.match.centerX,
            centerY: result.match.centerY,
            timestamp: new Date().toISOString(),
          });
        }

        // 탭 수행 (직접 구현)
        await driver
          .action('pointer', { parameters: { pointerType: 'touch' } })
          .move({ x: Math.floor(result.tapX), y: Math.floor(result.tapY) })
          .down()
          .up()
          .perform();

        return {
          success: true,
          action: 'tapTextOcr',
          text,
          foundText: result.match.text,
          x: result.tapX,
          y: result.tapY,
          confidence: result.match.confidence,
          ocrTime: result.processingTime,
          matchRegion: result.match.boundingBox,
        };
      },
      {
        retryCount,
        retryDelay,
        shouldRetry: (error) => {
          return error.message.includes('텍스트를 찾을 수 없음') || isRetryableError(error);
        },
      }
    );
  }

  /**
   * OCR로 텍스트가 나타날 때까지 대기
   */
  async waitUntilTextOcr(
    text: string,
    timeout: number = 30000,
    interval: number = 1000,
    options: {
      matchType?: TextMatchType;
      caseSensitive?: boolean;
      region?: SearchRegion;
      tapAfterWait?: boolean;
      nodeId?: string;
    } = {}
  ): Promise<ActionResult> {
    const { matchType = 'contains', caseSensitive = false, region, tapAfterWait = false, nodeId } = options;

    console.log(`[${this.deviceId}] 텍스트 나타남 대기 (OCR): "${text}"`);

    type OcrMatchResult = Awaited<ReturnType<typeof textMatcher.findTextAndHighlight>>;

    const pollResult = await this.pollUntil<OcrMatchResult>(
      async () => {
        try {
          const driver = await this.getDriver();
          const screenshot = await driver.takeScreenshot();
          const screenshotBuffer = Buffer.from(screenshot, 'base64');

          const result = await textMatcher.findTextAndHighlight(screenshotBuffer, text, {
            matchType,
            caseSensitive,
            region,
          });

          if (result.found && result.match) {
            return { found: true, result };
          }

          return { found: false };
        } catch (err) {
          const error = err as Error;
          if (isSessionCrashedError(error)) {
            throw new Error(`세션 오류: "${text}" 텍스트 검색 중 세션이 종료됨`);
          }
          return { found: false };
        }
      },
      { timeout, interval }
    );

    if (pollResult.success && pollResult.result) {
      const result = pollResult.result;
      console.log(`[${this.deviceId}] 텍스트 나타남 확인 (OCR): "${text}" (${pollResult.waited}ms)`);

      if (nodeId && result.highlightedBuffer && result.match) {
        imageMatchEmitter.emitTextMatchSuccess({
          deviceId: this.deviceId,
          nodeId,
          searchText: text,
          foundText: result.match.text,
          confidence: result.match.confidence,
          highlightedBuffer: result.highlightedBuffer,
          matchRegion: result.match.boundingBox,
          centerX: result.match.centerX,
          centerY: result.match.centerY,
          timestamp: new Date().toISOString(),
        });
      }

      let tapped = false;
      if (tapAfterWait && result.tapX !== undefined && result.tapY !== undefined) {
        await new Promise(resolve => setTimeout(resolve, 500));
        console.log(`[${this.deviceId}] 대기 후 탭: (${result.tapX}, ${result.tapY})`);

        const driver = await this.getDriver();
        await driver
          .action('pointer', { parameters: { pointerType: 'touch' } })
          .move({ x: Math.floor(result.tapX), y: Math.floor(result.tapY) })
          .down()
          .up()
          .perform();
        tapped = true;
      }

      return {
        success: true,
        action: 'waitUntilTextOcr',
        text,
        foundText: result.match?.text,
        waited: pollResult.waited,
        x: result.tapX,
        y: result.tapY,
        confidence: result.match?.confidence,
        ocrTime: result.processingTime,
        tapped,
        matchRegion: result.match?.boundingBox,
      };
    }

    throw new Error(`타임아웃: "${text}" 텍스트가 ${timeout}ms 내에 나타나지 않음 (OCR)`);
  }

  /**
   * OCR로 텍스트가 사라질 때까지 대기
   */
  async waitUntilTextGoneOcr(
    text: string,
    timeout: number = 30000,
    interval: number = 1000,
    options: {
      matchType?: TextMatchType;
      caseSensitive?: boolean;
      region?: SearchRegion;
    } = {}
  ): Promise<ActionResult> {
    const { matchType = 'contains', caseSensitive = false, region } = options;

    console.log(`[${this.deviceId}] 텍스트 사라짐 대기 (OCR): "${text}"`);

    type OcrResult = { processingTime: number };

    const pollResult = await this.pollUntil<OcrResult>(
      async () => {
        try {
          const driver = await this.getDriver();
          const screenshot = await driver.takeScreenshot();
          const screenshotBuffer = Buffer.from(screenshot, 'base64');

          const result = await textMatcher.findText(screenshotBuffer, text, {
            matchType,
            caseSensitive,
            region,
          });

          if (!result.found) {
            return { found: true, result: { processingTime: result.processingTime } };
          }

          return { found: false };
        } catch (err) {
          const error = err as Error;
          if (isSessionCrashedError(error)) {
            throw new Error(`세션 오류: "${text}" 텍스트 검색 중 세션이 종료됨`);
          }
          return { found: true, result: { processingTime: 0 } };
        }
      },
      { timeout, interval }
    );

    if (pollResult.success) {
      console.log(`[${this.deviceId}] 텍스트 사라짐 확인 (OCR): "${text}" (${pollResult.waited}ms)`);
      return {
        success: true,
        action: 'waitUntilTextGoneOcr',
        text,
        waited: pollResult.waited,
        ocrTime: pollResult.result?.processingTime,
      };
    }

    throw new Error(`타임아웃: "${text}" 텍스트가 ${timeout}ms 내에 사라지지 않음 (OCR)`);
  }

  /**
   * OCR로 텍스트 존재 여부 검증
   */
  async assertTextOcr(
    text: string,
    options: {
      matchType?: TextMatchType;
      caseSensitive?: boolean;
      region?: SearchRegion;
      shouldExist?: boolean;
    } = {}
  ): Promise<ActionResult> {
    const {
      matchType = 'contains',
      caseSensitive = false,
      region,
      shouldExist = true,
    } = options;

    console.log(`[${this.deviceId}] 텍스트 검증 (OCR): "${text}" (shouldExist: ${shouldExist})`);

    try {
      const driver = await this.getDriver();
      const screenshot = await driver.takeScreenshot();
      const screenshotBuffer = Buffer.from(screenshot, 'base64');

      const result = await textMatcher.findText(screenshotBuffer, text, {
        matchType,
        caseSensitive,
        region,
      });

      const exists = result.found;
      const success = shouldExist ? exists : !exists;

      if (!success) {
        throw new Error(
          shouldExist
            ? `텍스트가 존재해야 하지만 찾을 수 없음: "${text}"`
            : `텍스트가 존재하지 않아야 하지만 발견됨: "${text}"`
        );
      }

      console.log(`[${this.deviceId}] 텍스트 검증 성공 (OCR): "${text}"`);
      return {
        success: true,
        action: 'assertTextOcr',
        text,
        exists,
        shouldExist,
        x: result.tapX,
        y: result.tapY,
        confidence: result.match?.confidence,
      };
    } catch (error) {
      return {
        success: false,
        action: 'assertTextOcr',
        text,
        error: (error as Error).message,
      };
    }
  }

  /**
   * OCR로 텍스트 존재 여부 확인 (조건 노드용)
   */
  async ocrTextExists(
    text: string,
    options: {
      matchType?: TextMatchType;
      caseSensitive?: boolean;
      region?: SearchRegion;
    } = {}
  ): Promise<{ success: boolean; exists: boolean; confidence: number; x?: number; y?: number }> {
    const { matchType = 'contains', caseSensitive = false, region } = options;

    console.log(`[${this.deviceId}] OCR 텍스트 존재 확인: "${text}"`);

    try {
      const driver = await this.getDriver();
      const screenshot = await driver.takeScreenshot();
      const screenshotBuffer = Buffer.from(screenshot, 'base64');

      const result = await textMatcher.findText(screenshotBuffer, text, {
        matchType,
        caseSensitive,
        region,
      });

      console.log(`[${this.deviceId}] OCR 텍스트 존재 확인: "${text}" = ${result.found} (confidence: ${((result.match?.confidence || 0) * 100).toFixed(1)}%)`);

      return {
        success: true,
        exists: result.found,
        confidence: result.match?.confidence || 0,
        x: result.found ? result.tapX : undefined,
        y: result.found ? result.tapY : undefined,
      };
    } catch (error) {
      console.log(`[${this.deviceId}] OCR 텍스트 확인 실패: ${(error as Error).message}`);
      return { success: true, exists: false, confidence: 0 };
    }
  }
}
