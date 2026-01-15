// frontend/src/types/index.ts

// ========== Node 관련 ==========
export type NodeType = 'start' | 'action' | 'condition' | 'loop' | 'end';

export interface NodeParams {
  actionType?: string;
  x?: number;
  y?: number;
  duration?: number;
  startX?: number;
  startY?: number;
  endX?: number;
  endY?: number;
  text?: string;
  selector?: string;
  selectorType?: string;
  timeout?: number;
  interval?: number;
  conditionType?: string;
  loopType?: string;
  loopCount?: number;
  currentIteration?: number;
  packageName?: string;
  continueOnError?: boolean;
  retryCount?: number;
  retryDelay?: number;
  templateId?: string;
  templateName?: string;
  threshold?: number;
}

export interface FlowNode {
  id: string;
  type: NodeType;
  label?: string;  // 노드 설명 (예: "로그인 버튼 클릭")
  x: number;
  y: number;
  params: NodeParams;
}

export interface Connection {
  from: string;
  to: string;
  label?: string;
}

// ========== Device 관련 ==========
export interface DeviceStatus {
  connected: boolean;
  deviceId?: string;
  platformVersion?: string;
  appPackage?: string;
  sessionId?: string;
}

export interface ConnectionConfig {
  deviceId: string;
  platformVersion: string;
  appPackage: string;
  appActivity: string;
  automationName: string;
  noReset: boolean;
}

export interface ConnectionPreset {
  id: string;
  name: string;
  config: ConnectionConfig;
}

// ========== Package 관련 ==========
export interface Package {
  id: string;
  name: string;           // 표시 이름 (예: "게임 A")
  packageName: string;    // Android 패키지명 (예: "com.company.game")
  description?: string;
  scenarioCount?: number;
  createdAt: string;
  updatedAt: string;
}

// ========== Category 관련 (중분류) ==========
export interface Category {
  id: string;
  packageId: string;      // 소속 패키지 ID (대분류)
  name: string;           // 한글명 (예: "로그인", "결제")
  description?: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

// ========== Scenario 관련 ==========
export interface Scenario {
  id: string;
  name: string;
  description?: string;
  packageId: string;      // 소속 패키지 ID (대분류)
  categoryId: string;     // 소속 카테고리 ID (중분류)
  nodes: FlowNode[];
  connections: Connection[];
  createdAt: string;
  updatedAt: string;
}

export interface ScenarioSummary {
  id: string;
  name: string;
  description?: string;
  packageId: string;      // 소속 패키지 ID (대분류)
  packageName?: string;   // 패키지 표시명
  categoryId: string;     // 소속 카테고리 ID (중분류)
  categoryName?: string;  // 카테고리 표시명
  nodeCount: number;
  createdAt: string;
  updatedAt: string;
}

// ========== Execution 관련 ==========
export type ExecutionStatus = 'pending' | 'running' | 'passed' | 'failed' | 'success' | 'error' | 'skipped' | 'stopped';

export interface ExecutionLog {
  timestamp: string;
  nodeId: string;
  status: ExecutionStatus;
  message: string;
  duration?: number;
  error?: string;
}

export interface ExecutionResult {
  scenarioId: string;
  scenarioName: string;
  startTime: string;
  endTime: string;
  duration: number;
  status: 'success' | 'error' | 'stopped';
  nodeResults: ExecutionLog[];
  summary: {
    total: number;
    success: number;
    error: number;
    skipped: number;
  };
}

// ========== Report 관련 ==========
export interface Report {
  id: string;
  scenarioId: string;
  scenarioName: string;
  executedAt: string;
  duration: number;
  status: 'success' | 'error' | 'stopped';
  summary: {
    total: number;
    success: number;
    error: number;
    skipped: number;
  };
  nodeResults: ExecutionLog[];
}

export interface ReportSummary {
  id: string;
  scenarioName: string;
  executedAt: string;
  status: 'success' | 'error' | 'stopped';
  duration: number;
}

// ========== Action 관련 ==========
export interface ActionType {
  value: string;
  label: string;
  group: 'touch' | 'wait' | 'system';
}

export interface ConditionType {
  value: string;
  label: string;
}

export interface LoopType {
  value: string;
  label: string;
}

export interface SelectorStrategy {
  value: string;
  label: string;
}

// ========== API Response ==========
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// ========== Socket Events ==========
export interface SocketEvents {
  'scenario:start': { scenarioId: string };
  'scenario:node': ExecutionLog;
  'scenario:complete': ExecutionResult;
  'scenario:error': { error: string };
  'scenario:stop': { scenarioId: string };
}

// ========== Device Element (Preview용) ==========
export interface DeviceElement {
  resourceId?: string;
  text?: string;
  contentDesc?: string;
  className?: string;
  clickable?: boolean;
  enabled?: boolean;
  bounds?: {
    left: number;
    top: number;
    right: number;
    bottom: number;
    // 또는 x, y, width, height 형태로도 사용 가능
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  };
}

// ========== Connection Form ==========
export interface ConnectionFormData {
  deviceName: string;
  appPackage: string;
  appActivity: string;
}

// ========== Image Template ==========
export interface ImageTemplate {
  id: string;
  name: string;
  filename: string;
  packageId?: string;       // 소속 패키지 ID
  width: number;
  height: number;
  createdAt: string;
  // 캡처 좌표 정보 (ROI 자동 계산용)
  captureX?: number;        // 원본 스크린샷에서의 X 좌표
  captureY?: number;        // 원본 스크린샷에서의 Y 좌표
  sourceWidth?: number;     // 원본 스크린샷 너비
  sourceHeight?: number;    // 원본 스크린샷 높이
}

export interface ImageMatchResult {
  found: boolean;
  x: number;
  y: number;
  confidence: number;
}

// ========== WiFi ADB ==========

// WiFi ADB 연결 설정
export interface WifiDeviceConfig {
  ip: string;
  port: number;
  deviceId: string;        // 연결 시 사용되는 ID (예: 192.168.1.100:5555)
  originalDeviceId?: string;  // 원래 USB device ID (예: emulator-5554)
  alias?: string;
  lastConnected?: string;
  autoReconnect: boolean;
}

// WiFi 연결 결과
export interface WifiConnectionResult {
  success: boolean;
  deviceId?: string;
  message: string;
}

// ========== Multi-Device (Phase 2) ==========
export type DeviceOS = 'Android' | 'iOS';
export type DeviceRole = 'editing' | 'testing';  // 디바이스 역할 (편집용/테스트용)

export interface DeviceInfo {
  id: string;
  name: string;
  model: string;
  os: DeviceOS;
  osVersion: string;
  status: 'connected' | 'offline' | 'unauthorized';
  sessionActive: boolean;
  mjpegPort?: number;
  connectionType?: 'usb' | 'wifi';  // 연결 타입
}

// 디바이스 상세 정보 (대시보드용)
export interface DeviceDetailedInfo extends DeviceInfo {
  // 하드웨어 정보
  brand: string;
  manufacturer: string;
  screenResolution: string;
  screenDensity: number;

  // 시스템 정보
  cpuModel: string;  // CPU 모델명 (예: Snapdragon SDM845)
  cpuAbi: string;    // CPU ABI (예: arm64-v8a)
  sdkVersion: number;
  buildNumber: string;

  // 실시간 상태
  batteryLevel: number;
  batteryStatus: 'charging' | 'discharging' | 'full' | 'not charging' | 'unknown';
  batteryTemperature: number;  // 섭씨 온도
  cpuTemperature: number;      // 섭씨 온도
  memoryTotal: number;  // MB
  memoryAvailable: number;  // MB
  storageTotal: number;  // GB
  storageAvailable: number;  // GB

  // 저장된 정보 (영구 저장)
  alias?: string;                // 사용자 지정 별칭
  role?: DeviceRole;             // 디바이스 역할 (편집용/테스트용)
  firstConnectedAt?: string;     // 최초 연결 시간
  lastConnectedAt?: string;      // 마지막 연결 시간
}

export interface SessionInfo {
  deviceId: string;
  sessionId: string;
  appiumPort: number;
  mjpegPort: number;
  createdAt: string;
  status: 'active' | 'idle' | 'error';
}

// 디바이스별 실행 상태 (대시보드 표시용)
export interface DeviceExecutionStatus {
  scenarioName: string;
  currentNodeId: string;
  status: 'running' | 'waiting' | 'success' | 'error';
  message: string;
  // 진행률
  currentStep: number;
  totalSteps: number;
}

export interface DeviceExecutionResult {
  deviceId: string;
  success: boolean;
  duration: number;
  error?: string;
}

export interface ParallelExecutionResult {
  scenarioId: string;
  results: DeviceExecutionResult[];
  totalDuration: number;
  startedAt: string;
  completedAt: string;
}

// 병렬 실행 실시간 로그
export interface ParallelLog {
  deviceId: string;
  timestamp: string;
  nodeId: string;
  status: 'start' | 'success' | 'error' | 'skip';
  message: string;
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

// ========== 병렬 실행 통합 리포트 (Phase 3) ==========

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

// ========== QA 확장 타입 (리포트 품질 향상) ==========

// 디바이스 환경 정보
export interface DeviceEnvironment {
  brand: string;
  model: string;
  manufacturer: string;
  androidVersion: string;
  sdkVersion: number;
  screenResolution: string;
  screenDensity: number;
  cpuAbi: string;
  totalMemory: number;
  totalStorage: number;
  batteryLevel: number;
  batteryStatus: string;
  batteryTemperature: number;
  availableMemory: number;
  availableStorage: number;
  networkType: 'wifi' | 'mobile' | 'ethernet' | 'none' | 'unknown';
  networkStrength?: number;
  wifiSsid?: string;
  ipAddress?: string;
}

// 앱 정보
export interface AppInfo {
  packageName: string;
  appName?: string;
  versionName?: string;
  versionCode?: number;
  targetSdk?: number;
  minSdk?: number;
  installedAt?: string;
  lastUpdatedAt?: string;
}

// 실패 유형
export type FailureType =
  | 'timeout'
  | 'element_not_found'
  | 'image_not_matched'
  | 'text_not_found'
  | 'assertion_failed'
  | 'app_crash'
  | 'app_not_running'
  | 'session_error'
  | 'connection_error'
  | 'network_error'
  | 'permission_denied'
  | 'resource_exhausted'
  | 'unknown';

// 실패 분석
export interface FailureAnalysis {
  failureType: FailureType;
  errorMessage: string;
  errorCode?: string;
  stackTrace?: string;
  context: {
    previousAction?: string;
    attemptedAction: string;
    actionParams?: Record<string, unknown>;
    expectedState?: string;
    actualState?: string;
  };
  retryAttempts?: number;
  totalRetryTime?: number;
  failureScreenshot?: string;
  appState?: 'foreground' | 'background' | 'not_running' | 'crashed';
  currentActivity?: string;
  logcatSnippet?: string;
}

// 이미지 매칭 메트릭
export interface ImageMatchMetrics {
  templateId: string;
  templateName?: string;
  templateSize?: { width: number; height: number };
  matched: boolean;
  confidence: number;
  threshold: number;
  matchLocation?: { x: number; y: number; width: number; height: number };
  matchTime: number;
  preprocessTime?: number;
  roiUsed: boolean;
  roiRegion?: { x: number; y: number; width: number; height: number };
}

// 단계 성능 메트릭
export interface StepPerformance {
  waitTime?: number;
  actionTime?: number;
  totalTime: number;
  imageMatch?: ImageMatchMetrics;
  cpuUsage?: number;
  memoryUsage?: number;
}

// 디바이스 로그
export interface DeviceLogs {
  logcat?: string;
  logcatPath?: string;
  capturedAt: string;
  captureStartTime: string;
  captureEndTime: string;
  logLevel: 'verbose' | 'debug' | 'info' | 'warn' | 'error';
  packageFilter?: string;
  crashLogs?: string;
  anrTraces?: string;
}

// Flaky 테스트 분석
export interface FlakyAnalysis {
  scenarioId: string;
  deviceId: string;
  recentRuns: {
    reportId: string;
    success: boolean;
    executedAt: string;
    duration: number;
  }[];
  totalRuns: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  isFlaky: boolean;
  flakyScore: number;
  flakyReason?: string;
  failurePatterns?: {
    type: FailureType;
    count: number;
    percentage: number;
  }[];
}

// 단계별 결과
export interface StepResult {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  status: 'passed' | 'failed' | 'skipped' | 'error' | 'running' | 'waiting';
  startTime: string;
  endTime?: string;
  duration?: number;
  error?: string;
  screenshot?: string;

  // === QA 확장 필드 ===
  performance?: StepPerformance;
  failureAnalysis?: FailureAnalysis;
  imageMatchResult?: ImageMatchMetrics;
  actionParams?: Record<string, unknown>;
  retryCount?: number;
}

// ========== 시나리오 흐름 요약 ==========

// 노드 순회 결과
export interface TraversalNode {
  node: FlowNode;
  depth: number;                              // 들여쓰기 레벨 (분기/루프 깊이)
  branch?: 'yes' | 'no' | 'loop' | 'exit';    // 분기 라벨
  stepNumber: number;                         // 순서 번호
}

// 시나리오 흐름 요약 결과
export interface ScenarioFlowSummary {
  scenarioName: string;
  scenarioId?: string;
  totalNodes: number;
  totalSteps: number;
  hasConditions: boolean;
  hasLoops: boolean;
  disconnectedNodes: FlowNode[];              // 연결되지 않은 노드들
  traversalOrder: TraversalNode[];
  textSummary: string;
}

// ========== 스케줄링 (Phase 4) ==========

// 스케줄 정보
export interface Schedule {
  id: string;
  name: string;
  scenarioId: string;
  deviceIds: string[];
  cronExpression: string;  // '0 10 * * *' 형식
  enabled: boolean;
  description?: string;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  nextRunAt?: string;
}

// 스케줄 생성 요청
export interface CreateScheduleRequest {
  name: string;
  scenarioId: string;
  deviceIds: string[];
  cronExpression: string;
  description?: string;
}

// 스케줄 수정 요청
export interface UpdateScheduleRequest {
  name?: string;
  scenarioId?: string;
  deviceIds?: string[];
  cronExpression?: string;
  description?: string;
  enabled?: boolean;
}

// 스케줄 실행 이력
export interface ScheduleHistory {
  id: string;
  scheduleId: string;
  scheduleName: string;
  scenarioId: string;
  scenarioName: string;
  deviceIds: string[];
  startedAt: string;
  completedAt: string;
  success: boolean;
  reportId?: string;
  error?: string;
}

// 스케줄 목록 아이템
export interface ScheduleListItem {
  id: string;
  name: string;
  scenarioId: string;
  scenarioName: string;
  deviceIds: string[];
  cronExpression: string;
  enabled: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
}

// Cron 표현식 프리셋
export interface CronPreset {
  label: string;
  expression: string;
  description: string;
}

// 스케줄 Socket 이벤트
export interface ScheduleSocketEvents {
  'schedule:start': {
    scheduleId: string;
    scheduleName: string;
    scenarioId: string;
    deviceIds: string[];
    startedAt: string;
  };
  'schedule:complete': {
    scheduleId: string;
    scheduleName: string;
    success: boolean;
    error?: string;
    reportId?: string;
    startedAt: string;
    completedAt: string;
    duration: number;
  };
  'schedule:enabled': {
    scheduleId: string;
    scheduleName: string;
  };
  'schedule:disabled': {
    scheduleId: string;
  };
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
}

// 시나리오 큐 아이템 (실행 순서 관리)
export interface ScenarioQueueItem {
  scenarioId: string;
  scenarioName: string;
  packageId: string;
  packageName: string;
  categoryId: string;
  categoryName: string;
  order: number;                   // 실행 순서 (1-based)
  repeatIndex: number;             // 반복 회차 (1, 2, 3...)
}

// 개별 시나리오 실행 요약
export interface ScenarioExecutionSummary {
  scenarioId: string;
  scenarioName: string;
  packageId: string;
  packageName: string;
  categoryId: string;
  categoryName: string;
  repeatIndex: number;
  deviceResults: TestDeviceResult[];
  duration: number;
  status: 'passed' | 'failed' | 'skipped';
}

// 테스트용 디바이스 결과
export interface TestDeviceResult {
  deviceId: string;
  deviceName: string;
  success: boolean;
  duration: number;
  error?: string;
  steps: StepResult[];
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

// 테스트 실행 옵션 (UI용)
export interface TestExecutionOptions {
  repeatCount: number;
  scenarioInterval: number;        // 시나리오 간 인터벌 (초, 기본: 0)
}

// 디바이스별 진행 상태 (방식 2용)
export interface DeviceProgress {
  deviceId: string;
  deviceName: string;
  currentScenarioIndex: number;
  totalScenarios: number;
  currentScenarioId: string;
  currentScenarioName: string;
  status: 'running' | 'completed' | 'failed' | 'stopped';
  completedScenarios: number;
  failedScenarios: number;
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

// 디바이스 큐 상태 (잠금 상태)
export interface DeviceQueueStatus {
  deviceId: string;
  deviceName: string;
  status: 'available' | 'busy_mine' | 'busy_other' | 'reserved';
  lockedBy?: string;         // 사용 중인 사용자
  testName?: string;         // 실행 중인 테스트
  executionId?: string;      // 실행 ID
}

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

// ========== 통합 테스트 리포트 (다중 시나리오 지원) ==========

// 디바이스별 시나리오 실행 결과
export interface DeviceScenarioResult {
  deviceId: string;
  deviceName: string;
  success: boolean;
  status: DeviceReportStatus;  // 'completed' | 'failed' | 'skipped'
  duration: number;
  error?: string;
  steps: StepResult[];
  screenshots: ScreenshotInfo[];
  video?: VideoInfo;
  skippedReason?: string;

  // === QA 확장 필드 ===
  environment?: DeviceEnvironment;
  appInfo?: AppInfo;
  logs?: DeviceLogs;
  performanceSummary?: {
    avgStepDuration: number;
    maxStepDuration: number;
    minStepDuration: number;
    totalWaitTime: number;
    totalActionTime: number;
    imageMatchAvgTime?: number;
    imageMatchCount?: number;
    // 디바이스/백엔드 매칭 통계
    deviceMatchCount?: number;
    backendMatchCount?: number;
    deviceMatchAvgTime?: number;
    backendMatchAvgTime?: number;
  };
}

// 개별 시나리오 실행 결과 (리포트용)
export interface ScenarioReportResult {
  scenarioId: string;
  scenarioName: string;
  packageId: string;
  packageName: string;
  categoryId: string;
  categoryName: string;
  order: number;           // 실행 순서 (1-based)
  repeatIndex: number;     // 반복 회차 (1, 2, 3...)
  deviceResults: DeviceScenarioResult[];
  duration: number;
  status: 'passed' | 'failed' | 'partial' | 'skipped';
  startedAt: string;
  completedAt: string;
}

// 테스트 실행 정보 (리포트용)
export interface TestExecutionInfo {
  testName?: string;           // 테스트 이름
  requesterName?: string;      // 요청자 이름
  requesterSocketId?: string;  // 요청자 소켓 ID
  splitExecution?: boolean;    // 분할 실행 여부
  forceCompleted?: boolean;    // 부분 완료 여부
  originalDeviceCount?: number; // 원래 요청한 디바이스 수
  queueId?: string;            // 큐 ID
}

// 통합 리포트 통계
export interface TestReportStats {
  // 디바이스 통계
  totalDevices: number;
  successDevices: number;
  failedDevices: number;
  skippedDevices: number;

  // 시나리오 통계
  totalScenarios: number;
  passedScenarios: number;
  failedScenarios: number;
  partialScenarios: number;   // 일부 디바이스만 성공
  skippedScenarios: number;

  // 단계 통계
  totalSteps: number;
  passedSteps: number;
  failedSteps: number;

  // 시간 통계
  totalDuration: number;
  avgScenarioDuration: number;
  avgDeviceDuration: number;
}

// 통합 테스트 리포트
export interface TestReport {
  id: string;
  executionId: string;         // testExecutor 실행 ID
  executionInfo: TestExecutionInfo;

  // 요청 정보
  requestedDeviceIds: string[];
  requestedScenarioIds: string[];
  repeatCount: number;

  // 결과
  scenarioResults: ScenarioReportResult[];
  stats: TestReportStats;

  // 상태
  status: 'completed' | 'partial' | 'failed' | 'stopped';

  // 시간
  startedAt: string;
  completedAt: string;
  createdAt: string;

  // === QA 확장 필드 ===
  flakyAnalysis?: FlakyAnalysis[];
  failureSummary?: {
    totalFailures: number;
    failuresByType: {
      type: string;
      count: number;
      percentage: number;
    }[];
    commonPatterns?: string[];
  };
}

// 리포트 목록 아이템
export interface TestReportListItem {
  id: string;
  executionId: string;
  testName?: string;
  requesterName?: string;
  scenarioCount: number;
  deviceCount: number;
  stats: TestReportStats;
  status: 'completed' | 'partial' | 'failed' | 'stopped';
  startedAt: string;
  completedAt: string;
  createdAt: string;
}

// API 응답 타입
export interface TestReportListResponse {
  success: boolean;
  reports: TestReportListItem[];
}

export interface TestReportDetailResponse {
  success: boolean;
  report: TestReport;
}

// ========== Dashboard 메트릭 타입 ==========

export interface DashboardOverview {
  totalExecutions: number;
  totalScenarios: number;
  overallSuccessRate: number;
  avgExecutionTime: number;
  uniqueDevices: number;
  uniqueScenarios: number;
  recentFailures: number;
  todayExecutions: number;
}

export interface SuccessRateTrend {
  date: string;
  totalExecutions: number;
  totalScenarios: number;
  passedScenarios: number;
  failedScenarios: number;
  successRate: number;
}

export interface FailurePattern {
  failureType: string;
  failureCategory: string;
  count: number;
  percentage: number;
  affectedScenarios: string[];
  affectedDevices: string[];
  recentOccurrences: {
    executionId: string;
    scenarioName: string;
    deviceName: string;
    occurredAt: string;
  }[];
}

export interface ScenarioHistory {
  scenarioId: string;
  scenarioName: string;
  packageName?: string;
  categoryName?: string;
  totalExecutions: number;
  passedCount: number;
  failedCount: number;
  successRate: number;
  avgDuration: number;
  lastExecutedAt?: string;
  lastStatus?: string;
}

export interface DevicePerformanceMetric {
  deviceId: string;
  deviceName?: string;
  brand?: string;
  model?: string;
  totalTests: number;
  successRate: number;
  avgDuration: number;
  avgStepDuration: number;
}

export interface RecentExecution {
  executionId: string;
  testName?: string;
  requesterName?: string;
  status: string;
  deviceCount: number;
  scenarioCount: number;
  duration: number;
  startedAt: string;
  completedAt: string;
  passedScenarios: number;
  failedScenarios: number;
}

export interface PackageInfo {
  packageId: string;
  packageName: string;
  scenarioCount: number;
  lastExecutedAt?: string;
}