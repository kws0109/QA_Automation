// frontend/src/components/DeviceDashboard/components/types.ts

import type { DeviceDetailedInfo, SessionInfo, DeviceExecutionStatus, WifiDeviceConfig } from '../../../types';

/**
 * 스크린샷 데이터 타입
 */
export interface ScreenshotData {
  image: string;
  timestamp: number;
}

/**
 * 필터 옵션 타입
 */
export interface FilterOptions {
  brands: string[];
  osVersions: string[];
}

/**
 * 디바이스 필터 상태
 */
export interface DeviceFilterState {
  searchText: string;
  filterStatus: string;
  filterBrand: string;
  filterOS: string;
}

/**
 * WiFi ADB 상태
 */
export interface WifiAdbState {
  wifiPanelOpen: boolean;
  wifiConfigs: WifiDeviceConfig[];
  wifiConnectedIds: string[];
  wifiLoading: boolean;
  wifiConnecting: string | null;
  newWifiIp: string;
  newWifiPort: string;
  selectedUsbDevice: string;
  switchingToWifi: boolean;
}

/**
 * WiFi ADB 핸들러
 */
export interface WifiAdbHandlers {
  onPanelToggle: () => void;
  onConnect: (ip: string, port: number) => void;
  onDisconnect: (deviceId: string) => void;
  onDelete: (ip: string, port: number) => void;
  onNewConnect: () => void;
  onSwitchToWifi: () => void;
  onReconnectAll: () => void;
  onAutoReconnectToggle: (ip: string, port: number, autoReconnect: boolean) => void;
  setNewWifiIp: (value: string) => void;
  setNewWifiPort: (value: string) => void;
  setSelectedUsbDevice: (value: string) => void;
}

/**
 * 디바이스 카드 Props
 */
export interface DeviceCardProps {
  device: DeviceDetailedInfo;
  hasSession: boolean;
  executionStatus?: DeviceExecutionStatus;
  isPreviewActive: boolean;
  maxPreviewsReached: boolean;
  creatingSession: boolean;
  onCreateSession: () => void;
  onDestroySession: () => void;
  onTogglePreview: () => void;
  onToggleRole: () => void;
  onDeleteDevice: () => void;
  onSaveAlias: (alias: string) => void;
  updatingRole: boolean;
}

/**
 * 필터 바 Props
 */
export interface FilterBarProps {
  searchText: string;
  onSearchChange: (value: string) => void;
  filterStatus: string;
  onFilterStatusChange: (value: string) => void;
  filterBrand: string;
  onFilterBrandChange: (value: string) => void;
  filterOS: string;
  onFilterOSChange: (value: string) => void;
  filterOptions: FilterOptions;
  onReset: () => void;
  showResetButton: boolean;
  filteredCount: number;
  totalCount: number;
}

/**
 * WiFi 패널 Props
 */
export interface WifiPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  loading: boolean;
  configs: WifiDeviceConfig[];
  connectedIds: string[];
  connecting: string | null;
  usbDevices: DeviceDetailedInfo[];
  newWifiIp: string;
  onNewWifiIpChange: (value: string) => void;
  newWifiPort: string;
  onNewWifiPortChange: (value: string) => void;
  selectedUsbDevice: string;
  onSelectedUsbDeviceChange: (value: string) => void;
  switchingToWifi: boolean;
  onConnect: (ip: string, port: number) => void;
  onDisconnect: (deviceId: string) => void;
  onDelete: (ip: string, port: number) => void;
  onNewConnect: () => void;
  onSwitchToWifi: () => void;
  onReconnectAll: () => void;
  onAutoReconnectToggle: (ip: string, port: number, autoReconnect: boolean) => void;
}

/**
 * 프리뷰 패널 Props
 */
export interface PreviewPanelProps {
  deviceIds: string[];
  devices: DeviceDetailedInfo[];
  sessions: SessionInfo[];
  screenshots: Map<string, ScreenshotData>;
  screenshotConnected: boolean;
  height: number;
  isResizing: boolean;
  maxPreviews: number;
  onResizeStart: (e: React.MouseEvent) => void;
  onRemovePreview: (deviceId: string) => void;
  onCloseAll: () => void;
}

/**
 * 대시보드 헤더 Props
 */
export interface DashboardHeaderProps {
  connectedCount: number;
  sessionCount: number;
  devicesWithoutSessionCount: number;
  creatingAllSessions: boolean;
  syncingTemplates: boolean;
  refreshing: boolean;
  lastSyncResult: string | null;
  onCreateAllSessions: () => void;
  onSyncTemplates: () => void;
  onRefresh: () => void;
}
