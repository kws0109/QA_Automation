// backend/src/appium/driver.js

const { remote } = require('webdriverio');

class AppiumDriver {
  constructor() {
    this.driver = null;
    this.isConnected = false;
    this.capabilities = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;
  }

  /**
   * 세션 유효성 검사 및 자동 복구
   */
  async ensureSession() {
    if (!this.driver) {
      throw new Error('드라이버가 초기화되지 않음. 먼저 connect()를 호출하세요.');
    }

    try {
      // 세션 상태 확인
      await this.driver.getPageSource();
      this.reconnectAttempts = 0;  // 성공하면 재시도 횟수 리셋
      return true;
    } catch (error) {
      console.log('⚠️ 세션 문제 감지:', error.message);

      // 재연결 시도
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        console.log(`🔄 재연결 시도 ${this.reconnectAttempts}/${this.maxReconnectAttempts}...`);

        try {
          await this.reconnect();
          return true;
        } catch (reconnectError) {
          console.error('❌ 재연결 실패:', reconnectError.message);
        }
      }

      throw new Error('세션 복구 실패. 다시 연결해주세요.');
    }
  }

  async connect(config) {
    try {
      this.config = config;

      const capabilities = {
        platformName: 'Android',
        'appium:deviceName': config.deviceName || 'device',
        'appium:automationName': 'UiAutomator2',
        'appium:appPackage': config.appPackage,
        'appium:appActivity': config.appActivity,
        'appium:noReset': true,
        'appium:newCommandTimeout': 600,  // 10분으로 증가
        'appium:adbExecTimeout': 60000,
      };

      this.driver = await remote({
        hostname: 'localhost',
        port: 4723,
        path: '/',
        capabilities,
        connectionRetryCount: 3,
        connectionRetryTimeout: 30000,
      });

      console.log('✅ Appium 연결 성공');
      return { success: true, message: '디바이스 연결 성공' };

    } catch (error) {
      console.error('❌ Appium 연결 실패:', error.message);
      this.driver = null;
      throw error;
    }
  }

  async disconnect() {
    try {
      if (this.driver) {
        await this.driver.deleteSession();
        this.driver = null;
        console.log('✅ Appium 연결 해제');
      }
      return { success: true, message: '연결 해제 완료' };
    } catch (error) {
      this.driver = null;
      console.error('❌ 연결 해제 에러:', error.message);
      return { success: true, message: '연결 해제 완료' };
    }
  }

  getStatus() {
    return {
      connected: !!this.driver,
      config: this.config,
    };
  }

  // 세션 유효성 확인
  async isSessionValid() {
    if (!this.driver) return false;

    try {
      await this.driver.getPageSource();
      return true;
    } catch {
      return false;
    }
  }

  async reconnect() {
    if (!this.capabilities) {
      throw new Error('이전 연결 정보가 없습니다.');
    }

    console.log('🔄 재연결 중...');

    // 기존 드라이버 정리
    try {
      if (this.driver) {
        await this.driver.deleteSession();
      }
    } catch (e) {
      // 무시
    }

    this.driver = null;
    this.isConnected = false;

    // 새 세션 시작
    await this.connect(this.capabilities);
    console.log('✅ 재연결 성공');
  }

  /**
   * 드라이버 가져오기 (세션 확인 포함)
   */
  async getDriver() {
    await this.ensureSession();
    return this.driver;
  }

  // 세션 확인 후 드라이버 반환
  async getValidDriver() {
    if (!this.driver) {
      throw new Error('디바이스가 연결되어 있지 않습니다.');
    }

    const isValid = await this.isSessionValid();
    if (!isValid) {
      console.log('⚠️ 세션 만료, 재연결 시도...');
      await this.reconnect();
    }

    return this.driver;
  }

  async takeScreenshot() {
    const driver = await this.getValidDriver();
    const screenshot = await driver.takeScreenshot();
    return `data:image/png;base64,${screenshot}`;
  }

  async getDeviceInfo() {
    const driver = await this.getValidDriver();

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

module.exports = new AppiumDriver();
