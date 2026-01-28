// backend/src/appium/actions/element.ts

import type { Browser } from 'webdriverio';
import type {
  ActionResult,
  RetryOptions,
  DriverProvider,
  SelectorStrategy,
  ElementExistsResult,
  TextContainsResult,
  ElementStateResult
} from './types';
import { ActionsBase, buildSelector, isRetryableError } from './utils';

/**
 * 요소 검사 관련 액션 (elementExists, findElement 등)
 */
export class ElementActions extends ActionsBase {
  private driverProvider: DriverProvider;

  constructor(driverProvider: DriverProvider, deviceId: string) {
    super(deviceId);
    this.driverProvider = driverProvider;
  }

  private async getDriver(): Promise<Browser> {
    return await this.driverProvider();
  }

  /**
   * 요소 존재 여부 확인
   */
  async elementExists(
    selector: string,
    strategy: SelectorStrategy = 'id',
    timeout: number = 3000
  ): Promise<ElementExistsResult> {
    const driver = await this.getDriver();

    try {
      const element = await driver.$(buildSelector(selector, strategy));
      await element.waitForExist({ timeout });

      console.log(`[${this.deviceId}] 요소 존재함: ${selector}`);
      return { success: true, exists: true, selector };
    } catch {
      console.log(`[${this.deviceId}] 요소 없음: ${selector}`);
      return { success: true, exists: false, selector };
    }
  }

  /**
   * 요소의 텍스트가 특정 문자열 포함 여부 확인
   */
  async elementTextContains(
    selector: string,
    text: string,
    strategy: SelectorStrategy = 'id',
    timeout: number = 3000
  ): Promise<TextContainsResult> {
    const driver = await this.getDriver();

    try {
      const element = await driver.$(buildSelector(selector, strategy));
      await element.waitForExist({ timeout });

      const elementText = await element.getText();
      const contains = elementText.includes(text);

      console.log(`[${this.deviceId}] 텍스트 확인: "${elementText}" contains "${text}" = ${contains}`);
      return { success: true, contains, actualText: elementText, expectedText: text };
    } catch (e) {
      const error = e as Error;
      console.log(`[${this.deviceId}] 텍스트 확인 실패: ${error.message}`);
      return { success: true, contains: false, error: error.message };
    }
  }

  /**
   * 화면에 특정 텍스트가 포함되어 있는지 확인
   */
  async screenContainsText(
    text: string,
    timeout: number = 3000
  ): Promise<{ success: boolean; contains: boolean; text: string }> {
    const driver = await this.getDriver();

    try {
      const selector = `android=new UiSelector().textContains("${text}")`;
      const element = await driver.$(selector);
      await element.waitForExist({ timeout });

      console.log(`[${this.deviceId}] 화면에 텍스트 존재: "${text}"`);
      return { success: true, contains: true, text };
    } catch {
      console.log(`[${this.deviceId}] 화면에 텍스트 없음: "${text}"`);
      return { success: true, contains: false, text };
    }
  }

  /**
   * 요소 활성화 여부 확인
   */
  async elementIsEnabled(
    selector: string,
    strategy: SelectorStrategy = 'id',
    timeout: number = 3000
  ): Promise<ElementStateResult> {
    const driver = await this.getDriver();

    try {
      const element = await driver.$(buildSelector(selector, strategy));
      await element.waitForExist({ timeout });

      const enabled = await element.isEnabled();

      console.log(`[${this.deviceId}] 요소 활성화 여부: ${selector} = ${enabled}`);
      return { success: true, enabled, selector };
    } catch (e) {
      const error = e as Error;
      console.log(`[${this.deviceId}] 요소 활성화 확인 실패: ${error.message}`);
      return { success: true, enabled: false, error: error.message };
    }
  }

  /**
   * 요소 표시 여부 확인
   */
  async elementIsDisplayed(
    selector: string,
    strategy: SelectorStrategy = 'id',
    timeout: number = 3000
  ): Promise<ElementStateResult> {
    const driver = await this.getDriver();

    try {
      const element = await driver.$(buildSelector(selector, strategy));
      await element.waitForExist({ timeout });

      const displayed = await element.isDisplayed();

      console.log(`[${this.deviceId}] 요소 표시 여부: ${selector} = ${displayed}`);
      return { success: true, displayed, selector };
    } catch (e) {
      const error = e as Error;
      console.log(`[${this.deviceId}] 요소 표시 확인 실패: ${error.message}`);
      return { success: true, displayed: false, error: error.message };
    }
  }

  /**
   * 요소 찾기
   */
  async findElement(
    selector: string,
    strategy: SelectorStrategy = 'id',
    options: RetryOptions = {}
  ) {
    return this.withRetry(
      async () => {
        const driver = await this.getDriver();
        const builtSelector = buildSelector(selector, strategy);

        console.log(`[${this.deviceId}] 요소 찾기: ${selector} (${strategy})`);

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
        shouldRetry: (error) => isRetryableError(error),
      }
    );
  }
}
