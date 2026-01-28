// frontend/src/types/socket.ts
// Socket.IO 이벤트 관련 타입

import type { ExecutionLog, ExecutionResult, DeviceExecutionResult, TestExecutionRequest, TestExecutionResult, ScenarioQueueItem } from './execution';

// ========== Socket Events ==========
export interface SocketEvents {
  'scenario:start': { scenarioId: string };
  'scenario:node': ExecutionLog;
  'scenario:complete': ExecutionResult;
  'scenario:error': { error: string };
  'scenario:stop': { scenarioId: string };
}

// Socket 이벤트 (병렬 실행용)
export interface ParallelSocketEvents {
  'parallel:start': {
    scenarioId: string;
    scenarioName: string;
    deviceIds: string[];
    startedAt: string;
  };
  'parallel:complete': {
    scenarioId: string;
    scenarioName: string;
    totalDuration: number;
    results: DeviceExecutionResult[];
  };
  'device:scenario:start': {
    deviceId: string;
    scenarioId: string;
    scenarioName: string;
  };
  'device:scenario:complete': {
    deviceId: string;
    scenarioId: string;
    status: 'success' | 'failed';
    duration: number;
    error?: string;
  };
  'device:node': {
    deviceId: string;
    nodeId: string;
    status: 'start' | 'success' | 'error';
    message: string;
  };
}

// 테스트 실행 Socket 이벤트
export interface TestSocketEvents {
  'test:start': {
    executionId: string;
    request: TestExecutionRequest;
    queue: ScenarioQueueItem[];
    totalScenarios: number;
  };
  'test:scenario:start': {
    executionId: string;
    scenarioId: string;
    scenarioName: string;
    packageName: string;
    categoryName: string;
    repeatIndex: number;
    order: number;
    total: number;
  };
  'test:scenario:complete': {
    executionId: string;
    scenarioId: string;
    scenarioName: string;
    repeatIndex: number;
    order: number;
    status: 'passed' | 'failed' | 'skipped';
    duration: number;
  };
  'test:progress': {
    executionId: string;
    completed: number;
    total: number;
    percentage: number;
  };
  'test:complete': {
    executionId: string;
    result: TestExecutionResult;
  };
  'test:stopping': {
    executionId: string;
  };
}

// ========== 다중 사용자 큐 시스템 ==========

// 차단 디바이스 정보 (대기 원인)
export interface BlockingDeviceInfo {
  deviceId: string;
  deviceName: string;
  usedBy: string;            // 사용 중인 사용자
  testName?: string;         // 실행 중인 테스트 이름
  estimatedRemaining: number; // 예상 남은 시간 (초)
}

// 대기 원인 정보 (왜 테스트가 대기 중인지)
export interface WaitingInfo {
  blockedByDevices: BlockingDeviceInfo[];  // 차단하고 있는 디바이스 목록
  estimatedWaitTime: number;               // 예상 대기 시간 (초)
  queuePosition: number;                   // 대기열 순서
  canRunImmediatelyIf?: string[];          // 이 디바이스들이 해제되면 즉시 실행 가능
}

// 디바이스 큐 상태 (잠금 상태)
export interface DeviceQueueStatus {
  deviceId: string;
  deviceName: string;
  status: 'available' | 'busy_mine' | 'busy_other' | 'reserved';
  lockedBy?: string;         // 사용 중인 사용자
  testName?: string;         // 실행 중인 테스트
  executionId?: string;      // 실행 ID
}

// 대기열 테스트 항목
export interface QueuedTest {
  queueId: string;
  request: TestExecutionRequest;
  requesterName: string;
  socketId: string;
  priority: 0 | 1 | 2;       // 0: 낮음, 1: 보통, 2: 높음
  status: 'pending' | 'running' | 'completed' | 'cancelled' | 'failed';
  testName?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  executionId?: string;      // 실행 ID (실행 시작 후 할당)
  waitingInfo?: WaitingInfo; // 대기 원인 정보 (대기 중일 때만)
  progress?: number;         // 진행률 (0-100, 백엔드 계산)

  // Suite 관련 (type='suite'일 때 사용)
  type?: 'test' | 'suite';     // 실행 타입 (기본: 'test')
  suiteId?: string;            // Suite ID
  suiteName?: string;          // Suite 이름
}

// 완료된 테스트 항목
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
  completedAt: string;
  reportId?: string;         // 리포트 ID (리포트 페이지 연결용)
  executionId?: string;      // 실행 ID
  type?: 'test' | 'suite';   // 실행 타입
  suiteId?: string;          // Suite ID (type='suite'일 때)
}

// 큐 상태 응답
export interface QueueStatusResponse {
  isProcessing: boolean;
  queueLength: number;
  runningCount: number;
  pendingTests: QueuedTest[];
  runningTests: QueuedTest[];
  completedTests: CompletedTest[];  // 최근 완료된 테스트
  deviceStatuses: DeviceQueueStatus[];
}

// 테스트 제출 응답
export interface TestSubmitResponse {
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

// 큐 시스템 Socket 이벤트
export interface QueueSocketEvents {
  'user:identify': { userName: string };
  'user:identified': { socketId: string; userName: string };
  'queue:status': void;
  'queue:status:response': QueueStatusResponse;
  'queue:submit': {
    deviceIds: string[];
    scenarioIds: string[];
    repeatCount?: number;
    scenarioInterval?: number;
    priority?: 0 | 1 | 2;
    testName?: string;
  };
  'queue:submitted': TestSubmitResponse;
  'queue:cancel': { queueId: string };
  'queue:cancel:response': { success: boolean; message?: string };
  'queue:updated': { queue: QueuedTest[] };  // 큐 상태 변경 시 브로드캐스트
}
