// backend/src/appium/driver.js

const { remote } = require('webdriverio');
const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, '../../.driver-config.json');

class AppiumDriver {
  constructor() {
    this.driver = null;
    this.isConnected = false;
    this.config = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;
    this.lastActivityTime = null;
    this.keepAliveInterval = null;

    // 서버 시작 시 저장된 config 로드
    this._loadConfig();
  }

  /**
   * config 파일 저장
   */
  _saveConfig() {
    try {
      if (this.config) {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.config, null, 2));
        console.log('💾 연결 설정 저장됨');
      }
    } catch (e) {
      console.error('⚠️ 설정 저장 실패:', e.message);
    }
  }

  /**
   * config 파일 로드
   */
  _loadConfig() {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
        this.config = JSON.parse(data);
        console.log('📂 저장된 연결 설정 로드됨');
      }
    } catch (e) {
      console.error('⚠️ 설정 로드 실패:', e.message);
    }
  }

  /**
   * config 파일 삭제
   */
  _clearConfig() {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        fs.unlinkSync(CONFIG_FILE);
        console.log('🗑️ 연결 설정 삭제됨');
      }
    } catch (e) {
      // 무시
    }
  }

  /**
   * 디바이스 연결
   */
  async connect(config) {
    try {
      // 설정 저장 (재연결용)
      this.config = config;
      this._saveConfig();  // 파일에도 저장

      const capabilities = {
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

    } catch (error) {
      console.error('❌ Appium 연결 실패:', error.message);
      this.driver = null;
      this.isConnected = false;
      throw error;
    }
  }

  /**
   * 연결 해제
   */
  async disconnect() {
    try {
      this._stopKeepAlive();

      if (this.driver) {
        await this.driver.deleteSession();
        this.driver = null;
      }

      this.isConnected = false;
      this.config = null;
      this._clearConfig();  // 파일도 삭제

      console.log('✅ Appium 연결 해제');
      return { success: true, message: '연결 해제 완료' };

    } catch (error) {
      this.driver = null;
      this.isConnected = false;
      console.error('❌ 연결 해제 에러:', error.message);
      return { success: true, message: '연결 해제 완료' };
    }
  }

  /**
   * 연결 상태 조회
   */
  getStatus() {
    return {
      connected: this.isConnected && !!this.driver,
      config: this.config,
      lastActivity: this.lastActivityTime,
      hasStoredConfig: !!this.config,  // 저장된 설정 존재 여부
    };
  }

  /**
   * 세션 유효성 확인
   */
  async isSessionValid() {
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
  async ensureSession() {
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
      console.log('⚠️ 세션 문제 감지:', error.message);
      return await this._attemptReconnect();
    }
  }

  /**
   * 재연결 시도
   */
  async _attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.isConnected = false;
      throw new Error('세션 복구 실패. 다시 연결해주세요.');
    }

    this.reconnectAttempts++;
    console.log(`🔄 재연결 시도 ${this.reconnectAttempts}/${this.maxReconnectAttempts}...`);

    try {
      await this.reconnect();
      return true;
    } catch (reconnectError) {
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
  async reconnect() {
    if (!this.config) {
      throw new Error('이전 연결 정보가 없습니다.');
    }

    console.log('🔄 재연결 중...');

    try {
      if (this.driver) {
        await this.driver.deleteSession();
      }
    } catch (e) {
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
  _startKeepAlive() {
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
          console.error('❌ Keep-alive 재연결 실패:', e.message);
        }
      }
    }, 5 * 60 * 1000);
  }

  /**
   * Keep-alive 중지
   */
  _stopKeepAlive() {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }

  /**
   * 드라이버 가져오기
   */
  async getDriver() {
    await this.ensureSession();
    this.lastActivityTime = Date.now();
    return this.driver;
  }

  /**
   * 드라이버 가져오기 - 별칭
   */
  async getValidDriver() {
    return await this.getDriver();
  }

  /**
   * 스크린샷
   */
  async takeScreenshot() {
    const driver = await this.getDriver();
    const screenshot = await driver.takeScreenshot();
    return `data:image/png;base64,${screenshot}`;
  }

  /**
   * 디바이스 정보
   */
  async getDeviceInfo() {
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

module.exports = new AppiumDriver();