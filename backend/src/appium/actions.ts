// backend/src/appium/actions.ts

import { Browser } from 'webdriverio';
import { imageMatchService } from '../services/imageMatch';
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
  isRetryableError(error: Error): boolean {
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
    const { threshold, region, retryCount = 3, retryDelay = 1000 } = options;

    return this.withRetry(
      async () => {
        this._checkStop();

        const driver = await this._getDriver();
        const screenshot = await driver.takeScreenshot();
        const screenshotBuffer = Buffer.from(screenshot, 'base64');

        const result = await imageMatchService.findImageCenter(
          screenshotBuffer,
          templateId,
          { threshold, region }
        );

        if (!result.found) {
          throw new Error(`이미지를 찾을 수 없음: ${templateId} (confidence: ${(result.confidence * 100).toFixed(1)}%)`);
        }

        console.log(`🖼️ [${this.deviceId}] 이미지 발견: ${templateId} at (${result.x}, ${result.y}), confidence: ${(result.confidence * 100).toFixed(1)}%`);

        await this.tap(result.x, result.y, { retryCount: 1 });

        return {
          success: true,
          action: 'tapImage',
          templateId,
          x: result.x,
          y: result.y,
          confidence: result.confidence,
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
    const { threshold, region } = options;
    const startTime = Date.now();

    console.log(`⏳ [${this.deviceId}] 이미지 나타남 대기: ${templateId}`);

    while (Date.now() - startTime < timeout) {
      this._checkStop();

      try {
        const driver = await this._getDriver();
        const screenshot = await driver.takeScreenshot();
        const screenshotBuffer = Buffer.from(screenshot, 'base64');

        const result = await imageMatchService.findImageCenter(
          screenshotBuffer,
          templateId,
          { threshold, region }
        );

        if (result.found) {
          const waited = Date.now() - startTime;
          console.log(`✅ [${this.deviceId}] 이미지 나타남 확인: ${templateId} (${waited}ms, confidence: ${(result.confidence * 100).toFixed(1)}%)`);
          return {
            success: true,
            action: 'waitUntilImage',
            templateId,
            waited,
            x: result.x,
            y: result.y,
            confidence: result.confidence,
          };
        }
      } catch (err) {
        console.log(`🔍 [${this.deviceId}] 이미지 검색 중... (${templateId})`);
      }

      await new Promise(resolve => setTimeout(resolve, interval));
    }

    throw new Error(`타임아웃: ${templateId} 이미지가 ${timeout}ms 내에 나타나지 않음`);
  }

  async waitUntilImageGone(
    templateId: string,
    timeout: number = 30000,
    interval: number = 1000,
    options: ImageMatchOptions = {}
  ): Promise<ActionResult> {
    const { threshold, region } = options;
    const startTime = Date.now();

    console.log(`⏳ [${this.deviceId}] 이미지 사라짐 대기: ${templateId}`);

    while (Date.now() - startTime < timeout) {
      this._checkStop();

      try {
        const driver = await this._getDriver();
        const screenshot = await driver.takeScreenshot();
        const screenshotBuffer = Buffer.from(screenshot, 'base64');

        const result = await imageMatchService.findImageCenter(
          screenshotBuffer,
          templateId,
          { threshold, region }
        );

        if (!result.found) {
          const waited = Date.now() - startTime;
          console.log(`✅ [${this.deviceId}] 이미지 사라짐 확인: ${templateId} (${waited}ms)`);
          return {
            success: true,
            action: 'waitUntilImageGone',
            templateId,
            waited,
          };
        }

        console.log(`🔍 [${this.deviceId}] 이미지 아직 존재... (${templateId}, confidence: ${(result.confidence * 100).toFixed(1)}%)`);
      } catch {
        const waited = Date.now() - startTime;
        console.log(`✅ [${this.deviceId}] 이미지 사라짐 확인: ${templateId} (${waited}ms)`);
        return {
          success: true,
          action: 'waitUntilImageGone',
          templateId,
          waited,
        };
      }

      await new Promise(resolve => setTimeout(resolve, interval));
    }

    throw new Error(`타임아웃: ${templateId} 이미지가 ${timeout}ms 내에 사라지지 않음`);
  }

  async imageExists(
    templateId: string,
    options: ImageMatchOptions = {}
  ): Promise<{ success: boolean; exists: boolean; confidence: number; x?: number; y?: number }> {
    const { threshold, region } = options;

    try {
      const driver = await this._getDriver();
      const screenshot = await driver.takeScreenshot();
      const screenshotBuffer = Buffer.from(screenshot, 'base64');

      const result = await imageMatchService.findImageCenter(
        screenshotBuffer,
        templateId,
        { threshold, region }
      );

      console.log(`🔍 [${this.deviceId}] 이미지 존재 확인: ${templateId} = ${result.found} (confidence: ${(result.confidence * 100).toFixed(1)}%)`);

      return {
        success: true,
        exists: result.found,
        confidence: result.confidence,
        x: result.found ? result.x : undefined,
        y: result.found ? result.y : undefined,
      };
    } catch (err) {
      const error = err as Error;
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
}

// ========== 하위 호환성을 위한 기본 인스턴스 ==========
import appiumDriver from './driver';

const defaultActions = new Actions(
  () => appiumDriver.getValidDriver(),
  'default'
);

export default defaultActions;