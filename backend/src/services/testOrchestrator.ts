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
  DeviceExecutionResult,
  DeviceExecutionStatus,
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
   * 분할 실행: 하나의 통합 컨텍스트로 관리
   * - 가용 디바이스는 즉시 실행 (activeDevices)
   * - 바쁜 디바이스는 대기 (pendingDevices)
   * - 하나의 queueId, executionId로 통합 관리
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
    const executionId = `exec-${Date.now()}`;
    const queueId = `queue-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    console.log(`[TestOrchestrator] 분할 실행: ${availableDeviceIds.length}대 즉시, ${busyDeviceIds.length}대 대기`);

    // 가용 디바이스 잠금
    const lockResult = deviceLockService.lockDevices(
      availableDeviceIds,
      executionId,
      userName,
      testName
    );

    if (!lockResult.success) {
      // 동시 요청으로 잠금 실패 시 전체 대기열로
      const queuedTest = testQueueService.addToQueue(request, userName, socketId, options);
      return {
        queueId: queuedTest.queueId,
        status: 'queued',
        position: testQueueService.getPosition(queuedTest.queueId),
        estimatedWaitTime: testQueueService.getEstimatedWaitTime(queuedTest.queueId),
        message: '동시 요청으로 인해 대기열에 추가되었습니다.',
      };
    }

    // 통합 대기열 항목 추가 (running 상태, 디바이스 분류 포함)
    const queuedTest = testQueueService.addToQueue(request, userName, socketId, {
      ...options,
      testName,
      queueId,  // 지정된 queueId 사용
    });
    testQueueService.updateStatus(queuedTest.queueId, 'running', executionId);
    testQueueService.updateDeviceStatus(queuedTest.queueId, {
      runningDevices: availableDeviceIds,
      pendingDevices: busyDeviceIds,
      completedDevices: [],
    });

    // 디바이스 결과 맵 초기화
    const deviceResults = new Map<string, DeviceExecutionResult>();
    for (const deviceId of request.deviceIds) {
      const isActive = availableDeviceIds.includes(deviceId);
      deviceResults.set(deviceId, {
        deviceId,
        deviceName: deviceId,  // 실제 이름은 나중에 업데이트
        status: isActive ? 'running' : 'pending',
      });
    }

    // 통합 실행 컨텍스트 생성
    const context: ExecutionContext = {
      executionId,
      queueId: queuedTest.queueId,
      request,
      userName,
      socketId,
      deviceIds: request.deviceIds,
      activeDevices: [...availableDeviceIds],
      pendingDevices: [...busyDeviceIds],
      completedDevices: [],
      deviceResults,
      startedAt: new Date(),
      stopRequested: false,
      testName,
    };
    this.activeExecutions.set(executionId, context);

    const busyInfo = busyDeviceIds.map(id => {
      const lock = deviceLockService.getLock(id);
      return lock ? `${id} (${lock.lockedBy})` : id;
    }).join(', ');

    console.log(`[TestOrchestrator] 통합 분할 실행 시작: ${executionId}, ${availableDeviceIds.length}대 즉시, ${busyDeviceIds.length}대 대기`);

    // 가용 디바이스로 테스트 시작 (비동기)
    this.executeDeviceBatch(context, availableDeviceIds);

    return {
      queueId: queuedTest.queueId,
      status: 'partial',
      executionId,
      message: `${availableDeviceIds.length}대 즉시 실행, ${busyDeviceIds.length}대 대기 (${busyInfo})`,
      splitExecution: {
        immediateDeviceIds: availableDeviceIds,
        queuedDeviceIds: busyDeviceIds,
        immediateExecutionId: executionId,
        queuedQueueId: queuedTest.queueId,
        queuePosition: 0,  // 즉시 시작되므로 대기 순서 없음
      },
    };
  }

  /**
   * 테스트 즉시 실행 (모든 디바이스 가용한 경우)
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
    testQueueService.updateDeviceStatus(queuedTest.queueId, {
      runningDevices: request.deviceIds,
      pendingDevices: [],
      completedDevices: [],
    });

    // 디바이스 결과 맵 초기화
    const deviceResults = new Map<string, DeviceExecutionResult>();
    for (const deviceId of request.deviceIds) {
      deviceResults.set(deviceId, {
        deviceId,
        deviceName: deviceId,
        status: 'running',
      });
    }

    // 실행 컨텍스트 저장 (통합 필드 포함)
    const context: ExecutionContext = {
      executionId,
      queueId: queuedTest.queueId,
      request,
      userName,
      socketId,
      deviceIds: request.deviceIds,
      activeDevices: [...request.deviceIds],
      pendingDevices: [],
      completedDevices: [],
      deviceResults,
      startedAt: new Date(),
      stopRequested: false,
      testName,
    };
    this.activeExecutions.set(executionId, context);

    console.log(`[TestOrchestrator] 테스트 시작: ${executionId} by ${userName}`);

    // 비동기로 테스트 실행 (완료 시 콜백)
    this.executeDeviceBatch(context, request.deviceIds);

    return {
      queueId: queuedTest.queueId,
      status: 'started',
      executionId,
      message: '테스트가 시작되었습니다.',
    };
  }

  /**
   * 디바이스 배치 실행 (비동기)
   * 주어진 디바이스들에 대해 테스트 실행 후 배치 완료 처리
   */
  private async executeDeviceBatch(
    context: ExecutionContext,
    deviceIds: string[]
  ): Promise<void> {
    try {
      // 해당 디바이스만 포함한 요청 생성
      const batchRequest: TestExecutionRequest = {
        ...context.request,
        deviceIds,
      };

      // testExecutor를 통해 실제 테스트 실행
      const result = await testExecutor.execute(batchRequest, {
        executionId: context.executionId,
      });

      // 배치 완료 처리
      this.handleBatchComplete(context.executionId, deviceIds, result);

    } catch (error) {
      console.error(`[TestOrchestrator] 배치 실행 오류: ${context.executionId}, 디바이스: ${deviceIds.join(',')}`, error);
      this.handleBatchComplete(context.executionId, deviceIds, null, (error as Error).message);
    }
  }

  /**
   * 디바이스 배치 완료 처리
   * 모든 디바이스가 완료되면 최종 완료 처리
   */
  private handleBatchComplete(
    executionId: string,
    completedDeviceIds: string[],
    result: TestExecutionResult | null,
    errorMessage?: string
  ): void {
    const context = this.activeExecutions.get(executionId);
    if (!context) {
      console.warn(`[TestOrchestrator] 알 수 없는 실행 ID: ${executionId}`);
      return;
    }

    // 완료된 디바이스 상태 업데이트
    for (const deviceId of completedDeviceIds) {
      const deviceResult = context.deviceResults.get(deviceId);
      if (deviceResult) {
        deviceResult.status = errorMessage ? 'failed' : 'completed';
        deviceResult.completedAt = new Date();
        if (errorMessage) {
          deviceResult.error = errorMessage;
        }
        // 결과에서 성공 여부 추출
        // 에러가 없으면 성공으로 간주 (시나리오 레벨에서 이미 성공/실패 판단됨)
        deviceResult.success = !errorMessage;
      }

      // activeDevices에서 completedDevices로 이동
      const activeIndex = context.activeDevices.indexOf(deviceId);
      if (activeIndex > -1) {
        context.activeDevices.splice(activeIndex, 1);
        context.completedDevices.push(deviceId);
      }

      // 해당 디바이스 잠금 해제
      deviceLockService.unlockDevice(deviceId, executionId);
    }

    // 대기열 디바이스 상태 업데이트
    testQueueService.updateDeviceStatus(context.queueId, {
      runningDevices: context.activeDevices,
      pendingDevices: context.pendingDevices,
      completedDevices: context.completedDevices,
    });

    console.log(`[TestOrchestrator] 배치 완료: ${executionId}, 완료 ${completedDeviceIds.length}대, 활성 ${context.activeDevices.length}대, 대기 ${context.pendingDevices.length}대`);

    // 실행 시간 통계 업데이트
    if (result) {
      const avgTime = result.summary.totalDuration / 1000 /
        (result.summary.totalScenarios * completedDeviceIds.length);
      testQueueService.updateAvgScenarioTime(avgTime);
    }

    // 모든 디바이스 완료 확인 (활성 + 대기 = 0)
    if (context.activeDevices.length === 0 && context.pendingDevices.length === 0) {
      this.finalizeExecution(context);
    } else {
      // 대기 디바이스가 있으면 디스패치 시도
      this.tryDispatchPending();
    }
  }

  /**
   * 테스트 최종 완료 처리
   * 모든 디바이스가 완료 또는 스킵되었을 때 호출
   */
  private finalizeExecution(context: ExecutionContext): void {
    // 결과 집계
    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    context.deviceResults.forEach(result => {
      if (result.status === 'completed' && result.success !== false) {
        successCount++;
      } else if (result.status === 'failed') {
        failedCount++;
      } else if (result.status === 'skipped') {
        skippedCount++;
      }
    });

    // 실제 테스트 대상 (skipped 제외)
    const testedCount = successCount + failedCount;
    const isSuccess = testedCount > 0 && failedCount === 0;

    // 대기열 상태 완료로 업데이트
    testQueueService.updateStatus(context.queueId, 'completed');

    // 완료 목록에 추가
    const duration = Date.now() - context.startedAt.getTime();
    testQueueService.addToCompleted({
      queueId: context.queueId,
      testName: context.testName,
      requesterName: context.userName,
      deviceCount: context.deviceIds.length,
      scenarioCount: context.request.scenarioIds.length,
      success: isSuccess,
      successCount,
      totalCount: testedCount,  // skipped 제외
      duration,
      completedAt: new Date().toISOString(),
    });

    // 실행 컨텍스트 제거
    this.activeExecutions.delete(context.executionId);

    console.log(`[TestOrchestrator] 테스트 최종 완료: ${context.executionId} (성공 ${successCount}, 실패 ${failedCount}, 스킵 ${skippedCount})`);

    // 다음 대기 테스트 디스패치
    this.tryDispatchPending();
  }

  /**
   * 부분 완료 처리 (대기 디바이스 포기)
   * 현재까지 완료된 결과로 테스트를 종료하고 대기 디바이스는 skipped 처리
   */
  forceComplete(executionId: string, socketId: string, userName?: string): { success: boolean; message: string } {
    const context = this.activeExecutions.get(executionId);
    if (!context) {
      return { success: false, message: '실행 중인 테스트를 찾을 수 없습니다.' };
    }

    // 본인 테스트만 가능 (socketId 또는 userName 일치)
    const isOwner = context.socketId === socketId ||
                    (userName && context.userName === userName);
    if (!isOwner) {
      return { success: false, message: '본인의 테스트만 완료할 수 있습니다.' };
    }

    // 대기 중인 디바이스가 없으면 불필요
    if (context.pendingDevices.length === 0) {
      return { success: false, message: '대기 중인 디바이스가 없습니다.' };
    }

    // 아직 실행 중인 디바이스가 있으면 대기
    if (context.activeDevices.length > 0) {
      return { success: false, message: '아직 실행 중인 디바이스가 있습니다. 완료될 때까지 기다려주세요.' };
    }

    console.log(`[TestOrchestrator] 부분 완료 요청: ${executionId}, ${context.pendingDevices.length}대 스킵 처리`);

    // 대기 디바이스들을 skipped 상태로 변경
    for (const deviceId of context.pendingDevices) {
      const deviceResult = context.deviceResults.get(deviceId);
      if (deviceResult) {
        deviceResult.status = 'skipped';
      }
    }
    context.pendingDevices = [];

    // 최종 완료 처리
    this.finalizeExecution(context);

    return { success: true, message: '대기 중인 디바이스를 건너뛰고 완료했습니다.' };
  }

  /**
   * 대기열 처리: 실행 가능한 모든 테스트 디스패치
   *
   * 핵심 로직:
   * 1. 현재 사용 중인 디바이스 목록 수집
   * 2. 기존 실행 컨텍스트의 대기 디바이스 먼저 처리 (우선순위)
   * 3. 대기 중인 새 테스트를 우선순위/생성시간 순으로 순회
   * 4. 필요한 디바이스가 모두 가용하면 즉시 실행
   */
  private async tryDispatchPending(): Promise<void> {
    // 중복 처리 방지
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    try {
      // 현재 사용 중인 디바이스 목록
      const busyDeviceIds = new Set(
        deviceLockService.getAllLocks().map(l => l.deviceId)
      );

      // 1단계: 기존 실행 컨텍스트의 대기 디바이스 처리
      for (const context of this.activeExecutions.values()) {
        if (context.pendingDevices.length === 0) continue;

        // 가용해진 대기 디바이스 찾기
        const availablePending = context.pendingDevices.filter(d => !busyDeviceIds.has(d));

        if (availablePending.length > 0) {
          console.log(`[TestOrchestrator] 기존 실행 ${context.executionId}에 대기 디바이스 ${availablePending.length}대 추가`);

          // 디바이스 잠금
          const lockResult = deviceLockService.lockDevices(
            availablePending,
            context.executionId,
            context.userName,
            context.testName
          );

          if (lockResult.success) {
            // pendingDevices에서 activeDevices로 이동
            for (const deviceId of availablePending) {
              const idx = context.pendingDevices.indexOf(deviceId);
              if (idx > -1) {
                context.pendingDevices.splice(idx, 1);
                context.activeDevices.push(deviceId);

                // 디바이스 상태 업데이트
                const deviceResult = context.deviceResults.get(deviceId);
                if (deviceResult) {
                  deviceResult.status = 'running';
                  deviceResult.startedAt = new Date();
                }
              }
              busyDeviceIds.add(deviceId);
            }

            // 대기열 디바이스 상태 업데이트
            testQueueService.updateDeviceStatus(context.queueId, {
              runningDevices: context.activeDevices,
              pendingDevices: context.pendingDevices,
              completedDevices: context.completedDevices,
            });

            // 알림 전송
            if (this.io) {
              this.io.to(context.socketId).emit('queue:devices_started', {
                queueId: context.queueId,
                executionId: context.executionId,
                deviceIds: availablePending,
                message: `대기 중이던 디바이스 ${availablePending.length}대가 실행을 시작합니다.`,
              });
            }

            // 새 디바이스 배치 실행
            this.executeDeviceBatch(context, availablePending);
          }
        }
      }

      // 2단계: 대기열의 새 테스트 처리
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

          // 테스트 시작
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
    testQueueService.updateDeviceStatus(queuedTest.queueId, {
      runningDevices: queuedTest.request.deviceIds,
      pendingDevices: [],
      completedDevices: [],
    });

    // 디바이스 결과 맵 초기화
    const deviceResults = new Map<string, DeviceExecutionResult>();
    for (const deviceId of queuedTest.request.deviceIds) {
      deviceResults.set(deviceId, {
        deviceId,
        deviceName: deviceId,
        status: 'running',
        startedAt: new Date(),
      });
    }

    // 실행 컨텍스트 저장 (통합 필드 포함)
    const context: ExecutionContext = {
      executionId,
      queueId: queuedTest.queueId,
      request: queuedTest.request,
      userName: queuedTest.requesterName,
      socketId: queuedTest.requesterSocketId,
      deviceIds: queuedTest.request.deviceIds,
      activeDevices: [...queuedTest.request.deviceIds],
      pendingDevices: [],
      completedDevices: [],
      deviceResults,
      startedAt: new Date(),
      stopRequested: false,
      testName: queuedTest.testName,
    };
    this.activeExecutions.set(executionId, context);

    // 비동기로 테스트 실행
    this.executeDeviceBatch(context, queuedTest.request.deviceIds);
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
  cancelTest(queueId: string, socketId: string, userName?: string): { success: boolean; message: string; queueId?: string } {
    const test = testQueueService.getTest(queueId);

    if (!test) {
      return { success: false, message: '테스트를 찾을 수 없습니다.', queueId };
    }

    // 본인 테스트만 취소 가능 (socketId 또는 userName 일치)
    // socketId는 재연결 시 변경될 수 있으므로 userName도 확인
    const isOwner = test.requesterSocketId === socketId ||
                    (userName && test.requesterName === userName);
    if (!isOwner) {
      return { success: false, message: '본인의 테스트만 취소할 수 있습니다.', queueId };
    }

    if (test.status === 'running') {
      // 실행 중인 테스트 중지
      const context = Array.from(this.activeExecutions.values())
        .find(c => c.queueId === queueId);

      if (context) {
        context.stopRequested = true;

        // Actions 인스턴스에 즉시 중지 신호 전송 (대기 루프 즉시 중단)
        const allDevices = [...context.activeDevices, ...context.completedDevices, ...context.pendingDevices];
        testExecutor.stopActionsOnDevices(allDevices);

        // 특정 실행만 중지 (다른 사용자의 테스트는 영향 없음)
        testExecutor.stopExecution(context.executionId);

        // 실행 중이던 디바이스들의 앱 강제 종료 (비동기, 결과 기다리지 않음)
        const devicesToTerminate = [...context.activeDevices, ...context.completedDevices];
        if (devicesToTerminate.length > 0) {
          testExecutor.terminateAppsOnDevices(context.executionId, devicesToTerminate)
            .catch(err => console.error('[TestOrchestrator] 앱 종료 중 오류:', err));
        }

        // 모든 디바이스를 cancelled 상태로 마킹
        for (const deviceId of context.activeDevices) {
          const deviceResult = context.deviceResults.get(deviceId);
          if (deviceResult) {
            deviceResult.status = 'failed';
            deviceResult.error = '사용자에 의해 취소됨';
          }
        }
        for (const deviceId of context.pendingDevices) {
          const deviceResult = context.deviceResults.get(deviceId);
          if (deviceResult) {
            deviceResult.status = 'skipped';
          }
        }
        context.activeDevices = [];
        context.pendingDevices = [];

        // 디바이스 잠금 해제
        deviceLockService.unlockByExecutionId(context.executionId);

        // 대기열 상태 업데이트
        testQueueService.updateStatus(context.queueId, 'cancelled');

        // 실행 컨텍스트 제거
        this.activeExecutions.delete(context.executionId);

        console.log(`[TestOrchestrator] 테스트 취소: ${context.executionId}`);

        // 다음 대기 테스트 디스패치
        this.tryDispatchPending();

        return { success: true, message: '테스트가 중지되고 앱이 종료됩니다.', queueId };
      } else {
        // Context가 없는 경우 (엣지 케이스): 강제로 상태 변경
        console.warn(`[TestOrchestrator] Context 없이 running 상태인 테스트 강제 취소: ${queueId}`);

        // executionId가 있으면 잠금 해제 시도
        if (test.executionId) {
          deviceLockService.unlockByExecutionId(test.executionId);
        }

        // 상태를 cancelled로 변경 (removeFromQueue가 처리됨)
        testQueueService.updateStatus(queueId, 'cancelled');

        this.tryDispatchPending();

        return { success: true, message: '테스트가 취소되었습니다.', queueId };
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
      return { success: true, message: '테스트가 취소되었습니다.', queueId };
    }

    return { success: false, message: '테스트 취소에 실패했습니다.', queueId };
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
