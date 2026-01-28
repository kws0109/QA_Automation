// shared/types/device.ts
// Frontend/Backend 공유 디바이스 타입

export type DeviceOS = 'Android' | 'iOS';
export type DeviceRole = 'editing' | 'testing';

// 디바이스 정보 (공유)
export interface DeviceInfo {
  id: string;
  name: string;
  model: string;
  os: DeviceOS;
  osVersion: string;
  status: 'connected' | 'offline' | 'unauthorized';
  sessionActive: boolean;
  mjpegPort?: number;
  connectionType?: 'usb' | 'wifi';  // Frontend 전용, optional로 통합
}

// 세션 정보 (공유) - createdAt을 string으로 통일
export interface SessionInfo {
  deviceId: string;
  sessionId: string;
  appiumPort: number;
  mjpegPort: number;
  createdAt: string;  // ISO 문자열로 통일
  status: 'active' | 'idle' | 'error';
}

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
