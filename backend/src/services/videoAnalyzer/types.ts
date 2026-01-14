/**
 * 비디오 분석기 타입 정의
 *
 * 이 모듈은 격리되어 있어 삭제 시 다른 부분에 영향을 주지 않습니다.
 *
 * 삭제 방법:
 * 1. backend/src/services/videoAnalyzer/ 폴더 삭제
 * 2. backend/src/routes/video.ts 삭제
 * 3. backend/src/index.ts에서 관련 import 및 라우트 제거
 */

// ========================================
// 탭 감지 관련 타입
// ========================================

/** 감지된 탭 정보 */
export interface DetectedTap {
  /** 프레임 번호 */
  frameNumber: number;
  /** 비디오 내 타임스탬프 (ms) */
  timestamp: number;
  /** 탭 X 좌표 (화면 기준) */
  x: number;
  /** 탭 Y 좌표 (화면 기준) */
  y: number;
  /** 감지 신뢰도 (0-1) */
  confidence: number;
  /** 탭 유형 */
  type: 'tap' | 'longPress' | 'swipe';
  /** 스와이프인 경우 종료 좌표 */
  endX?: number;
  endY?: number;
  /** 스와이프인 경우 방향 */
  direction?: 'up' | 'down' | 'left' | 'right';
}

/** 원 감지 결과 (OpenCV HoughCircles) */
export interface DetectedCircle {
  x: number;
  y: number;
  radius: number;
  /** 감지 강도 */
  votes?: number;
}

// ========================================
// 프레임 분석 관련 타입
// ========================================

/** 프레임 정보 */
export interface FrameInfo {
  /** 프레임 번호 */
  number: number;
  /** 타임스탬프 (ms) */
  timestamp: number;
  /** 프레임 이미지 경로 */
  imagePath?: string;
  /** 프레임 이미지 버퍼 */
  imageBuffer?: Buffer;
  /** 감지된 탭 표시기 */
  circles: DetectedCircle[];
}

/** 프레임 추출 옵션 */
export interface FrameExtractionOptions {
  /** 초당 추출할 프레임 수 (기본: 10) */
  fps?: number;
  /** 시작 시간 (초) */
  startTime?: number;
  /** 종료 시간 (초) */
  endTime?: number;
  /** 출력 너비 (자동 리사이즈) */
  width?: number;
  /** 출력 높이 (자동 리사이즈) */
  height?: number;
}

// ========================================
// 탭 감지 옵션
// ========================================

/** 탭 감지 옵션 */
export interface TapDetectionOptions {
  /** 최소 원 반지름 (픽셀) */
  minRadius?: number;
  /** 최대 원 반지름 (픽셀) */
  maxRadius?: number;
  /** Hough 변환 파라미터1 (에지 감지 임계값) */
  param1?: number;
  /** Hough 변환 파라미터2 (누적 임계값) */
  param2?: number;
  /** 최소 원 간격 (dp) */
  minDist?: number;
  /** 탭 표시기 색상 범위 (HSV) */
  colorRange?: {
    lower: [number, number, number];
    upper: [number, number, number];
  };
}

// ========================================
// 비디오 분석 결과
// ========================================

/** 비디오 분석 결과 */
export interface VideoAnalysisResult {
  /** 성공 여부 */
  success: boolean;
  /** 비디오 정보 */
  videoInfo: {
    /** 파일명 */
    filename: string;
    /** 비디오 길이 (초) */
    duration: number;
    /** 원본 FPS */
    fps: number;
    /** 해상도 */
    width: number;
    height: number;
    /** 총 프레임 수 */
    totalFrames: number;
  };
  /** 감지된 탭 목록 */
  detectedTaps: DetectedTap[];
  /** 분석 통계 */
  stats: {
    /** 분석된 프레임 수 */
    analyzedFrames: number;
    /** 탭 감지 수 */
    tapCount: number;
    /** 롱프레스 감지 수 */
    longPressCount: number;
    /** 스와이프 감지 수 */
    swipeCount: number;
    /** 처리 시간 (ms) */
    processingTime: number;
  };
  /** 오류 메시지 */
  error?: string;
}

// ========================================
// 시나리오 생성 관련 타입
// ========================================

/** 생성된 시나리오 노드 */
export interface GeneratedScenarioNode {
  id: string;
  action: 'tap' | 'doubleTap' | 'longPress' | 'swipe' | 'waitUntilImage';
  label: string;
  /** 좌표 (tap, doubleTap, longPress) */
  x?: number;
  y?: number;
  /** 스와이프 좌표 */
  startX?: number;
  startY?: number;
  endX?: number;
  endY?: number;
  direction?: 'up' | 'down' | 'left' | 'right';
  /** waitUntilImage용 스크린샷 */
  templateBuffer?: Buffer;
  templateDescription?: string;
  /** 원본 타임스탬프 */
  timestamp: number;
  /** 신뢰도 */
  confidence: number;
}

/** 시나리오 생성 옵션 */
export interface ScenarioGenerationOptions {
  /** 각 탭 사이에 waitUntilImage 삽입 여부 */
  insertWaitSteps?: boolean;
  /** 대기 조건으로 사용할 스크린샷 영역 (탭 위치 기준) */
  waitRegion?: {
    /** 탭 위치로부터의 오프셋 */
    offsetX: number;
    offsetY: number;
    /** 영역 크기 */
    width: number;
    height: number;
  };
  /** 최소 탭 간격 (ms) - 이보다 가까운 탭은 더블탭으로 처리 */
  doubleTapThreshold?: number;
  /** 롱프레스 최소 시간 (ms) */
  longPressThreshold?: number;
  /** 스와이프 최소 거리 (픽셀) */
  swipeMinDistance?: number;
}

/** 시나리오 생성 결과 */
export interface ScenarioGenerationResult {
  success: boolean;
  nodes: GeneratedScenarioNode[];
  edges: Array<{
    id: string;
    source: string;
    target: string;
  }>;
  summary: {
    totalNodes: number;
    tapNodes: number;
    waitNodes: number;
    swipeNodes: number;
  };
  error?: string;
}

// ========================================
// API 요청/응답 타입
// ========================================

/** 비디오 업로드 응답 */
export interface VideoUploadResponse {
  success: boolean;
  videoId: string;
  filename: string;
  size: number;
  duration?: number;
  error?: string;
}

/** 분석 진행 상태 */
export interface AnalysisProgress {
  videoId: string;
  status: 'pending' | 'extracting' | 'analyzing' | 'generating' | 'completed' | 'error';
  progress: number; // 0-100
  currentStep: string;
  estimatedRemaining?: number; // 초
  error?: string;
}
