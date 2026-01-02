/*
 * Appium 드라이버 관리 모듈
 * - 디바이스 연결/해제
 * - 연결 상태 확인
 */

const { remote } = require('webdriverio');

class AppiumDriver {
  //constructor 초기화
  constructor() {
    // 드라이버 인스턴스 저장 변수
    this.driver = null;
    
    // 연결 설정 저장
    this.config = null;
  }

  /**
   * 디바이스 연결
   * @param {Object} config - 연결 설정
   * @returns {Promise<Object>} - 연결 결과
   */
  async connect(config) {
    // 이미 연결되어 있으면 에러
    if (this.driver) {
      throw new Error('이미 디바이스에 연결되어 있습니다.');
    }

    // 설정값 저장
    this.config = config;

    // Appium capabilities 설정
    const capabilities = {
      platformName: config.platformName || 'Android',
      'appium:deviceName': config.deviceName || 'device',
      'appium:automationName': 'UiAutomator2',
      'appium:appPackage': config.appPackage || 'com.android.settings',
      'appium:appActivity': config.appActivity || '.Settings',
      'appium:noReset': true,  // 앱 데이터 유지
      'appium:newCommandTimeout': 300,  // 5분 타임아웃
    };

    console.log('📱 디바이스 연결 시도...');
    console.log('설정:', JSON.stringify(capabilities, null, 2));

    try {
      // Appium 서버에 연결
      this.driver = await remote({
        hostname: config.hostname || 'localhost',
        port: config.port || 4723,
        path: '/',
        capabilities,
        logLevel: 'warn',  // 로그 레벨 (trace, debug, info, warn, error)
      });

      console.log('✅ 디바이스 연결 성공!');
      
      // 연결 정보 반환
      return {
        success: true,
        sessionId: this.driver.sessionId,
        capabilities: this.driver.capabilities,
      };
    } catch (error) {
      console.error('❌ 디바이스 연결 실패:', error.message);
      this.driver = null;
      throw error;
    }
  }

  /**
   * 디바이스 연결 해제
   * @returns {Promise<Object>} - 해제 결과
   */
  async disconnect() {
    if (!this.driver) {
      throw new Error('연결된 디바이스가 없습니다.');
    }

    try {
      console.log('🔌 디바이스 연결 해제 중...');
      await this.driver.deleteSession();
      this.driver = null;
      this.config = null;
      console.log('✅ 연결 해제 완료');
      
      return { success: true, message: '연결이 해제되었습니다.' };
    } catch (error) {
      console.error('❌ 연결 해제 실패:', error.message);
      throw error;
    }
  }

  /**
   * 연결 상태 확인
   * @returns {Object} - 연결 상태 정보
   */
  getStatus() {
    if (!this.driver) {
      return {
        connected: false,
        message: '연결된 디바이스가 없습니다.',
      };
    }

    return {
      connected: true,
      sessionId: this.driver.sessionId,
      config: this.config,
    };
  }

  /**
   * 드라이버 인스턴스 반환
   * @returns {Object|null} - WebDriverIO 드라이버
   */
  getDriver() {
    return this.driver;
  }

  /**
   * 스크린샷 촬영
   * @returns {Promise<string>} - Base64 인코딩된 이미지
   */
  async takeScreenshot() {
    if (!this.driver) {
      throw new Error('연결된 디바이스가 없습니다.');
    }

    const screenshot = await this.driver.takeScreenshot();
    return screenshot;  // Base64 문자열
  }

  /**
   * 디바이스 정보 가져오기
   * @returns {Promise<Object>} - 디바이스 정보
   */
  async getDeviceInfo() {
    if (!this.driver) {
      throw new Error('연결된 디바이스가 없습니다.');
    }

    // 다양한 디바이스 정보 수집
    const [windowSize, orientation] = await Promise.all([
      this.driver.getWindowSize(),
      this.driver.getOrientation(),
    ]);

    return {
      sessionId: this.driver.sessionId,
      platformName: this.driver.capabilities.platformName,
      deviceName: this.driver.capabilities.deviceName,
      platformVersion: this.driver.capabilities.platformVersion,
      windowSize,
      orientation,
    };
  }
}

// 싱글톤 인스턴스 생성 및 내보내기
// 앱 전체에서 하나의 드라이버만 사용
module.exports = new AppiumDriver();