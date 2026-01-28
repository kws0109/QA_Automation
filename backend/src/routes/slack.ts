// backend/src/routes/slack.ts
// Slack 알림 설정 API (환경 변수 기반 - 읽기 전용)

import { Router, Request, Response } from 'express';
import { slackNotificationService } from '../services/slackNotificationService';
import { asyncHandler, syncHandler } from '../utils/asyncHandler';

const router = Router();

/**
 * GET /api/slack/settings
 * 현재 Slack 알림 설정 상태 조회
 */
router.get('/settings', syncHandler((_req: Request, res: Response) => {
  const settings = slackNotificationService.getSettings();
  res.json({
    success: true,
    data: settings,
  });
}));

/**
 * POST /api/slack/test
 * Slack 연결 테스트
 */
router.post('/test', asyncHandler(async (_req: Request, res: Response) => {
  const result = await slackNotificationService.testConnection();
  res.json({
    success: result.success,
    message: result.message,
  });
}));

export default router;
