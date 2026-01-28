// frontend/src/types/execution.ts
// 실행, 성능, 실패 분석 관련 타입

import type { DeviceEnvironment, AppInfo, DeviceLogs } from './device';

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

// ========== 병렬 실행 ==========
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

// ========== 실패 분석 ==========

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

// ========== 성능 메트릭 ==========

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

// OCR 매칭 메트릭
export interface OcrMatchMetrics {
  searchText: string;
  matchType: 'exact' | 'contains' | 'regex';
  matched: boolean;
  confidence: number;
  foundText?: string;
  matchLocation?: { x: number; y: number; width: number; height: number };
  ocrTime: number;
  apiProvider?: string;
}

// 단계 성능 메트릭
export interface StepPerformance {
  waitTime?: number;
  actionTime?: number;
  totalTime: number;
  imageMatch?: ImageMatchMetrics;
  ocrMatch?: OcrMatchMetrics;
  cpuUsage?: number;
  memoryUsage?: number;
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

// ========== 디바이스별 시나리오 실행 결과 (리포트용) ==========

// Device 상태에 DeviceReportStatus 타입 export 추가
export type DeviceReportStatus = 'completed' | 'failed' | 'skipped' | 'running' | 'pending';

export interface ScreenshotInfo {
  nodeId: string;
  timestamp: string;
  path: string;  // 상대 경로
  type: 'step' | 'final' | 'highlight' | 'failed';  // 단계별/최종/이미지인식/실패
  templateId?: string;  // 이미지 인식 시 사용된 템플릿 ID
  confidence?: number;  // 매칭 신뢰도 (0-1)
}

export interface VideoInfo {
  path: string;  // 상대 경로
  duration: number;  // 녹화 시간 (ms)
  size: number;  // 파일 크기 (bytes)
  startedAt: string;  // 녹화 시작 시간 (ISO 문자열)
}

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
