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
   * 하나라도 사용 중이면 대기열에 추가
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

    // 사용 중인 디바이스 확인
    const busyDevices = deviceLockService.getBusyDevices(request.deviceIds);

    if (busyDevices.length > 0) {
      // 사용 중인 디바이스가 있으면 대기열에 추가
      const queuedTest = testQueueService.addToQueue(
        request,
        userName,
        socketId,
        options
      );

      const position = testQueueService.getPosition(queuedTest.queueId);
      const estimatedWait = testQueueService.getEstimatedWaitTime(queuedTest.queueId);

      // 대기 중인 디바이스 정보
      const busyInfo = busyDevices.map(id => {
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

    // 모든 디바이스가 사용 가능하면 즉시 실행
    return this.startTestImmediately(request, userName, socketId, options);
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
      // testExecutor를 통해 실제 테스트 실행
      const result = await testExecutor.execute(context.request);

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

    // 실행 컨텍스트 제거
    this.activeExecutions.delete(executionId);

    console.log(`[TestOrchestrator] 테스트 완료: ${executionId} (${status})`);

    // 실행 시간 통계 업데이트
    if (result) {
      const avgTime = result.summary.totalDuration / 1000 /
        (result.summary.totalScenarios * context.deviceIds.length);
      testQueueService.updateAvgScenarioTime(avgTime);
    }

    // 다음 대기 테스트 실행
    this.processQueue();
  }

  /**
   * 대기열 처리 (다음 실행 가능한 테스트 시작)
   */
  private async processQueue(): Promise<void> {
    // 중복 처리 방지
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    try {
      // 현재 사용 중인 디바이스 목록
      const busyDeviceIds = new Set(
        deviceLockService.getAllLocks().map(l => l.deviceId)
      );

      // 실행 가능한 다음 테스트 찾기
      const nextTest = testQueueService.getNextExecutable(busyDeviceIds);

      if (nextTest) {
        console.log(`[TestOrchestrator] 대기열에서 다음 테스트 시작: ${nextTest.queueId}`);

        // 알림 전송
        if (this.io) {
          this.io.to(nextTest.requesterSocketId).emit('queue:auto_start', {
            queueId: nextTest.queueId,
            message: '대기 중이던 테스트가 자동으로 시작됩니다.',
          });
        }

        // 테스트 시작
        await this.startTestImmediately(
          nextTest.request,
          nextTest.requesterName,
          nextTest.requesterSocketId,
          {
            priority: nextTest.priority,
            testName: nextTest.testName,
          }
        );
      }
    } finally {
      this.isProcessingQueue = false;
    }
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
        testExecutor.stop();
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
