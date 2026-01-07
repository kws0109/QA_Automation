// backend/src/routes/report.js

const express = require('express');
const router = express.Router();
const reportService = require('../services/report');

/**
 * GET /api/reports
 * 리포트 목록 조회
 */
router.get('/', async (req, res) => {
  try {
    const reports = await reportService.getAll();
    
    res.json({
      success: true,
      count: reports.length,
      data: reports,
    });
  } catch (error) {
    console.error('리포트 목록 조회 에러:', error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * GET /api/reports/:id
 * 특정 리포트 조회
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const report = await reportService.getById(id);
    
    res.json({
      success: true,
      data: report,
    });
  } catch (error) {
    console.error('리포트 조회 에러:', error.message);
    res.status(404).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * DELETE /api/reports/:id
 * 리포트 삭제
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await reportService.delete(id);
    
    res.json(result);
  } catch (error) {
    console.error('리포트 삭제 에러:', error.message);
    res.status(404).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * DELETE /api/reports
 * 모든 리포트 삭제
 */
router.delete('/', async (req, res) => {
  try {
    const result = await reportService.deleteAll();
    
    res.json(result);
  } catch (error) {
    console.error('리포트 전체 삭제 에러:', error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

module.exports = router;