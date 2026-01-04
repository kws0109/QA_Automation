// backend/src/routes/action.js

/**
 * 액션 관련 API 라우트
 */

const express = require('express');
const router = express.Router();
const actions = require('../appium/action');

/**
 * POST /api/action/tap
 * 좌표 탭
 * Body: { x: number, y: number }
 */
router.post('/tap', async (req, res) => {
  try {
    const { x, y } = req.body;
    
    if (x === undefined || y === undefined) {
      return res.status(400).json({
        success: false,
        message: 'x, y 좌표가 필요합니다.',
      });
    }
    
    const result = await actions.tap(x, y);
    res.json(result);
  } catch (error) {
    console.error('탭 에러:', error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * POST /api/action/longPress
 * 롱프레스
 * Body: { x: number, y: number, duration?: number }
 */
router.post('/longPress', async (req, res) => {
  try {
    const { x, y, duration = 1000 } = req.body;
    
    if (x === undefined || y === undefined) {
      return res.status(400).json({
        success: false,
        message: 'x, y 좌표가 필요합니다.',
      });
    }
    
    const result = await actions.longPress(x, y, duration);
    res.json(result);
  } catch (error) {
    console.error('롱프레스 에러:', error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * POST /api/action/inputText
 * 텍스트 입력
 * Body: { selector: string, text: string, strategy?: string }
 */
router.post('/inputText', async (req, res) => {
  try {
    const { selector, text, strategy = 'id' } = req.body;
    
    if (!selector || text === undefined) {
      return res.status(400).json({
        success: false,
        message: 'selector와 text가 필요합니다.',
      });
    }
    
    const result = await actions.inputText(selector, text, strategy);
    res.json(result);
  } catch (error) {
    console.error('텍스트 입력 에러:', error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * POST /api/action/click
 * 요소 클릭
 * Body: { selector: string, strategy?: string }
 */
router.post('/click', async (req, res) => {
  try {
    const { selector, strategy = 'id' } = req.body;
    
    if (!selector) {
      return res.status(400).json({
        success: false,
        message: 'selector가 필요합니다.',
      });
    }
    
    const result = await actions.clickElement(selector, strategy);
    res.json(result);
  } catch (error) {
    console.error('클릭 에러:', error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * POST /api/action/wait
 * 대기
 * Body: { duration: number }
 */
router.post('/wait', async (req, res) => {
  try {
    const { duration } = req.body;
    
    if (!duration) {
      return res.status(400).json({
        success: false,
        message: 'duration이 필요합니다.',
      });
    }
    
    const result = await actions.wait(duration);
    res.json(result);
  } catch (error) {
    console.error('대기 에러:', error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * POST /api/action/back
 * 뒤로 가기
 */
router.post('/back', async (req, res) => {
  try {
    const result = await actions.pressBack();
    res.json(result);
  } catch (error) {
    console.error('뒤로 가기 에러:', error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * POST /api/action/home
 * 홈 버튼
 */
router.post('/home', async (req, res) => {
  try {
    const result = await actions.pressHome();
    res.json(result);
  } catch (error) {
    console.error('홈 버튼 에러:', error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * POST /api/action/restart
 * 앱 재시작
 */
router.post('/restart', async (req, res) => {
  try {
    const result = await actions.restartApp();
    res.json(result);
  } catch (error) {
    console.error('앱 재시작 에러:', error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * POST /api/action/clearData
 * 앱 데이터 삭제 (완전 초기화)
 * Body: { appPackage?: string }
 */
router.post('/clearData', async (req, res) => {
  try {
    const { appPackage } = req.body;
    
    const result = await actions.clearAppData(appPackage);
    res.json(result);
  } catch (error) {
    console.error('앱 데이터 삭제 에러:', error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * POST /api/action/clearCache
 * 앱 캐시만 삭제
 * Body: { appPackage?: string }
 */
router.post('/clearCache', async (req, res) => {
  try {
    const { appPackage } = req.body;
    
    const result = await actions.clearAppCache(appPackage);
    res.json(result);
  } catch (error) {
    console.error('앱 캐시 삭제 에러:', error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

module.exports = router;