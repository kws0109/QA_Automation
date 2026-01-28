// frontend/src/components/DevicePreview/types.ts

import type { DeviceElement, DeviceDetailedInfo } from '../../types';

export interface ClickPosition {
  x: number;
  y: number;
  displayX: number;
  displayY: number;
}

export interface DeviceSize {
  width: number;
  height: number;
}

export interface ElementInfo extends DeviceElement {
  className?: string;
  clickable?: boolean;
  enabled?: boolean;
}

export interface SelectionRegion {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export interface NormalizedRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DeviceRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ExtractedTextResult {
  combinedText: string;
  lines: string[];
  processingTime: number;
}

export interface SwipeCoordinates {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  startXPercent: number;
  startYPercent: number;
  endXPercent: number;
  endYPercent: number;
}

export interface DevicePreviewProps {
  onSelectCoordinate?: (x: number, y: number) => void;
  onSelectElement?: (element: DeviceElement) => void;
  onTemplateCreated?: () => void;
  packageId?: string;
  onDeviceIdChange?: (deviceId: string) => void;
  regionSelectMode?: boolean;
  onRegionSelectModeChange?: (active: boolean) => void;
  onSelectRegion?: (region: NormalizedRegion) => void;
  // 스와이프 좌표 선택 모드
  swipeSelectMode?: boolean;
  onSwipeSelectModeChange?: (active: boolean) => void;
  onSelectSwipe?: (coords: SwipeCoordinates) => void;
}

// Hook return types
export interface UseDeviceConnectionReturn {
  devices: DeviceDetailedInfo[];
  selectedDeviceId: string;
  selectedDevice: DeviceDetailedInfo | undefined;
  devicesLoading: boolean;
  hasSession: boolean;
  creatingSession: boolean;
  mjpegUrl: string | null;
  mjpegError: boolean;
  setMjpegError: (error: boolean) => void;
  handleDeviceChange: (deviceId: string) => void;
  handleConnectSession: () => Promise<void>;
  resetScreenState: () => void;
}

export interface UseScreenCaptureReturn {
  screenshot: string | null;
  loading: boolean;
  deviceSize: DeviceSize;
  orientation: 'portrait' | 'landscape';
  selectionRegion: SelectionRegion | null;
  isSelecting: boolean;
  selectionPreview: string | null;
  imageRef: React.RefObject<HTMLImageElement | null>;
  liveImageRef: React.RefObject<HTMLImageElement | null>;
  captureScreen: () => Promise<void>;
  handleImageLoad: (e: React.SyntheticEvent<HTMLImageElement>) => void;
  handleMouseDown: (e: React.MouseEvent<HTMLImageElement>) => void;
  handleMouseMove: (e: React.MouseEvent<HTMLImageElement>) => void;
  handleMouseUp: () => void;
  getDeviceRegion: () => DeviceRegion | null;
  getNormalizedRegion: () => NormalizedRegion | null;
  resetSelection: () => void;
  setScreenshot: (screenshot: string | null) => void;
}

// Component Props types
export interface PreviewHeaderProps {
  devices: DeviceDetailedInfo[];
  selectedDeviceId: string;
  devicesLoading: boolean;
  hasSession: boolean;
  loading: boolean;
  mjpegError: boolean;
  captureMode: boolean;
  textExtractMode: boolean;
  liveMode: boolean;
  onDeviceChange: (deviceId: string) => void;
  onToggleCaptureMode: () => void;
  onToggleTextExtractMode: () => void;
  onToggleLiveMode: () => void;
  onCaptureScreen: () => void;
}

export interface ScreenshotViewerProps {
  // Device state
  devices: DeviceDetailedInfo[];
  selectedDeviceId: string;
  selectedDevice: DeviceDetailedInfo | undefined;
  hasSession: boolean;
  creatingSession: boolean;
  onConnectSession: () => void;
  // Screenshot state
  screenshot: string | null;
  loading: boolean;
  orientation: 'portrait' | 'landscape';
  deviceSize: DeviceSize;
  // Mode state
  liveMode: boolean;
  mjpegUrl: string | null;
  mjpegError: boolean;
  onMjpegError: () => void;
  captureMode: boolean;
  textExtractMode: boolean;
  regionSelectMode: boolean;
  swipeSelectMode: boolean;
  // Click/Selection state
  clickPos: ClickPosition | null;
  selectionRegion: SelectionRegion | null;
  // Swipe state
  swipeStart: { x: number; y: number } | null;
  swipeEnd: { x: number; y: number } | null;
  // Refs
  imageRef: React.RefObject<HTMLImageElement | null>;
  liveImageRef: React.RefObject<HTMLImageElement | null>;
  // Handlers
  onImageClick: (e: React.MouseEvent<HTMLImageElement>) => void;
  onImageLoad: (e: React.SyntheticEvent<HTMLImageElement>) => void;
  onMouseDown: (e: React.MouseEvent<HTMLImageElement>) => void;
  onMouseMove: (e: React.MouseEvent<HTMLImageElement>) => void;
  onMouseUp: () => void;
}

export interface InfoPanelProps {
  clickPos: ClickPosition | null;
  elementInfo: ElementInfo | null;
  elementLoading: boolean;
  onApplyCoordinate: () => void;
  onApplyElement: () => void;
}

export interface CapturePanelProps {
  selectionPreview: string | null;
  deviceRegion: DeviceRegion | null;
  templateName: string;
  onTemplateNameChange: (name: string) => void;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}

export interface TextExtractPanelProps {
  selectionPreview: string | null;
  deviceRegion: DeviceRegion | null;
  extracting: boolean;
  extractedText: ExtractedTextResult | null;
  onExtract: () => void;
  onCancel: () => void;
}

export interface RegionSelectPanelProps {
  selectionPreview: string | null;
  deviceRegion: DeviceRegion | null;
  normalizedRegion: NormalizedRegion | null;
  onApply: () => void;
  onCancel: () => void;
}

export interface SwipeSelectPanelProps {
  swipeStart: { x: number; y: number } | null;
  swipeEnd: { x: number; y: number } | null;
  deviceSwipe: {
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    startXPercent: number;
    startYPercent: number;
    endXPercent: number;
    endYPercent: number;
  } | null;
  onApply: () => void;
  onCancel: () => void;
}
