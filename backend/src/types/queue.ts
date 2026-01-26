// backend/src/types/queue.ts
// 다중 사용자 테스트 큐 시스템 타입 정의

import { TestExecutionRequest } from './index';

/**
 * 디바이스 잠금 정보
 */
export interface DeviceLock {
  deviceId: string;
  executionId: string;
  lockedBy: string;          // 사용자 이름
  lockedAt: Date;
  testName?: string;         // 실행 중인 테스트 이름
}

/**
 * 디바이스 상태 (UI용)
 */
export interface DeviceQueueStatus {
  deviceId: string;
  deviceName: string;
  status: 'available' | 'busy_mine' | 'busy_other' | 'reserved';
  lockedBy?: string;         // 사용 중인 사용자
  testName?: string;         // 실행 중인 테스트
  executionId?: string;      // 실행 ID
}

/**
 * 대기열 테스트 항목
 */
export interface QueuedTest {
  queueId: string;
  request: TestExecutionRequest;
  requesterName: string;
  requesterSocketId: string;
  requestedAt: Date;
  status: 'queued' | 'waiting_devices' | 'running' | 'completed' | 'cancelled' | 'failed';
  priority: 0 | 1 | 2;       // 0=일반, 1=높음, 2=긴급
  position?: number;         // 대기 순서
  estimatedStartTime?: Date; // 예상 시작 시간
  executionId?: string;      // 실행 시작 후 할당
  testName?: string;         // 테스트 이름 (표시용)
  waitingInfo?: WaitingInfo; // 대기 원인 정보 (대기 중일 때만)
  createdAt: string;         // ISO 문자열 (UI 호환)
  startedAt?: string;        // 실행 시작 시간 (ISO 문자열)
  progress?: number;         // 진행률 (0-100, 백엔드 계산)

  // 디바이스 상태 (부분 실행 시 사용)
  runningDevices?: string[];   // 현재 실행 중인 디바이스
  pendingDevices?: string[];   // 선점 해제 대기 중인 디바이스
  completedDevices?: string[]; // 실행 완료된 디바이스

  // Suite 관련 (type='suite'일 때 사용)
  type?: 'test' | 'suite';     // 실행 타입 (기본: 'test')
  suiteId?: string;            // Suite ID
  suiteName?: string;          // Suite 이름
}

/**
 * 완료된 테스트 항목 (UI용)
 */
export interface CompletedTest {
  queueId: string;
  testName?: string;
  requesterName: string;
  deviceCount: number;
  scenarioCount: number;
  success: boolean;          // 전체 성공 여부
  successCount: number;      // 성공한 디바이스 수
  totalCount: number;        // 전체 디바이스 수
  duration: number;          // 소요 시간 (ms)
  completedAt: string;       // ISO 문자열
}

/**
 * 디바이스 실행 상태
 */
export type DeviceExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

/**
 * 디바이스별 실행 결과 (통합 컨텍스트용)
 */
export interface DeviceExecutionResult {
  deviceId: string;
  deviceName: string;
  status: DeviceExecutionStatus;
  startedAt?: Date;
  completedAt?: Date;
  duration?: number;
  success?: boolean;
  error?: string;
}

/**
 * 실행 컨텍스트 (실행 중인 테스트 정보)
 * - 통합 컨텍스트: 하나의 요청에 대해 모든 디바이스를 관리
 */
export interface ExecutionContext {
  executionId: string;
  queueId: string;
  request: TestExecutionRequest;
  userName: string;
  socketId: string;

  // 전체 요청 디바이스
  deviceIds: string[];

  // 디바이스 상태 분류
  activeDevices: string[];       // 현재 실행 중인 디바이스
  pendingDevices: string[];      // 선점 해제 대기 중인 디바이스
  completedDevices: string[];    // 실행 완료된 디바이스

  // 디바이스별 결과 누적
  deviceResults: Map<string, DeviceExecutionResult>;

  startedAt: Date;
  stopRequested: boolean;
  testName?: string;

  // Suite 관련 (type='suite'일 때 사용)
  type: 'test' | 'suite';        // 실행 타입 (기본: 'test')
  suiteId?: string;              // Suite ID
}

/**
 * 테스트 제출 결과
 */
export interface SubmitTestResult {
  queueId: string;
  status: 'started' | 'queued' | 'partial';  // partial: 일부 즉시 실행, 일부 대기
  executionId?: string;      // 즉시 시작된 경우
  position?: number;         // 대기열에 추가된 경우
  estimatedWaitTime?: number; // 예상 대기 시간 (초)
  message: string;

  // 분할 실행 정보 (status가 'partial'일 때)
  splitExecution?: {
    immediateDeviceIds: string[];   // 즉시 실행된 디바이스
    queuedDeviceIds: string[];      // 큐에 추가된 디바이스
    immediateExecutionId: string;   // 즉시 실행 ID
    queuedQueueId: string;          // 큐에 추가된 테스트 ID
    queuePosition: number;          // 큐 위치
  };
}

/**
 * 대기 원인 정보 (UI용)
 * 왜 테스트가 대기 중인지 상세 정보 제공
 */
export interface WaitingInfo {
  blockedByDevices: BlockingDeviceInfo[];  // 차단하고 있는 디바이스 목록
  estimatedWaitTime: number;               // 예상 대기 시간 (초)
  queuePosition: number;                   // 대기열 순서 (우선순위 순)
  canRunImmediatelyIf?: string[];          // 이 디바이스들이 해제되면 즉시 실행 가능
}

/**
 * 차단 디바이스 정보
 */
export interface BlockingDeviceInfo {
  deviceId: string;
  deviceName: string;
  usedBy: string;            // 사용 중인 사용자
  testName?: string;         // 실행 중인 테스트 이름
  estimatedRemaining: number; // 예상 남은 시간 (초)
}

/**
 * 전체 큐 상태
 */
export interface QueueSystemStatus {
  activeExecutions: ExecutionContext[];
  queue: QueuedTest[];
  deviceLocks: DeviceLock[];
}

/**
 * Socket 이벤트 페이로드
 */
export interface QueueSocketEvents {
  'queue:updated': {
    queue: QueuedTest[];
  };
  'queue:position': {
    queueId: string;
    position: number;
    estimatedWaitTime: number;
  };
  'queue:auto_start': {
    queueId: string;
    executionId: string;
    message: string;
  };
  'queue:cancelled': {
    queueId: string;
    message: string;
  };
  'device:locks_updated': {
    locks: DeviceLock[];
    deviceStatuses: DeviceQueueStatus[];
  };
}
