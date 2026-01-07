// backend/src/appium/driver.js

const { remote } = require('webdriverio');

class AppiumDriver {
  constructor() {
    this.driver = null;
    this.config = null;
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

  getDriver() {
    return this.driver;
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

  // 세션 재연결
  async reconnect() {
    if (!this.config) {
      throw new Error('저장된 연결 정보가 없습니다.');
    }
    
    console.log('🔄 세션 재연결 시도...');
    await this.disconnect();
    return await this.connect(this.config);
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