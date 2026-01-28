// backend/src/appium/actions/app.ts

import type { Browser } from 'webdriverio';
import type { ActionResult, DriverProvider } from './types';
import { ActionsBase } from './utils';

/**
 * 앱 관련 액션 (launchApp, terminateApp, clearAppData 등)
 */
export class AppActions extends ActionsBase {
  private driverProvider: DriverProvider;

  constructor(driverProvider: DriverProvider, deviceId: string) {
    super(deviceId);
    this.driverProvider = driverProvider;
  }

  private async getDriver(): Promise<Browser> {
    return await this.driverProvider();
  }

  /**
   * 앱 실행 (패키지명으로)
   */
  async launchApp(packageName: string): Promise<ActionResult> {
    const driver = await this.getDriver();

    console.log(`[${this.deviceId}] 앱 실행: ${packageName}`);

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
    const driver = await this.getDriver();
    const targetPackage = packageName || await driver.getCurrentPackage();

    console.log(`[${this.deviceId}] 앱 종료: ${targetPackage}`);

    await driver.terminateApp(targetPackage);

    return { success: true, action: 'terminateApp', package: targetPackage };
  }

  /**
   * 앱 재시작
   */
  async restartApp(): Promise<ActionResult> {
    const driver = await this.getDriver();
    const currentPackage = await driver.getCurrentPackage();

    await driver.terminateApp(currentPackage);
    await new Promise(resolve => setTimeout(resolve, 1000));
    await driver.activateApp(currentPackage);

    console.log(`[${this.deviceId}] 앱 재시작: ${currentPackage}`);
    return { success: true, action: 'restart', package: currentPackage };
  }

  /**
   * 앱 데이터 삭제 (pm clear)
   * pm clear는 앱을 강제 종료시키므로, 이후 앱을 다시 실행합니다.
   */
  async clearData(packageName?: string): Promise<ActionResult> {
    const driver = await this.getDriver();
    const targetPackage = packageName || await driver.getCurrentPackage();

    console.log(`[${this.deviceId}] 앱 데이터 삭제: ${targetPackage}`);

    // ADB shell pm clear 명령 실행 (앱이 종료됨)
    await driver.execute('mobile: shell', {
      command: 'pm',
      args: ['clear', targetPackage],
    });

    // pm clear 후 앱이 종료되므로 잠시 대기 후 앱 재실행
    await new Promise(resolve => setTimeout(resolve, 500));

    console.log(`[${this.deviceId}] 앱 재실행: ${targetPackage}`);
    await driver.activateApp(targetPackage);

    return { success: true, action: 'clearData', package: targetPackage };
  }

  /**
   * 앱 캐시 삭제
   */
  async clearCache(packageName?: string): Promise<ActionResult> {
    const driver = await this.getDriver();
    const targetPackage = packageName || await driver.getCurrentPackage();

    console.log(`[${this.deviceId}] 앱 캐시 삭제: ${targetPackage}`);

    // ADB shell로 캐시 디렉토리 삭제
    await driver.execute('mobile: shell', {
      command: 'rm',
      args: ['-rf', `/data/data/${targetPackage}/cache/*`],
    });

    return { success: true, action: 'clearCache', package: targetPackage };
  }

  /**
   * 앱 데이터 삭제 (구 API - clearData로 포워딩)
   */
  async clearAppData(appPackage?: string): Promise<ActionResult> {
    const driver = await this.getDriver();
    const targetPackage = appPackage || await driver.getCurrentPackage();

    await driver.execute('mobile: shell', {
      command: 'pm',
      args: ['clear', targetPackage],
    });

    console.log(`[${this.deviceId}] 앱 데이터 삭제: ${targetPackage}`);
    return { success: true, action: 'clearData', package: targetPackage };
  }

  /**
   * 앱 캐시 삭제 (구 API - clearCache로 포워딩)
   */
  async clearAppCache(appPackage?: string): Promise<ActionResult> {
    const driver = await this.getDriver();
    const targetPackage = appPackage || await driver.getCurrentPackage();

    await driver.execute('mobile: shell', {
      command: 'rm',
      args: ['-rf', `/data/data/${targetPackage}/cache/*`],
    });

    console.log(`[${this.deviceId}] 앱 캐시 삭제: ${targetPackage}`);
    return { success: true, action: 'clearCache', package: targetPackage };
  }
}
