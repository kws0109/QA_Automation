// backend/src/types/index.ts

// 모든 타입을 한 곳에서 export
export * from './device';
export * from './action';
export * from './scenario';
export * from './execution';
export * from './image';
export * from './package';

// 같은 파일에서 사용하기 위해 import
import type { StepResult } from './execution';

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

// 디바이스별 실행 결과 (통합 리포트용)
export interface DeviceReportResult {
  deviceId: string;
  deviceName: string;
  success: boolean;
  duration: number;
  error?: string;
  steps: StepResult[];
  screenshots: ScreenshotInfo[];
  video?: VideoInfo;  // 녹화된 비디오
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