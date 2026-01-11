// backend/src/services/testQueueService.ts
// 테스트 대기열 관리 서비스
// 다중 사용자 환경에서 테스트 요청 순서 관리

import { Server as SocketIOServer } from 'socket.io';
import { TestExecutionRequest } from '../types';
import { QueuedTest, WaitingInfo } from '../types/queue';

/**
 * 간단한 고유 ID 생성
 */
function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
}

/**
 * 테스트 대기열 관리 서비스
 *
 * 역할:
 * - 테스트 요청 대기열 관리 (FIFO + 우선순위)
 * - 대기 순서 및 예상 시간 계산
 * - 실시간 대기열 상태 브로드캐스트
 */
class TestQueueService {
  private queue: QueuedTest[] = [];
  private io: SocketIOServer | null = null;

  // 평균 시나리오 실행 시간 (초) - 예상 대기 시간 계산용
  private avgScenarioTime = 60;

  /**
   * Socket.IO 인스턴스 설정
   */
  setSocketIO(io: SocketIOServer): void {
    this.io = io;
  }

  /**
   * 테스트를 대기열에 추가
   */
  addToQueue(
    request: TestExecutionRequest,
    requesterName: string,
    requesterSocketId: string,
    options?: {
      priority?: 0 | 1 | 2;
      testName?: string;
    }
  ): QueuedTest {
    const queueId = `queue-${Date.now()}-${generateId()}`;

    const now = new Date();
    const queuedTest: QueuedTest = {
      queueId,
      request,
      requesterName,
      requesterSocketId,
      requestedAt: now,
      status: 'queued',
      priority: options?.priority || 0,
      testName: options?.testName || this.generateTestName(request),
      createdAt: now.toISOString(),
    };

    // 우선순위에 따라 적절한 위치에 삽입
    this.insertByPriority(queuedTest);

    // 순서 업데이트
    this.updatePositions();

    console.log(`[TestQueueService] 대기열 추가: ${queueId} by ${requesterName} (우선순위: ${queuedTest.priority})`);
    this.broadcastQueueStatus();

    return queuedTest;
  }

  /**
   * 우선순위에 따라 적절한 위치에 삽입
   * 같은 우선순위 내에서는 FIFO
   */
  private insertByPriority(newTest: QueuedTest): void {
    // running 상태가 아닌 것들 중에서 우선순위가 낮은 첫 번째 위치 찾기
    let insertIndex = this.queue.length;

    for (let i = 0; i < this.queue.length; i++) {
      const test = this.queue[i];
      // 실행 중인 것은 건너뜀
      if (test.status === 'running') continue;

      // 새 테스트의 우선순위가 더 높으면 이 위치에 삽입
      if (newTest.priority > test.priority) {
        insertIndex = i;
        break;
      }
    }

    this.queue.splice(insertIndex, 0, newTest);
  }

  /**
   * 대기열에서 제거 (취소)
   */
  removeFromQueue(queueId: string): boolean {
    const index = this.queue.findIndex(t => t.queueId === queueId);

    if (index === -1) {
      return false;
    }

    const test = this.queue[index];

    // 실행 중인 테스트는 여기서 취소 불가 (Orchestrator에서 처리)
    if (test.status === 'running') {
      console.warn(`[TestQueueService] 실행 중인 테스트는 대기열에서 직접 제거 불가: ${queueId}`);
      return false;
    }

    this.queue.splice(index, 1);
    this.updatePositions();

    console.log(`[TestQueueService] 대기열에서 제거: ${queueId}`);
    this.broadcastQueueStatus();

    return true;
  }

  /**
   * 대기열 조회
   */
  getQueue(): QueuedTest[] {
    return [...this.queue];
  }

  /**
   * 대기 중인 테스트만 조회 (running 제외)
   */
  getPendingQueue(): QueuedTest[] {
    return this.queue.filter(t => t.status === 'queued' || t.status === 'waiting_devices');
  }

  /**
   * 대기 중인 테스트 목록 (우선순위 > 생성시간 순으로 정렬됨)
   * tryDispatchPending()에서 사용
   */
  getPendingTests(): QueuedTest[] {
    return this.getPendingQueue();
  }

  /**
   * 평균 시나리오 실행 시간 조회 (분 단위)
   */
  getAvgScenarioTime(): number {
    return this.avgScenarioTime / 60; // 초 → 분
  }

  /**
   * 테스트의 대기 원인 정보 업데이트
   */
  updateWaitingInfo(queueId: string, waitingInfo: WaitingInfo): boolean {
    const test = this.queue.find(t => t.queueId === queueId);

    if (!test) {
      return false;
    }

    test.waitingInfo = waitingInfo;

    // 대기열 상태 브로드캐스트
    this.broadcastQueueStatus();

    return true;
  }

  /**
   * 실행 가능한 다음 테스트 반환
   * @param busyDeviceIds 현재 사용 중인 디바이스 ID 목록
   */
  getNextExecutable(busyDeviceIds: Set<string>): QueuedTest | null {
    for (const test of this.queue) {
      // 이미 실행 중이거나 완료된 것은 건너뜀
      if (test.status !== 'queued' && test.status !== 'waiting_devices') {
        continue;
      }

      // 요청한 디바이스 중 사용 중인 것이 있는지 확인
      const hasConflict = test.request.deviceIds.some(id => busyDeviceIds.has(id));

      if (!hasConflict) {
        return test;
      }

      // 디바이스 대기 중 상태로 변경
      if (test.status === 'queued') {
        test.status = 'waiting_devices';
      }
    }

    return null;
  }

  /**
   * 테스트 상태 업데이트
   */
  updateStatus(queueId: string, status: QueuedTest['status'], executionId?: string): boolean {
    const test = this.queue.find(t => t.queueId === queueId);

    if (!test) {
      return false;
    }

    test.status = status;
    if (executionId) {
      test.executionId = executionId;
    }

    console.log(`[TestQueueService] 상태 업데이트: ${queueId} → ${status}`);

    // 완료/취소/실패 시 대기열에서 제거
    if (status === 'completed' || status === 'cancelled' || status === 'failed') {
      const index = this.queue.findIndex(t => t.queueId === queueId);
      if (index !== -1) {
        this.queue.splice(index, 1);
        this.updatePositions();
      }
    }

    this.broadcastQueueStatus();
    return true;
  }

  /**
   * 특정 테스트의 대기 순서 조회
   */
  getPosition(queueId: string): number {
    const test = this.queue.find(t => t.queueId === queueId);
    return test?.position || -1;
  }

  /**
   * 예상 대기 시간 계산 (초)
   */
  getEstimatedWaitTime(queueId: string): number {
    const test = this.queue.find(t => t.queueId === queueId);
    if (!test || test.status === 'running') {
      return 0;
    }

    let waitTime = 0;

    // 앞에 있는 테스트들의 예상 실행 시간 합산
    for (const t of this.queue) {
      if (t.queueId === queueId) break;
      if (t.status === 'running' || t.status === 'queued' || t.status === 'waiting_devices') {
        // 시나리오 수 × 평균 시나리오 시간 × 디바이스 수
        const scenarioCount = t.request.scenarioIds.length * (t.request.repeatCount || 1);
        waitTime += scenarioCount * this.avgScenarioTime;
      }
    }

    return waitTime;
  }

  /**
   * 특정 사용자의 대기 중인 테스트 조회
   */
  getTestsByUser(userName: string): QueuedTest[] {
    return this.queue.filter(t => t.requesterName === userName);
  }

  /**
   * 특정 Socket ID의 대기 중인 테스트 조회
   */
  getTestsBySocketId(socketId: string): QueuedTest[] {
    return this.queue.filter(t => t.requesterSocketId === socketId);
  }

  /**
   * 특정 테스트 조회
   */
  getTest(queueId: string): QueuedTest | null {
    return this.queue.find(t => t.queueId === queueId) || null;
  }

  /**
   * 테스트 이름 생성
   */
  private generateTestName(request: TestExecutionRequest): string {
    const scenarioCount = request.scenarioIds.length;
    const deviceCount = request.deviceIds.length;
    return `테스트 (${scenarioCount}개 시나리오 × ${deviceCount}대)`;
  }

  /**
   * 대기 순서 업데이트
   */
  private updatePositions(): void {
    let position = 1;
    for (const test of this.queue) {
      if (test.status === 'running') {
        test.position = 0; // 실행 중
      } else {
        test.position = position++;
      }
      test.estimatedStartTime = new Date(Date.now() + this.getEstimatedWaitTime(test.queueId) * 1000);
    }
  }

  /**
   * 대기열 상태 브로드캐스트
   */
  private broadcastQueueStatus(): void {
    if (!this.io) return;

    this.io.emit('queue:updated', {
      queue: this.queue,
    });

    // 각 사용자에게 개별 순서 알림
    for (const test of this.queue) {
      if (test.status !== 'running') {
        this.io.to(test.requesterSocketId).emit('queue:position', {
          queueId: test.queueId,
          position: test.position || 0,
          estimatedWaitTime: this.getEstimatedWaitTime(test.queueId),
        });
      }
    }
  }

  /**
   * 평균 시나리오 실행 시간 업데이트
   * (실제 실행 결과 기반으로 조정)
   */
  updateAvgScenarioTime(actualTime: number): void {
    // 지수 이동 평균 (EMA)
    const alpha = 0.2;
    this.avgScenarioTime = alpha * actualTime + (1 - alpha) * this.avgScenarioTime;
  }

  /**
   * 대기열 크기
   */
  getQueueSize(): number {
    return this.queue.length;
  }

  /**
   * 대기 중인 테스트 수 (running 제외)
   */
  getPendingCount(): number {
    return this.queue.filter(t => t.status !== 'running').length;
  }

  /**
   * 대기열 초기화
   */
  clearQueue(): void {
    const count = this.queue.length;
    this.queue = [];

    if (count > 0) {
      console.log(`[TestQueueService] 대기열 초기화 (${count}개 제거)`);
      this.broadcastQueueStatus();
    }
  }

  /**
   * Socket 연결 해제 시 해당 사용자의 대기 중인 테스트 정리
   * (실행 중인 것은 유지)
   */
  cleanupBySocketId(socketId: string): number {
    const toRemove = this.queue.filter(
      t => t.requesterSocketId === socketId && t.status !== 'running'
    );

    for (const test of toRemove) {
      const index = this.queue.findIndex(t => t.queueId === test.queueId);
      if (index !== -1) {
        this.queue.splice(index, 1);
      }
    }

    if (toRemove.length > 0) {
      this.updatePositions();
      console.log(`[TestQueueService] Socket ${socketId} 연결 해제로 ${toRemove.length}개 테스트 제거`);
      this.broadcastQueueStatus();
    }

    return toRemove.length;
  }
}

// 싱글톤 인스턴스
export const testQueueService = new TestQueueService();
