// backend/src/appium/actions/device.ts

import type { Browser } from 'webdriverio';
import type { ActionResult, DriverProvider } from './types';
import { ActionsBase } from './utils';

/**
 * 디바이스 관련 액션 (pressBack, pressHome, screenshot 등)
 */
export class DeviceActions extends ActionsBase {
  private driverProvider: DriverProvider;

  constructor(driverProvider: DriverProvider, deviceId: string) {
    super(deviceId);
    this.driverProvider = driverProvider;
  }

  private async getDriver(): Promise<Browser> {
    return await this.driverProvider();
  }

  /**
   * 뒤로 가기 버튼
   */
  async pressBack(): Promise<ActionResult> {
    const driver = await this.getDriver();
    await driver.execute('mobile: pressKey', { keycode: 4 });
    console.log(`[${this.deviceId}] 뒤로 가기`);
    return { success: true, action: 'back' };
  }

  /**
   * 홈 버튼
   */
  async pressHome(): Promise<ActionResult> {
    const driver = await this.getDriver();
    await driver.execute('mobile: pressKey', { keycode: 3 });
    console.log(`[${this.deviceId}] 홈 버튼`);
    return { success: true, action: 'home' };
  }

  /**
   * 뒤로 가기 (별칭)
   */
  async back(): Promise<ActionResult> {
    return this.pressBack();
  }

  /**
   * 홈 (별칭)
   */
  async home(): Promise<ActionResult> {
    return this.pressHome();
  }

  /**
   * 키코드로 키 입력
   * @param keycode Android KeyEvent keycode (예: 66=ENTER, 4=BACK, 3=HOME)
   */
  async pressKey(keycode: number): Promise<ActionResult> {
    const driver = await this.getDriver();
    await driver.execute('mobile: pressKey', { keycode });
    console.log(`[${this.deviceId}] 키 입력: keycode=${keycode}`);
    return { success: true, action: 'pressKey', keycode };
  }

  /**
   * 스크린샷 캡처
   * @returns Base64 인코딩된 스크린샷
   */
  async takeScreenshot(): Promise<ActionResult & { screenshot?: string }> {
    const driver = await this.getDriver();
    const screenshot = await driver.takeScreenshot();
    console.log(`[${this.deviceId}] 스크린샷 캡처`);
    return { success: true, action: 'takeScreenshot', screenshot };
  }
}
