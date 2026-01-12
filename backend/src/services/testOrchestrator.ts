// backend/src/services/testOrchestrator.ts
// 테스트 실행 조율 서비스
// 대기열, 디바이스 잠금, 테스트 실행을 통합 관리

import { Server as SocketIOServer } from 'socket.io';
import { deviceLockService } from './deviceLockService';
import { testQueueService } from './testQueueService';
import { testExecutor } from './testExecutor';
import { deviceManager } from './deviceManager';
import {
  TestExecutionRequest,
  TestExecutionResult,
} from '../types';
import {
  QueuedTest,
  SubmitTestResult,
  ExecutionContext,
  QueueSystemStatus,
  WaitingInfo,
  BlockingDeviceInfo,
} from '../types/queue';

/**
 * 테스트 실행 조율 서비스
 *
 * 역할:
 * - 테스트 제출 요청 처리 (즉시 실행 또는 대기열 추가)
 * - 테스트 완료 시 다음 대기 테스트 자동 실행
 * - 전체 상태 관리 및 브로드캐스트
 */
class TestOrchestrator {
  private io: SocketIOServer | null = null;
  private activeExecutions: Map<string, ExecutionContext> = new Map();
  private isProcessingQueue = false;

  /**
   * Socket.IO 인스턴스 설정
   */
  setSocketIO(io: SocketIOServer): void {
    this.io = io;
    deviceLockService.setSocketIO(io);
    testQueueService.setSocketIO(io);
    testExecutor.setSocketIO(io);
  }

  /**
   * 테스트 제출 (메인 진입점)
   *
   * 요청한 디바이스가 모두 사용 가능하면 즉시 실행,
   * 일부만 사용 가능하면 분할 실행 (가용 디바이스는 즉시, 바쁜 디바이스는 큐)
   * 모두 사용 중이면 대기열에 추가
   */
  async submitTest(
    request: TestExecutionRequest,
    userName: string,
    socketId: string,
    options?: {
      priority?: 0 | 1 | 2;
      testName?: string;
    }
  ): Promise<SubmitTestResult> {
    // 요청 유효성 검사
    if (!request.deviceIds || request.deviceIds.length === 0) {
      throw new Error('테스트할 디바이스를 선택해주세요.');
    }

    if (!request.scenarioIds || request.scenarioIds.length === 0) {
      throw new Error('테스트할 시나리오를 선택해주세요.');
    }

    // 사용 중인 디바이스와 가용 디바이스 분리
    const busyDeviceIds = deviceLockService.getBusyDevices(request.deviceIds);
    const availableDeviceIds = request.deviceIds.filter(id => !busyDeviceIds.includes(id));

    // Case 1: 모든 디바이스 가용 → 즉시 실행
    if (busyDeviceIds.length === 0) {
      return this.startTestImmediately(request, userName, socketId, options);
    }

    // Case 2: 모든 디바이스 사용 중 → 전체 대기열 추가
    if (availableDeviceIds.length === 0) {
      const queuedTest = testQueueService.addToQueue(
        request,
        userName,
        socketId,
        options
      );

      const position = testQueueService.getPosition(queuedTest.queueId);
      const estimatedWait = testQueueService.getEstimatedWaitTime(queuedTest.queueId);

      const busyInfo = busyDeviceIds.map(id => {
        const lock = deviceLockService.getLock(id);
        return lock ? `${id} (${lock.lockedBy})` : id;
      }).join(', ');

      console.log(`[TestOrchestrator] 대기열 추가: ${queuedTest.queueId} - 사용 중인 디바이스: ${busyInfo}`);

      return {
        queueId: queuedTest.queueId,
        status: 'queued',
        position,
        estimatedWaitTime: estimatedWait,
        message: `다음 디바이스가 사용 중이어서 대기열에 추가되었습니다: ${busyInfo}`,
      };
    }

    // Case 3: 분할 실행 (일부 가용, 일부 사용 중)
    return this.startSplitExecution(request, userName, socketId, availableDeviceIds, busyDeviceIds, options);
  }

  /**
   * 분할 실행: 가용 디바이스는 즉시 실행, 바쁜 디바이스는 큐에 추가
   */
  private async startSplitExecution(
    request: TestExecutionRequest,
    userName: string,
    socketId: string,
    availableDeviceIds: string[],
    busyDeviceIds: string[],
    options?: {
      priority?: 0 | 1 | 2;
      testName?: string;
    }
  ): Promise<SubmitTestResult> {
    const testName = options?.testName || `테스트 (${request.scenarioIds.length}개 시나리오)`;

    console.log(`[TestOrchestrator] 분할 실행: ${availableDeviceIds.length}대 즉시, ${busyDeviceIds.length}대 대기`);

    // 1. 가용 디바이스로 즉시 실행
    const immediateRequest: TestExecutionRequest = {
      ...request,
      deviceIds: availableDeviceIds,
    };

    const immediateResult = await this.startTestImmediately(
      immediateRequest,
      userName,
      socketId,
      { ...options, testName: `${testName} (즉시 실행)` }
    );

    // 2. 바쁜 디바이스는 큐에 추가
    const queuedRequest: TestExecutionRequest = {
      ...request,
      deviceIds: busyDeviceIds,
    };

    const queuedTest = testQueueService.addToQueue(
      queuedRequest,
      userName,
      socketId,
      { ...options, testName: `${testName} (대기 실행)` }
    );

    const queuePosition = testQueueService.getPosition(queuedTest.queueId);
    const estimatedWait = testQueueService.getEstimatedWaitTime(queuedTest.queueId);

    const busyInfo = busyDeviceIds.map(id => {
      const lock = deviceLockService.getLock(id);
      return lock ? `${id} (${lock.lockedBy})` : id;
    }).join(', ');

    console.log(`[TestOrchestrator] 분할 실행 완료 - 즉시: ${immediateResult.executionId}, 대기: ${queuedTest.queueId}`);

    return {
      queueId: immediateResult.queueId,  // 메인 ID는 즉시 실행 ID
      status: 'partial',
      executionId: immediateResult.executionId,
      position: queuePosition,
      estimatedWaitTime: estimatedWait,
      message: `${availableDeviceIds.length}대 즉시 실행, ${busyDeviceIds.length}대 대기 (${busyInfo})`,
      splitExecution: {
        immediateDeviceIds: availableDeviceIds,
        queuedDeviceIds: busyDeviceIds,
        immediateExecutionId: immediateResult.executionId!,
        queuedQueueId: queuedTest.queueId,
        queuePosition,
      },
    };
  }

  /**
   * 테스트 즉시 실행
   */
  private async startTestImmediately(
    request: TestExecutionRequest,
    userName: string,
    socketId: string,
    options?: {
      priority?: 0 | 1 | 2;
      testName?: string;
    }
  ): Promise<SubmitTestResult> {
    const executionId = `exec-${Date.now()}`;
    const testName = options?.testName || `테스트 (${request.scenarioIds.length}개 시나리오)`;

    // 디바이스 잠금
    const lockResult = deviceLockService.lockDevices(
      request.deviceIds,
      executionId,
      userName,
      testName
    );

    if (!lockResult.success) {
      // 동시 요청으로 잠금 실패 시 대기열로
      const queuedTest = testQueueService.addToQueue(
        request,
        userName,
        socketId,
        options
      );

      return {
        queueId: queuedTest.queueId,
        status: 'queued',
        position: testQueueService.getPosition(queuedTest.queueId),
        estimatedWaitTime: testQueueService.getEstimatedWaitTime(queuedTest.queueId),
        message: '동시 요청으로 인해 대기열에 추가되었습니다.',
      };
    }

    // 대기열에 running 상태로 추가 (추적용)
    const queuedTest = testQueueService.addToQueue(
      request,
      userName,
      socketId,
      { ...options, testName }
    );
    testQueueService.updateStatus(queuedTest.queueId, 'running', executionId);

    // 실행 컨텍스트 저장
    const context: ExecutionContext = {
      executionId,
      queueId: queuedTest.queueId,
      request,
      userName,
      socketId,
      deviceIds: request.deviceIds,
      startedAt: new Date(),
      stopRequested: false,
      testName,
    };
    this.activeExecutions.set(executionId, context);

    console.log(`[TestOrchestrator] 테스트 시작: ${executionId} by ${userName}`);

    // 비동기로 테스트 실행 (완료 시 콜백)
    this.executeTest(context);

    return {
      queueId: queuedTest.queueId,
      status: 'started',
      executionId,
      message: '테스트가 시작되었습니다.',
    };
  }

  /**
   * 테스트 실행 (비동기)
   */
  private async executeTest(context: ExecutionContext): Promise<void> {
    try {
      // testExecutor를 통해 실제 테스트 실행 (executionId 전달하여 일관성 유지)
      const result = await testExecutor.execute(context.request, {
        executionId: context.executionId,
      });

      // 성공/실패와 관계없이 완료 처리
      this.handleTestComplete(context.executionId, result, 'completed');

    } catch (error) {
      console.error(`[TestOrchestrator] 테스트 실행 오류: ${context.executionId}`, error);
      this.handleTestComplete(context.executionId, null, 'failed', (error as Error).message);
    }
  }

  /**
   * 테스트 완료 처리
   */
  private handleTestComplete(
    executionId: string,
    result: TestExecutionResult | null,
    status: 'completed' | 'failed' | 'cancelled',
    errorMessage?: string
  ): void {
    const context = this.activeExecutions.get(executionId);
    if (!context) {
      console.warn(`[TestOrchestrator] 알 수 없는 실행 ID: ${executionId}`);
      return;
    }

    // 디바이스 잠금 해제
    deviceLockService.unlockByExecutionId(executionId);

    // 대기열 상태 업데이트
    testQueueService.updateStatus(context.queueId, status);

    // 완료 목록에 추가
    const duration = Date.now() - context.startedAt.getTime();
    const successCount = result?.summary.passedScenarios || 0;
    const totalCount = context.deviceIds.length;
    const isSuccess = status === 'completed' && (!result || result.summary.failedScenarios === 0);

    testQueueService.addToCompleted({
      queueId: context.queueId,
      testName: context.testName,
      requesterName: context.userName,
      deviceCount: context.deviceIds.length,
      scenarioCount: context.request.scenarioIds.length,
      success: isSuccess,
      successCount: isSuccess ? totalCount : Math.max(0, totalCount - (result?.summary.failedScenarios || totalCount)),
      totalCount,
      duration,
      completedAt: new Date().toISOString(),
    });

    // 실행 컨텍스트 제거
    this.activeExecutions.delete(executionId);

    console.log(`[TestOrchestrator] 테스트 완료: ${executionId} (${status})`);

    // 실행 시간 통계 업데이트
    if (result) {
      const avgTime = result.summary.totalDuration / 1000 /
        (result.summary.totalScenarios * context.deviceIds.length);
      testQueueService.updateAvgScenarioTime(avgTime);
    }

    // 다음 대기 테스트 실행 (실행 가능한 모든 테스트 디스패치)
    this.tryDispatchPending();
  }

  /**
   * 대기열 처리: 실행 가능한 모든 테스트 디스패치
   *
   * 핵심 로직:
   * 1. 현재 사용 중인 디바이스 목록 수집
   * 2. 대기 중인 모든 테스트를 우선순위/생성시간 순으로 순회
   * 3. 필요한 디바이스가 모두 가용하면 즉시 실행
   * 4. 실행 시작된 디바이스는 다음 테스트 체크 시 사용 중으로 간주
   */
  private async tryDispatchPending(): Promise<void> {
    // 중복 처리 방지
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    try {
      // 현재 사용 중인 디바이스 목록 (새로 시작된 테스트 포함을 위해 Set 복사)
      const busyDeviceIds = new Set(
        deviceLockService.getAllLocks().map(l => l.deviceId)
      );

      // 대기 중인 테스트 목록 (우선순위 > 생성시간 순으로 정렬됨)
      const pendingTests = testQueueService.getPendingTests();
      const startedTests: string[] = [];

      for (const test of pendingTests) {
        const requiredDevices = new Set(test.request.deviceIds);
        const blockedDevices = [...requiredDevices].filter(d => busyDeviceIds.has(d));

        if (blockedDevices.length === 0) {
          // 모든 디바이스 가용 → 즉시 실행
          console.log(`[TestOrchestrator] 대기열에서 테스트 시작: ${test.queueId} (${test.testName || 'unnamed'})`);

          // 알림 전송
          if (this.io) {
            this.io.to(test.requesterSocketId).emit('queue:auto_start', {
              queueId: test.queueId,
              message: '대기 중이던 테스트가 자동으로 시작됩니다.',
            });
          }

          // 테스트 시작 (비동기지만 잠금은 즉시 획득됨)
          await this.startQueuedTest(test);

          // 이 테스트가 사용하는 디바이스들을 busy로 마킹
          test.request.deviceIds.forEach(d => busyDeviceIds.add(d));
          startedTests.push(test.queueId);
        }
      }

      if (startedTests.length > 0) {
        console.log(`[TestOrchestrator] ${startedTests.length}개 테스트 동시 시작`);
      }

      // 남은 대기 테스트들의 waitingInfo 업데이트
      this.updatePendingTestsWaitingInfo();

    } finally {
      this.isProcessingQueue = false;
    }
  }

  /**
   * 대기열에 있던 테스트 시작 (이미 대기열에 등록된 상태)
   */
  private async startQueuedTest(queuedTest: QueuedTest): Promise<void> {
    const executionId = `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // 디바이스 잠금
    const lockResult = deviceLockService.lockDevices(
      queuedTest.request.deviceIds,
      executionId,
      queuedTest.requesterName,
      queuedTest.testName
    );

    if (!lockResult.success) {
      // 동시 요청으로 잠금 실패 - 다음 디스패치 시도에서 재시도
      console.warn(`[TestOrchestrator] 잠금 실패로 실행 건너뜀: ${queuedTest.queueId}`);
      return;
    }

    // 상태를 running으로 업데이트
    testQueueService.updateStatus(queuedTest.queueId, 'running', executionId);

    // 실행 컨텍스트 저장
    const context: ExecutionContext = {
      executionId,
      queueId: queuedTest.queueId,
      request: queuedTest.request,
      userName: queuedTest.requesterName,
      socketId: queuedTest.requesterSocketId,
      deviceIds: queuedTest.request.deviceIds,
      startedAt: new Date(),
      stopRequested: false,
      testName: queuedTest.testName,
    };
    this.activeExecutions.set(executionId, context);

    // 비동기로 테스트 실행
    this.executeTest(context);
  }

  /**
   * 대기 중인 테스트들의 waitingInfo 업데이트
   */
  private updatePendingTestsWaitingInfo(): void {
    const pendingTests = testQueueService.getPendingTests();
    const locks = deviceLockService.getAllLocks();
    const avgScenarioTime = testQueueService.getAvgScenarioTime();

    // 디바이스 잠금 정보 맵
    const lockMap = new Map(locks.map(l => [l.deviceId, l]));

    pendingTests.forEach((test, index) => {
      const blockedDevices: BlockingDeviceInfo[] = [];

      for (const deviceId of test.request.deviceIds) {
        const lock = lockMap.get(deviceId);
        if (lock) {
          blockedDevices.push({
            deviceId,
            deviceName: deviceId, // 실제로는 deviceManager에서 이름 조회 필요
            usedBy: lock.lockedBy,
            testName: lock.testName,
            estimatedRemaining: avgScenarioTime * 60, // 대략적인 추정
          });
        }
      }

      if (blockedDevices.length > 0) {
        const waitingInfo: WaitingInfo = {
          blockedByDevices: blockedDevices,
          estimatedWaitTime: Math.max(...blockedDevices.map(d => d.estimatedRemaining)),
          queuePosition: index + 1,
          canRunImmediatelyIf: blockedDevices.map(d => d.deviceId),
        };

        testQueueService.updateWaitingInfo(test.queueId, waitingInfo);
      }
    });
  }

  /**
   * 테스트 취소
   */
  cancelTest(queueId: string, socketId: string): { success: boolean; message: string } {
    const test = testQueueService.getTest(queueId);

    if (!test) {
      return { success: false, message: '테스트를 찾을 수 없습니다.' };
    }

    // 본인 테스트만 취소 가능 (관리자는 별도 처리)
    if (test.requesterSocketId !== socketId) {
      return { success: false, message: '본인의 테스트만 취소할 수 있습니다.' };
    }

    if (test.status === 'running') {
      // 실행 중인 테스트 중지
      const context = Array.from(this.activeExecutions.values())
        .find(c => c.queueId === queueId);

      if (context) {
        context.stopRequested = true;
        // 특정 실행만 중지 (다른 사용자의 테스트는 영향 없음)
        testExecutor.stopExecution(context.executionId);
        this.handleTestComplete(context.executionId, null, 'cancelled');
        return { success: true, message: '실행 중인 테스트가 중지되었습니다.' };
      }
    }

    // 대기 중인 테스트 제거
    const removed = testQueueService.removeFromQueue(queueId);

    if (removed) {
      if (this.io) {
        this.io.to(socketId).emit('queue:cancelled', {
          queueId,
          message: '테스트가 취소되었습니다.',
        });
      }
      return { success: true, message: '테스트가 취소되었습니다.' };
    }

    return { success: false, message: '테스트 취소에 실패했습니다.' };
  }

  /**
   * 전체 상태 조회
   */
  getStatus(): QueueSystemStatus {
    return {
      activeExecutions: Array.from(this.activeExecutions.values()),
      queue: testQueueService.getQueue(),
      deviceLocks: deviceLockService.getAllLocks(),
    };
  }

  /**
   * 완료된 테스트 목록 조회
   */
  getCompletedTests() {
    return testQueueService.getCompletedTests();
  }

  /**
   * 디바이스 상태 목록 조회 (UI용)
   */
  async getDeviceStatuses(currentUserName?: string) {
    const devices = await deviceManager.getMergedDeviceList();
    const deviceIds = devices.map(d => d.id);
    const deviceNames = new Map(devices.map(d => [d.id, d.alias || d.model || d.id]));

    return deviceLockService.getDeviceStatuses(deviceIds, deviceNames, currentUserName);
  }

  /**
   * 특정 사용자의 테스트 목록
   */
  getTestsByUser(userName: string): QueuedTest[] {
    return testQueueService.getTestsByUser(userName);
  }

  /**
   * Socket 연결 해제 처리
   */
  handleSocketDisconnect(socketId: string): void {
    // 대기 중인 테스트 정리
    testQueueService.cleanupBySocketId(socketId);

    // 실행 중인 테스트는 계속 실행 (연결 끊어도 테스트는 완료)
  }

  /**
   * 실행 중인 테스트 수
   */
  getActiveExecutionCount(): number {
    return this.activeExecutions.size;
  }

  /**
   * 전체 초기화 (서버 재시작 등)
   */
  reset(): void {
    // 모든 실행 중지
    for (const context of this.activeExecutions.values()) {
      context.stopRequested = true;
    }
    testExecutor.stop();

    // 데이터 초기화
    this.activeExecutions.clear();
    deviceLockService.clearAllLocks();
    testQueueService.clearQueue();

    console.log('[TestOrchestrator] 전체 초기화 완료');
  }
}

// 싱글톤 인스턴스
export const testOrchestrator = new TestOrchestrator();
