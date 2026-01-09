// backend/src/types/image.ts

export interface ImageTemplate {
  id: string;
  name: string;
  filename: string;
  width: number;
  height: number;
  createdAt: string;
}

export interface MatchResult {
  found: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
}

export interface ImageMatchOptions {
  threshold?: number;      // 매칭 임계값 (0-1, 기본 0.9)
  region?: {              // 검색 영역 제한
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

// ========== Image Template ==========
export interface ImageTemplate {
  id: string;
  name: string;
  filename: string;
  width: number;
  height: number;
  createdAt: string;
}

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