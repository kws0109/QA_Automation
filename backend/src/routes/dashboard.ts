// backend/src/routes/dashboard.ts
// 대시보드 메트릭 API

import { Router, Request, Response } from 'express';
import { metricsAggregator } from '../services/metricsAggregator';
import { syncHandler } from '../utils/asyncHandler';

const router = Router();

/**
 * GET /api/dashboard/packages
 * 패키지 목록 조회
 */
router.get('/packages', syncHandler((req: Request, res: Response) => {
  const packages = metricsAggregator.getPackageList();
  res.json(packages);
}));

/**
 * GET /api/dashboard/overview
 * 대시보드 개요 데이터
 * Query: packageId (선택)
 */
router.get('/overview', syncHandler((req: Request, res: Response) => {
  const packageId = req.query.packageId as string | undefined;
  const overview = metricsAggregator.getDashboardOverview(packageId);
  res.json(overview);
}));

/**
 * GET /api/dashboard/success-rate-trend
 * 성공률 추이 (일별)
 * Query: days (기본 30), packageId (선택)
 */
router.get('/success-rate-trend', syncHandler((req: Request, res: Response) => {
  const days = parseInt(req.query.days as string) || 30;
  const packageId = req.query.packageId as string | undefined;
  const trend = metricsAggregator.getSuccessRateTrend(days, packageId);
  res.json(trend);
}));

/**
 * GET /api/dashboard/scenario-history
 * 시나리오별 히스토리 요약
 * Query: limit (기본 50), packageId (선택)
 */
router.get('/scenario-history', syncHandler((req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 50;
  const packageId = req.query.packageId as string | undefined;
  const history = metricsAggregator.getScenarioHistory(limit, packageId);
  res.json(history);
}));

/**
 * GET /api/dashboard/scenario/:id/history
 * 특정 시나리오의 실행 히스토리
 * Query: limit (기본 20)
 */
router.get('/scenario/:id/history', syncHandler((req: Request, res: Response) => {
  const scenarioId = req.params.id;
  const limit = parseInt(req.query.limit as string) || 20;
  const history = metricsAggregator.getScenarioExecutionHistory(scenarioId, limit);
  res.json(history);
}));

/**
 * GET /api/dashboard/suite-history
 * Suite별 히스토리 요약
 * Query: limit (기본 50)
 */
router.get('/suite-history', syncHandler((req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 50;
  const history = metricsAggregator.getSuiteHistory(limit);
  res.json(history);
}));

/**
 * GET /api/dashboard/suite/:id/history
 * 특정 Suite의 실행 히스토리
 * Query: limit (기본 20)
 */
router.get('/suite/:id/history', syncHandler((req: Request, res: Response) => {
  const suiteId = req.params.id;
  const limit = parseInt(req.query.limit as string) || 20;
  const history = metricsAggregator.getSuiteExecutionHistory(suiteId, limit);
  res.json(history);
}));

/**
 * GET /api/dashboard/failure-patterns
 * 실패 패턴 분석
 * Query: days (기본 30), packageId (선택)
 */
router.get('/failure-patterns', syncHandler((req: Request, res: Response) => {
  const days = parseInt(req.query.days as string) || 30;
  const packageId = req.query.packageId as string | undefined;
  const patterns = metricsAggregator.getFailurePatterns(days, packageId);
  res.json(patterns);
}));

/**
 * GET /api/dashboard/device-performance
 * 디바이스별 성능 요약
 * Query: limit (기본 20)
 */
router.get('/device-performance', syncHandler((req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 20;
  const performance = metricsAggregator.getDevicePerformance(limit);
  res.json(performance);
}));

/**
 * GET /api/dashboard/step-type-performance
 * 스텝 유형별 성능
 */
router.get('/step-type-performance', syncHandler((req: Request, res: Response) => {
  const performance = metricsAggregator.getStepTypePerformance();
  res.json(performance);
}));

/**
 * GET /api/dashboard/recent-executions
 * 최근 실행 목록
 * Query: limit (기본 20), packageId (선택)
 */
router.get('/recent-executions', syncHandler((req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 20;
  const packageId = req.query.packageId as string | undefined;
  const executions = metricsAggregator.getRecentExecutions(limit, packageId);
  res.json(executions);
}));

/**
 * GET /api/dashboard/image-match-performance
 * 이미지 매칭 성능 분석
 */
router.get('/image-match-performance', syncHandler((req: Request, res: Response) => {
  const performance = metricsAggregator.getImageMatchPerformance();
  res.json(performance);
}));

/**
 * GET /api/dashboard/ocr-performance
 * OCR 성능 분석
 */
router.get('/ocr-performance', syncHandler((req: Request, res: Response) => {
  const performance = metricsAggregator.getOcrPerformance();
  res.json(performance);
}));

export default router;
