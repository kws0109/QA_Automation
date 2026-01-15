/**
 * 텍스트 매칭 서비스 타입 정의
 */

// ========================================
// OCR 엔진 타입
// ========================================

/** OCR 엔진 유형 */
export type OcrEngine = 'googleVision' | 'paddleOcr';

/** OCR 설정 */
export interface OcrConfig {
  /** 사용할 OCR 엔진 (기본: googleVision) */
  engine: OcrEngine;
  /** Google Cloud Vision API 키 경로 (JSON 파일) */
  googleCredentialsPath?: string;
  /** PaddleOCR 서버 URL (기본: http://localhost:8868) */
  paddleOcrUrl?: string;
  /** 언어 설정 (기본: ['ko', 'en']) */
  languages?: string[];
}

// ========================================
// 텍스트 감지 결과
// ========================================

/** 감지된 텍스트의 바운딩 박스 */
export interface TextBoundingBox {
  /** 좌상단 X 좌표 */
  x: number;
  /** 좌상단 Y 좌표 */
  y: number;
  /** 너비 */
  width: number;
  /** 높이 */
  height: number;
}

/** 감지된 단일 텍스트 */
export interface DetectedText {
  /** 감지된 텍스트 */
  text: string;
  /** 바운딩 박스 */
  boundingBox: TextBoundingBox;
  /** 신뢰도 (0-1) */
  confidence: number;
  /** 중앙 좌표 */
  centerX: number;
  centerY: number;
}

/** OCR 결과 */
export interface OcrResult {
  /** 성공 여부 */
  success: boolean;
  /** 감지된 모든 텍스트 */
  texts: DetectedText[];
  /** 전체 텍스트 (합침) */
  fullText: string;
  /** 처리 시간 (ms) */
  processingTime: number;
  /** 사용된 OCR 엔진 */
  engine: OcrEngine;
  /** 에러 메시지 */
  error?: string;
}

// ========================================
// 텍스트 매칭 옵션
// ========================================

/** 텍스트 매칭 방식 */
export type TextMatchType = 'exact' | 'contains' | 'regex';

/** 검색 영역 */
export interface SearchRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 텍스트 검색 옵션 */
export interface TextSearchOptions {
  /** 매칭 방식 (기본: contains) */
  matchType?: TextMatchType;
  /** 대소문자 구분 (기본: false) */
  caseSensitive?: boolean;
  /** 검색 영역 (없으면 전체 화면) */
  region?: SearchRegion;
  /** 동일 텍스트 중 선택할 인덱스 (기본: 0) */
  index?: number;
  /** 탭 위치 오프셋 */
  offset?: { x: number; y: number };
}

/** 텍스트 검색 결과 */
export interface TextSearchResult {
  /** 성공 여부 (텍스트 찾음) */
  found: boolean;
  /** 찾은 텍스트 정보 */
  match?: DetectedText;
  /** 모든 일치 항목 */
  allMatches: DetectedText[];
  /** 탭할 좌표 (오프셋 적용됨) */
  tapX?: number;
  tapY?: number;
  /** 처리 시간 (ms) */
  processingTime: number;
  /** 에러 메시지 */
  error?: string;
}

/** 텍스트 추출 결과 */
export interface ExtractTextResult {
  /** 성공 여부 */
  success: boolean;
  /** 영역 내 감지된 개별 텍스트들 */
  texts: DetectedText[];
  /** 줄 단위로 결합된 전체 텍스트 */
  combinedText: string;
  /** 줄별 텍스트 배열 */
  lines: string[];
  /** 처리 시간 (ms) */
  processingTime: number;
  /** 에러 메시지 */
  error?: string;
}

// ========================================
// 텍스트 액션 타입
// ========================================

/** 텍스트 기반 액션 파라미터 */
export interface TextActionParams {
  /** 검색할 텍스트 */
  text: string;
  /** 매칭 방식 */
  matchType?: TextMatchType;
  /** 대소문자 구분 */
  caseSensitive?: boolean;
  /** 검색 영역 */
  region?: SearchRegion;
  /** 텍스트 인덱스 */
  index?: number;
  /** 오프셋 */
  offset?: { x: number; y: number };
  /** 타임아웃 (ms) */
  timeout?: number;
  /** 재시도 횟수 */
  retryCount?: number;
  /** 재시도 간격 (ms) */
  retryDelay?: number;
}

/** 텍스트 액션 결과 */
export interface TextActionResult {
  /** 성공 여부 */
  success: boolean;
  /** 액션 타입 */
  action: 'tapText' | 'waitUntilText' | 'assertText';
  /** 검색한 텍스트 */
  text: string;
  /** 찾은 위치 */
  x?: number;
  y?: number;
  /** 신뢰도 */
  confidence?: number;
  /** 대기 시간 (waitUntilText) */
  waited?: number;
  /** 에러 메시지 */
  error?: string;
}
