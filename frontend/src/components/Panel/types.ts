// frontend/src/components/Panel/types.ts

import type { FlowNode, NodeParams, ImageTemplate } from '../../types';

// ROI 타입 정의
export interface RegionOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'absolute' | 'relative';
}

// 상수 타입 정의
export interface ActionTypeItem {
  value: string;
  label: string;
  group: 'touch' | 'wait' | 'image' | 'text' | 'system';
}

export interface SelectOption {
  value: string;
  label: string;
}

// 테스트 결과 타입
export interface ImageTestResult {
  matched: boolean;
  confidence: number;
  location: {
    x: number;
    y: number;
    centerX: number;
    centerY: number;
  } | null;
  timing: {
    captureTime: number;
    matchTime: number;
    totalTime: number;
  };
  threshold: number;
}

export interface OcrTestResult {
  mode: 'search' | 'detect';
  found?: boolean;
  match?: {
    text: string;
    confidence: number;
    centerX: number;
    centerY: number;
  };
  allMatches?: Array<{
    text: string;
    confidence: number;
  }>;
  matchCount?: number;
  timing: {
    captureTime: number;
    ocrTime: number;
    totalTime: number;
  };
}

// Props 정의
export interface PanelProps {
  selectedNode: FlowNode | undefined;
  onNodeUpdate?: (nodeId: string, updates: Partial<FlowNode>) => void;
  onNodeDelete?: (nodeId: string) => void;
  templates?: ImageTemplate[];
  onOpenTemplateModal?: () => void;
  selectedDeviceId?: string;
  onRequestRegionSelect?: () => void;
}

// 공통 필드 Props
export interface BaseFieldProps {
  selectedNode: FlowNode;
  onParamChange: (key: keyof NodeParams, value: NodeParams[keyof NodeParams]) => void;
}

// ROI 필드 Props
export interface RoiFieldProps extends BaseFieldProps {
  onRoiToggle: (enabled: boolean) => void;
  onRoiFieldChange: (field: keyof RegionOptions, value: number | string) => void;
  onRequestRegionSelect?: () => void;
  selectedDeviceId?: string;
}

// 이미지 필드 Props
export interface ImageFieldProps extends RoiFieldProps {
  templates: ImageTemplate[];
  onOpenTemplateModal?: () => void;
  onAutoROI: () => Promise<void>;
  roiLoading: boolean;
  hasCaptureInfo: boolean;
  // 테스트 관련
  isTesting: boolean;
  imageTestResult: ImageTestResult | null;
  testError: string | null;
  onImageTest: () => Promise<void>;
}

// OCR 필드 Props
export interface OcrFieldProps extends RoiFieldProps {
  isTesting: boolean;
  ocrTestResult: OcrTestResult | null;
  testError: string | null;
  onOcrTest: () => Promise<void>;
}
