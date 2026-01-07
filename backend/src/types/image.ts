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