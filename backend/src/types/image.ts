// backend/src/types/image.ts

export interface ImageTemplate {
  id: string;
  name: string;
  filename: string;
  width: number;
  height: number;
  createdAt: string;
  packageId?: string;       // 소속 패키지 ID
  // 캡처 좌표 정보 (ROI 자동 계산용)
  captureX?: number;        // 원본 스크린샷에서의 X 좌표
  captureY?: number;        // 원본 스크린샷에서의 Y 좌표
  sourceWidth?: number;     // 원본 스크린샷 너비
  sourceHeight?: number;    // 원본 스크린샷 높이
}

export interface MatchResult {
  found: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  scale?: number;          // 매칭된 스케일 (멀티스케일 사용 시)
}

// 멀티스케일 매칭 옵션
export interface MultiScaleOptions {
  enabled: boolean;        // 멀티스케일 활성화 여부
  minScale?: number;       // 최소 스케일 (기본: 0.7)
  maxScale?: number;       // 최대 스케일 (기본: 1.3)
  scaleSteps?: number;     // 스케일 단계 수 (기본: 5)
}

// ROI(Region of Interest) 영역 정의
export interface RegionOptions {
  x: number;              // X 좌표 (absolute: 픽셀, relative: 0-1 비율)
  y: number;              // Y 좌표
  width: number;          // 너비
  height: number;         // 높이
  type?: 'absolute' | 'relative';  // 좌표 타입 (기본: 'absolute')
}

export interface ImageMatchOptions {
  threshold?: number;      // 매칭 임계값 (0-1, 기본 0.9)
  region?: RegionOptions;  // 검색 영역 제한 (ROI)
  multiScale?: MultiScaleOptions;  // 멀티스케일 매칭 옵션
  grayscale?: boolean;     // 그레이스케일 변환 후 매칭 (기본: false)
}

// ========== Image Match Result ==========
export interface ImageMatchResult {
  found: boolean;
  x: number;
  y: number;
  confidence: number;
}

// ========== Highlight Options ==========
export interface HighlightOptions {
  color?: string;           // 하이라이트 색상 (hex, 기본: '#00FF00')
  strokeWidth?: number;     // 테두리 두께 (기본: 4)
  padding?: number;         // 매칭 영역 주변 여백 (기본: 2)
  label?: string;           // 라벨 텍스트 (옵션)
}

export interface HighlightedScreenshot {
  buffer: Buffer;           // 하이라이트가 그려진 스크린샷 버퍼
  matchResult: MatchResult; // 매칭 결과 정보
}