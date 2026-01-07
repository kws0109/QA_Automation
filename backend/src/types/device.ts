// 디바이스 관련 타입 정의

export interface DeviceConfig {
  platformName: string;
  platformVersion: string;
  deviceName: string;
  udid: string;
  automationName: string;
  appPackage?: string;
  appActivity?: string;
  noReset?: boolean;
}

export interface DeviceStatus {
  connected: boolean;
  deviceInfo: DeviceInfo | null;
}

export interface DeviceInfo {
  platformName: string;
  platformVersion: string;
  deviceName: string;
  udid: string;
}

export interface ConnectResult {
  success: boolean;
  message: string;
  deviceInfo?: DeviceInfo;
}