// backend/src/types/testReport.ts
// 통합 테스트 리포트 타입 정의 (다중 시나리오 지원)

import { StepResult, ScreenshotInfo, VideoInfo } from './execution';
import {
  DeviceEnvironment,
  AppInfo,
  DeviceLogs,
  FlakyAnalysis,
  TestCoverage,
  PerformanceComparison,
} from './reportEnhanced';

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

  // === QA 확장 필드 ===
  // 디바이스 환경 정보 (테스트 시작 시점)
  environment?: DeviceEnvironment;

  // 앱 정보
  appInfo?: AppInfo;

  // 디바이스 로그
  logs?: DeviceLogs;

  // 성능 요약
  performanceSummary?: {
    avgStepDuration: number;    // 평균 단계 소요 시간 (ms)
    maxStepDuration: number;    // 최대 단계 소요 시간
    minStepDuration: number;    // 최소 단계 소요 시간
    totalWaitTime: number;      // 총 대기 시간 (waitUntil* 계열)
    totalActionTime: number;    // 총 액션 실행 시간
    imageMatchAvgTime?: number; // 이미지 매칭 평균 시간
    imageMatchCount?: number;   // 이미지 매칭 횟수
    // 디바이스/백엔드 매칭 통계
    deviceMatchCount?: number;  // 디바이스 OpenCV 매칭 횟수
    backendMatchCount?: number; // 백엔드 매칭 횟수
    deviceMatchAvgTime?: number; // 디바이스 매칭 평균 시간
    backendMatchAvgTime?: number; // 백엔드 매칭 평균 시간
  };
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

  // === QA 확장 필드 ===
  // Flaky 테스트 분석 (각 디바이스-시나리오 조합별)
  flakyAnalysis?: FlakyAnalysis[];

  // 테스트 커버리지
  coverage?: TestCoverage;

  // 이전 실행과의 성능 비교
  performanceComparison?: PerformanceComparison;

  // 전체 실패 요약
  failureSummary?: {
    totalFailures: number;
    failuresByType: {
      type: string;
      count: number;
      percentage: number;
    }[];
    commonPatterns?: string[];  // 자주 발생하는 실패 패턴
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

// ========== API 응답 ==========

export interface TestReportListResponse {
  success: boolean;
  reports: TestReportListItem[];
}

export interface TestReportDetailResponse {
  success: boolean;
  report: TestReport;
}
