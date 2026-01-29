// backend/src/appium/actions/index.ts

import type { Browser } from 'webdriverio';
import type {
  ActionResult,
  RetryOptions,
  ElementExistsResult,
  TextContainsResult,
  ElementStateResult,
  WaitResult,
  SelectorStrategy,
  DriverProvider,
} from './types';
import { isRetryableError, isSessionCrashedError } from './utils';
import { TouchActions } from './touch';
import { WaitActions } from './wait';
import { TextActions } from './text';
import { AppActions } from './app';
import { DeviceActions } from './device';
import { ElementActions } from './element';
import { ImageActions } from './image';
import type { ImageMatchOptions } from '../../types';
import type { TextMatchType, SearchRegion } from '../../services/textMatcher/types';

// Re-export types
export type {
  ActionResult,
  RetryOptions,
  ElementExistsResult,
  TextContainsResult,
  ElementStateResult,
  WaitResult,
  SelectorStrategy,
  DriverProvider,
};

/**
 * Actions 클래스 - 모든 액션 모듈을 통합
 */
export class Actions {
  private shouldStop: boolean = false;
  private driverProvider: DriverProvider;
  private deviceId: string;

  // 액션 모듈 인스턴스
  private touchActions: TouchActions;
  private waitActions: WaitActions;
  private textActions: TextActions;
  private appActions: AppActions;
  private deviceActions: DeviceActions;
  private elementActions: ElementActions;
  private imageActions: ImageActions;

  constructor(driverProvider: DriverProvider, deviceId: string = 'default') {
    this.driverProvider = driverProvider;
    this.deviceId = deviceId;
    this.shouldStop = false;

    // 액션 모듈 초기화
    this.touchActions = new TouchActions(driverProvider, deviceId);
    this.waitActions = new WaitActions(driverProvider, deviceId);
    this.textActions = new TextActions(driverProvider, deviceId);
    this.appActions = new AppActions(driverProvider, deviceId);
    this.deviceActions = new DeviceActions(driverProvider, deviceId);
    this.elementActions = new ElementActions(driverProvider, deviceId);
    this.imageActions = new ImageActions(driverProvider, deviceId);
  }

  /**
   * 디바이스 ID 반환
   */
  getDeviceId(): string {
    return this.deviceId;
  }

  /**
   * 중지 신호
   */
  stop(): void {
    this.shouldStop = true;
    console.log(`[${this.deviceId}] 액션 중지 요청`);

    // 모든 모듈에 중지 전파
    this.touchActions.stop();
    this.waitActions.stop();
    this.textActions.stop();
    this.appActions.stop();
    this.deviceActions.stop();
    this.elementActions.stop();
    this.imageActions.stop();
  }

  /**
   * 중지 상태 리셋
   */
  reset(): void {
    this.shouldStop = false;

    // 모든 모듈에 리셋 전파
    this.touchActions.reset();
    this.waitActions.reset();
    this.textActions.reset();
    this.appActions.reset();
    this.deviceActions.reset();
    this.elementActions.reset();
    this.imageActions.reset();
  }

  /**
   * 세션이 크래시되었는지 확인
   */
  isSessionCrashedError(error: Error): boolean {
    return isSessionCrashedError(error);
  }

  /**
   * 재시도 가능한 에러인지 판단
   */
  isRetryableError(error: Error): boolean {
    return isRetryableError(error);
  }

  /**
   * 재시도 래퍼 함수
   */
  async withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
    return this.touchActions.withRetry(fn, options);
  }

  // ========== TouchActions ==========

  async tap(x: number, y: number, options: RetryOptions = {}): Promise<ActionResult> {
    return this.touchActions.tap(x, y, options);
  }

  async tapElement(
    selector: string,
    strategy: SelectorStrategy = 'id',
    options: RetryOptions = {}
  ): Promise<ActionResult> {
    return this.touchActions.tapElement(selector, strategy, options);
  }

  async longPress(x: number, y: number, duration: number = 1000): Promise<ActionResult> {
    return this.touchActions.longPress(x, y, duration);
  }

  async doubleTap(x: number, y: number): Promise<ActionResult> {
    return this.touchActions.doubleTap(x, y);
  }

  async swipe(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    duration: number = 500
  ): Promise<ActionResult> {
    return this.touchActions.swipe(startX, startY, endX, endY, duration);
  }

  async clickElement(
    selector: string,
    strategy: SelectorStrategy = 'id'
  ): Promise<ActionResult> {
    return this.touchActions.clickElement(selector, strategy);
  }

  // ========== WaitActions ==========

  async wait(ms: number): Promise<ActionResult> {
    return this.waitActions.wait(ms);
  }

  async waitUntilGone(
    selector: string,
    strategy: SelectorStrategy = 'id',
    timeout: number = 30000,
    interval: number = 500
  ): Promise<WaitResult> {
    return this.waitActions.waitUntilGone(selector, strategy, timeout, interval);
  }

  async waitUntilExists(
    selector: string,
    strategy: SelectorStrategy = 'id',
    timeout: number = 30000,
    interval: number = 500,
    options: { tapAfterWait?: boolean } = {}
  ): Promise<WaitResult> {
    return this.waitActions.waitUntilExists(selector, strategy, timeout, interval, options);
  }

  async waitUntilTextGone(
    text: string,
    timeout: number = 30000,
    interval: number = 500
  ): Promise<WaitResult> {
    return this.waitActions.waitUntilTextGone(text, timeout, interval);
  }

  async waitUntilTextExists(
    text: string,
    timeout: number = 30000,
    interval: number = 500,
    options: { tapAfterWait?: boolean } = {}
  ): Promise<WaitResult> {
    return this.waitActions.waitUntilTextExists(text, timeout, interval, options);
  }

  // ========== TextActions ==========

  async clearText(): Promise<ActionResult> {
    return this.textActions.clearText();
  }

  async inputText(
    selector: string,
    text: string,
    strategy: SelectorStrategy = 'id',
    clearFirst: boolean = false
  ): Promise<ActionResult> {
    return this.textActions.inputText(selector, text, strategy, clearFirst);
  }

  async typeText(text: string, clearFirst: boolean = false): Promise<ActionResult> {
    return this.textActions.typeText(text, clearFirst);
  }

  async typeRandomText(options: {
    prefix?: string;
    suffix?: string;
    length?: number;
    charset?: 'alphanumeric' | 'alpha' | 'numeric';
  } = {}): Promise<ActionResult & { generatedText: string }> {
    return this.textActions.typeRandomText(options);
  }

  async tapText(text: string): Promise<ActionResult> {
    return this.textActions.tapText(text);
  }

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
    return this.textActions.tapTextOcr(text, options);
  }

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
    return this.textActions.waitUntilTextOcr(text, timeout, interval, options);
  }

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
    return this.textActions.waitUntilTextGoneOcr(text, timeout, interval, options);
  }

  async assertTextOcr(
    text: string,
    options: {
      matchType?: TextMatchType;
      caseSensitive?: boolean;
      region?: SearchRegion;
      shouldExist?: boolean;
    } = {}
  ): Promise<ActionResult> {
    return this.textActions.assertTextOcr(text, options);
  }

  // ========== AppActions ==========

  async launchApp(packageName: string): Promise<ActionResult> {
    return this.appActions.launchApp(packageName);
  }

  async terminateApp(packageName?: string): Promise<ActionResult> {
    return this.appActions.terminateApp(packageName);
  }

  async restartApp(): Promise<ActionResult> {
    return this.appActions.restartApp();
  }

  async clearData(packageName?: string): Promise<ActionResult> {
    return this.appActions.clearData(packageName);
  }

  async clearCache(packageName?: string): Promise<ActionResult> {
    return this.appActions.clearCache(packageName);
  }

  async clearAppData(appPackage?: string): Promise<ActionResult> {
    return this.appActions.clearAppData(appPackage);
  }

  async clearAppCache(appPackage?: string): Promise<ActionResult> {
    return this.appActions.clearAppCache(appPackage);
  }

  // ========== DeviceActions ==========

  async pressBack(): Promise<ActionResult> {
    return this.deviceActions.pressBack();
  }

  async pressHome(): Promise<ActionResult> {
    return this.deviceActions.pressHome();
  }

  async back(): Promise<ActionResult> {
    return this.deviceActions.back();
  }

  async home(): Promise<ActionResult> {
    return this.deviceActions.home();
  }

  async pressKey(keycode: number): Promise<ActionResult> {
    return this.deviceActions.pressKey(keycode);
  }

  async takeScreenshot(): Promise<ActionResult & { screenshot?: string }> {
    return this.deviceActions.takeScreenshot();
  }

  // ========== ElementActions ==========

  async elementExists(
    selector: string,
    strategy: SelectorStrategy = 'id',
    timeout: number = 3000
  ): Promise<ElementExistsResult> {
    return this.elementActions.elementExists(selector, strategy, timeout);
  }

  async elementTextContains(
    selector: string,
    text: string,
    strategy: SelectorStrategy = 'id',
    timeout: number = 3000
  ): Promise<TextContainsResult> {
    return this.elementActions.elementTextContains(selector, text, strategy, timeout);
  }

  async screenContainsText(
    text: string,
    timeout: number = 3000
  ): Promise<{ success: boolean; contains: boolean; text: string }> {
    return this.elementActions.screenContainsText(text, timeout);
  }

  async elementIsEnabled(
    selector: string,
    strategy: SelectorStrategy = 'id',
    timeout: number = 3000
  ): Promise<ElementStateResult> {
    return this.elementActions.elementIsEnabled(selector, strategy, timeout);
  }

  async elementIsDisplayed(
    selector: string,
    strategy: SelectorStrategy = 'id',
    timeout: number = 3000
  ): Promise<ElementStateResult> {
    return this.elementActions.elementIsDisplayed(selector, strategy, timeout);
  }

  async findElement(
    selector: string,
    strategy: SelectorStrategy = 'id',
    options: RetryOptions = {}
  ) {
    return this.elementActions.findElement(selector, strategy, options);
  }

  // ========== ImageActions ==========

  async tapImage(
    templateId: string,
    options: ImageMatchOptions & RetryOptions & { nodeId?: string } = {}
  ): Promise<ActionResult> {
    return this.imageActions.tapImage(templateId, options);
  }

  async waitUntilImage(
    templateId: string,
    timeout: number = 30000,
    interval: number = 1000,
    options: ImageMatchOptions & { tapAfterWait?: boolean; nodeId?: string } = {}
  ): Promise<ActionResult> {
    return this.imageActions.waitUntilImage(templateId, timeout, interval, options);
  }

  async waitUntilImageGone(
    templateId: string,
    timeout: number = 30000,
    interval: number = 1000,
    options: ImageMatchOptions = {}
  ): Promise<ActionResult> {
    return this.imageActions.waitUntilImageGone(templateId, timeout, interval, options);
  }

  async imageExists(
    templateId: string,
    options: ImageMatchOptions = {}
  ): Promise<{ success: boolean; exists: boolean; confidence: number; x?: number; y?: number }> {
    return this.imageActions.imageExists(templateId, options);
  }

  async ocrTextExists(
    text: string,
    options: {
      matchType?: TextMatchType;
      caseSensitive?: boolean;
      region?: SearchRegion;
    } = {}
  ): Promise<{ success: boolean; exists: boolean; confidence: number; x?: number; y?: number }> {
    return this.textActions.ocrTextExists(text, options);
  }
}
