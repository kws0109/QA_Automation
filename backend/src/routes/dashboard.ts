// backend/src/routes/dashboard.ts
// 대시보드 메트릭 API

import { Router, Request, Response } from 'express';
import { metricsAggregator } from '../services/metricsAggregator';

const router = Router();

/**
 * GET /api/dashboard/packages
 * 패키지 목록 조회
 */
router.get('/packages', (req: Request, res: Response) => {
  try {
    const packages = metricsAggregator.getPackageList();
    res.json(packages);
  } catch (error) {
    console.error('[Dashboard API] packages 조회 실패:', error);
    res.status(500).json({ error: 'Failed to get package list' });
  }
});

/**
 * GET /api/dashboard/overview
 * 대시보드 개요 데이터
 * Query: packageId (선택)
 */
router.get('/overview', (req: Request, res: Response) => {
  try {
    const packageId = req.query.packageId as string | undefined;
    const overview = metricsAggregator.getDashboardOverview(packageId);
    res.json(overview);
  } catch (error) {
    console.error('[Dashboard API] overview 조회 실패:', error);
    res.status(500).json({ error: 'Failed to get dashboard overview' });
  }
});

/**
 * GET /api/dashboard/success-rate-trend
 * 성공률 추이 (일별)
 * Query: days (기본 30), packageId (선택)
 */
router.get('/success-rate-trend', (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const packageId = req.query.packageId as string | undefined;
    const trend = metricsAggregator.getSuccessRateTrend(days, packageId);
    res.json(trend);
  } catch (error) {
    console.error('[Dashboard API] success-rate-trend 조회 실패:', error);
    res.status(500).json({ error: 'Failed to get success rate trend' });
  }
});

/**
 * GET /api/dashboard/scenario-history
 * 시나리오별 히스토리 요약
 * Query: limit (기본 50), packageId (선택)
 */
router.get('/scenario-history', (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const packageId = req.query.packageId as string | undefined;
    const history = metricsAggregator.getScenarioHistory(limit, packageId);
    res.json(history);
  } catch (error) {
    console.error('[Dashboard API] scenario-history 조회 실패:', error);
    res.status(500).json({ error: 'Failed to get scenario history' });
  }
});

/**
 * GET /api/dashboard/scenario/:id/history
 * 특정 시나리오의 실행 히스토리
 * Query: limit (기본 20)
 */
router.get('/scenario/:id/history', (req: Request, res: Response) => {
  try {
    const scenarioId = req.params.id;
    const limit = parseInt(req.query.limit as string) || 20;
    const history = metricsAggregator.getScenarioExecutionHistory(scenarioId, limit);
    res.json(history);
  } catch (error) {
    console.error('[Dashboard API] scenario execution history 조회 실패:', error);
    res.status(500).json({ error: 'Failed to get scenario execution history' });
  }
});

/**
 * GET /api/dashboard/suite-history
 * Suite별 히스토리 요약
 * Query: limit (기본 50)
 */
router.get('/suite-history', (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const history = metricsAggregator.getSuiteHistory(limit);
    res.json(history);
  } catch (error) {
    console.error('[Dashboard API] suite-history 조회 실패:', error);
    res.status(500).json({ error: 'Failed to get suite history' });
  }
});

/**
 * GET /api/dashboard/suite/:id/history
 * 특정 Suite의 실행 히스토리
 * Query: limit (기본 20)
 */
router.get('/suite/:id/history', (req: Request, res: Response) => {
  try {
    const suiteId = req.params.id;
    const limit = parseInt(req.query.limit as string) || 20;
    const history = metricsAggregator.getSuiteExecutionHistory(suiteId, limit);
    res.json(history);
  } catch (error) {
    console.error('[Dashboard API] suite execution history 조회 실패:', error);
    res.status(500).json({ error: 'Failed to get suite execution history' });
  }
});

/**
 * GET /api/dashboard/failure-patterns
 * 실패 패턴 분석
 * Query: days (기본 30), packageId (선택)
 */
router.get('/failure-patterns', (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const packageId = req.query.packageId as string | undefined;
    const patterns = metricsAggregator.getFailurePatterns(days, packageId);
    res.json(patterns);
  } catch (error) {
    console.error('[Dashboard API] failure-patterns 조회 실패:', error);
    res.status(500).json({ error: 'Failed to get failure patterns' });
  }
});

/**
 * GET /api/dashboard/device-performance
 * 디바이스별 성능 요약
 * Query: limit (기본 20)
 */
router.get('/device-performance', (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const performance = metricsAggregator.getDevicePerformance(limit);
    res.json(performance);
  } catch (error) {
    console.error('[Dashboard API] device-performance 조회 실패:', error);
    res.status(500).json({ error: 'Failed to get device performance' });
  }
});

/**
 * GET /api/dashboard/step-type-performance
 * 스텝 유형별 성능
 */
router.get('/step-type-performance', (req: Request, res: Response) => {
  try {
    const performance = metricsAggregator.getStepTypePerformance();
    res.json(performance);
  } catch (error) {
    console.error('[Dashboard API] step-type-performance 조회 실패:', error);
    res.status(500).json({ error: 'Failed to get step type performance' });
  }
});

/**
 * GET /api/dashboard/recent-executions
 * 최근 실행 목록
 * Query: limit (기본 20), packageId (선택)
 */
router.get('/recent-executions', (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const packageId = req.query.packageId as string | undefined;
    const executions = metricsAggregator.getRecentExecutions(limit, packageId);
    res.json(executions);
  } catch (error) {
    console.error('[Dashboard API] recent-executions 조회 실패:', error);
    res.status(500).json({ error: 'Failed to get recent executions' });
  }
});

/**
 * GET /api/dashboard/image-match-performance
 * 이미지 매칭 성능 분석
 */
router.get('/image-match-performance', (req: Request, res: Response) => {
  try {
    const performance = metricsAggregator.getImageMatchPerformance();
    res.json(performance);
  } catch (error) {
    console.error('[Dashboard API] image-match-performance 조회 실패:', error);
    res.status(500).json({ error: 'Failed to get image match performance' });
  }
});

/**
 * GET /api/dashboard/ocr-performance
 * OCR 성능 분석
 */
router.get('/ocr-performance', (req: Request, res: Response) => {
  try {
    const performance = metricsAggregator.getOcrPerformance();
    res.json(performance);
  } catch (error) {
    console.error('[Dashboard API] ocr-performance 조회 실패:', error);
    res.status(500).json({ error: 'Failed to get OCR performance' });
  }
});

export default router;
