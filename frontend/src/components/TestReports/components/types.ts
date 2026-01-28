// frontend/src/components/TestReports/components/types.ts
// TestReports 컴포넌트에서 사용하는 로컬 타입 정의

import {
  TestReport,
  TestReportListItem,
  ScenarioReportResult,
  DeviceScenarioResult,
  StepResult,
  SuiteExecutionResult,
  StepSuiteResult,
  ScenarioSuiteResult,
} from '../../../types';

// 통합 리포트 아이템 타입
export interface UnifiedReportItem {
  id: string;
  type: 'scenario' | 'suite';
  name: string;
  requesterName?: string;
  createdAt: string;
  status: 'completed' | 'partial' | 'failed' | 'stopped';
  scenarioCount: number;
  deviceCount: number;
  successRate: number;
  duration: number;
  originalId: string;
}

// 시나리오 중심으로 변환된 결과 타입
export interface ConvertedScenarioResult {
  scenarioId: string;
  scenarioName: string;
  deviceResults: ConvertedDeviceResult[];
  overallStatus: 'passed' | 'failed' | 'partial' | 'skipped';
  totalDuration: number;
}

export interface ConvertedDeviceResult {
  deviceId: string;
  deviceName: string;
  status: string;
  duration: number;
  error?: string;
  stepResults: StepSuiteResult[];
  screenshots: ScenarioSuiteResult['screenshots'];
  videoPath?: string;
  startedAt: string;
  environment?: DeviceEnvironment;
  appInfo?: AppInfo;
}

export interface DeviceEnvironment {
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

export interface AppInfo {
  packageName: string;
  appName?: string;
  versionName?: string;
  versionCode?: number;
  targetSdk?: number;
}

// 단계 그룹 타입
export interface StepGroup {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  steps: StepResult[];
  status: string;
  startTime: string;
  endTime?: string;
  duration?: number;
  error?: string;
  hasWaiting: boolean;
}

// Re-export for convenience
export type {
  TestReport,
  TestReportListItem,
  ScenarioReportResult,
  DeviceScenarioResult,
  StepResult,
  SuiteExecutionResult,
  StepSuiteResult,
  ScenarioSuiteResult,
};
