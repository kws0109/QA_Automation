// backend/src/appium/actions/touch.ts

import type { Browser } from 'webdriverio';
import type { ActionResult, RetryOptions, DriverProvider, SelectorStrategy } from './types';
import { ActionsBase, buildSelector, isRetryableError } from './utils';

/**
 * 터치 관련 액션 (tap, doubleTap, longPress, swipe, drag 등)
 */
export class TouchActions extends ActionsBase {
  private driverProvider: DriverProvider;

  constructor(driverProvider: DriverProvider, deviceId: string) {
    super(deviceId);
    this.driverProvider = driverProvider;
  }

  private async getDriver(): Promise<Browser> {
    return await this.driverProvider();
  }

  /**
   * 좌표 탭
   */
  async tap(x: number, y: number, options: RetryOptions = {}): Promise<ActionResult> {
    // 좌표 유효성 검증
    const tapX = Math.floor(x);
    const tapY = Math.floor(y);

    if (!Number.isFinite(tapX) || !Number.isFinite(tapY)) {
      throw new Error(`잘못된 탭 좌표: x=${x}, y=${y} (변환 후: ${tapX}, ${tapY})`);
    }

    if (tapX < 0 || tapY < 0) {
      throw new Error(`탭 좌표가 음수입니다: (${tapX}, ${tapY})`);
    }

    return this.withRetry(
      async () => {
        const driver = await this.getDriver();

        console.log(`[${this.deviceId}] 탭 실행: (${tapX}, ${tapY})`);

        try {
          await driver
            .action('pointer', { parameters: { pointerType: 'touch' } })
            .move({ x: tapX, y: tapY })
            .down()
            .up()
            .perform();
        } catch (err) {
          const error = err as Error;
          console.error(`[${this.deviceId}] 탭 실패 (${tapX}, ${tapY}): ${error.message}`);
          // 화면 크기 조회 시도 (디버깅용)
          try {
            const windowSize = await driver.getWindowRect();
            console.log(`[${this.deviceId}] 화면 크기: ${windowSize.width}x${windowSize.height}`);
            if (tapX > windowSize.width || tapY > windowSize.height) {
              throw new Error(`탭 좌표가 화면 범위를 벗어남: (${tapX}, ${tapY}), 화면: ${windowSize.width}x${windowSize.height}`);
            }
          } catch (sizeErr) {
            console.error(`[${this.deviceId}] 화면 크기 조회 실패: ${(sizeErr as Error).message}`);
          }
          throw error;
        }

        return { success: true, action: 'tap', x: tapX, y: tapY };
      },
      {
        retryCount: options.retryCount || 2,
        retryDelay: options.retryDelay || 500,
        shouldRetry: (error) => isRetryableError(error),
      }
    );
  }

  /**
   * 요소 탭 (셀렉터 기반)
   */
  async tapElement(
    selector: string,
    strategy: SelectorStrategy = 'id',
    options: RetryOptions = {}
  ): Promise<ActionResult> {
    return this.withRetry(
      async () => {
        const driver = await this.getDriver();
        const builtSelector = buildSelector(selector, strategy);
        const element = await driver.$(builtSelector);
        const exists = await element.isExisting();

        if (!exists) {
          throw new Error(`요소를 찾을 수 없음: ${selector}`);
        }

        console.log(`[${this.deviceId}] 요소 탭: ${selector}`);
        await element.click();

        return { success: true, action: 'tapElement', selector, strategy };
      },
      {
        retryCount: options.retryCount || 3,
        retryDelay: options.retryDelay || 1000,
        shouldRetry: (error) => isRetryableError(error),
      }
    );
  }

  /**
   * 롱프레스
   */
  async longPress(x: number, y: number, duration: number = 1000): Promise<ActionResult> {
    const driver = await this.getDriver();

    await driver
      .action('pointer', { parameters: { pointerType: 'touch' } })
      .move({ x: Math.round(x), y: Math.round(y) })
      .down()
      .pause(duration)
      .up()
      .perform();

    console.log(`[${this.deviceId}] 롱프레스: (${x}, ${y}), ${duration}ms`);
    return { success: true, action: 'longPress', x, y, duration };
  }

  /**
   * 더블 탭
   */
  async doubleTap(x: number, y: number): Promise<ActionResult> {
    const driver = await this.getDriver();

    await driver
      .action('pointer', { parameters: { pointerType: 'touch' } })
      .move({ x: Math.round(x), y: Math.round(y) })
      .down()
      .up()
      .pause(50)
      .down()
      .up()
      .perform();

    console.log(`[${this.deviceId}] 더블탭: (${x}, ${y})`);
    return { success: true, action: 'doubleTap', x, y };
  }

  /**
   * 스와이프
   */
  async swipe(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    duration: number = 500
  ): Promise<ActionResult> {
    const driver = await this.getDriver();

    await driver
      .action('pointer', { parameters: { pointerType: 'touch' } })
      .move({ x: Math.round(startX), y: Math.round(startY) })
      .down()
      .pause(100)
      .move({ x: Math.round(endX), y: Math.round(endY), duration })
      .up()
      .perform();

    console.log(`[${this.deviceId}] 스와이프: (${startX}, ${startY}) -> (${endX}, ${endY}), ${duration}ms`);
    return { success: true, action: 'swipe', startX, startY, endX, endY, duration };
  }

  /**
   * 요소 클릭
   */
  async clickElement(
    selector: string,
    strategy: SelectorStrategy = 'id'
  ): Promise<ActionResult> {
    const driver = await this.getDriver();
    const element = await driver.$(buildSelector(selector, strategy));

    await element.click();

    console.log(`[${this.deviceId}] 요소 클릭: ${selector}`);
    return { success: true, action: 'click', selector };
  }
}
