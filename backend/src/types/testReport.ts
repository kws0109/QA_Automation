// backend/src/types/testReport.ts
// 통합 테스트 리포트 타입 정의 (다중 시나리오 지원)

import { StepResult, ScreenshotInfo, VideoInfo } from './execution';

// ========== 디바이스 결과 ==========

// 디바이스 실행 상태
export type DeviceResultStatus = 'completed' | 'failed' | 'skipped';

// 디바이스별 시나리오 실행 결과
export interface DeviceScenarioResult {
  deviceId: string;
  deviceName: string;
  success: boolean;
  status: DeviceResultStatus;
  duration: number;
  error?: string;
  steps: StepResult[];
  screenshots: ScreenshotInfo[];
  video?: VideoInfo;
  skippedReason?: string;
}

// ========== 시나리오 결과 ==========

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

// ========== 통합 리포트 ==========

// 실행 정보
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

// ========== API 응답 ==========

export interface TestReportListResponse {
  success: boolean;
  reports: TestReportListItem[];
}

export interface TestReportDetailResponse {
  success: boolean;
  report: TestReport;
}
