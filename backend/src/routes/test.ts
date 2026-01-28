// backend/src/routes/test.ts
// 다중 시나리오 테스트 실행 API
// 다중 사용자 지원: 큐 기반 테스트 실행

import { Router, Request, Response } from 'express';
import { testExecutor } from '../services/testExecutor';
import { testOrchestrator } from '../services/testOrchestrator';
import { sessionManager } from '../services/sessionManager';
import { TestExecutionRequest } from '../types';
import { asyncHandler, syncHandler, BadRequestError } from '../utils/asyncHandler';

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
router.post('/submit', asyncHandler(async (req: Request, res: Response) => {
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
    throw new BadRequestError('deviceIds는 비어있지 않은 배열이어야 합니다.');
  }

  if (!scenarioIds || !Array.isArray(scenarioIds) || scenarioIds.length === 0) {
    throw new BadRequestError('scenarioIds는 비어있지 않은 배열이어야 합니다.');
  }

  if (!userName || typeof userName !== 'string') {
    throw new BadRequestError('userName은 필수입니다.');
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
}));

/**
 * POST /api/test/cancel/:queueId
 * 테스트 취소
 */
router.post('/cancel/:queueId', syncHandler((req: Request, res: Response) => {
  const { queueId } = req.params;
  const socketId = req.headers['x-socket-id'] as string || '';

  if (!socketId) {
    throw new BadRequestError('x-socket-id 헤더가 필요합니다.');
  }

  const result = testOrchestrator.cancelTest(queueId, socketId);

  if (result.success) {
    res.json({
      success: true,
      message: result.message,
    });
  } else {
    throw new BadRequestError(result.message);
  }
}));

/**
 * GET /api/test/queue/status
 * 전체 큐 시스템 상태 조회
 */
router.get('/queue/status', asyncHandler(async (req: Request, res: Response) => {
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
}));

/**
 * GET /api/test/queue/my
 * 내 테스트 목록 조회
 */
router.get('/queue/my', syncHandler((req: Request, res: Response) => {
  const userName = req.query.userName as string;

  if (!userName) {
    throw new BadRequestError('userName 쿼리 파라미터가 필요합니다.');
  }

  const tests = testOrchestrator.getTestsByUser(userName);

  res.json({
    success: true,
    data: tests,
  });
}));

// =========================================
// 기존 API (하위 호환성 유지)
// =========================================

/**
 * POST /api/test/execute
 * 테스트 실행 (여러 시나리오 순차/반복 실행)
 */
router.post('/execute', asyncHandler(async (req: Request, res: Response) => {
  const request: TestExecutionRequest = req.body;

  // 유효성 검사
  if (!request.deviceIds || !Array.isArray(request.deviceIds)) {
    throw new BadRequestError('deviceIds는 배열이어야 합니다.');
  }

  if (!request.scenarioIds || !Array.isArray(request.scenarioIds)) {
    throw new BadRequestError('scenarioIds는 배열이어야 합니다.');
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
}));

/**
 * GET /api/test/status
 * 현재 테스트 실행 상태 조회
 */
router.get('/status', syncHandler((_req: Request, res: Response) => {
  const status = testExecutor.getStatus();
  res.json({
    success: true,
    data: status,
  });
}));

/**
 * POST /api/test/stop
 * 테스트 실행 중지
 */
router.post('/stop', syncHandler((_req: Request, res: Response) => {
  const status = testExecutor.getStatus();
  if (!status.isRunning) {
    throw new BadRequestError('실행 중인 테스트가 없습니다.');
  }

  testExecutor.stop();

  res.json({
    success: true,
    message: '테스트 중지 요청이 전송되었습니다.',
  });
}));

// =========================================
// 에디터 테스트용 API
// =========================================

/**
 * POST /api/test/execute-node
 * 단일 노드 실행 (에디터 테스트용)
 * - 리포트에 저장하지 않음
 * - 편집용 디바이스에서 실행
 */
router.post('/execute-node', asyncHandler(async (req: Request, res: Response) => {
  const { deviceId, node, appPackage } = req.body;

  if (!deviceId || typeof deviceId !== 'string') {
    throw new BadRequestError('deviceId가 필요합니다.');
  }

  if (!node || typeof node !== 'object') {
    throw new BadRequestError('node 정보가 필요합니다.');
  }

  const result = await testExecutor.executeSingleNode(deviceId, node, appPackage);

  if (result.success) {
    res.json({
      success: true,
      result: result.result,
    });
  } else {
    throw new BadRequestError(result.error || 'Node execution failed');
  }
}));

/**
 * POST /api/test/stop-editor-test
 * 에디터 테스트 중지
 * - 디바이스의 Actions에 stop() 호출
 * - 대기 중인 명령 즉시 중단
 */
router.post('/stop-editor-test', syncHandler((req: Request, res: Response) => {
  const { deviceId } = req.body;

  if (!deviceId || typeof deviceId !== 'string') {
    throw new BadRequestError('deviceId가 필요합니다.');
  }

  const actions = sessionManager.getActions(deviceId);
  if (!actions) {
    throw new BadRequestError('해당 디바이스의 세션이 없습니다.');
  }

  // Actions의 stop 메서드 호출하여 대기 중인 명령 중단
  actions.stop();
  console.log(`🛑 [${deviceId}] 에디터 테스트 중지 요청`);

  res.json({
    success: true,
    message: '테스트 중지 신호를 보냈습니다.',
  });
}));

export default router;
