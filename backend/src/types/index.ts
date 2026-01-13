// backend/src/types/index.ts

// 모든 타입을 한 곳에서 export
export * from './device';
export * from './action';
export * from './scenario';
export * from './execution';
export * from './image';
export * from './package';
export * from './testReport';

// 같은 파일에서 사용하기 위해 import
import type { StepResult, ScreenshotInfo, VideoInfo } from './execution';

// ActionType에 이미지 액션 추가
export type ImageActionType = 
  | 'tapImage'
  | 'waitUntilImage'
  | 'waitUntilImageGone';

// 디바이스 관련 타입
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

export interface SessionInfo {
  deviceId: string;
  sessionId: string;
  appiumPort: number;
  mjpegPort: number;
  createdAt: Date;
  status: 'active' | 'idle' | 'error';
}

export interface ParallelExecutionResult {
  scenarioId: string;
  results: {
    deviceId: string;
    success: boolean;
    duration: number;
    error?: string;
    steps: StepResult[];  // 이제 정상 참조
  }[];
  totalDuration: number;
  startedAt: Date;
  completedAt: Date;
}

// ========== 병렬 실행 통합 리포트 ==========
// (ScreenshotInfo, VideoInfo는 execution.ts에서 re-export됨)

// 디바이스 리포트 상태 (통합 분할 실행용)
export type DeviceReportStatus = 'completed' | 'failed' | 'skipped';

// 디바이스별 실행 결과 (통합 리포트용)
export interface DeviceReportResult {
  deviceId: string;
  deviceName: string;
  success: boolean;
  status: DeviceReportStatus;  // 'completed' | 'failed' | 'skipped'
  duration: number;
  error?: string;
  steps: StepResult[];
  screenshots: ScreenshotInfo[];
  video?: VideoInfo;  // 녹화된 비디오
  skippedReason?: string;  // 건너뛴 이유 (forceComplete, 세션 없음 등)
}

// 통합 리포트 통계
export interface ParallelReportStats {
  totalDevices: number;
  successDevices: number;
  failedDevices: number;
  skippedDevices: number;  // 건너뛴 디바이스 수 (forceComplete 등)
  totalSteps: number;
  passedSteps: number;
  failedSteps: number;
  totalDuration: number;
  avgDuration: number;  // skipped 제외한 평균
}

// 실행 정보 (통합 분할 실행용)
export interface ExecutionInfo {
  testName?: string;           // 테스트 이름
  requesterName?: string;      // 요청자 이름
  splitExecution?: boolean;    // 분할 실행 여부
  forceCompleted?: boolean;    // 부분 완료 여부
  originalDeviceCount?: number; // 원래 요청한 디바이스 수
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
  executionInfo?: ExecutionInfo;  // 실행 정보 (통합 분할 실행용)
}

// 통합 리포트 목록 아이템
export interface ParallelReportListItem {
  id: string;
  scenarioId: string;
  scenarioName: string;
  stats: ParallelReportStats;
  createdAt: string;
}

// ========== R2 공유 ==========

// R2 공유 결과
export interface R2ShareResult {
  url: string;
  uploadedAt: string;
}

// ========== 스케줄링 ==========

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
  reportId?: string;  // ParallelReport ID 연결
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

// ========== 디바이스 저장 ==========

// 저장된 디바이스 정보
export interface SavedDevice {
  id: string;                    // ADB device ID (고유키)
  alias?: string;                // 사용자 지정 별칭
  brand: string;
  manufacturer: string;
  model: string;
  androidVersion: string;
  sdkVersion: number;
  screenResolution: string;
  cpuAbi: string;
  firstConnectedAt: string;      // 최초 연결 시간
  lastConnectedAt: string;       // 마지막 연결 시간
}