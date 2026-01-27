// backend/src/types/suite.ts
// Test Suite 관련 타입 정의

import { StepPerformance } from './reportEnhanced';

/**
 * Test Suite - 시나리오와 디바이스를 묶어서 한 번에 실행
 */
export interface TestSuite {
  id: string;
  name: string;
  description?: string;
  scenarioIds: string[];  // 실행 순서대로 정렬
  deviceIds: string[];    // 실행할 디바이스 목록
  createdAt: string;
  updatedAt: string;
}

/**
 * Suite 생성/수정 요청
 */
export interface TestSuiteInput {
  name: string;
  description?: string;
  scenarioIds: string[];
  deviceIds: string[];
}

/**
 * Suite 실행 결과 - 전체
 */
export interface SuiteExecutionResult {
  id: string;
  suiteId: string;
  suiteName: string;
  startedAt: string;
  completedAt: string;
  totalDuration: number;
  deviceResults: DeviceSuiteResult[];
  stats: SuiteExecutionStats;
}

/**
 * Suite 실행 통계
 */
export interface SuiteExecutionStats {
  totalScenarios: number;
  totalDevices: number;
  totalExecutions: number;  // scenarios × devices
  passed: number;
  failed: number;
  skipped: number;
}

/**
 * 디바이스 환경 정보 (Suite용)
 */
export interface DeviceSuiteEnvironment {
  brand: string;
  model: string;
  androidVersion: string;
  sdkVersion: number;
  screenResolution: string;
  batteryLevel: number;
  batteryStatus: string;
  availableMemory: number;
  totalMemory: number;
  networkType: string;
}

/**
 * 앱 정보 (Suite용)
 */
export interface AppSuiteInfo {
  packageName: string;
  appName?: string;
  versionName?: string;
  versionCode?: number;
  targetSdk?: number;
}

/**
 * 디바이스별 Suite 실행 결과
 */
export interface DeviceSuiteResult {
  deviceId: string;
  deviceName: string;
  startedAt: string;
  completedAt: string;
  duration: number;
  scenarioResults: ScenarioSuiteResult[];
  stats: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  /** 디바이스 환경 정보 */
  environment?: DeviceSuiteEnvironment;
  /** 앱 정보 */
  appInfo?: AppSuiteInfo;
}

/**
 * 시나리오별 실행 결과 (Suite 컨텍스트)
 */
export interface ScenarioSuiteResult {
  scenarioId: string;
  scenarioName: string;
  status: 'passed' | 'failed' | 'skipped';
  startedAt: string;
  completedAt: string;
  duration: number;
  error?: string;
  stepResults: StepSuiteResult[];
  videoPath?: string;
  screenshots: ScreenshotInfo[];
}

/**
 * 스텝별 실행 결과
 */
export interface StepSuiteResult {
  nodeId: string;
  nodeName: string;
  actionType: string;
  status: 'passed' | 'failed' | 'skipped' | 'waiting';
  duration: number;
  error?: string;
  timestamp: string;
  /** 성능 메트릭 (이미지 매칭, OCR 등) */
  performance?: StepPerformance;
}

/**
 * 스크린샷 정보
 */
export interface ScreenshotInfo {
  nodeId: string;
  path: string;
  type: 'error' | 'success' | 'highlight' | 'failed' | 'step' | 'final';
  timestamp: string;
  confidence?: number;
  templateId?: string;
}

/**
 * Suite 실행 진행 상태 (Socket.IO 이벤트용)
 */
export interface SuiteProgress {
  suiteId: string;
  suiteName: string;
  currentDevice: string;
  currentScenario: string;
  deviceProgress: {
    current: number;
    total: number;
  };
  scenarioProgress: {
    current: number;
    total: number;
  };
  overallProgress: number;  // 0-100
  repeatProgress?: {        // 반복 진행 상태 (repeatCount > 1일 때만)
    current: number;
    total: number;
  };
}

/**
 * Suite Socket.IO 이벤트 타입
 */
export interface SuiteSocketEvents {
  'suite:start': {
    suiteId: string;
    suiteName: string;
    deviceIds: string[];
    scenarioIds: string[];
  };
  'suite:progress': SuiteProgress;
  'suite:device:start': {
    suiteId: string;
    deviceId: string;
    deviceName: string;
  };
  'suite:device:complete': {
    suiteId: string;
    deviceId: string;
    result: DeviceSuiteResult;
  };
  'suite:scenario:start': {
    suiteId: string;
    deviceId: string;
    scenarioId: string;
    scenarioName: string;
  };
  'suite:scenario:complete': {
    suiteId: string;
    deviceId: string;
    scenarioId: string;
    result: ScenarioSuiteResult;
  };
  'suite:complete': {
    suiteId: string;
    result: SuiteExecutionResult;
  };
  'suite:error': {
    suiteId: string;
    error: string;
  };
}
