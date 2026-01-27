// backend/src/routes/slack.ts
// Slack 알림 설정 API (환경 변수 기반 - 읽기 전용)

import { Router, Request, Response } from 'express';
import { slackNotificationService } from '../services/slackNotificationService';

const router = Router();

/**
 * GET /api/slack/settings
 * 현재 Slack 알림 설정 상태 조회
 */
router.get('/settings', (_req: Request, res: Response) => {
  try {
    const settings = slackNotificationService.getSettings();
    res.json({
      success: true,
      data: settings,
    });
  } catch (error) {
    console.error('[Slack API] 설정 조회 실패:', error);
    res.status(500).json({
      success: false,
      error: '설정 조회에 실패했습니다.',
    });
  }
});

/**
 * POST /api/slack/test
 * Slack 연결 테스트
 */
router.post('/test', async (_req: Request, res: Response) => {
  try {
    const result = await slackNotificationService.testConnection();
    res.json({
      success: result.success,
      message: result.message,
    });
  } catch (error) {
    console.error('[Slack API] 연결 테스트 실패:', error);
    res.status(500).json({
      success: false,
      message: '연결 테스트에 실패했습니다.',
    });
  }
});

export default router;
