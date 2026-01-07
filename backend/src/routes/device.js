// backend/src/routes/device.js

const express = require('express');
const router = express.Router();
const appiumDriver = require('../appium/driver');

/**
 * POST /api/device/connect
 * 디바이스 연결
 */
router.post('/connect', async (req, res) => {
  try {
    const config = req.body;
    const result = await appiumDriver.connect(config);
    res.json(result);
  } catch (error) {
    console.error('디바이스 연결 에러:', error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * POST /api/device/disconnect
 * 디바이스 연결 해제
 */
router.post('/disconnect', async (req, res) => {
  try {
    const result = await appiumDriver.disconnect();
    res.json(result);
  } catch (error) {
    console.error('디바이스 연결 해제 에러:', error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * GET /api/device/status
 * 연결 상태 확인
 */
router.get('/status', (req, res) => {
  const status = appiumDriver.getStatus();
  res.json(status);
});

/**
 * GET /api/device/screenshot
 * 스크린샷 캡처
 */
router.get('/screenshot', async (req, res) => {
  try {
    const screenshot = await appiumDriver.takeScreenshot();
    res.json({
      success: true,
      screenshot,
    });
  } catch (error) {
    console.error('스크린샷 에러:', error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * GET /api/device/info
 * 디바이스 정보 조회
 */
router.get('/info', async (req, res) => {
  try {
    const info = await appiumDriver.getDeviceInfo();
    res.json({
      success: true,
      ...info,
    });
  } catch (error) {
    console.error('디바이스 정보 조회 에러:', error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * GET /api/device/source
 * 현재 화면의 UI 소스 가져오기
 */
router.get('/source', async (req, res) => {
  try {
    const driver = await appiumDriver.getValidDriver();
    const source = await driver.getPageSource();
    
    res.json({
      success: true,
      source,
    });
  } catch (error) {
    console.error('UI 소스 에러:', error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * POST /api/device/find-element
 * 좌표에 있는 요소 찾기
 */
router.post('/find-element', async (req, res) => {
  try {
    const { x, y } = req.body;
    const driver = await appiumDriver.getValidDriver();
    
    const source = await driver.getPageSource();
    const elementInfo = findElementAtCoordinate(source, x, y);
    
    res.json({
      success: true,
      element: elementInfo,
    });
  } catch (error) {
    console.error('요소 찾기 에러:', error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * XML에서 좌표에 해당하는 요소 찾기
 */
function findElementAtCoordinate(xmlSource, x, y) {
  let bestMatch = null;
  let smallestArea = Infinity;
  
  const allElementsRegex = /<([^\s/>]+)([^>]*)(?:\/>|>)/g;
  let match;
  
  while ((match = allElementsRegex.exec(xmlSource)) !== null) {
    const attributes = match[2];
    
    // bounds 추출
    const boundsMatch = attributes.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    if (!boundsMatch) continue;
    
    const left = parseInt(boundsMatch[1]);
    const top = parseInt(boundsMatch[2]);
    const right = parseInt(boundsMatch[3]);
    const bottom = parseInt(boundsMatch[4]);
    
    // 좌표가 bounds 안에 있는지 확인
    if (x >= left && x <= right && y >= top && y <= bottom) {
      const area = (right - left) * (bottom - top);
      
      if (area < smallestArea) {
        smallestArea = area;
        
        // 속성 추출
        const resourceId = attributes.match(/resource-id="([^"]*)"/)?.[1] || '';
        const text = attributes.match(/text="([^"]*)"/)?.[1] || '';
        const className = attributes.match(/class="([^"]*)"/)?.[1] || match[1];
        const contentDesc = attributes.match(/content-desc="([^"]*)"/)?.[1] || '';
        const clickable = attributes.includes('clickable="true"');
        const enabled = attributes.includes('enabled="true"');
        
        bestMatch = {
          resourceId,
          text,
          className,
          contentDesc,
          clickable,
          enabled,
          bounds: { left, top, right, bottom },
        };
      }
    }
  }
  
  return bestMatch;
}

module.exports = router;