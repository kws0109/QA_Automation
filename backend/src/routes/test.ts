// backend/src/routes/test.ts
// 다중 시나리오 테스트 실행 API

import { Router, Request, Response } from 'express';
import { testExecutor } from '../services/testExecutor';
import { TestExecutionRequest } from '../types';

const router = Router();

/**
 * POST /api/test/execute
 * 테스트 실행 (여러 시나리오 순차/반복 실행)
 */
router.post('/execute', async (req: Request, res: Response) => {
  try {
    const request: TestExecutionRequest = req.body;

    // 유효성 검사
    if (!request.deviceIds || !Array.isArray(request.deviceIds)) {
      res.status(400).json({
        success: false,
        error: 'deviceIds는 배열이어야 합니다.',
      });
      return;
    }

    if (!request.scenarioIds || !Array.isArray(request.scenarioIds)) {
      res.status(400).json({
        success: false,
        error: 'scenarioIds는 배열이어야 합니다.',
      });
      return;
    }

    // 기본값 설정
    const executionRequest: TestExecutionRequest = {
      deviceIds: request.deviceIds,
      scenarioIds: request.scenarioIds,
      repeatCount: request.repeatCount || 1,
    };

    // 즉시 실행 (비동기로 시작, 결과는 Socket.IO로 전달)
    // 실행 ID를 먼저 반환하고 백그라운드로 실행
    const status = testExecutor.getStatus();
    if (status.isRunning) {
      res.status(409).json({
        success: false,
        error: '이미 테스트가 실행 중입니다.',
      });
      return;
    }

    // 비동기 실행 시작
    testExecutor.execute(executionRequest).catch(err => {
      console.error('[TestAPI] 테스트 실행 오류:', err);
    });

    // 실행 시작 응답
    res.json({
      success: true,
      message: '테스트 실행이 시작되었습니다.',
      executionId: `test-${Date.now()}`,
    });

  } catch (err) {
    const error = err as Error;
    console.error('[TestAPI] 테스트 실행 요청 오류:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/test/status
 * 현재 테스트 실행 상태 조회
 */
router.get('/status', (_req: Request, res: Response) => {
  try {
    const status = testExecutor.getStatus();
    res.json({
      success: true,
      data: status,
    });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/test/stop
 * 테스트 실행 중지
 */
router.post('/stop', (_req: Request, res: Response) => {
  try {
    const status = testExecutor.getStatus();
    if (!status.isRunning) {
      res.status(400).json({
        success: false,
        error: '실행 중인 테스트가 없습니다.',
      });
      return;
    }

    testExecutor.stop();

    res.json({
      success: true,
      message: '테스트 중지 요청이 전송되었습니다.',
    });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
