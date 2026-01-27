// backend/src/types/reportEnhanced.ts
// QA 리포트 확장 타입 정의

/**
 * 디바이스 환경 정보
 * 테스트 실행 시점의 디바이스 상태 기록
 */
export interface DeviceEnvironment {
  // 기본 정보
  brand: string;
  model: string;
  manufacturer: string;
  androidVersion: string;
  sdkVersion: number;

  // 하드웨어
  screenResolution: string;
  screenDensity: number;
  cpuAbi: string;
  totalMemory: number;      // MB
  totalStorage: number;     // GB

  // 상태 (테스트 시작 시점)
  batteryLevel: number;     // 0-100
  batteryStatus: string;    // charging, discharging, full, not_charging
  batteryTemperature: number; // 섭씨
  availableMemory: number;  // MB
  availableStorage: number; // GB

  // 네트워크
  networkType: 'wifi' | 'mobile' | 'ethernet' | 'none' | 'unknown';
  networkStrength?: number; // 0-4 (signal bars)
  wifiSsid?: string;
  ipAddress?: string;
}

/**
 * 앱 정보
 */
export interface AppInfo {
  packageName: string;
  appName?: string;
  versionName?: string;     // 예: "1.2.3"
  versionCode?: number;     // 예: 123
  targetSdk?: number;
  minSdk?: number;
  installedAt?: string;     // ISO 날짜
  lastUpdatedAt?: string;
  signatureHash?: string;   // APK 서명 해시 (무결성 확인용)
}

/**
 * 실패 유형 분류
 */
export type FailureType =
  | 'timeout'              // 대기 시간 초과
  | 'element_not_found'    // 요소를 찾을 수 없음 (selector)
  | 'image_not_matched'    // 이미지 매칭 실패
  | 'text_not_found'       // 텍스트를 찾을 수 없음
  | 'assertion_failed'     // 검증 실패
  | 'app_crash'            // 앱 크래시 (ANR 포함)
  | 'app_not_running'      // 앱이 실행 중이 아님
  | 'session_error'        // Appium 세션 오류
  | 'connection_error'     // 디바이스 연결 오류
  | 'network_error'        // 네트워크 오류
  | 'permission_denied'    // 권한 거부
  | 'resource_exhausted'   // 리소스 부족 (메모리, 스토리지)
  | 'unknown';             // 분류 불가

/**
 * 실패 분석 데이터
 */
export interface FailureAnalysis {
  // 분류
  failureType: FailureType;
  errorMessage: string;
  errorCode?: string;

  // 스택 트레이스
  stackTrace?: string;

  // 컨텍스트 (실패 전후 상황)
  context: {
    previousAction?: string;     // 직전 수행 액션
    previousActionResult?: string; // 직전 액션 결과
    attemptedAction: string;     // 시도한 액션
    actionParams?: Record<string, unknown>; // 액션 파라미터
    expectedState?: string;      // 기대 상태
    actualState?: string;        // 실제 상태
  };

  // 재시도 정보
  retryAttempts?: number;
  totalRetryTime?: number; // ms

  // 관련 리소스
  failureScreenshot?: string;  // 실패 시점 스크린샷 경로
  failureVideo?: {             // 실패 전후 비디오 클립
    path: string;
    startOffset: number;       // 실패 전 N초부터
    endOffset: number;         // 실패 후 N초까지
  };

  // 앱 상태
  appState?: 'foreground' | 'background' | 'not_running' | 'crashed';
  currentActivity?: string;    // 현재 Activity

  // 디바이스 로그 스니펫
  logcatSnippet?: string;      // 실패 전후 logcat
}

/**
 * 이미지 매칭 성능 메트릭
 */
export interface ImageMatchMetrics {
  templateId: string;
  templateName?: string;
  templateSize?: { width: number; height: number };

  // 매칭 결과
  matched: boolean;
  confidence: number;          // 0-1 (매칭 신뢰도)
  threshold: number;           // 설정된 임계값

  // 위치 정보
  matchLocation?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  // 성능
  matchTime: number;           // ms (매칭 소요 시간)
  screenshotCaptureTime?: number; // ms (스크린샷 캡처 시간)
  preprocessTime?: number;     // ms (전처리 시간)

  // ROI 사용 여부
  roiUsed: boolean;
  roiRegion?: { x: number; y: number; width: number; height: number };
}

/**
 * OCR 매칭 메트릭
 */
export interface OcrMatchMetrics {
  // 검색 텍스트
  searchText: string;
  matchType: 'exact' | 'contains' | 'regex';

  // 매칭 결과
  matched: boolean;
  confidence: number;          // 0-1 (OCR 신뢰도)
  foundText?: string;          // 실제 인식된 텍스트

  // 위치 정보
  matchLocation?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  // 성능
  ocrTime: number;             // ms (OCR 처리 시간)
  screenshotCaptureTime?: number; // ms (스크린샷 캡처 시간)

  // OCR 상세
  totalTextsFound?: number;    // 화면에서 인식된 총 텍스트 수
  apiProvider?: string;        // 사용된 OCR API (google, tesseract 등)
}

/**
 * 단계별 성능 메트릭
 */
export interface StepPerformance {
  // 시간 분석
  waitTime?: number;           // 대기 시간 (ms) - waitUntil* 계열
  actionTime?: number;         // 액션 실행 시간 (ms)
  totalTime: number;           // 총 소요 시간 (ms)

  // 이미지 매칭 (해당 시)
  imageMatch?: ImageMatchMetrics;

  // OCR 매칭 (해당 시)
  ocrMatch?: OcrMatchMetrics;

  // 리소스 사용량 (해당 단계 실행 중)
  cpuUsage?: number;           // 0-100%
  memoryUsage?: number;        // MB

  // 네트워크 (해당 시)
  networkLatency?: number;     // ms
  dataTransferred?: number;    // bytes
}

/**
 * 디바이스 로그
 */
export interface DeviceLogs {
  // Logcat
  logcat?: string;             // 전체 logcat (필터링됨)
  logcatPath?: string;         // 파일로 저장된 경우 경로

  // 캡처 정보
  capturedAt: string;
  captureStartTime: string;
  captureEndTime: string;

  // 필터 설정
  logLevel: 'verbose' | 'debug' | 'info' | 'warn' | 'error';
  packageFilter?: string;      // 특정 패키지만 필터링
  tagFilters?: string[];       // 특정 태그만 필터링

  // 크래시/ANR 정보
  crashLogs?: string;
  anrTraces?: string;
}

/**
 * Flaky 테스트 분석
 */
export interface FlakyAnalysis {
  // 식별 정보
  scenarioId: string;
  deviceId: string;

  // 최근 실행 이력
  recentRuns: {
    reportId: string;
    success: boolean;
    executedAt: string;
    duration: number;
  }[];

  // 분석 결과
  totalRuns: number;
  successCount: number;
  failureCount: number;
  successRate: number;         // 0-100%

  // Flaky 판정
  isFlaky: boolean;
  flakyScore: number;          // 0-100 (높을수록 불안정)
  flakyReason?: string;        // flaky로 판정된 이유

  // 패턴 분석
  failurePatterns?: {
    type: FailureType;
    count: number;
    percentage: number;
  }[];

  // 환경 상관관계
  environmentCorrelation?: {
    factor: string;            // 예: 'batteryLevel', 'networkType'
    correlation: number;       // -1 ~ 1
    description: string;
  }[];
}

/**
 * 테스트 커버리지
 */
export interface TestCoverage {
  // 시나리오 레벨
  totalScenarios: number;
  executedScenarios: number;
  scenarioCoverage: number;    // 0-100%

  // 노드/스텝 레벨
  totalNodes: number;
  executedNodes: number;
  nodeCoverage: number;        // 0-100%

  // 액션 타입별
  actionTypeCoverage: {
    actionType: string;
    totalCount: number;
    executedCount: number;
    coverage: number;
  }[];

  // 화면/Activity 커버리지 (앱 기준)
  screensCovered?: string[];
}

/**
 * 성능 히스토리 비교
 */
export interface PerformanceComparison {
  // 비교 대상
  currentReportId: string;
  comparedReportId: string;
  comparedAt: string;

  // 전체 비교
  durationChange: {
    current: number;
    previous: number;
    changePercent: number;     // 양수면 느려짐, 음수면 빨라짐
  };

  // 단계별 비교
  stepComparisons: {
    nodeId: string;
    nodeName: string;
    currentDuration: number;
    previousDuration: number;
    changePercent: number;
  }[];

  // 주요 변화 감지
  significantChanges: {
    nodeId: string;
    nodeName: string;
    changeType: 'slower' | 'faster' | 'new_failure' | 'fixed';
    description: string;
  }[];
}
