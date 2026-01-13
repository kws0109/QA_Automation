// backend/src/routes/screenshot.ts
// 스크린샷 폴링 서비스 API

import express, { Request, Response } from 'express';
import { screenshotService } from '../services/screenshotService';

const router = express.Router();

/**
 * POST /api/screenshot/subscribe
 * 디바이스 스크린샷 구독
 * body: { deviceIds: string[] }
 */
router.post('/subscribe', (req: Request, res: Response) => {
  try {
    const { deviceIds } = req.body;

    if (!deviceIds || !Array.isArray(deviceIds) || deviceIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'deviceIds 배열이 필요합니다',
      });
    }

    screenshotService.subscribe(deviceIds);

    res.json({
      success: true,
      message: `${deviceIds.length}개 디바이스 구독 완료`,
      subscribedDevices: deviceIds,
    });
  } catch (error) {
    const err = error as Error;
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * POST /api/screenshot/unsubscribe
 * 디바이스 스크린샷 구독 해제
 * body: { deviceIds: string[] }
 */
router.post('/unsubscribe', (req: Request, res: Response) => {
  try {
    const { deviceIds } = req.body;

    if (!deviceIds || !Array.isArray(deviceIds)) {
      return res.status(400).json({
        success: false,
        error: 'deviceIds 배열이 필요합니다',
      });
    }

    screenshotService.unsubscribe(deviceIds);

    res.json({
      success: true,
      message: `${deviceIds.length}개 디바이스 구독 해제`,
    });
  } catch (error) {
    const err = error as Error;
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * POST /api/screenshot/unsubscribe-all
 * 모든 디바이스 구독 해제
 */
router.post('/unsubscribe-all', (_req: Request, res: Response) => {
  try {
    screenshotService.unsubscribeAll();

    res.json({
      success: true,
      message: '모든 구독 해제 완료',
    });
  } catch (error) {
    const err = error as Error;
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * GET /api/screenshot/:deviceId
 * 특정 디바이스의 최신 캐시된 스크린샷 조회
 */
router.get('/:deviceId', (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;
    const cached = screenshotService.getLatest(deviceId);

    if (!cached) {
      return res.status(404).json({
        success: false,
        error: '캐시된 스크린샷이 없습니다',
      });
    }

    res.json({
      success: true,
      screenshot: cached,
    });
  } catch (error) {
    const err = error as Error;
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * POST /api/screenshot/:deviceId/capture
 * 즉시 스크린샷 캡처 (폴링 외)
 */
router.post('/:deviceId/capture', async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;
    const screenshot = await screenshotService.captureNow(deviceId);

    res.json({
      success: true,
      screenshot,
    });
  } catch (error) {
    const err = error as Error;
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * GET /api/screenshot/status
 * 폴링 서비스 상태 조회
 */
router.get('/', (_req: Request, res: Response) => {
  try {
    const status = screenshotService.getStatus();

    res.json({
      success: true,
      status,
    });
  } catch (error) {
    const err = error as Error;
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * PUT /api/screenshot/config
 * 폴링 설정 변경
 * body: { intervalMs?: number, maxConcurrent?: number, cacheMaxAge?: number }
 */
router.put('/config', (req: Request, res: Response) => {
  try {
    const { intervalMs, maxConcurrent, cacheMaxAge } = req.body;

    const config: Record<string, number> = {};
    if (typeof intervalMs === 'number') config.intervalMs = intervalMs;
    if (typeof maxConcurrent === 'number') config.maxConcurrent = maxConcurrent;
    if (typeof cacheMaxAge === 'number') config.cacheMaxAge = cacheMaxAge;

    screenshotService.setConfig(config);

    res.json({
      success: true,
      message: '설정 변경 완료',
      config: screenshotService.getStatus().config,
    });
  } catch (error) {
    const err = error as Error;
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

export default router;
