// frontend/src/types/common.ts
// 공통 타입 (API, 패키지, 카테고리, 이미지 템플릿, 대시보드 등)

// ========== API Response ==========
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// ========== Package 관련 ==========
export interface Package {
  id: string;
  name: string;           // 표시 이름 (예: "게임 A")
  packageName: string;    // Android 패키지명 (예: "com.company.game")
  description?: string;
  scenarioCount?: number;
  createdAt: string;
  updatedAt: string;
}

// ========== Category 관련 (중분류) ==========
export interface Category {
  id: string;
  packageId: string;      // 소속 패키지 ID (대분류)
  name: string;           // 한글명 (예: "로그인", "결제")
  description?: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

// ========== Image Template ==========
export interface ImageTemplate {
  id: string;
  name: string;
  filename: string;
  packageId?: string;       // 소속 패키지 ID
  width: number;
  height: number;
  createdAt: string;
  // 캡처 좌표 정보 (ROI 자동 계산용)
  captureX?: number;        // 원본 스크린샷에서의 X 좌표
  captureY?: number;        // 원본 스크린샷에서의 Y 좌표
  sourceWidth?: number;     // 원본 스크린샷 너비
  sourceHeight?: number;    // 원본 스크린샷 높이
}

export interface ImageMatchResult {
  found: boolean;
  x: number;
  y: number;
  confidence: number;
}

// ========== Dashboard 메트릭 타입 ==========

export interface DashboardOverview {
  totalExecutions: number;
  totalScenarios: number;
  overallSuccessRate: number;
  avgExecutionTime: number;
  uniqueDevices: number;
  uniqueScenarios: number;
  recentFailures: number;
  todayExecutions: number;
}

export interface SuccessRateTrend {
  date: string;
  totalExecutions: number;
  totalScenarios: number;
  passedScenarios: number;
  failedScenarios: number;
  successRate: number;
}

export interface FailurePattern {
  failureType: string;
  failureCategory: string;
  count: number;
  percentage: number;
  affectedScenarios: string[];
  affectedDevices: string[];
  recentOccurrences: {
    executionId: string;
    scenarioName: string;
    deviceName: string;
    occurredAt: string;
  }[];
}

export interface ScenarioHistory {
  scenarioId: string;
  scenarioName: string;
  packageName?: string;
  categoryName?: string;
  totalExecutions: number;
  passedCount: number;
  failedCount: number;
  successRate: number;
  avgDuration: number;
  lastExecutedAt?: string;
  lastStatus?: string;
}

export interface SuiteHistory {
  suiteId: string;
  suiteName: string;
  totalExecutions: number;
  passedCount: number;
  failedCount: number;
  successRate: number;
  avgDuration: number;
  avgDeviceCount: number;
  avgScenarioCount: number;
  lastExecutedAt?: string;
  lastStatus?: string;
}

export interface DevicePerformanceMetric {
  deviceId: string;
  deviceName?: string;
  brand?: string;
  model?: string;
  totalTests: number;
  successRate: number;
  avgDuration: number;
  avgStepDuration: number;
}

export interface ImageMatchPerformance {
  totalMatches: number;
  avgMatchTime: number;
  avgConfidence: number;
  successRate: number;
  byTemplate: {
    templateId: string;
    count: number;
    avgConfidence: number;
    avgMatchTime: number;
  }[];
}

export interface OcrPerformance {
  totalMatches: number;
  avgOcrTime: number;
  avgConfidence: number;
  successRate: number;
  byMatchType: {
    matchType: string;
    count: number;
    avgConfidence: number;
    avgOcrTime: number;
  }[];
  byApiProvider: {
    apiProvider: string;
    count: number;
    avgOcrTime: number;
  }[];
}

export interface RecentExecution {
  executionId: string;
  testName?: string;
  requesterName?: string;
  status: string;
  deviceCount: number;
  scenarioCount: number;
  duration: number;
  startedAt: string;
  completedAt: string;
  passedScenarios: number;
  failedScenarios: number;
}

export interface PackageInfo {
  packageId: string;
  packageName: string;
  scenarioCount: number;
  lastExecutedAt?: string;
}
