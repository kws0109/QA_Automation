// 실행 관련 타입 정의

export type ExecutionStatus = 'pending' | 'running' | 'waiting' | 'passed' | 'failed' | 'error';

// 시나리오 노드 (실행 시 사용되는 형식)
export interface ExecutionNode {
  id: string;
  type: string;
  label?: string;
  params?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface StepResult {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  status: ExecutionStatus;
  startTime: string;
  endTime?: string;
  duration?: number;
  error?: string;
  screenshot?: string;
}

export interface ExecutionResult {
  id: string;
  scenarioId: string;
  scenarioName: string;
  status: ExecutionStatus;
  startTime: string;
  endTime?: string;
  duration?: number;
  steps: StepResult[];
}

export interface ExecutionLog {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  nodeId?: string;
}

// ========== 다중 시나리오 테스트 실행 (Who/What/When) ==========

// 테스트 실행 요청
export interface TestExecutionRequest {
  // WHO - 어떤 디바이스로 테스트할 것인지
  deviceIds: string[];

  // WHAT - 어떤 테스트를 진행할 것인지
  scenarioIds: string[];

  // WHEN - 실행 옵션
  repeatCount: number;             // 반복 횟수 (기본: 1)
  scenarioInterval?: number;       // 시나리오 간 인터벌 (ms, 기본: 0)

  // 테스트 정보
  testName?: string;               // 테스트 이름 (리포트용)
  requesterName?: string;          // 요청자 이름
  requesterSocketId?: string;      // 요청자 소켓 ID
  queueId?: string;                // 큐 ID (분할 실행 시)

  // 큐 시스템용 (선택적, HTTP 요청 시 포함) - 하위 호환성
  userName?: string;               // 요청자 이름 (deprecated, requesterName 사용)
  socketId?: string;               // 요청자 소켓 ID (deprecated, requesterSocketId 사용)
}

// 시나리오 큐 아이템 (실행 순서 관리)
export interface ScenarioQueueItem {
  scenarioId: string;
  scenarioName: string;
  packageId: string;
  packageName: string;             // 패키지 표시 이름
  appPackage: string;              // Android 앱 패키지명 (예: com.example.app)
  categoryId: string;
  categoryName: string;
  order: number;                   // 실행 순서 (1-based)
  repeatIndex: number;             // 반복 회차 (1, 2, 3...)
}

// 개별 디바이스 실행 결과 (TestExecutor용)
export interface DeviceExecutionResult {
  deviceId: string;
  deviceName: string;
  success: boolean;
  duration: number;
  error?: string;
  steps: StepResult[];
}

// 개별 시나리오 실행 요약
export interface ScenarioExecutionSummary {
  scenarioId: string;
  scenarioName: string;
  packageId: string;
  packageName: string;             // 패키지 표시 이름
  appPackage: string;              // Android 앱 패키지명 (예: com.example.app)
  categoryId: string;
  categoryName: string;
  repeatIndex: number;
  deviceResults: DeviceExecutionResult[];
  duration: number;
  status: 'passed' | 'failed' | 'skipped';
}

// 테스트 실행 상태
export interface TestExecutionStatus {
  isRunning: boolean;
  executionId?: string;
  currentScenario?: {
    scenarioId: string;
    scenarioName: string;
    order: number;
    repeatIndex: number;
  };
  progress: {
    completed: number;
    total: number;
    percentage: number;
  };
  startedAt?: string;
}

// 전체 테스트 실행 결과
export interface TestExecutionResult {
  id: string;                              // 실행 ID
  request: TestExecutionRequest;
  scenarioResults: ScenarioExecutionSummary[];
  summary: {
    totalScenarios: number;
    passedScenarios: number;
    failedScenarios: number;
    skippedScenarios: number;
    totalDevices: number;
    totalDuration: number;
  };
  startedAt: string;
  completedAt: string;
  status: 'completed' | 'partial' | 'failed' | 'stopped';
}

// ========== 스크린샷/비디오 ==========

// 스크린샷 정보
export interface ScreenshotInfo {
  nodeId: string;
  timestamp: string;
  path: string;  // 상대 경로
  type: 'step' | 'final' | 'highlight' | 'failed';  // 단계별/최종/이미지인식/실패
  templateId?: string;  // 이미지 인식 시 사용된 템플릿 ID
  confidence?: number;  // 매칭 신뢰도 (0-1)
}

// 비디오 녹화 정보
export interface VideoInfo {
  path: string;  // 상대 경로
  duration: number;  // 녹화 시간 (ms)
  size: number;  // 파일 크기 (bytes)
  startedAt: string;  // 녹화 시작 시간 (ISO 문자열)
}