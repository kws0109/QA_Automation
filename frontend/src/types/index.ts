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
export type ExecutionStatus = 'running' | 'success' | 'error' | 'skipped' | 'stopped';

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
  packageId?: string;  // 소속 패키지 ID
  width: number;
  height: number;
  createdAt: string;
}

export interface ImageMatchResult {
  found: boolean;
  x: number;
  y: number;
  confidence: number;
}

// ========== Multi-Device (Phase 2) ==========
export type DeviceOS = 'Android' | 'iOS';

export interface DeviceInfo {
  id: string;
  name: string;
  model: string;
  os: DeviceOS;
  osVersion: string;
  status: 'connected' | 'offline' | 'unauthorized';
  sessionActive: boolean;
  mjpegPort?: number;
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
}

// 디바이스별 실행 결과 (통합 리포트용)
export interface DeviceReportResult {
  deviceId: string;
  deviceName: string;
  success: boolean;
  duration: number;
  error?: string;
  steps: StepResult[];
  screenshots: ScreenshotInfo[];
  video?: VideoInfo;
}

// 통합 리포트 통계
export interface ParallelReportStats {
  totalDevices: number;
  successDevices: number;
  failedDevices: number;
  totalSteps: number;
  passedSteps: number;
  failedSteps: number;
  totalDuration: number;
  avgDuration: number;
}

// 병렬 실행 통합 리포트
export interface ParallelReport {
  id: string;
  scenarioId: string;
  scenarioName: string;
  deviceResults: DeviceReportResult[];
  stats: ParallelReportStats;
  startedAt: string;
  completedAt: string;
  createdAt: string;
}

// 통합 리포트 목록 아이템
export interface ParallelReportListItem {
  id: string;
  scenarioId: string;
  scenarioName: string;
  stats: ParallelReportStats;
  createdAt: string;
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