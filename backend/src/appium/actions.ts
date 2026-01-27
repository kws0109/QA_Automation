// backend/src/appium/actions.ts

import { Browser } from 'webdriverio';
import { imageMatchService } from '../services/imageMatch';
import { textMatcher } from '../services/textMatcher';
import { imageMatchEmitter } from '../services/screenshotEventService';
import type { ImageMatchOptions } from '../types';
import type { TextSearchOptions, TextMatchType, SearchRegion } from '../services/textMatcher/types';

// 액션 결과 인터페이스
interface ActionResult {
  success: boolean;
  action?: string;
  [key: string]: unknown;
}

// 재시도 옵션 인터페이스
interface RetryOptions {
  retryCount?: number;
  retryDelay?: number;
  onRetry?: (attempt: number, error: Error) => Promise<void>;
  shouldRetry?: (error: Error) => boolean;
}

// 요소 존재 결과
interface ElementExistsResult {
  success: boolean;
  exists: boolean;
  selector: string;
}

// 텍스트 포함 결과
interface TextContainsResult {
  success: boolean;
  contains: boolean;
  actualText?: string;
  expectedText?: string;
  error?: string;
}

// 요소 상태 결과
interface ElementStateResult {
  success: boolean;
  enabled?: boolean;
  displayed?: boolean;
  selector?: string;
  error?: string;
}

// 대기 결과
interface WaitResult {
  success: boolean;
  action: string;
  waited?: number;
  selector?: string;
  text?: string;
  tapped?: boolean;  // tapAfterWait 사용 시 탭 여부
}

type SelectorStrategy = 'id' | 'xpath' | 'accessibility id' | 'text';

// 드라이버 제공자 타입
type DriverProvider = () => Promise<Browser>;

export class Actions {
  private shouldStop: boolean = false;
  private defaultRetryCount: number = 3;
  private defaultRetryDelay: number = 1000;
  private driverProvider: DriverProvider;
  private deviceId: string;

  constructor(driverProvider: DriverProvider, deviceId: string = 'default') {
    this.driverProvider = driverProvider;
    this.deviceId = deviceId;
    this.shouldStop = false;
  }

  /**
   * 디바이스 ID 반환
   */
  getDeviceId(): string {
    return this.deviceId;
  }

  /**
   * 유효한 드라이버 가져오기
   */
  private async _getDriver(): Promise<Browser> {
    return await this.driverProvider();
  }

  /**
   * 중지 신호
   */
  stop(): void {
    this.shouldStop = true;
    console.log(`🛑 [${this.deviceId}] 액션 중지 요청`);
  }

  /**
   * 중지 상태 리셋
   */
  reset(): void {
    this.shouldStop = false;
  }

  /**
   * 중지 확인 헬퍼
   */
  private _checkStop(): void {
    if (this.shouldStop) {
      throw new Error('사용자에 의해 중지됨');
    }
  }

  /**
   * 백엔드에서 이미지 매칭 수행 (스크린샷 캡처 후 OpenCV 매칭 + 하이라이트)
   * @returns 매칭 결과 및 하이라이트 버퍼
   */
  private async _matchOnBackend(
    templateId: string,
    options: ImageMatchOptions = {}
  ): Promise<{
    found: boolean;
    x: number;
    y: number;
    width: number;
    height: number;
    confidence: number;
    matchTime?: number;
    highlightedBuffer?: Buffer;
  }> {
    const { threshold = 0.8, region } = options;
    const startTime = Date.now();

    try {
      // 1. Appium으로 스크린샷 캡처
      const driver = await this._getDriver();
      const screenshot = await driver.takeScreenshot();
      const screenshotBuffer = Buffer.from(screenshot, 'base64');

      // 2. 백엔드 OpenCV로 템플릿 매칭 + 하이라이트 생성
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
    } catch (error) {
      console.log(`⚠️ [${this.deviceId}] 백엔드 매칭 오류: ${(error as Error).message}`);
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
   * 재시도 래퍼 함수
   */
  async withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
    const {
      retryCount = this.defaultRetryCount,
      retryDelay = this.defaultRetryDelay,
      onRetry = null,
      shouldRetry = () => true,
    } = options;

    let lastError: Error = new Error('Unknown error');

    for (let attempt = 1; attempt <= retryCount; attempt++) {
      try {
        return await fn();
      } catch (e) {
        lastError = e as Error;

        if (this.shouldStop) {
          throw lastError;
        }

        if (!shouldRetry(lastError)) {
          throw lastError;
        }

        if (attempt === retryCount) {
          throw lastError;
        }

        console.log(`⚠️ [${this.deviceId}] 시도 ${attempt}/${retryCount} 실패: ${lastError.message}`);
        console.log(`   ${retryDelay}ms 후 재시도...`);

        if (onRetry) {
          await onRetry(attempt, lastError);
        }

        await this.wait(retryDelay);
      }
    }

    throw lastError;
  }

  /**
   * 재시도 가능한 에러인지 판단
   */
  /**
   * 세션이 크래시되었는지 확인 (즉시 실패 처리 필요)
   */
  isSessionCrashedError(error: Error): boolean {
    const crashMessages = [
      'instrumentation process is not running',
      'probably crashed',
      'session deleted',
      'invalid session id',
      'session not found',
      'A session is either terminated or not started',
    ];
    return crashMessages.some(msg => error.message.toLowerCase().includes(msg.toLowerCase()));
  }

  isRetryableError(error: Error): boolean {
    // 세션 크래시 에러는 재시도하지 않음
    if (this.isSessionCrashedError(error)) {
      return false;
    }

    const retryableMessages = [
      'no such element',
      'stale element',
      'element not interactable',
      'timeout',
      'ETIMEDOUT',
      'ECONNREFUSED',
      'session not created',
    ];

    const message = error.message?.toLowerCase() || '';
    return retryableMessages.some(msg => message.includes(msg.toLowerCase()));
  }

  /**
   * 셀렉터 빌드
   */
  private _buildSelector(selector: string, strategy: SelectorStrategy): string {
    switch (strategy) {
      case 'id':
        return `android=new UiSelector().resourceId("${selector}")`;
      case 'xpath':
        return selector;
      case 'accessibility id':
        return `~${selector}`;
      case 'text':
        return `android=new UiSelector().text("${selector}")`;
      default:
        return selector;
    }
  }

  // ========== 조건 검사 액션 ==========

  async elementExists(
    selector: string,
    strategy: SelectorStrategy = 'id',
    timeout: number = 3000
  ): Promise<ElementExistsResult> {
    const driver = await this._getDriver();

    try {
      const element = await driver.$(this._buildSelector(selector, strategy));
      await element.waitForExist({ timeout });

      console.log(`🔍 [${this.deviceId}] 요소 존재함: ${selector}`);
      return { success: true, exists: true, selector };
    } catch {
      console.log(`🔍 [${this.deviceId}] 요소 없음: ${selector}`);
      return { success: true, exists: false, selector };
    }
  }

  async elementTextContains(
    selector: string,
    text: string,
    strategy: SelectorStrategy = 'id',
    timeout: number = 3000
  ): Promise<TextContainsResult> {
    const driver = await this._getDriver();

    try {
      const element = await driver.$(this._buildSelector(selector, strategy));
      await element.waitForExist({ timeout });

      const elementText = await element.getText();
      const contains = elementText.includes(text);

      console.log(`🔍 [${this.deviceId}] 텍스트 확인: "${elementText}" contains "${text}" = ${contains}`);
      return { success: true, contains, actualText: elementText, expectedText: text };
    } catch (e) {
      const error = e as Error;
      console.log(`🔍 [${this.deviceId}] 텍스트 확인 실패: ${error.message}`);
      return { success: true, contains: false, error: error.message };
    }
  }

  async screenContainsText(
    text: string,
    timeout: number = 3000
  ): Promise<{ success: boolean; contains: boolean; text: string }> {
    const driver = await this._getDriver();

    try {
      const selector = `android=new UiSelector().textContains("${text}")`;
      const element = await driver.$(selector);
      await element.waitForExist({ timeout });

      console.log(`🔍 [${this.deviceId}] 화면에 텍스트 존재: "${text}"`);
      return { success: true, contains: true, text };
    } catch {
      console.log(`🔍 [${this.deviceId}] 화면에 텍스트 없음: "${text}"`);
      return { success: true, contains: false, text };
    }
  }

  async elementIsEnabled(
    selector: string,
    strategy: SelectorStrategy = 'id',
    timeout: number = 3000
  ): Promise<ElementStateResult> {
    const driver = await this._getDriver();

    try {
      const element = await driver.$(this._buildSelector(selector, strategy));
      await element.waitForExist({ timeout });

      const enabled = await element.isEnabled();

      console.log(`🔍 [${this.deviceId}] 요소 활성화 여부: ${selector} = ${enabled}`);
      return { success: true, enabled, selector };
    } catch (e) {
      const error = e as Error;
      console.log(`🔍 [${this.deviceId}] 요소 활성화 확인 실패: ${error.message}`);
      return { success: true, enabled: false, error: error.message };
    }
  }

  async elementIsDisplayed(
    selector: string,
    strategy: SelectorStrategy = 'id',
    timeout: number = 3000
  ): Promise<ElementStateResult> {
    const driver = await this._getDriver();

    try {
      const element = await driver.$(this._buildSelector(selector, strategy));
      await element.waitForExist({ timeout });

      const displayed = await element.isDisplayed();

      console.log(`🔍 [${this.deviceId}] 요소 표시 여부: ${selector} = ${displayed}`);
      return { success: true, displayed, selector };
    } catch (e) {
      const error = e as Error;
      console.log(`🔍 [${this.deviceId}] 요소 표시 확인 실패: ${error.message}`);
      return { success: true, displayed: false, error: error.message };
    }
  }

  async waitUntilGone(
    selector: string,
    strategy: SelectorStrategy = 'id',
    timeout: number = 30000,
    interval: number = 500
  ): Promise<WaitResult> {
    const driver = await this._getDriver();
    const startTime = Date.now();

    console.log(`⏳ [${this.deviceId}] 요소 사라짐 대기: ${selector}`);

    while (Date.now() - startTime < timeout) {
      this._checkStop();
      const iterationStart = Date.now();

      try {
        const element = await driver.$(this._buildSelector(selector, strategy));
        const exists = await element.isExisting();

        if (!exists) {
          const waited = Date.now() - startTime;
          console.log(`✅ [${this.deviceId}] 요소 사라짐 확인 (${waited}ms)`);
          return { success: true, action: 'waitUntilGone', waited, selector };
        }
      } catch {
        const waited = Date.now() - startTime;
        console.log(`✅ [${this.deviceId}] 요소 사라짐 확인 (${waited}ms)`);
        return { success: true, action: 'waitUntilGone', waited, selector };
      }

      // 순차 폴링: 이전 작업 완료 후 남은 시간만 대기
      const elapsed = Date.now() - iterationStart;
      const waitTime = Math.max(interval - elapsed, 0);
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    throw new Error(`타임아웃: ${selector}가 ${timeout}ms 내에 사라지지 않음`);
  }

  async waitUntilExists(
    selector: string,
    strategy: SelectorStrategy = 'id',
    timeout: number = 30000,
    interval: number = 500,
    options: { tapAfterWait?: boolean } = {}
  ): Promise<WaitResult> {
    const { tapAfterWait = false } = options;
    const driver = await this._getDriver();
    const startTime = Date.now();

    const actionDesc = tapAfterWait ? '요소 대기 후 탭' : '요소 나타남 대기';
    console.log(`⏳ [${this.deviceId}] ${actionDesc}: ${selector}`);

    while (Date.now() - startTime < timeout) {
      this._checkStop();
      const iterationStart = Date.now();

      try {
        const element = await driver.$(this._buildSelector(selector, strategy));
        const exists = await element.isExisting();

        if (exists) {
          const waited = Date.now() - startTime;

          // tapAfterWait 옵션이 true면 요소 탭
          if (tapAfterWait) {
            // UI 안정화를 위한 지연
            await new Promise(resolve => setTimeout(resolve, 500));
            console.log(`✅ [${this.deviceId}] 요소 발견, 탭 실행: ${selector}`);
            await element.click();
          }

          console.log(`✅ [${this.deviceId}] ${actionDesc} 완료 (${waited}ms)`);
          return {
            success: true,
            action: tapAfterWait ? 'waitUntilExistsAndTap' : 'waitUntilExists',
            waited,
            selector,
            tapped: tapAfterWait,
          };
        }
      } catch {
        // 아직 없음
      }

      // 순차 폴링: 이전 작업 완료 후 남은 시간만 대기
      const elapsed = Date.now() - iterationStart;
      const waitTime = Math.max(interval - elapsed, 0);
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    throw new Error(`타임아웃: ${selector}가 ${timeout}ms 내에 나타나지 않음`);
  }

  async waitUntilTextGone(
    text: string,
    timeout: number = 30000,
    interval: number = 500
  ): Promise<WaitResult> {
    const driver = await this._getDriver();
    const startTime = Date.now();

    console.log(`⏳ [${this.deviceId}] 텍스트 사라짐 대기: "${text}"`);

    while (Date.now() - startTime < timeout) {
      this._checkStop();
      const iterationStart = Date.now();

      try {
        const selector = `android=new UiSelector().textContains("${text}")`;
        const element = await driver.$(selector);
        const exists = await element.isExisting();

        if (!exists) {
          const waited = Date.now() - startTime;
          console.log(`✅ [${this.deviceId}] 텍스트 사라짐 확인 (${waited}ms)`);
          return { success: true, action: 'waitUntilTextGone', waited, text };
        }
      } catch {
        const waited = Date.now() - startTime;
        console.log(`✅ [${this.deviceId}] 텍스트 사라짐 확인 (${waited}ms)`);
        return { success: true, action: 'waitUntilTextGone', waited, text };
      }

      // 순차 폴링: 이전 작업 완료 후 남은 시간만 대기
      const elapsed = Date.now() - iterationStart;
      const waitTime = Math.max(interval - elapsed, 0);
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    throw new Error(`타임아웃: "${text}"가 ${timeout}ms 내에 사라지지 않음`);
  }

  async waitUntilTextExists(
    text: string,
    timeout: number = 30000,
    interval: number = 500,
    options: { tapAfterWait?: boolean } = {}
  ): Promise<WaitResult> {
    const { tapAfterWait = false } = options;
    const driver = await this._getDriver();
    const startTime = Date.now();

    const actionDesc = tapAfterWait ? '텍스트 대기 후 탭' : '텍스트 나타남 대기';
    console.log(`⏳ [${this.deviceId}] ${actionDesc}: "${text}"`);

    while (Date.now() - startTime < timeout) {
      this._checkStop();
      const iterationStart = Date.now();

      try {
        const selector = `android=new UiSelector().textContains("${text}")`;
        const element = await driver.$(selector);
        const exists = await element.isExisting();

        if (exists) {
          const waited = Date.now() - startTime;

          // tapAfterWait 옵션이 true면 요소 탭
          if (tapAfterWait) {
            console.log(`✅ [${this.deviceId}] 텍스트 발견, 탭 실행: "${text}"`);
            await element.click();
          }

          console.log(`✅ [${this.deviceId}] ${actionDesc} 완료 (${waited}ms)`);
          return {
            success: true,
            action: tapAfterWait ? 'waitUntilTextExistsAndTap' : 'waitUntilTextExists',
            waited,
            text,
            tapped: tapAfterWait,
          };
        }
      } catch {
        // 아직 없음
      }

      // 순차 폴링: 이전 작업 완료 후 남은 시간만 대기
      const elapsed = Date.now() - iterationStart;
      const waitTime = Math.max(interval - elapsed, 0);
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    throw new Error(`타임아웃: "${text}"가 ${timeout}ms 내에 나타나지 않음`);
  }

  async findElement(
    selector: string,
    strategy: SelectorStrategy = 'id',
    options: RetryOptions = {}
  ) {
    return this.withRetry(
      async () => {
        const driver = await this._getDriver();
        const builtSelector = this._buildSelector(selector, strategy);

        console.log(`🔍 [${this.deviceId}] 요소 찾기: ${selector} (${strategy})`);

        const element = await driver.$(builtSelector);
        const exists = await element.isExisting();

        if (!exists) {
          throw new Error(`요소를 찾을 수 없음: ${selector}`);
        }

        return element;
      },
      {
        retryCount: options.retryCount || 3,
        retryDelay: options.retryDelay || 1000,
        shouldRetry: (error) => this.isRetryableError(error),
      }
    );
  }

  async tapElement(
    selector: string,
    strategy: SelectorStrategy = 'id',
    options: RetryOptions = {}
  ): Promise<ActionResult> {
    return this.withRetry(
      async () => {
        const element = await this.findElement(selector, strategy, { retryCount: 1 });

        console.log(`👆 [${this.deviceId}] 요소 탭: ${selector}`);
        await element.click();

        return { success: true, action: 'tapElement', selector, strategy };
      },
      {
        retryCount: options.retryCount || 3,
        retryDelay: options.retryDelay || 1000,
        shouldRetry: (error) => this.isRetryableError(error),
      }
    );
  }

  async tap(x: number, y: number, options: RetryOptions = {}): Promise<ActionResult> {
    return this.withRetry(
      async () => {
        const driver = await this._getDriver();

        console.log(`👆 [${this.deviceId}] 탭: (${x}, ${y})`);

        await driver
          .action('pointer', { parameters: { pointerType: 'touch' } })
          .move({ x: Math.floor(x), y: Math.floor(y) })
          .down()
          .up()
          .perform();

        return { success: true, action: 'tap', x, y };
      },
      {
        retryCount: options.retryCount || 2,
        retryDelay: options.retryDelay || 500,
        shouldRetry: (error) => this.isRetryableError(error),
      }
    );
  }

  async longPress(x: number, y: number, duration: number = 1000): Promise<ActionResult> {
    const driver = await this._getDriver();

    await driver
      .action('pointer', { parameters: { pointerType: 'touch' } })
      .move({ x: Math.round(x), y: Math.round(y) })
      .down()
      .pause(duration)
      .up()
      .perform();

    console.log(`👆 [${this.deviceId}] 롱프레스: (${x}, ${y}), ${duration}ms`);
    return { success: true, action: 'longPress', x, y, duration };
  }

  async inputText(
    selector: string,
    text: string,
    strategy: SelectorStrategy = 'id'
  ): Promise<ActionResult> {
    const driver = await this._getDriver();
    const element = await driver.$(this._buildSelector(selector, strategy));

    await element.setValue(text);

    console.log(`⌨️ [${this.deviceId}] 텍스트 입력: "${text}"`);
    return { success: true, action: 'inputText', text };
  }

  async clickElement(
    selector: string,
    strategy: SelectorStrategy = 'id'
  ): Promise<ActionResult> {
    const driver = await this._getDriver();
    const element = await driver.$(this._buildSelector(selector, strategy));

    await element.click();

    console.log(`👆 [${this.deviceId}] 요소 클릭: ${selector}`);
    return { success: true, action: 'click', selector };
  }

  async wait(ms: number): Promise<ActionResult> {
    console.log(`⏳ [${this.deviceId}] 대기: ${ms}ms`);

    const interval = 100;
    let waited = 0;

    while (waited < ms) {
      this._checkStop();

      const waitTime = Math.min(interval, ms - waited);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      waited += waitTime;
    }

    return { success: true, action: 'wait', duration: ms };
  }

  async pressBack(): Promise<ActionResult> {
    const driver = await this._getDriver();
    await driver.execute('mobile: pressKey', { keycode: 4 });
    console.log(`⬅️ [${this.deviceId}] 뒤로 가기`);
    return { success: true, action: 'back' };
  }

  async pressHome(): Promise<ActionResult> {
    const driver = await this._getDriver();
    await driver.execute('mobile: pressKey', { keycode: 3 });
    console.log(`🏠 [${this.deviceId}] 홈 버튼`);
    return { success: true, action: 'home' };
  }

  async restartApp(): Promise<ActionResult> {
    const driver = await this._getDriver();
    const currentPackage = await driver.getCurrentPackage();

    await driver.terminateApp(currentPackage);
    await new Promise(resolve => setTimeout(resolve, 1000));
    await driver.activateApp(currentPackage);

    console.log(`🔄 [${this.deviceId}] 앱 재시작: ${currentPackage}`);
    return { success: true, action: 'restart', package: currentPackage };
  }

  async clearAppData(appPackage?: string): Promise<ActionResult> {
    const driver = await this._getDriver();
    const targetPackage = appPackage || await driver.getCurrentPackage();

    await driver.execute('mobile: shell', {
      command: 'pm',
      args: ['clear', targetPackage],
    });

    console.log(`🗑️ [${this.deviceId}] 앱 데이터 삭제: ${targetPackage}`);
    return { success: true, action: 'clearData', package: targetPackage };
  }

  async clearAppCache(appPackage?: string): Promise<ActionResult> {
    const driver = await this._getDriver();
    const targetPackage = appPackage || await driver.getCurrentPackage();

    await driver.execute('mobile: shell', {
      command: 'rm',
      args: ['-rf', `/data/data/${targetPackage}/cache/*`],
    });

    console.log(`🧹 [${this.deviceId}] 앱 캐시 삭제: ${targetPackage}`);
    return { success: true, action: 'clearCache', package: targetPackage };
  }

  // ========== 이미지 기반 액션 ==========

  async tapImage(
    templateId: string,
    options: ImageMatchOptions & RetryOptions & { nodeId?: string } = {}
  ): Promise<ActionResult> {
    const { threshold = 0.8, region, retryCount = 3, retryDelay = 1000, nodeId } = options;
    const template = imageMatchService.getTemplate(templateId);
    const templateName = template?.name || templateId;
    let maxConfidence = 0;
    let attempts = 0;

    console.log(`🖼️ [${this.deviceId}] 이미지 탭 시도: ${templateName} (threshold: ${(threshold * 100).toFixed(0)}%)`);

    return this.withRetry(
      async () => {
        this._checkStop();
        attempts++;

        const result = await this._matchOnBackend(templateId, { threshold, region });

        if (result.confidence > maxConfidence) {
          maxConfidence = result.confidence;
        }

        if (result.found) {
          console.log(`✅ [${this.deviceId}] 이미지 발견: ${templateName} at (${result.x}, ${result.y}), confidence: ${(result.confidence * 100).toFixed(1)}%`);

          // 하이라이트 이벤트 발생 (nodeId가 있고 하이라이트 버퍼가 있는 경우)
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

          await this.tap(result.x, result.y, { retryCount: 1 });

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
          return error.message.includes('이미지를 찾을 수 없음') || this.isRetryableError(error);
        },
      }
    );
  }

  async waitUntilImage(
    templateId: string,
    timeout: number = 30000,
    interval: number = 1000,
    options: ImageMatchOptions & { tapAfterWait?: boolean; nodeId?: string } = {}
  ): Promise<ActionResult> {
    const { threshold = 0.8, region, tapAfterWait = false, nodeId } = options;
    const startTime = Date.now();
    const template = imageMatchService.getTemplate(templateId);
    const templateName = template?.name || templateId;
    let maxConfidence = 0;
    let attempts = 0;

    const actionDesc = tapAfterWait ? '이미지 대기 후 탭' : '이미지 나타남 대기';
    console.log(`⏳ [${this.deviceId}] ${actionDesc}: ${templateName} (threshold: ${(threshold * 100).toFixed(0)}%)`);

    while (Date.now() - startTime < timeout) {
      this._checkStop();
      const iterationStart = Date.now();
      attempts++;

      try {
        const result = await this._matchOnBackend(templateId, { threshold, region });

        if (result.confidence > maxConfidence) {
          maxConfidence = result.confidence;
        }

        if (result.found) {
          const waited = Date.now() - startTime;

          // 하이라이트 이벤트 발생 (nodeId가 있고 하이라이트 버퍼가 있는 경우)
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

          // tapAfterWait 옵션이 true면 찾은 좌표를 탭
          if (tapAfterWait && result.x !== undefined && result.y !== undefined) {
            // UI 안정화를 위한 지연
            await new Promise(resolve => setTimeout(resolve, 500));
            console.log(`✅ [${this.deviceId}] 이미지 발견, 탭 실행: ${templateName} (${result.x}, ${result.y})`);
            await this.tap(result.x, result.y);
          }

          console.log(`✅ [${this.deviceId}] ${actionDesc} 완료: ${templateName} (${waited}ms, confidence: ${(result.confidence * 100).toFixed(1)}%)`);

          return {
            success: true,
            action: tapAfterWait ? 'waitUntilImageAndTap' : 'waitUntilImage',
            templateId,
            waited,
            x: result.x,
            y: result.y,
            confidence: result.confidence,
            matchTime: result.matchTime,
            tapped: tapAfterWait,
          };
        }

        console.log(`🔍 [${this.deviceId}] 이미지 검색 중... (${templateName}, 현재: ${(result.confidence * 100).toFixed(1)}%, 최대: ${(maxConfidence * 100).toFixed(1)}%)`);
      } catch (err) {
        const error = err as Error;
        if (this.isSessionCrashedError(error)) {
          throw new Error(`세션 오류: ${templateName} 이미지 검색 중 세션이 종료됨 (${error.message})`);
        }
        console.log(`🔍 [${this.deviceId}] 이미지 검색 중... (${templateName})`);
      }

      // 순차 폴링: 이전 작업 완료 후 남은 시간만 대기
      const elapsed = Date.now() - iterationStart;
      const waitTime = Math.max(interval - elapsed, 0);
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    const thresholdPercent = (threshold * 100).toFixed(0);
    const maxConfidencePercent = (maxConfidence * 100).toFixed(1);
    throw new Error(`타임아웃: ${templateName} 이미지가 ${timeout}ms 내에 나타나지 않음 (필요: ${thresholdPercent}%, 최대 매칭률: ${maxConfidencePercent}%, 시도: ${attempts}회)`);
  }

  async waitUntilImageGone(
    templateId: string,
    timeout: number = 30000,
    interval: number = 1000,
    options: ImageMatchOptions = {}
  ): Promise<ActionResult> {
    const { threshold = 0.8, region } = options;
    const startTime = Date.now();
    const template = imageMatchService.getTemplate(templateId);
    const templateName = template?.name || templateId;
    let lastConfidence = 0;
    let attempts = 0;

    console.log(`⏳ [${this.deviceId}] 이미지 사라짐 대기: ${templateName} (threshold: ${(threshold * 100).toFixed(0)}%)`);

    while (Date.now() - startTime < timeout) {
      this._checkStop();
      const iterationStart = Date.now();
      attempts++;

      try {
        const result = await this._matchOnBackend(templateId, { threshold, region });
        lastConfidence = result.confidence;

        if (!result.found) {
          const waited = Date.now() - startTime;
          console.log(`✅ [${this.deviceId}] 이미지 사라짐 확인: ${templateName} (${waited}ms, 마지막 매칭률: ${(lastConfidence * 100).toFixed(1)}%)`);
          return {
            success: true,
            action: 'waitUntilImageGone',
            templateId,
            waited,
          };
        }

        console.log(`🔍 [${this.deviceId}] 이미지 아직 존재... (${templateName}, 매칭률: ${(result.confidence * 100).toFixed(1)}%)`);
      } catch (err) {
        const error = err as Error;
        if (this.isSessionCrashedError(error)) {
          throw new Error(`세션 오류: ${templateName} 이미지 검색 중 세션이 종료됨 (${error.message})`);
        }
        // 이미지 매칭 관련 에러는 이미지 사라짐으로 처리
        const waited = Date.now() - startTime;
        console.log(`✅ [${this.deviceId}] 이미지 사라짐 확인: ${templateName} (${waited}ms)`);
        return {
          success: true,
          action: 'waitUntilImageGone',
          templateId,
          waited,
        };
      }

      // 순차 폴링: 이전 작업 완료 후 남은 시간만 대기
      const elapsed = Date.now() - iterationStart;
      const waitTime = Math.max(interval - elapsed, 0);
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    const thresholdPercent = (threshold * 100).toFixed(0);
    const lastConfidencePercent = (lastConfidence * 100).toFixed(1);
    throw new Error(`타임아웃: ${templateName} 이미지가 ${timeout}ms 내에 사라지지 않음 (threshold: ${thresholdPercent}%, 마지막 매칭률: ${lastConfidencePercent}%, 시도: ${attempts}회)`);
  }

  async imageExists(
    templateId: string,
    options: ImageMatchOptions = {}
  ): Promise<{ success: boolean; exists: boolean; confidence: number; x?: number; y?: number }> {
    const { threshold, region } = options;
    const template = imageMatchService.getTemplate(templateId);
    const templateName = template?.name || templateId;

    try {
      const result = await this._matchOnBackend(templateId, { threshold, region });

      console.log(`🔍 [${this.deviceId}] 이미지 존재 확인: ${templateName} = ${result.found} (confidence: ${(result.confidence * 100).toFixed(1)}%)`);

      return {
        success: true,
        exists: result.found,
        confidence: result.confidence,
        x: result.found ? result.x : undefined,
        y: result.found ? result.y : undefined,
      };
    } catch (err) {
      const error = err as Error;
      if (this.isSessionCrashedError(error)) {
        throw new Error(`세션 오류: ${templateName} 이미지 확인 중 세션이 종료됨 (${error.message})`);
      }
      console.log(`🔍 [${this.deviceId}] 이미지 확인 실패: ${error.message}`);
      return { success: true, exists: false, confidence: 0 };
    }
  }

  async back(): Promise<ActionResult> {
    return this.pressBack();
  }

  async home(): Promise<ActionResult> {
    return this.pressHome();
  }

  /**
   * 앱 실행 (패키지명으로)
   */
  async launchApp(packageName: string): Promise<ActionResult> {
    const driver = await this._getDriver();

    console.log(`🚀 [${this.deviceId}] 앱 실행: ${packageName}`);

    // 앱이 이미 실행 중이면 먼저 종료
    try {
      await driver.terminateApp(packageName);
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch {
      // 앱이 실행 중이 아니면 무시
    }

    // 앱 실행
    await driver.activateApp(packageName);

    return { success: true, action: 'launchApp', package: packageName };
  }

  /**
   * 앱 종료 (패키지명으로)
   */
  async terminateApp(packageName?: string): Promise<ActionResult> {
    const driver = await this._getDriver();
    const targetPackage = packageName || await driver.getCurrentPackage();

    console.log(`🛑 [${this.deviceId}] 앱 종료: ${targetPackage}`);

    await driver.terminateApp(targetPackage);

    return { success: true, action: 'terminateApp', package: targetPackage };
  }

  /**
   * 앱 데이터 삭제 (pm clear)
   * pm clear는 앱을 강제 종료시키므로, 이후 앱을 다시 실행합니다.
   */
  async clearData(packageName?: string): Promise<ActionResult> {
    const driver = await this._getDriver();
    const targetPackage = packageName || await driver.getCurrentPackage();

    console.log(`🗑️ [${this.deviceId}] 앱 데이터 삭제: ${targetPackage}`);

    // ADB shell pm clear 명령 실행 (앱이 종료됨)
    await driver.execute('mobile: shell', {
      command: 'pm',
      args: ['clear', targetPackage],
    });

    // pm clear 후 앱이 종료되므로 잠시 대기 후 앱 재실행
    await new Promise(resolve => setTimeout(resolve, 500));

    console.log(`🚀 [${this.deviceId}] 앱 재실행: ${targetPackage}`);
    await driver.activateApp(targetPackage);

    return { success: true, action: 'clearData', package: targetPackage };
  }

  /**
   * 앱 캐시 삭제
   */
  async clearCache(packageName?: string): Promise<ActionResult> {
    const driver = await this._getDriver();
    const targetPackage = packageName || await driver.getCurrentPackage();

    console.log(`🧹 [${this.deviceId}] 앱 캐시 삭제: ${targetPackage}`);

    // ADB shell로 캐시 디렉토리 삭제
    await driver.execute('mobile: shell', {
      command: 'rm',
      args: ['-rf', `/data/data/${targetPackage}/cache/*`],
    });

    return { success: true, action: 'clearCache', package: targetPackage };
  }

  // ========== OCR 기반 텍스트 액션 ==========

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
      nodeId?: string; // 하이라이트 스크린샷 저장용
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

    console.log(`🔤 [${this.deviceId}] 텍스트 탭 (OCR): "${text}"`);

    return this.withRetry(
      async () => {
        this._checkStop();

        // 스크린샷 캡처
        const driver = await this._getDriver();
        const screenshot = await driver.takeScreenshot();
        const screenshotBuffer = Buffer.from(screenshot, 'base64');

        // OCR로 텍스트 찾기 + 하이라이트 생성
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

        console.log(`✅ [${this.deviceId}] 텍스트 발견: "${text}" at (${result.tapX}, ${result.tapY})`);

        // 하이라이트 이벤트 발생 (nodeId가 있고 하이라이트 버퍼가 있는 경우)
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

        // 탭 수행
        await this.tap(result.tapX, result.tapY, { retryCount: 1 });

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
          return error.message.includes('텍스트를 찾을 수 없음') || this.isRetryableError(error);
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
      nodeId?: string; // 하이라이트 스크린샷 저장용
    } = {}
  ): Promise<ActionResult> {
    const { matchType = 'contains', caseSensitive = false, region, tapAfterWait = false, nodeId } = options;
    const startTime = Date.now();

    console.log(`⏳ [${this.deviceId}] 텍스트 나타남 대기 (OCR): "${text}"`);

    while (Date.now() - startTime < timeout) {
      this._checkStop();
      const iterationStart = Date.now();

      try {
        // 스크린샷 캡처
        const driver = await this._getDriver();
        const screenshot = await driver.takeScreenshot();
        const screenshotBuffer = Buffer.from(screenshot, 'base64');

        // OCR로 텍스트 찾기 + 하이라이트 생성
        const result = await textMatcher.findTextAndHighlight(screenshotBuffer, text, {
          matchType,
          caseSensitive,
          region,
        });

        if (result.found && result.match) {
          const waited = Date.now() - startTime;
          console.log(`✅ [${this.deviceId}] 텍스트 나타남 확인 (OCR): "${text}" (${waited}ms)`);

          // 하이라이트 이벤트 발생 (nodeId가 있고 하이라이트 버퍼가 있는 경우)
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

          // 대기 후 탭 옵션이 활성화되어 있고 좌표가 있으면 탭
          let tapped = false;
          if (tapAfterWait && result.tapX !== undefined && result.tapY !== undefined) {
            // UI 안정화를 위한 지연
            await new Promise(resolve => setTimeout(resolve, 500));
            console.log(`👆 [${this.deviceId}] 대기 후 탭: (${result.tapX}, ${result.tapY})`);
            await this.tap(result.tapX, result.tapY);
            tapped = true;
          }

          return {
            success: true,
            action: 'waitUntilTextOcr',
            text,
            foundText: result.match.text,
            waited,
            x: result.tapX,
            y: result.tapY,
            confidence: result.match.confidence,
            ocrTime: result.processingTime,
            tapped,
            matchRegion: result.match.boundingBox,
          };
        }

        console.log(`🔍 [${this.deviceId}] 텍스트 검색 중 (OCR)... "${text}"`);
      } catch (err) {
        const error = err as Error;
        if (this.isSessionCrashedError(error)) {
          throw new Error(`세션 오류: "${text}" 텍스트 검색 중 세션이 종료됨`);
        }
        console.log(`🔍 [${this.deviceId}] 텍스트 검색 중 (OCR)... "${text}"`);
      }

      // 순차 폴링: 이전 작업 완료 후 남은 시간만 대기
      const elapsed = Date.now() - iterationStart;
      const waitTime = Math.max(interval - elapsed, 0);
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
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
    const startTime = Date.now();

    console.log(`⏳ [${this.deviceId}] 텍스트 사라짐 대기 (OCR): "${text}"`);

    while (Date.now() - startTime < timeout) {
      this._checkStop();
      const iterationStart = Date.now();

      try {
        // 스크린샷 캡처
        const driver = await this._getDriver();
        const screenshot = await driver.takeScreenshot();
        const screenshotBuffer = Buffer.from(screenshot, 'base64');

        // OCR로 텍스트 찾기
        const result = await textMatcher.findText(screenshotBuffer, text, {
          matchType,
          caseSensitive,
          region,
        });

        if (!result.found) {
          const waited = Date.now() - startTime;
          console.log(`✅ [${this.deviceId}] 텍스트 사라짐 확인 (OCR): "${text}" (${waited}ms)`);
          return {
            success: true,
            action: 'waitUntilTextGoneOcr',
            text,
            waited,
            ocrTime: result.processingTime,
          };
        }

        console.log(`🔍 [${this.deviceId}] 텍스트 아직 존재 (OCR)... "${text}"`);
      } catch (err) {
        const error = err as Error;
        if (this.isSessionCrashedError(error)) {
          throw new Error(`세션 오류: "${text}" 텍스트 검색 중 세션이 종료됨`);
        }
        // OCR 에러는 텍스트 없음으로 처리
        const waited = Date.now() - startTime;
        console.log(`✅ [${this.deviceId}] 텍스트 사라짐 확인 (OCR): "${text}" (${waited}ms)`);
        return {
          success: true,
          action: 'waitUntilTextGoneOcr',
          text,
          waited,
        };
      }

      // 순차 폴링: 이전 작업 완료 후 남은 시간만 대기
      const elapsed = Date.now() - iterationStart;
      const waitTime = Math.max(interval - elapsed, 0);
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
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

    console.log(`🔍 [${this.deviceId}] 텍스트 검증 (OCR): "${text}" (shouldExist: ${shouldExist})`);

    try {
      // 스크린샷 캡처
      const driver = await this._getDriver();
      const screenshot = await driver.takeScreenshot();
      const screenshotBuffer = Buffer.from(screenshot, 'base64');

      // OCR로 텍스트 찾기
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

      console.log(`✅ [${this.deviceId}] 텍스트 검증 성공 (OCR): "${text}"`);
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
}