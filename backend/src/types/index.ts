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