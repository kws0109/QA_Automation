// backend/src/appium/actions.ts

import { Browser } from 'webdriverio';
import { imageMatchService } from '../services/imageMatch';
import { imageMatchEmitter } from '../services/screenshotEventService';
import { screenRecorder } from '../services/videoAnalyzer/screenRecorder';
import type { ImageMatchOptions } from '../types';

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

  // 디바이스 매칭 활성화 여부 (세션별 캐시)
  private _deviceMatchingEnabled: boolean | null = null;

  /**
   * 디바이스 OpenCV 매칭 사용 가능 여부 확인
   * 최초 호출 시 확인 후 세션 동안 캐시
   */
  private async _isDeviceMatchingAvailable(): Promise<boolean> {
    if (this._deviceMatchingEnabled !== null) {
      return this._deviceMatchingEnabled;
    }

    try {
      this._deviceMatchingEnabled = await screenRecorder.isDeviceMatchingAvailable(this.deviceId);
      if (this._deviceMatchingEnabled) {
        console.log(`📱 [${this.deviceId}] 디바이스 OpenCV 매칭 활성화됨`);
      } else {
        console.log(`💻 [${this.deviceId}] 백엔드 매칭 모드 (디바이스 앱 미사용)`);
      }
    } catch (error) {
      console.log(`💻 [${this.deviceId}] 백엔드 매칭 모드 (디바이스 앱 확인 실패)`);
      this._deviceMatchingEnabled = false;
    }

    return this._deviceMatchingEnabled;
  }

  /**
   * 디바이스에서 이미지 매칭 수행
   * @returns 매칭 결과 또는 null (디바이스 매칭 불가 시)
   */
  private async _matchOnDevice(
    templateId: string,
    options: ImageMatchOptions = {}
  ): Promise<{
    found: boolean;
    x: number;
    y: number;
    confidence: number;
    matchTime?: number;
    highlightPath?: string;
  } | null> {
    const { threshold = 0.8, region } = options;

    // 디바이스 매칭 사용 가능 여부 확인
    if (!(await this._isDeviceMatchingAvailable())) {
      return null;
    }

    try {
      const result = await screenRecorder.matchTemplateOnDevice(
        this.deviceId,
        templateId,
        threshold,
        region
      );

      if (result.success && result.found !== undefined) {
        return {
          found: result.found,
          x: result.x || 0,
          y: result.y || 0,
          confidence: result.confidence || 0,
          matchTime: result.matchTime,
          highlightPath: result.highlightPath,
        };
      }

      // 디바이스 매칭 실패 시 null 반환 (폴백 트리거)
      console.log(`⚠️ [${this.deviceId}] 디바이스 매칭 실패, 백엔드로 폴백: ${result.error}`);
      return null;
    } catch (error) {
      console.log(`⚠️ [${this.deviceId}] 디바이스 매칭 오류, 백엔드로 폴백`);
      return null;
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

      await new Promise(resolve => setTimeout(resolve, interval));
    }

    throw new Error(`타임아웃: ${selector}가 ${timeout}ms 내에 사라지지 않음`);
  }

  async waitUntilExists(
    selector: string,
    strategy: SelectorStrategy = 'id',
    timeout: number = 30000,
    interval: number = 500
  ): Promise<WaitResult> {
    const driver = await this._getDriver();
    const startTime = Date.now();

    console.log(`⏳ [${this.deviceId}] 요소 나타남 대기: ${selector}`);

    while (Date.now() - startTime < timeout) {
      this._checkStop();

      try {
        const element = await driver.$(this._buildSelector(selector, strategy));
        const exists = await element.isExisting();

        if (exists) {
          const waited = Date.now() - startTime;
          console.log(`✅ [${this.deviceId}] 요소 나타남 확인 (${waited}ms)`);
          return { success: true, action: 'waitUntilExists', waited, selector };
        }
      } catch {
        // 아직 없음
      }

      await new Promise(resolve => setTimeout(resolve, interval));
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

      await new Promise(resolve => setTimeout(resolve, interval));
    }

    throw new Error(`타임아웃: "${text}"가 ${timeout}ms 내에 사라지지 않음`);
  }

  async waitUntilTextExists(
    text: string,
    timeout: number = 30000,
    interval: number = 500
  ): Promise<WaitResult> {
    const driver = await this._getDriver();
    const startTime = Date.now();

    console.log(`⏳ [${this.deviceId}] 텍스트 나타남 대기: "${text}"`);

    while (Date.now() - startTime < timeout) {
      this._checkStop();

      try {
        const selector = `android=new UiSelector().textContains("${text}")`;
        const element = await driver.$(selector);
        const exists = await element.isExisting();

        if (exists) {
          const waited = Date.now() - startTime;
          console.log(`✅ [${this.deviceId}] 텍스트 나타남 확인 (${waited}ms)`);
          return { success: true, action: 'waitUntilTextExists', waited, text };
        }
      } catch {
        // 아직 없음
      }

      await new Promise(resolve => setTimeout(resolve, interval));
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
    options: ImageMatchOptions & RetryOptions = {}
  ): Promise<ActionResult> {
    const { threshold = 0.8, region, retryCount = 3, retryDelay = 1000 } = options;
    const template = imageMatchService.getTemplate(templateId);
    const templateName = template?.name || templateId;
    let maxConfidence = 0;
    let attempts = 0;

    console.log(`🖼️ [${this.deviceId}] 이미지 탭 시도: ${templateName} (threshold: ${(threshold * 100).toFixed(0)}%)`);

    return this.withRetry(
      async () => {
        this._checkStop();
        attempts++;

        // 1. 디바이스 매칭 시도 (Device App OpenCV)
        const deviceResult = await this._matchOnDevice(templateId, { threshold, region });

        if (deviceResult) {
          // 디바이스 매칭 성공
          if (deviceResult.confidence > maxConfidence) {
            maxConfidence = deviceResult.confidence;
          }

          if (deviceResult.found) {
            console.log(`📱 [${this.deviceId}] 이미지 발견 (디바이스): ${templateName} at (${deviceResult.x}, ${deviceResult.y}), confidence: ${(deviceResult.confidence * 100).toFixed(1)}%`);

            // 하이라이트 이미지가 있으면 이벤트 발송 (디바이스 매칭용)
            if (deviceResult.highlightPath) {
              imageMatchEmitter.emitDeviceMatchSuccess({
                deviceId: this.deviceId,
                nodeId: `tapImage_${templateId}`,
                templateId,
                confidence: deviceResult.confidence,
                highlightPath: deviceResult.highlightPath,
                timestamp: new Date().toISOString(),
              });
            }

            await this.tap(deviceResult.x, deviceResult.y, { retryCount: 1 });

            return {
              success: true,
              action: 'tapImage',
              templateId,
              x: deviceResult.x,
              y: deviceResult.y,
              confidence: deviceResult.confidence,
              matchTime: deviceResult.matchTime,
              matchMethod: 'device',
            };
          }

          // 디바이스에서 이미지 못 찾음
          const thresholdPercent = (threshold * 100).toFixed(0);
          const currentPercent = (deviceResult.confidence * 100).toFixed(1);
          const maxPercent = (maxConfidence * 100).toFixed(1);
          throw new Error(`이미지를 찾을 수 없음: ${templateName} (필요: ${thresholdPercent}%, 현재: ${currentPercent}%, 최대: ${maxPercent}%, 시도: ${attempts}회)`);
        }

        // 2. 백엔드 매칭 폴백
        const driver = await this._getDriver();
        const screenshot = await driver.takeScreenshot();
        const screenshotBuffer = Buffer.from(screenshot, 'base64');

        // 매칭과 하이라이트를 동시에 수행
        const { matchResult, highlightedBuffer, centerX, centerY } =
          await imageMatchService.matchAndHighlight(
            screenshotBuffer,
            templateId,
            { threshold, region },
            { color: '#00FF00', strokeWidth: 4 }
          );

        // 최대 confidence 추적
        if (matchResult.confidence > maxConfidence) {
          maxConfidence = matchResult.confidence;
        }

        if (!matchResult.found) {
          const thresholdPercent = (threshold * 100).toFixed(0);
          const currentPercent = (matchResult.confidence * 100).toFixed(1);
          const maxPercent = (maxConfidence * 100).toFixed(1);
          throw new Error(`이미지를 찾을 수 없음: ${templateName} (필요: ${thresholdPercent}%, 현재: ${currentPercent}%, 최대: ${maxPercent}%, 시도: ${attempts}회)`);
        }

        console.log(`💻 [${this.deviceId}] 이미지 발견 (백엔드): ${templateName} at (${centerX}, ${centerY}), confidence: ${(matchResult.confidence * 100).toFixed(1)}%`);

        // 이벤트 기반 하이라이트 스크린샷 저장 (tap 전에 emit)
        if (highlightedBuffer) {
          imageMatchEmitter.emitMatchSuccess({
            deviceId: this.deviceId,
            nodeId: `tapImage_${templateId}`,  // testExecutor에서 실제 nodeId로 대체됨
            templateId,
            confidence: matchResult.confidence,
            highlightedBuffer,
            matchRegion: {
              x: matchResult.x,
              y: matchResult.y,
              width: matchResult.width,
              height: matchResult.height,
            },
            timestamp: new Date().toISOString(),
          });
        }

        await this.tap(centerX, centerY, { retryCount: 1 });

        return {
          success: true,
          action: 'tapImage',
          templateId,
          x: centerX,
          y: centerY,
          confidence: matchResult.confidence,
          matchTime: matchResult.metrics?.matchTime,
          matchMethod: 'backend',
        };
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
    options: ImageMatchOptions = {}
  ): Promise<ActionResult> {
    const { threshold = 0.8, region } = options;
    const startTime = Date.now();
    const template = imageMatchService.getTemplate(templateId);
    const templateName = template?.name || templateId;
    let maxConfidence = 0;
    let attempts = 0;

    console.log(`⏳ [${this.deviceId}] 이미지 나타남 대기: ${templateName} (threshold: ${(threshold * 100).toFixed(0)}%)`);

    // 디바이스 매칭 사용 가능 여부 미리 확인
    const useDeviceMatching = await this._isDeviceMatchingAvailable();

    while (Date.now() - startTime < timeout) {
      this._checkStop();
      attempts++;

      try {
        // 1. 디바이스 매칭 시도 (Device App OpenCV)
        if (useDeviceMatching) {
          const deviceResult = await this._matchOnDevice(templateId, { threshold, region });

          if (deviceResult) {
            if (deviceResult.confidence > maxConfidence) {
              maxConfidence = deviceResult.confidence;
            }

            if (deviceResult.found) {
              const waited = Date.now() - startTime;
              console.log(`📱 [${this.deviceId}] 이미지 나타남 확인 (디바이스): ${templateName} (${waited}ms, confidence: ${(deviceResult.confidence * 100).toFixed(1)}%)`);

              // 하이라이트 이미지가 있으면 이벤트 발송 (디바이스 매칭용)
              if (deviceResult.highlightPath) {
                imageMatchEmitter.emitDeviceMatchSuccess({
                  deviceId: this.deviceId,
                  nodeId: `waitUntilImage_${templateId}`,
                  templateId,
                  confidence: deviceResult.confidence,
                  highlightPath: deviceResult.highlightPath,
                  timestamp: new Date().toISOString(),
                });
              }

              return {
                success: true,
                action: 'waitUntilImage',
                templateId,
                waited,
                x: deviceResult.x,
                y: deviceResult.y,
                confidence: deviceResult.confidence,
                matchTime: deviceResult.matchTime,
                matchMethod: 'device',
              };
            }

            console.log(`🔍 [${this.deviceId}] 이미지 검색 중... (${templateName}, 현재: ${(deviceResult.confidence * 100).toFixed(1)}%, 최대: ${(maxConfidence * 100).toFixed(1)}%)`);
            await new Promise(resolve => setTimeout(resolve, interval));
            continue;
          }
        }

        // 2. 백엔드 매칭 폴백
        const driver = await this._getDriver();
        const screenshot = await driver.takeScreenshot();
        const screenshotBuffer = Buffer.from(screenshot, 'base64');

        // 매칭과 하이라이트를 동시에 수행
        const { matchResult, highlightedBuffer, centerX, centerY } =
          await imageMatchService.matchAndHighlight(
            screenshotBuffer,
            templateId,
            { threshold, region },
            { color: '#00FF00', strokeWidth: 4 }
          );

        // 최대 confidence 추적
        if (matchResult.confidence > maxConfidence) {
          maxConfidence = matchResult.confidence;
        }

        if (matchResult.found) {
          const waited = Date.now() - startTime;
          console.log(`💻 [${this.deviceId}] 이미지 나타남 확인 (백엔드): ${templateName} (${waited}ms, confidence: ${(matchResult.confidence * 100).toFixed(1)}%)`);

          // 이벤트 기반 하이라이트 스크린샷 저장
          if (highlightedBuffer) {
            imageMatchEmitter.emitMatchSuccess({
              deviceId: this.deviceId,
              nodeId: `waitUntilImage_${templateId}`,  // testExecutor에서 실제 nodeId로 대체됨
              templateId,
              confidence: matchResult.confidence,
              highlightedBuffer,
              matchRegion: {
                x: matchResult.x,
                y: matchResult.y,
                width: matchResult.width,
                height: matchResult.height,
              },
              timestamp: new Date().toISOString(),
            });
          }

          return {
            success: true,
            action: 'waitUntilImage',
            templateId,
            waited,
            x: centerX,
            y: centerY,
            confidence: matchResult.confidence,
            matchTime: matchResult.metrics?.matchTime,
            matchMethod: 'backend',
          };
        }

        console.log(`🔍 [${this.deviceId}] 이미지 검색 중... (${templateName}, 현재: ${(matchResult.confidence * 100).toFixed(1)}%, 최대: ${(maxConfidence * 100).toFixed(1)}%)`);
      } catch (err) {
        const error = err as Error;
        // 세션 크래시 에러는 즉시 실패
        if (this.isSessionCrashedError(error)) {
          throw new Error(`세션 오류: ${templateName} 이미지 검색 중 세션이 종료됨 (${error.message})`);
        }
        console.log(`🔍 [${this.deviceId}] 이미지 검색 중... (${templateName})`);
      }

      await new Promise(resolve => setTimeout(resolve, interval));
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

    // 디바이스 매칭 사용 가능 여부 미리 확인
    const useDeviceMatching = await this._isDeviceMatchingAvailable();

    while (Date.now() - startTime < timeout) {
      this._checkStop();
      attempts++;

      try {
        // 1. 디바이스 매칭 시도 (Device App OpenCV)
        if (useDeviceMatching) {
          const deviceResult = await this._matchOnDevice(templateId, { threshold, region });

          if (deviceResult) {
            lastConfidence = deviceResult.confidence;

            if (!deviceResult.found) {
              const waited = Date.now() - startTime;
              console.log(`📱 [${this.deviceId}] 이미지 사라짐 확인 (디바이스): ${templateName} (${waited}ms, 마지막 매칭률: ${(lastConfidence * 100).toFixed(1)}%)`);
              return {
                success: true,
                action: 'waitUntilImageGone',
                templateId,
                waited,
                matchMethod: 'device',
              };
            }

            console.log(`🔍 [${this.deviceId}] 이미지 아직 존재... (${templateName}, 매칭률: ${(deviceResult.confidence * 100).toFixed(1)}%)`);
            await new Promise(resolve => setTimeout(resolve, interval));
            continue;
          }
        }

        // 2. 백엔드 매칭 폴백
        const driver = await this._getDriver();
        const screenshot = await driver.takeScreenshot();
        const screenshotBuffer = Buffer.from(screenshot, 'base64');

        const result = await imageMatchService.findImageCenter(
          screenshotBuffer,
          templateId,
          { threshold, region }
        );

        lastConfidence = result.confidence;

        if (!result.found) {
          const waited = Date.now() - startTime;
          console.log(`💻 [${this.deviceId}] 이미지 사라짐 확인 (백엔드): ${templateName} (${waited}ms, 마지막 매칭률: ${(lastConfidence * 100).toFixed(1)}%)`);
          return {
            success: true,
            action: 'waitUntilImageGone',
            templateId,
            waited,
            matchMethod: 'backend',
          };
        }

        console.log(`🔍 [${this.deviceId}] 이미지 아직 존재... (${templateName}, 매칭률: ${(result.confidence * 100).toFixed(1)}%)`);
      } catch (err) {
        const error = err as Error;
        // 세션 크래시 에러는 즉시 실패
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

      await new Promise(resolve => setTimeout(resolve, interval));
    }

    const thresholdPercent = (threshold * 100).toFixed(0);
    const lastConfidencePercent = (lastConfidence * 100).toFixed(1);
    throw new Error(`타임아웃: ${templateName} 이미지가 ${timeout}ms 내에 사라지지 않음 (threshold: ${thresholdPercent}%, 마지막 매칭률: ${lastConfidencePercent}%, 시도: ${attempts}회)`);
  }

  async imageExists(
    templateId: string,
    options: ImageMatchOptions = {}
  ): Promise<{ success: boolean; exists: boolean; confidence: number; x?: number; y?: number; highlightedScreenshot?: Buffer; highlightPath?: string; matchMethod?: string }> {
    const { threshold, region } = options;
    const template = imageMatchService.getTemplate(templateId);
    const templateName = template?.name || templateId;

    try {
      // 1. 디바이스 매칭 시도 (Device App OpenCV)
      const deviceResult = await this._matchOnDevice(templateId, { threshold, region });

      if (deviceResult) {
        console.log(`📱 [${this.deviceId}] 이미지 존재 확인 (디바이스): ${templateName} = ${deviceResult.found} (confidence: ${(deviceResult.confidence * 100).toFixed(1)}%)`);

        return {
          success: true,
          exists: deviceResult.found,
          confidence: deviceResult.confidence,
          x: deviceResult.found ? deviceResult.x : undefined,
          y: deviceResult.found ? deviceResult.y : undefined,
          highlightPath: deviceResult.found ? deviceResult.highlightPath : undefined,
          matchMethod: 'device',
        };
      }

      // 2. 백엔드 매칭 폴백
      const driver = await this._getDriver();
      const screenshot = await driver.takeScreenshot();
      const screenshotBuffer = Buffer.from(screenshot, 'base64');

      // 매칭과 하이라이트를 동시에 수행
      const { matchResult, highlightedBuffer, centerX, centerY } =
        await imageMatchService.matchAndHighlight(
          screenshotBuffer,
          templateId,
          { threshold, region },
          { color: '#00FF00', strokeWidth: 4 }
        );

      console.log(`💻 [${this.deviceId}] 이미지 존재 확인 (백엔드): ${templateName} = ${matchResult.found} (confidence: ${(matchResult.confidence * 100).toFixed(1)}%)`);

      return {
        success: true,
        exists: matchResult.found,
        confidence: matchResult.confidence,
        x: matchResult.found ? centerX : undefined,
        y: matchResult.found ? centerY : undefined,
        highlightedScreenshot: matchResult.found ? (highlightedBuffer || undefined) : undefined,
        matchMethod: 'backend',
      };
    } catch (err) {
      const error = err as Error;
      // 세션 크래시 에러는 즉시 실패
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
}