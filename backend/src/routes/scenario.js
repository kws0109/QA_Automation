// backend/src/routes/scenario.js

/**
 * 시나리오 관련 API 라우트
 */

const express = require('express');
const router = express.Router();
const scenarioService = require('../services/scenario');
const executor = require('../services/executor');

/**
 * GET /api/scenarios/execution/status
 * 실행 상태 조회 (이 라우트를 :id 라우트보다 먼저 배치!)
 */
router.get('/execution/status', (req, res) => {
  const status = executor.getStatus();
  res.json(status);
});

/**
 * GET /api/scenarios/execution/log
 * 실행 로그 조회
 */
router.get('/execution/log', (req, res) => {
  const log = executor.getLog();
  res.json({
    success: true,
    count: log.length,
    data: log,
  });
});

/**
 * POST /api/scenarios/stop
 * 시나리오 실행 중지
 */
router.post('/stop', (req, res) => {
  try {
    const result = executor.stop();
    res.json(result);
  } catch (error) {
    console.error('시나리오 중지 에러:', error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * GET /api/scenarios
 * 시나리오 목록 조회
 */
router.get('/', async (req, res) => {
  try {
    const scenarios = await scenarioService.getAll();
    
    res.json({
      success: true,
      count: scenarios.length,
      data: scenarios,
    });
  } catch (error) {
    console.error('시나리오 목록 조회 에러:', error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * GET /api/scenarios/:id
 * 특정 시나리오 조회
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const scenario = await scenarioService.getById(id);
    
    res.json({
      success: true,
      data: scenario,
    });
  } catch (error) {
    console.error('시나리오 조회 에러:', error.message);
    res.status(404).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * POST /api/scenarios
 * 새 시나리오 생성
 */
router.post('/', async (req, res) => {
  try {
    const data = req.body;
    const scenario = await scenarioService.create(data);
    
    res.status(201).json({
      success: true,
      message: '시나리오가 생성되었습니다.',
      data: scenario,
    });
  } catch (error) {
    console.error('시나리오 생성 에러:', error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * PUT /api/scenarios/:id
 * 시나리오 수정
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;
    const scenario = await scenarioService.update(id, data);
    
    res.json({
      success: true,
      message: '시나리오가 수정되었습니다.',
      data: scenario,
    });
  } catch (error) {
    console.error('시나리오 수정 에러:', error.message);
    res.status(404).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * DELETE /api/scenarios/:id
 * 시나리오 삭제
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await scenarioService.delete(id);
    
    res.json(result);
  } catch (error) {
    console.error('시나리오 삭제 에러:', error.message);
    res.status(404).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * POST /api/scenarios/:id/duplicate
 * 시나리오 복제
 */
router.post('/:id/duplicate', async (req, res) => {
  try {
    const { id } = req.params;
    const scenario = await scenarioService.duplicate(id);
    
    res.status(201).json({
      success: true,
      message: '시나리오가 복제되었습니다.',
      data: scenario,
    });
  } catch (error) {
    console.error('시나리오 복제 에러:', error.message);
    res.status(404).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * POST /api/scenarios/:id/run
 * 시나리오 실행
 */
router.post('/:id/run', async (req, res) => {
  try {
    const { id } = req.params;
    
    // 시나리오 조회
    const scenario = await scenarioService.getById(id);
    
    // 시나리오 실행
    const result = await executor.run(scenario);
    
    res.json(result);
  } catch (error) {
    console.error('시나리오 실행 에러:', error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

module.exports = router;