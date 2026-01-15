// backend/src/routes/test.ts
// 다중 시나리오 테스트 실행 API
// 다중 사용자 지원: 큐 기반 테스트 실행

import { Router, Request, Response } from 'express';
import { testExecutor } from '../services/testExecutor';
import { testOrchestrator } from '../services/testOrchestrator';
import { TestExecutionRequest } from '../types';

const router = Router();

// =========================================
// 다중 사용자 큐 시스템 API (신규)
// =========================================

/**
 * POST /api/test/submit
 * 테스트 제출 (큐 시스템 진입점)
 * - 디바이스가 사용 가능하면 즉시 실행
 * - 사용 중이면 대기열에 추가
 */
router.post('/submit', async (req: Request, res: Response) => {
  try {
    const {
      deviceIds,
      scenarioIds,
      repeatCount,
      scenarioInterval,
      userName,
      priority,
      testName,
    } = req.body;

    // 유효성 검사
    if (!deviceIds || !Array.isArray(deviceIds) || deviceIds.length === 0) {
      res.status(400).json({
        success: false,
        error: 'deviceIds는 비어있지 않은 배열이어야 합니다.',
      });
      return;
    }

    if (!scenarioIds || !Array.isArray(scenarioIds) || scenarioIds.length === 0) {
      res.status(400).json({
        success: false,
        error: 'scenarioIds는 비어있지 않은 배열이어야 합니다.',
      });
      return;
    }

    if (!userName || typeof userName !== 'string') {
      res.status(400).json({
        success: false,
        error: 'userName은 필수입니다.',
      });
      return;
    }

    // 실행 요청 구성
    const request: TestExecutionRequest = {
      deviceIds,
      scenarioIds,
      repeatCount: repeatCount || 1,
      scenarioInterval: scenarioInterval || 0,
    };

    // Socket ID 추출 (헤더에서)
    const socketId = req.headers['x-socket-id'] as string || `http-${Date.now()}`;

    // 테스트 제출
    const result = await testOrchestrator.submitTest(request, userName, socketId, {
      priority: priority || 0,
      testName,
    });

    res.json({
      success: true,
      data: result,
    });

  } catch (err) {
    const error = err as Error;
    console.error('[TestAPI] 테스트 제출 오류:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/test/cancel/:queueId
 * 테스트 취소
 */
router.post('/cancel/:queueId', (req: Request, res: Response) => {
  try {
    const { queueId } = req.params;
    const socketId = req.headers['x-socket-id'] as string || '';

    if (!socketId) {
      res.status(400).json({
        success: false,
        error: 'x-socket-id 헤더가 필요합니다.',
      });
      return;
    }

    const result = testOrchestrator.cancelTest(queueId, socketId);

    if (result.success) {
      res.json({
        success: true,
        message: result.message,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.message,
      });
    }

  } catch (err) {
    const error = err as Error;
    console.error('[TestAPI] 테스트 취소 오류:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/test/queue/status
 * 전체 큐 시스템 상태 조회
 */
router.get('/queue/status', async (req: Request, res: Response) => {
  try {
    const userName = req.query.userName as string | undefined;

    const status = testOrchestrator.getStatus();
    const deviceStatuses = await testOrchestrator.getDeviceStatuses(userName);

    res.json({
      success: true,
      data: {
        ...status,
        deviceStatuses,
      },
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
 * GET /api/test/queue/my
 * 내 테스트 목록 조회
 */
router.get('/queue/my', (req: Request, res: Response) => {
  try {
    const userName = req.query.userName as string;

    if (!userName) {
      res.status(400).json({
        success: false,
        error: 'userName 쿼리 파라미터가 필요합니다.',
      });
      return;
    }

    const tests = testOrchestrator.getTestsByUser(userName);

    res.json({
      success: true,
      data: tests,
    });

  } catch (err) {
    const error = err as Error;
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// =========================================
// 기존 API (하위 호환성 유지)
// =========================================

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
      scenarioInterval: request.scenarioInterval,
    };

    // testOrchestrator를 통해 실행 (디바이스 사용 중이면 자동 대기열)
    // userName과 socketId가 없으면 기본값 사용 (레거시 호환)
    const userName = request.userName || 'anonymous';
    const socketId = request.socketId || `http-${Date.now()}`;

    const result = await testOrchestrator.submitTest(
      executionRequest,
      userName,
      socketId,
      {
        testName: `테스트 (${request.scenarioIds.length}개 시나리오)`,
      }
    );

    // 실행/대기열 결과 응답
    res.json({
      success: true,
      message: result.message,
      executionId: result.executionId,
      queueId: result.queueId,
      status: result.status,
      position: result.position,
      estimatedWaitTime: result.estimatedWaitTime,
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

// =========================================
// 에디터 테스트용 API
// =========================================

/**
 * POST /api/test/execute-node
 * 단일 노드 실행 (에디터 테스트용)
 * - 리포트에 저장하지 않음
 * - 편집용 디바이스에서 실행
 */
router.post('/execute-node', async (req: Request, res: Response) => {
  try {
    const { deviceId, node, appPackage } = req.body;

    if (!deviceId || typeof deviceId !== 'string') {
      res.status(400).json({
        success: false,
        error: 'deviceId가 필요합니다.',
      });
      return;
    }

    if (!node || typeof node !== 'object') {
      res.status(400).json({
        success: false,
        error: 'node 정보가 필요합니다.',
      });
      return;
    }

    const result = await testExecutor.executeSingleNode(deviceId, node, appPackage);

    if (result.success) {
      res.json({
        success: true,
        result: result.result,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
      });
    }
  } catch (err) {
    const error = err as Error;
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
