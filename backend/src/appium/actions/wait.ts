// backend/src/appium/actions/wait.ts

import type { Browser } from 'webdriverio';
import type { ActionResult, WaitResult, DriverProvider, SelectorStrategy } from './types';
import { ActionsBase, buildSelector } from './utils';

/**
 * 대기 관련 액션 (waitUntilExists, waitUntilGone 등)
 */
export class WaitActions extends ActionsBase {
  private driverProvider: DriverProvider;

  constructor(driverProvider: DriverProvider, deviceId: string) {
    super(deviceId);
    this.driverProvider = driverProvider;
  }

  private async getDriver(): Promise<Browser> {
    return await this.driverProvider();
  }

  /**
   * 단순 대기
   */
  async wait(ms: number): Promise<ActionResult> {
    console.log(`[${this.deviceId}] 대기: ${ms}ms`);

    const interval = 100;
    let waited = 0;

    while (waited < ms) {
      this.checkStop();

      const waitTime = Math.min(interval, ms - waited);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      waited += waitTime;
    }

    return { success: true, action: 'wait', duration: ms };
  }

  /**
   * 요소가 사라질 때까지 대기
   */
  async waitUntilGone(
    selector: string,
    strategy: SelectorStrategy = 'id',
    timeout: number = 30000,
    interval: number = 500
  ): Promise<WaitResult> {
    const driver = await this.getDriver();
    console.log(`[${this.deviceId}] 요소 사라짐 대기: ${selector}`);

    const pollResult = await this.pollUntil(
      async () => {
        try {
          const element = await driver.$(buildSelector(selector, strategy));
          const exists = await element.isExisting();
          return { found: !exists };
        } catch {
          // 요소 조회 실패 = 사라짐
          return { found: true };
        }
      },
      { timeout, interval }
    );

    if (pollResult.success) {
      console.log(`[${this.deviceId}] 요소 사라짐 확인 (${pollResult.waited}ms)`);
      return { success: true, action: 'waitUntilGone', waited: pollResult.waited, selector };
    }

    throw new Error(`타임아웃: ${selector}가 ${timeout}ms 내에 사라지지 않음`);
  }

  /**
   * 요소가 나타날 때까지 대기
   */
  async waitUntilExists(
    selector: string,
    strategy: SelectorStrategy = 'id',
    timeout: number = 30000,
    interval: number = 500,
    options: { tapAfterWait?: boolean } = {}
  ): Promise<WaitResult> {
    const { tapAfterWait = false } = options;
    const driver = await this.getDriver();
    const actionDesc = tapAfterWait ? '요소 대기 후 탭' : '요소 나타남 대기';
    console.log(`[${this.deviceId}] ${actionDesc}: ${selector}`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pollResult = await this.pollUntil<{ element: any }>(
      async () => {
        try {
          const element = await driver.$(buildSelector(selector, strategy));
          const exists = await element.isExisting();
          return exists ? { found: true, result: { element } } : { found: false };
        } catch {
          return { found: false };
        }
      },
      { timeout, interval }
    );

    if (pollResult.success && pollResult.result) {
      // tapAfterWait 옵션이 true면 요소 탭
      if (tapAfterWait) {
        await new Promise(resolve => setTimeout(resolve, 500));
        console.log(`[${this.deviceId}] 요소 발견, 탭 실행: ${selector}`);
        await pollResult.result.element.click();
      }

      console.log(`[${this.deviceId}] ${actionDesc} 완료 (${pollResult.waited}ms)`);
      return {
        success: true,
        action: tapAfterWait ? 'waitUntilExistsAndTap' : 'waitUntilExists',
        waited: pollResult.waited,
        selector,
        tapped: tapAfterWait,
      };
    }

    throw new Error(`타임아웃: ${selector}가 ${timeout}ms 내에 나타나지 않음`);
  }

  /**
   * 텍스트가 사라질 때까지 대기
   */
  async waitUntilTextGone(
    text: string,
    timeout: number = 30000,
    interval: number = 500
  ): Promise<WaitResult> {
    const driver = await this.getDriver();
    console.log(`[${this.deviceId}] 텍스트 사라짐 대기: "${text}"`);

    const pollResult = await this.pollUntil(
      async () => {
        try {
          const selector = `android=new UiSelector().textContains("${text}")`;
          const element = await driver.$(selector);
          const exists = await element.isExisting();
          return { found: !exists };
        } catch {
          return { found: true };
        }
      },
      { timeout, interval }
    );

    if (pollResult.success) {
      console.log(`[${this.deviceId}] 텍스트 사라짐 확인 (${pollResult.waited}ms)`);
      return { success: true, action: 'waitUntilTextGone', waited: pollResult.waited, text };
    }

    throw new Error(`타임아웃: "${text}"가 ${timeout}ms 내에 사라지지 않음`);
  }

  /**
   * 텍스트가 나타날 때까지 대기
   */
  async waitUntilTextExists(
    text: string,
    timeout: number = 30000,
    interval: number = 500,
    options: { tapAfterWait?: boolean } = {}
  ): Promise<WaitResult> {
    const { tapAfterWait = false } = options;
    const driver = await this.getDriver();
    const actionDesc = tapAfterWait ? '텍스트 대기 후 탭' : '텍스트 나타남 대기';
    console.log(`[${this.deviceId}] ${actionDesc}: "${text}"`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pollResult = await this.pollUntil<{ element: any }>(
      async () => {
        try {
          const selector = `android=new UiSelector().textContains("${text}")`;
          const element = await driver.$(selector);
          const exists = await element.isExisting();
          return exists ? { found: true, result: { element } } : { found: false };
        } catch {
          return { found: false };
        }
      },
      { timeout, interval }
    );

    if (pollResult.success && pollResult.result) {
      // tapAfterWait 옵션이 true면 요소 탭
      if (tapAfterWait) {
        console.log(`[${this.deviceId}] 텍스트 발견, 탭 실행: "${text}"`);
        await pollResult.result.element.click();
      }

      console.log(`[${this.deviceId}] ${actionDesc} 완료 (${pollResult.waited}ms)`);
      return {
        success: true,
        action: tapAfterWait ? 'waitUntilTextExistsAndTap' : 'waitUntilTextExists',
        waited: pollResult.waited,
        text,
        tapped: tapAfterWait,
      };
    }

    throw new Error(`타임아웃: "${text}"가 ${timeout}ms 내에 나타나지 않음`);
  }
}
