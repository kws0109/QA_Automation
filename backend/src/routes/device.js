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
      screenshot,  // data:image/png;base64,... 형식
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

module.exports = router;