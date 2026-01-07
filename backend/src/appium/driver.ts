// backend/src/appium/driver.ts

import { remote, Browser } from 'webdriverio';
import fs from 'fs';
import path from 'path';

const CONFIG_FILE = path.join(__dirname, '../../.driver-config.json');

// 연결 설정 인터페이스
interface DriverConfig {
  deviceName: string;
  appPackage: string;
  appActivity: string;
  platformVersion?: string;
  udid?: string;
}

// 상태 응답 인터페이스
interface DriverStatus {
  connected: boolean;
  config: DriverConfig | null;
  lastActivity: number | null;
  hasStoredConfig: boolean;
}

// 연결 결과 인터페이스
interface ConnectResult {
  success: boolean;
  message: string;
}

// 디바이스 정보 인터페이스
interface DeviceInfo {
  windowSize: { width: number; height: number; x: number; y: number };
  batteryInfo: unknown;
}

class AppiumDriver {
  private driver: Browser | null = null;
  private isConnected: boolean = false;
  private config: DriverConfig | null = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 3;
  private lastActivityTime: number | null = null;
  private keepAliveInterval: NodeJS.Timeout | null = null;

  constructor() {
    // 서버 시작 시 저장된 config 로드
    this._loadConfig();
  }

  /**
   * config 파일 저장
   */
  private _saveConfig(): void {
    try {
      if (this.config) {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.config, null, 2));
        console.log('💾 연결 설정 저장됨');
      }
    } catch (e) {
      const error = e as Error;
      console.error('⚠️ 설정 저장 실패:', error.message);
    }
  }

  /**
   * config 파일 로드
   */
  private _loadConfig(): void {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
        this.config = JSON.parse(data) as DriverConfig;
        console.log('📂 저장된 연결 설정 로드됨');
      }
    } catch (e) {
      const error = e as Error;
      console.error('⚠️ 설정 로드 실패:', error.message);
    }
  }

  /**
   * config 파일 삭제
   */
  private _clearConfig(): void {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        fs.unlinkSync(CONFIG_FILE);
        console.log('🗑️ 연결 설정 삭제됨');
      }
    } catch {
      // 무시
    }
  }

  /**
   * 디바이스 연결
   */
  async connect(config: DriverConfig): Promise<ConnectResult> {
    try {
      // 설정 저장 (재연결용)
      this.config = config;
      this._saveConfig();

      const capabilities: WebdriverIO.Capabilities = {
        platformName: 'Android',
        'appium:deviceName': config.deviceName || 'device',
        'appium:automationName': 'UiAutomator2',
        'appium:appPackage': config.appPackage,
        'appium:appActivity': config.appActivity,
        'appium:noReset': true,
        'appium:newCommandTimeout': 3600,
        'appium:adbExecTimeout': 60000,
        'appium:uiautomator2ServerInstallTimeout': 60000,
      };

      this.driver = await remote({
        hostname: 'localhost',
        port: 4723,
        path: '/',
        capabilities,
        connectionRetryCount: 3,
        connectionRetryTimeout: 30000,
      });

      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.lastActivityTime = Date.now();

      this._startKeepAlive();

      console.log('✅ Appium 연결 성공');
      return { success: true, message: '디바이스 연결 성공' };

    } catch (e) {
      const error = e as Error;
      console.error('❌ Appium 연결 실패:', error.message);
      this.driver = null;
      this.isConnected = false;
      throw error;
    }
  }

  /**
   * 연결 해제
   */
  async disconnect(): Promise<ConnectResult> {
    try {
      this._stopKeepAlive();

      if (this.driver) {
        await this.driver.deleteSession();
        this.driver = null;
      }

      this.isConnected = false;
      this.config = null;
      this._clearConfig();

      console.log('✅ Appium 연결 해제');
      return { success: true, message: '연결 해제 완료' };

    } catch (e) {
      const error = e as Error;
      this.driver = null;
      this.isConnected = false;
      console.error('❌ 연결 해제 에러:', error.message);
      return { success: true, message: '연결 해제 완료' };
    }
  }

  /**
   * 연결 상태 조회
   */
  getStatus(): DriverStatus {
    return {
      connected: this.isConnected && !!this.driver,
      config: this.config,
      lastActivity: this.lastActivityTime,
      hasStoredConfig: !!this.config,
    };
  }

  /**
   * 세션 유효성 확인
   */
  async isSessionValid(): Promise<boolean> {
    if (!this.driver) return false;

    try {
      await this.driver.status();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 세션 유효성 검사 및 자동 복구
   */
  async ensureSession(): Promise<boolean> {
    console.log('🔍 ensureSession 호출');
    console.log('  - driver 존재:', !!this.driver);
    console.log('  - config 존재:', !!this.config);
    console.log('  - isConnected:', this.isConnected);

    // 드라이버가 없으면 재연결 시도
    if (!this.driver) {
      if (this.config) {
        console.log('⚠️ 드라이버 없음, 재연결 시도...');
        this.reconnectAttempts = 0;
        return await this._attemptReconnect();
      }
      throw new Error('드라이버가 초기화되지 않음. 먼저 connect()를 호출하세요.');
    }

    try {
      await this.driver.status();
      this.lastActivityTime = Date.now();
      console.log('✅ 세션 유효');
      return true;
    } catch (error) {
      const err = error as Error;
      console.log('⚠️ 세션 문제 감지:', err.message);
      return await this._attemptReconnect();
    }
  }

  /**
   * 재연결 시도
   */
  private async _attemptReconnect(): Promise<boolean> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.isConnected = false;
      throw new Error('세션 복구 실패. 다시 연결해주세요.');
    }

    this.reconnectAttempts++;
    console.log(`🔄 재연결 시도 ${this.reconnectAttempts}/${this.maxReconnectAttempts}...`);

    try {
      await this.reconnect();
      return true;
    } catch (e) {
      const reconnectError = e as Error;
      console.error('❌ 재연결 실패:', reconnectError.message);

      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        this.isConnected = false;
        throw new Error('세션 복구 실패. 다시 연결해주세요.');
      }

      return await this._attemptReconnect();
    }
  }

  /**
   * 재연결
   */
  async reconnect(): Promise<void> {
    if (!this.config) {
      throw new Error('이전 연결 정보가 없습니다.');
    }

    console.log('🔄 재연결 중...');

    try {
      if (this.driver) {
        await this.driver.deleteSession();
      }
    } catch {
      // 무시
    }

    this.driver = null;
    this.isConnected = false;

    await new Promise(resolve => setTimeout(resolve, 2000));

    await this.connect(this.config);
    console.log('✅ 재연결 성공');
  }

  /**
   * Keep-alive 시작 (5분마다)
   */
  private _startKeepAlive(): void {
    this._stopKeepAlive();

    this.keepAliveInterval = setInterval(async () => {
      if (!this.driver || !this.isConnected) return;

      try {
        await this.driver.status();
        this.lastActivityTime = Date.now();
        console.log('💓 Keep-alive 성공');
      } catch (error) {
        console.log('⚠️ Keep-alive 실패, 재연결 시도...');
        try {
          await this.reconnect();
        } catch (e) {
          const err = e as Error;
          console.error('❌ Keep-alive 재연결 실패:', err.message);
        }
      }
    }, 5 * 60 * 1000);
  }

  /**
   * Keep-alive 중지
   */
  private _stopKeepAlive(): void {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }

  /**
   * 드라이버 가져오기
   */
  async getDriver(): Promise<Browser> {
    await this.ensureSession();
    this.lastActivityTime = Date.now();
    return this.driver!;
  }

  /**
   * 드라이버 가져오기 - 별칭
   */
  async getValidDriver(): Promise<Browser> {
    return await this.getDriver();
  }

  /**
   * 스크린샷
   */
  async takeScreenshot(): Promise<string> {
    const driver = await this.getDriver();
    const screenshot = await driver.takeScreenshot();
    return `data:image/png;base64,${screenshot}`;
  }

  /**
   * 디바이스 정보
   */
  async getDeviceInfo(): Promise<DeviceInfo> {
    const driver = await this.getDriver();

    const [windowSize, batteryInfo] = await Promise.all([
      driver.getWindowRect(),
      driver.execute('mobile: batteryInfo', {}).catch(() => null),
    ]);

    return {
      windowSize,
      batteryInfo,
    };
  }
}

// 싱글톤 인스턴스 export
const appiumDriver = new AppiumDriver();
export default appiumDriver;