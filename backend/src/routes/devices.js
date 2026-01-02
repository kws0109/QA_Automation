/*
 * 디바이스 관련 API 라우트
 */

const express = require('express');
const router = express.Router();
const appiumDriver = require('../appium/driver');

/*
 * POST /api/device/connect
 * 디바이스 연결
 */
router.post('/connect', async (req, res) => {
  try {
    // 요청 본문에서 설정 가져오기
    const config = req.body;
    
    console.log('📱 연결 요청:', config);
    
    // Appium 연결
    const result = await appiumDriver.connect(config);
    
    res.json({
      success: true,
      message: '디바이스 연결 성공',
      data: result,
    });
  } catch (error) {
    console.error('연결 에러:', error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/*
 * POST /api/device/disconnect
 * 디바이스 연결 해제
 */
router.post('/disconnect', async (req, res) => {
  try {
    const result = await appiumDriver.disconnect();
    
    res.json({
      success: true,
      message: '연결 해제 완료',
      data: result,
    });
  } catch (error) {
    console.error('연결 해제 에러:', error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/*
 * GET /api/device/status
 * 연결 상태 확인
 */
router.get('/status', (req, res) => {
  const status = appiumDriver.getStatus();
  res.json(status);
});

/*
 * GET /api/device/screenshot
 * 스크린샷 촬영
 */
router.get('/screenshot', async (req, res) => {
  try {
    const screenshot = await appiumDriver.takeScreenshot();
    
    res.json({
      success: true,
      // Base64 이미지 데이터
      image: `data:image/png;base64,${screenshot}`,
    });
  } catch (error) {
    console.error('스크린샷 에러:', error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/*
 * GET /api/device/info
 * 디바이스 정보 조회
 */
router.get('/info', async (req, res) => {
  try {
    const info = await appiumDriver.getDeviceInfo();
    
    res.json({
      success: true,
      data: info,
    });
  } catch (error) {
    console.error('디바이스 정보 에러:', error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

module.exports = router;