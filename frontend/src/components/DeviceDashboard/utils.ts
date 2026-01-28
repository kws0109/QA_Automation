// frontend/src/components/DeviceDashboard/utils.ts

import type { DeviceDetailedInfo } from '../../types';

/**
 * 디바이스 표시명 (alias 우선)
 */
export function getDeviceDisplayName(device: DeviceDetailedInfo): string {
  return device.alias || `${device.brand} ${device.model}`;
}

/**
 * 마지막 연결 시간 포맷
 */
export function formatLastConnected(dateStr?: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * 배터리 아이콘
 */
export function getBatteryIcon(level: number, status: string): string {
  if (status === 'charging') return '⚡';
  if (level >= 80) return '🔋';
  if (level >= 50) return '🔋';
  if (level >= 20) return '🪫';
  return '🪫';
}

/**
 * 메모리 사용률 계산
 */
export function getMemoryUsagePercent(total: number, available: number): number {
  if (total === 0) return 0;
  return Math.round(((total - available) / total) * 100);
}

/**
 * 스토리지 사용률 계산
 */
export function getStorageUsagePercent(total: number, available: number): number {
  if (total === 0) return 0;
  return Math.round(((total - available) / total) * 100);
}

/**
 * WiFi 디바이스 여부 확인 (IP:PORT 형식)
 */
export function isWifiDevice(deviceId: string): boolean {
  return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d+$/.test(deviceId);
}
