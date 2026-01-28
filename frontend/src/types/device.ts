// frontend/src/types/device.ts
// 디바이스, 세션 관련 타입

export interface DeviceStatus {
  connected: boolean;
  deviceId?: string;
  platformVersion?: string;
  appPackage?: string;
  sessionId?: string;
}

export interface ConnectionConfig {
  deviceId: string;
  platformVersion: string;
  appPackage: string;
  appActivity: string;
  automationName: string;
  noReset: boolean;
}

export interface ConnectionPreset {
  id: string;
  name: string;
  config: ConnectionConfig;
}

// ========== WiFi ADB ==========

// WiFi ADB 연결 설정
export interface WifiDeviceConfig {
  ip: string;
  port: number;
  deviceId: string;        // 연결 시 사용되는 ID (예: 192.168.1.100:5555)
  originalDeviceId?: string;  // 원래 USB device ID (예: emulator-5554)
  alias?: string;
  lastConnected?: string;
  autoReconnect: boolean;
}

// WiFi 연결 결과
export interface WifiConnectionResult {
  success: boolean;
  deviceId?: string;
  message: string;
}

// ========== Multi-Device (Phase 2) ==========
export type DeviceOS = 'Android' | 'iOS';
export type DeviceRole = 'editing' | 'testing';  // 디바이스 역할 (편집용/테스트용)

export interface DeviceInfo {
  id: string;
  name: string;
  model: string;
  os: DeviceOS;
  osVersion: string;
  status: 'connected' | 'offline' | 'unauthorized';
  sessionActive: boolean;
  mjpegPort?: number;
  connectionType?: 'usb' | 'wifi';  // 연결 타입
}

// 디바이스 상세 정보 (대시보드용)
export interface DeviceDetailedInfo extends DeviceInfo {
  // 하드웨어 정보
  brand: string;
  manufacturer: string;
  screenResolution: string;
  screenDensity: number;

  // 시스템 정보
  cpuModel: string;  // CPU 모델명 (예: Snapdragon SDM845)
  cpuAbi: string;    // CPU ABI (예: arm64-v8a)
  sdkVersion: number;
  buildNumber: string;

  // 실시간 상태
  batteryLevel: number;
  batteryStatus: 'charging' | 'discharging' | 'full' | 'not charging' | 'unknown';
  batteryTemperature: number;  // 섭씨 온도
  cpuTemperature: number;      // 섭씨 온도
  memoryTotal: number;  // MB
  memoryAvailable: number;  // MB
  storageTotal: number;  // GB
  storageAvailable: number;  // GB

  // 저장된 정보 (영구 저장)
  alias?: string;                // 사용자 지정 별칭
  role?: DeviceRole;             // 디바이스 역할 (편집용/테스트용)
  firstConnectedAt?: string;     // 최초 연결 시간
  lastConnectedAt?: string;      // 마지막 연결 시간
}

export interface SessionInfo {
  deviceId: string;
  sessionId: string;
  appiumPort: number;
  mjpegPort: number;
  createdAt: string;
  status: 'active' | 'idle' | 'error';
}

// 디바이스별 실행 상태 (대시보드 표시용)
export interface DeviceExecutionStatus {
  scenarioName: string;
  currentNodeId: string;
  status: 'running' | 'waiting' | 'success' | 'error';
  message: string;
  // 진행률
  currentStep: number;
  totalSteps: number;
}

// ========== Device Element (Preview용) ==========
export interface DeviceElement {
  resourceId?: string;
  text?: string;
  contentDesc?: string;
  className?: string;
  clickable?: boolean;
  enabled?: boolean;
  bounds?: {
    left: number;
    top: number;
    right: number;
    bottom: number;
    // 또는 x, y, width, height 형태로도 사용 가능
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  };
}

// ========== Connection Form ==========
export interface ConnectionFormData {
  deviceName: string;
  appPackage: string;
  appActivity: string;
}

// ========== QA 확장 타입 (디바이스 환경 정보) ==========

// 디바이스 환경 정보
export interface DeviceEnvironment {
  brand: string;
  model: string;
  manufacturer: string;
  androidVersion: string;
  sdkVersion: number;
  screenResolution: string;
  screenDensity: number;
  cpuAbi: string;
  totalMemory: number;
  totalStorage: number;
  batteryLevel: number;
  batteryStatus: string;
  batteryTemperature: number;
  availableMemory: number;
  availableStorage: number;
  networkType: 'wifi' | 'mobile' | 'ethernet' | 'none' | 'unknown';
  networkStrength?: number;
  wifiSsid?: string;
  ipAddress?: string;
}

// 앱 정보
export interface AppInfo {
  packageName: string;
  appName?: string;
  versionName?: string;
  versionCode?: number;
  targetSdk?: number;
  minSdk?: number;
  installedAt?: string;
  lastUpdatedAt?: string;
}

// 디바이스 로그
export interface DeviceLogs {
  logcat?: string;
  logcatPath?: string;
  capturedAt: string;
  captureStartTime: string;
  captureEndTime: string;
  logLevel: 'verbose' | 'debug' | 'info' | 'warn' | 'error';
  packageFilter?: string;
  crashLogs?: string;
  anrTraces?: string;
}
