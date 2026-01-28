// backend/src/services/execution/types.ts
// 테스트 실행 관련 타입 정의

import type {
  TestExecutionRequest,
  ScenarioQueueItem,
  ScreenshotInfo,
  VideoInfo,
} from '../../types';
import type { DeviceEnvironment, AppInfo } from '../../types/reportEnhanced';

/**
 * 디바이스별 실행 진행 상태
 */
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

/**
 * 개별 실행 컨텍스트
 * 각 테스트 실행마다 독립된 상태를 유지합니다.
 */
export interface ExecutionState {
  executionId: string;
  reportId: string;  // 리포트 ID (사전 생성)
  request: TestExecutionRequest;
  stopRequested: boolean;
  scenarioQueue: ScenarioQueueItem[];
  deviceProgress: Map<string, DeviceProgress>;
  deviceNames: Map<string, string>;
  startedAt: Date;
  deviceIds: string[];
  scenarioInterval: number;
  deviceScreenshots: Map<string, Map<string, ScreenshotInfo[]>>;  // deviceId -> scenarioKey -> screenshots
  deviceVideos: Map<string, Map<string, VideoInfo>>;  // deviceId -> scenarioKey -> VideoInfo (시나리오별 비디오)
  // QA 확장 필드
  deviceEnvironments: Map<string, DeviceEnvironment>;  // deviceId -> DeviceEnvironment
  deviceAppInfos: Map<string, Map<string, AppInfo>>;  // deviceId -> packageName -> AppInfo
}

/**
 * 실행 옵션 (다중 사용자 지원)
 */
export interface ExecutionOptions {
  executionId?: string;
}

/**
 * 큐 빌드 결과
 */
export interface QueueBuildResult {
  queue: ScenarioQueueItem[];
  skippedIds: string[];
}
