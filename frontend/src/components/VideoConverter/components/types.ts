/**
 * VideoConverter 타입 정의
 */

// ADB screenrecord 최대 녹화 시간 (초)
export const ADB_MAX_RECORDING_DURATION = 180;

export interface DetectedTap {
  frameNumber: number;
  timestamp: number;
  x: number;
  y: number;
  confidence: number;
  type: 'tap' | 'longPress' | 'swipe';
  endX?: number;
  endY?: number;
  direction?: 'up' | 'down' | 'left' | 'right';
}

export interface VideoInfo {
  filename: string;
  duration: number;
  fps: number;
  width: number;
  height: number;
  totalFrames: number;
}

export interface AnalysisResult {
  success: boolean;
  videoInfo: VideoInfo;
  detectedTaps: DetectedTap[];
  stats: {
    analyzedFrames: number;
    tapCount: number;
    longPressCount: number;
    swipeCount: number;
    processingTime: number;
  };
  error?: string;
}

export interface UploadedVideo {
  videoId: string;
  filename: string;
  size: number;
  createdAt: string;
  duration?: number;
  fps?: number;
  width?: number;
  height?: number;
}

export interface AnalysisProgress {
  videoId: string;
  status: 'pending' | 'extracting' | 'analyzing' | 'generating' | 'completed' | 'error';
  progress: number;
  currentStep: string;
  error?: string;
}

export interface ScenarioNode {
  id: string;
  type: string;
  action?: string;
  label?: string;
  data?: Record<string, unknown>;
}

export interface ScenarioEdge {
  id: string;
  source: string;
  target: string;
}

export interface ScenarioOutput {
  nodes: ScenarioNode[];
  edges: ScenarioEdge[];
}

export interface RecordingStatus {
  deviceId: string;
  status: 'recording' | 'stopping' | 'completed' | 'error';
  startedAt: string;
  duration?: number;
  error?: string;
}

export interface DeviceInfo {
  id: string;
  name: string;
  model: string;
  status: 'connected' | 'offline';
}

export interface VideoConverterProps {
  onApplyScenario?: (scenario: ScenarioOutput) => void;
  devices?: DeviceInfo[];
}

export type DetectionMethod = 'showTaps' | 'pointerLocation';

// 분석 옵션 타입
export interface AnalysisOptions {
  fps: number;
  doubleTapThreshold: number;
  longPressThreshold: number;
  swipeMinDistance: number;
  detectionMethod: DetectionMethod;
}
