// backend/src/types/index.ts

// 모든 타입을 한 곳에서 export
export * from './device';
export * from './action';
export * from './scenario';
export * from './execution';
export * from './image';
export * from './package';
export * from './testReport';
export * from './suite';

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

// 디바이스 역할 타입
export type DeviceRole = 'editing' | 'testing';

// 저장된 디바이스 정보
export interface SavedDevice {
  id: string;                    // ADB device ID (고유키)
  alias?: string;                // 사용자 지정 별칭
  role?: DeviceRole;             // 디바이스 역할 (편집용/테스트용, 기본: testing)
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