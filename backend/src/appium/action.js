// backend/src/appium/actions.js

/**
 * Appium 액션 모듈
 * - 탭, 롱프레스, 텍스트 입력 등
 */

const appiumDriver = require('./driver');

class Actions {
  /**
   * 드라이버 인스턴스 가져오기 (내부 헬퍼)
   */
  _getDriver() {
    const driver = appiumDriver.getDriver();
    if (!driver) {
      throw new Error('디바이스가 연결되어 있지 않습니다.');
    }
    return driver;
  }

  /**
   * 좌표 탭 (클릭)
   * @param {number} x - X 좌표
   * @param {number} y - Y 좌표
   */
  async tap(x, y) {
    const driver = this._getDriver();
    
    console.log(`👆 탭: (${x}, ${y})`);
    
    await driver.action('pointer', {
      parameters: { pointerType: 'touch' }
    })
      .move({ x: parseInt(x), y: parseInt(y) })
      .down()
      .up()
      .perform();
    
    return { success: true, action: 'tap', x, y };
  }

  /**
   * 롱프레스 (길게 누르기)
   * @param {number} x - X 좌표
   * @param {number} y - Y 좌표
   * @param {number} duration - 누르고 있는 시간 (ms)
   */
  async longPress(x, y, duration = 1000) {
    const driver = this._getDriver();
    
    console.log(`👇 롱프레스: (${x}, ${y}) - ${duration}ms`);
    
    await driver.action('pointer', {
      parameters: { pointerType: 'touch' }
    })
      .move({ x: parseInt(x), y: parseInt(y) })
      .down()
      .pause(duration)
      .up()
      .perform();
    
    return { success: true, action: 'longPress', x, y, duration };
  }

  /**
   * 텍스트 입력
   * @param {string} selector - 요소 선택자 (id, xpath 등)
   * @param {string} text - 입력할 텍스트
   * @param {string} strategy - 선택 전략 ('id', 'xpath', 'accessibility id')
   */
  async inputText(selector, text, strategy = 'id') {
    const driver = this._getDriver();
    
    console.log(`⌨️ 텍스트 입력: "${text}" → ${strategy}:${selector}`);
    
    // 요소 찾기
    let element;
    switch (strategy.toLowerCase()) {
      case 'id':
        element = await driver.$(`id=${selector}`);
        break;
      case 'xpath':
        element = await driver.$(selector);
        break;
      case 'accessibility id':
        element = await driver.$(`~${selector}`);
        break;
      default:
        element = await driver.$(`id=${selector}`);
    }
    
    // 기존 텍스트 지우고 새 텍스트 입력
    await element.clearValue();
    await element.setValue(text);
    
    return { success: true, action: 'inputText', selector, text, strategy };
  }

  /**
   * 요소 클릭 (선택자 기반)
   * @param {string} selector - 요소 선택자
   * @param {string} strategy - 선택 전략
   */
  async clickElement(selector, strategy = 'id') {
    const driver = this._getDriver();
    
    console.log(`👆 요소 클릭: ${strategy}:${selector}`);
    
    let element;
    switch (strategy.toLowerCase()) {
      case 'id':
        element = await driver.$(`id=${selector}`);
        break;
      case 'xpath':
        element = await driver.$(selector);
        break;
      case 'accessibility id':
        element = await driver.$(`~${selector}`);
        break;
      case 'text':
        element = await driver.$(`//*[@text="${selector}"]`);
        break;
      default:
        element = await driver.$(`id=${selector}`);
    }
    
    await element.click();
    
    return { success: true, action: 'clickElement', selector, strategy };
  }

  /**
   * 대기
   * @param {number} ms - 대기 시간 (밀리초)
   */
  async wait(ms) {
    console.log(`⏳ 대기: ${ms}ms`);
    
    await new Promise(resolve => setTimeout(resolve, parseInt(ms)));
    
    return { success: true, action: 'wait', duration: ms };
  }

  /**
   * 뒤로 가기 버튼
   */
  async pressBack() {
    const driver = this._getDriver();
    
    console.log('⬅️ 뒤로 가기');
    
    await driver.back();
    
    return { success: true, action: 'pressBack' };
  }

  /**
   * 홈 버튼
   */
  async pressHome() {
    const driver = this._getDriver();
    
    console.log('🏠 홈 버튼');
    
    await driver.execute('mobile: pressKey', { keycode: 3 });
    
    return { success: true, action: 'pressHome' };
  }

  /**
   * 앱 다시 시작
   */
  async restartApp() {
    const driver = this._getDriver();
    
    console.log('🔄 앱 재시작');
    
    const appPackage = driver.capabilities.appPackage;
    await driver.terminateApp(appPackage);
    await this.wait(1000);
    await driver.activateApp(appPackage);
    
    return { success: true, action: 'restartApp', appPackage };
  }

  /**
   * 앱 데이터 삭제 (캐시 포함, 완전 초기화)
   * @param {string} appPackage - 앱 패키지명 (생략 시 현재 연결된 앱)
   */
  async clearAppData(appPackage = null) {
    const driver = this._getDriver();
    
    // 패키지명이 없으면 현재 연결된 앱 사용
    const targetPackage = appPackage || driver.capabilities.appPackage;
    
    console.log(`🗑️ 앱 데이터 삭제: ${targetPackage}`);
    
    // ADB 명령으로 앱 데이터 삭제
    await driver.execute('mobile: shell', {
      command: 'pm',
      args: ['clear', targetPackage]
    });
    
    return { 
      success: true, 
      action: 'clearAppData', 
      appPackage: targetPackage,
      message: '앱 데이터가 삭제되었습니다. 앱이 종료되었을 수 있습니다.'
    };
  }

  /**
   * 앱 캐시만 삭제 (데이터 유지)
   * @param {string} appPackage - 앱 패키지명 (생략 시 현재 연결된 앱)
   */
  async clearAppCache(appPackage = null) {
    const driver = this._getDriver();
    
    // 패키지명이 없으면 현재 연결된 앱 사용
    const targetPackage = appPackage || driver.capabilities.appPackage;
    
    console.log(`🧹 앱 캐시 삭제: ${targetPackage}`);
    
    // ADB 명령으로 캐시 삭제
    try {
      await driver.execute('mobile: shell', {
        command: 'rm',
        args: ['-rf', `/data/data/${targetPackage}/cache/*`]
      });
    } catch (e) {
      // 권한 없으면 앱 컨텍스트로 시도
      console.log('캐시 삭제 대체 방법 시도...');
    }
    
    return { 
      success: true, 
      action: 'clearAppCache', 
      appPackage: targetPackage,
      message: '앱 캐시가 삭제되었습니다.'
    };
  }

    /**
   * 앱 데이터 삭제 (캐시 포함, 완전 초기화)
   * @param {string} appPackage - 앱 패키지명 (생략 시 현재 연결된 앱)
   */
  async clearAppData(appPackage = null) {
    const driver = this._getDriver();
    
    // 패키지명이 없으면 현재 연결된 앱 사용
    const targetPackage = appPackage || driver.capabilities.appPackage;
    
    console.log(`🗑️ 앱 데이터 삭제: ${targetPackage}`);
    
    // ADB 명령으로 앱 데이터 삭제
    await driver.execute('mobile: shell', {
      command: 'pm',
      args: ['clear', targetPackage]
    });
    
    return { 
      success: true, 
      action: 'clearAppData', 
      appPackage: targetPackage,
      message: '앱 데이터가 삭제되었습니다. 앱이 종료되었을 수 있습니다.'
    };
  }

  /**
   * 앱 캐시만 삭제 (데이터 유지)
   * @param {string} appPackage - 앱 패키지명 (생략 시 현재 연결된 앱)
   */
  async clearAppCache(appPackage = null) {
    const driver = this._getDriver();
    
    // 패키지명이 없으면 현재 연결된 앱 사용
    const targetPackage = appPackage || driver.capabilities.appPackage;
    
    console.log(`🧹 앱 캐시 삭제: ${targetPackage}`);
    
    // ADB 명령으로 캐시 삭제
    await driver.execute('mobile: shell', {
      command: 'run-as',
      args: [targetPackage, 'rm', '-rf', 'cache/*']
    });
    
    // run-as가 안 되는 경우 (릴리즈 빌드) 대체 방법
    try {
      await driver.execute('mobile: shell', {
        command: 'rm',
        args: ['-rf', `/data/data/${targetPackage}/cache/*`]
      });
    } catch (e) {
      // 권한 없으면 무시 (위 명령이 성공했을 수 있음)
    }
    
    return { 
      success: true, 
      action: 'clearAppCache', 
      appPackage: targetPackage,
      message: '앱 캐시가 삭제되었습니다.'
    };
  }
}

// 싱글톤 인스턴스 내보내기
module.exports = new Actions();