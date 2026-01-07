// backend/src/appium/actions.js

const appiumDriver = require('./driver');

class Actions {
  // 유효한 드라이버 가져오기 (세션 확인 포함)
  async _getDriver() {
    return await appiumDriver.getValidDriver();
  }

  async tap(x, y) {
    const driver = await this._getDriver();
    
    await driver
      .action('pointer', { parameters: { pointerType: 'touch' } })
      .move({ x: Math.round(x), y: Math.round(y) })
      .down()
      .up()
      .perform();

    console.log(`👆 탭: (${x}, ${y})`);
    return { success: true, action: 'tap', x, y };
  }

  async longPress(x, y, duration = 1000) {
    const driver = await this._getDriver();
    
    await driver
      .action('pointer', { parameters: { pointerType: 'touch' } })
      .move({ x: Math.round(x), y: Math.round(y) })
      .down()
      .pause(duration)
      .up()
      .perform();

    console.log(`👆 롱프레스: (${x}, ${y}), ${duration}ms`);
    return { success: true, action: 'longPress', x, y, duration };
  }

  async inputText(selector, text, strategy = 'id') {
    const driver = await this._getDriver();
    const element = await driver.$(this._buildSelector(selector, strategy));
    
    await element.setValue(text);

    console.log(`⌨️ 텍스트 입력: "${text}"`);
    return { success: true, action: 'inputText', text };
  }

  async clickElement(selector, strategy = 'id') {
    const driver = await this._getDriver();
    const element = await driver.$(this._buildSelector(selector, strategy));
    
    await element.click();

    console.log(`👆 요소 클릭: ${selector}`);
    return { success: true, action: 'click', selector };
  }

  _buildSelector(selector, strategy) {
    switch (strategy) {
      case 'id':
        return `android=new UiSelector().resourceId("${selector}")`;
      case 'xpath':
        return selector;
      case 'accessibility id':
        return `~${selector}`;
      case 'text':
        return `android=new UiSelector().text("${selector}")`;
      default:
        return selector;
    }
  }

  async wait(ms) {
    await new Promise(resolve => setTimeout(resolve, ms));
    console.log(`⏳ 대기: ${ms}ms`);
    return { success: true, action: 'wait', duration: ms };
  }

  async pressBack() {
    const driver = await this._getDriver();
    await driver.execute('mobile: pressKey', { keycode: 4 });
    console.log('⬅️ 뒤로 가기');
    return { success: true, action: 'back' };
  }

  async pressHome() {
    const driver = await this._getDriver();
    await driver.execute('mobile: pressKey', { keycode: 3 });
    console.log('🏠 홈 버튼');
    return { success: true, action: 'home' };
  }

  async restartApp() {
    const driver = await this._getDriver();
    const currentPackage = await driver.getCurrentPackage();
    
    await driver.terminateApp(currentPackage);
    await new Promise(resolve => setTimeout(resolve, 1000));
    await driver.activateApp(currentPackage);

    console.log(`🔄 앱 재시작: ${currentPackage}`);
    return { success: true, action: 'restart', package: currentPackage };
  }

  async clearAppData(appPackage) {
    const driver = await this._getDriver();
    const targetPackage = appPackage || await driver.getCurrentPackage();
    
    await driver.execute('mobile: shell', {
      command: 'pm',
      args: ['clear', targetPackage],
    });

    console.log(`🗑️ 앱 데이터 삭제: ${targetPackage}`);
    return { success: true, action: 'clearData', package: targetPackage };
  }

  async clearAppCache(appPackage) {
    const driver = await this._getDriver();
    const targetPackage = appPackage || await driver.getCurrentPackage();
    
    await driver.execute('mobile: shell', {
      command: 'rm',
      args: ['-rf', `/data/data/${targetPackage}/cache/*`],
    });

    console.log(`🧹 앱 캐시 삭제: ${targetPackage}`);
    return { success: true, action: 'clearCache', package: targetPackage };
  }
}

module.exports = new Actions();