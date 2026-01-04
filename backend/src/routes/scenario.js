/**
 * 시나리오 관련 API 라우트
 */

const express = require('express');
const router = express.Router();
const scenarioService = require('../services/scenario');

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

module.exports = router;