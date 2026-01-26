/**
 * 포인터 위치 감지기 (OpenCV + OCR 기반)
 *
 * Android "포인터 위치" 개발자 옵션에서 생성되는
 * 십자선과 상단 좌표 텍스트를 감지합니다.
 *
 * 감지 방식:
 * 1. 십자선 패턴 감지 (OpenCV HoughLinesP)
 * 2. 상단 바 OCR로 정확한 좌표 추출 (tesseract.js)
 * 3. 둘을 조합하여 최종 좌표 결정
 */

import cv from '@u4/opencv4nodejs';
import Tesseract from 'tesseract.js';
import type { DetectedTap, FrameInfo } from './types';

// ========================================
// 타입 정의
// ========================================

export interface PointerDetectionOptions {
  /** 십자선 감지 최소 선 길이 (픽셀) */
  minLineLength?: number;
  /** 십자선 감지 최대 선 간격 */
  maxLineGap?: number;
  /** OCR 상단 바 영역 높이 (픽셀) */
  ocrRegionHeight?: number;
  /** 십자선 색상 범위 (HSV) - 빨간색 */
  redLineRange?: {
    lower: [number, number, number];
    upper: [number, number, number];
  };
  /** 십자선 색상 범위 (HSV) - 노란색 */
  yellowLineRange?: {
    lower: [number, number, number];
    upper: [number, number, number];
  };
}

export interface CrosshairDetection {
  /** 십자선 중심 X */
  x: number;
  /** 십자선 중심 Y */
  y: number;
  /** 감지 신뢰도 */
  confidence: number;
  /** 수직선 감지 여부 */
  hasVerticalLine: boolean;
  /** 수평선 감지 여부 */
  hasHorizontalLine: boolean;
}

export interface OcrCoordinates {
  /** X 좌표 */
  x: number;
  /** Y 좌표 */
  y: number;
  /** OCR 신뢰도 */
  confidence: number;
  /** 원본 텍스트 */
  rawText: string;
}

// ========================================
// 기본 설정
// ========================================

const DEFAULT_OPTIONS: Required<PointerDetectionOptions> = {
  minLineLength: 50,
  maxLineGap: 10,
  ocrRegionHeight: 60,
  // 빨간색 범위 (HSV) - 빨간색은 H가 0 근처와 180 근처에 있음
  redLineRange: {
    lower: [0, 100, 100],
    upper: [10, 255, 255],
  },
  // 노란색 범위 (HSV)
  yellowLineRange: {
    lower: [20, 100, 100],
    upper: [40, 255, 255],
  },
};

// ========================================
// PointerLocationDetector 클래스
// ========================================

export class PointerLocationDetector {
  private options: Required<PointerDetectionOptions>;
  private ocrWorker: Tesseract.Worker | null = null;
  private ocrInitialized = false;

  constructor(options: PointerDetectionOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * OCR 워커 초기화
   */
  async initOcr(): Promise<void> {
    if (this.ocrInitialized) return;

    this.ocrWorker = await Tesseract.createWorker('eng');
    // 숫자와 기본 문자만 인식하도록 설정
    await this.ocrWorker.setParameters({
      tessedit_char_whitelist: '0123456789XYxy:. -',
    });
    this.ocrInitialized = true;
    console.log('[PointerLocationDetector] OCR initialized');
  }

  /**
   * OCR 워커 종료
   */
  async terminateOcr(): Promise<void> {
    if (this.ocrWorker) {
      await this.ocrWorker.terminate();
      this.ocrWorker = null;
      this.ocrInitialized = false;
    }
  }

  /**
   * 십자선 패턴 감지
   */
  detectCrosshair(imageBuffer: Buffer): CrosshairDetection | null {
    try {
      const mat = cv.imdecode(imageBuffer);
      const height = mat.rows;
      const width = mat.cols;

      // HSV 변환
      const hsv = mat.cvtColor(cv.COLOR_BGR2HSV);

      // 빨간색 마스크 생성 (빨간색은 H=0 근처와 H=180 근처에 분포)
      const redLower1 = new cv.Vec3(0, 100, 100);
      const redUpper1 = new cv.Vec3(10, 255, 255);
      const redLower2 = new cv.Vec3(160, 100, 100);
      const redUpper2 = new cv.Vec3(180, 255, 255);

      const redMask1 = hsv.inRange(redLower1, redUpper1);
      const redMask2 = hsv.inRange(redLower2, redUpper2);
      const redMask = redMask1.bitwiseOr(redMask2);

      // 노란색 마스크 생성
      const yellowLower = new cv.Vec3(
        this.options.yellowLineRange.lower[0],
        this.options.yellowLineRange.lower[1],
        this.options.yellowLineRange.lower[2]
      );
      const yellowUpper = new cv.Vec3(
        this.options.yellowLineRange.upper[0],
        this.options.yellowLineRange.upper[1],
        this.options.yellowLineRange.upper[2]
      );
      const yellowMask = hsv.inRange(yellowLower, yellowUpper);

      // 빨간색 + 노란색 마스크 결합
      const combinedMask = redMask.bitwiseOr(yellowMask);

      // 모폴로지 연산으로 노이즈 제거
      const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
      // MORPH_CLOSE = dilate then erode, MORPH_OPEN = erode then dilate
      const closedMask = combinedMask.dilate(kernel).erode(kernel);
      const cleanedMask = closedMask.erode(kernel).dilate(kernel);

      // Hough 선 감지
      const lines = cleanedMask.houghLinesP(
        1,                              // rho
        Math.PI / 180,                  // theta
        50,                             // threshold
        this.options.minLineLength,     // minLineLength
        this.options.maxLineGap         // maxLineGap
      );

      // 수직선과 수평선 분류
      const verticalLines: Array<{ x: number; y1: number; y2: number }> = [];
      const horizontalLines: Array<{ y: number; x1: number; x2: number }> = [];

      for (const line of lines) {
        const x1 = line.x;
        const y1 = line.y;
        const x2 = line.z;
        const y2 = line.w;

        const dx = Math.abs(x2 - x1);
        const dy = Math.abs(y2 - y1);

        if (dy > dx * 3) {
          // 수직선 (dy가 dx보다 3배 이상 큼)
          verticalLines.push({
            x: Math.round((x1 + x2) / 2),
            y1: Math.min(y1, y2),
            y2: Math.max(y1, y2),
          });
        } else if (dx > dy * 3) {
          // 수평선 (dx가 dy보다 3배 이상 큼)
          horizontalLines.push({
            y: Math.round((y1 + y2) / 2),
            x1: Math.min(x1, x2),
            x2: Math.max(x1, x2),
          });
        }
      }

      // 메모리 해제
      mat.release();
      hsv.release();
      redMask1.release();
      redMask2.release();
      redMask.release();
      yellowMask.release();
      combinedMask.release();
      cleanedMask.release();

      // 교차점 찾기
      if (verticalLines.length === 0 && horizontalLines.length === 0) {
        return null;
      }

      // 가장 긴 수직선과 수평선 선택
      let bestVertical: typeof verticalLines[0] | null = null;
      let bestHorizontal: typeof horizontalLines[0] | null = null;

      for (const vLine of verticalLines) {
        if (!bestVertical || (vLine.y2 - vLine.y1) > (bestVertical.y2 - bestVertical.y1)) {
          bestVertical = vLine;
        }
      }

      for (const hLine of horizontalLines) {
        if (!bestHorizontal || (hLine.x2 - hLine.x1) > (bestHorizontal.x2 - bestHorizontal.x1)) {
          bestHorizontal = hLine;
        }
      }

      // 교차점 계산
      let crossX: number;
      let crossY: number;
      let confidence = 0;

      if (bestVertical && bestHorizontal) {
        // 둘 다 있으면 교차점
        crossX = bestVertical.x;
        crossY = bestHorizontal.y;
        confidence = 0.95;
      } else if (bestVertical) {
        // 수직선만 있으면 중간점
        crossX = bestVertical.x;
        crossY = Math.round((bestVertical.y1 + bestVertical.y2) / 2);
        confidence = 0.7;
      } else if (bestHorizontal) {
        // 수평선만 있으면 중간점
        crossX = Math.round((bestHorizontal.x1 + bestHorizontal.x2) / 2);
        crossY = bestHorizontal.y;
        confidence = 0.7;
      } else {
        return null;
      }

      // 상단 바 영역 제외 (OCR 영역)
      if (crossY < this.options.ocrRegionHeight) {
        return null;
      }

      return {
        x: crossX,
        y: crossY,
        confidence,
        hasVerticalLine: !!bestVertical,
        hasHorizontalLine: !!bestHorizontal,
      };
    } catch (error) {
      console.error('[PointerLocationDetector] Crosshair detection error:', error);
      return null;
    }
  }

  /**
   * OCR로 상단 바에서 좌표 추출
   */
  async extractCoordinatesFromOcr(imageBuffer: Buffer): Promise<OcrCoordinates | null> {
    if (!this.ocrInitialized || !this.ocrWorker) {
      await this.initOcr();
    }

    try {
      const mat = cv.imdecode(imageBuffer);
      const width = mat.cols;

      // 상단 바 영역만 잘라내기
      const topRegion = mat.getRegion(
        new cv.Rect(0, 0, width, this.options.ocrRegionHeight)
      );

      // OCR을 위해 전처리: 그레이스케일 → 이진화
      const gray = topRegion.cvtColor(cv.COLOR_BGR2GRAY);
      const binary = gray.threshold(100, 255, cv.THRESH_BINARY);

      // Buffer로 변환
      const processedBuffer = cv.imencode('.png', binary);

      // 메모리 해제
      mat.release();
      topRegion.release();
      gray.release();
      binary.release();

      // OCR 실행
      const result = await this.ocrWorker!.recognize(processedBuffer);
      const text = result.data.text;

      // 좌표 패턴 파싱: "X: 540 Y: 960" 또는 "X:540 Y:960"
      const xMatch = text.match(/X\s*:\s*(-?\d+)/i);
      const yMatch = text.match(/Y\s*:\s*(-?\d+)/i);

      if (xMatch && yMatch) {
        return {
          x: parseInt(xMatch[1], 10),
          y: parseInt(yMatch[1], 10),
          confidence: result.data.confidence / 100,
          rawText: text.trim(),
        };
      }

      return null;
    } catch (error) {
      console.error('[PointerLocationDetector] OCR extraction error:', error);
      return null;
    }
  }

  /**
   * 십자선 + OCR 조합 감지
   */
  async detectPointerLocation(
    imageBuffer: Buffer
  ): Promise<{ x: number; y: number; confidence: number; method: 'crosshair' | 'ocr' | 'combined' } | null> {
    // 1. 십자선 감지
    const crosshair = this.detectCrosshair(imageBuffer);

    // 2. OCR 좌표 추출
    const ocrCoords = await this.extractCoordinatesFromOcr(imageBuffer);

    // 3. 결과 조합
    if (crosshair && ocrCoords) {
      // 둘 다 있으면 OCR 좌표를 우선 사용 (더 정확함)
      // 단, 십자선이 감지되었다는 것은 터치가 발생했다는 확실한 증거
      return {
        x: ocrCoords.x,
        y: ocrCoords.y,
        confidence: Math.min(crosshair.confidence + 0.05, 1.0),
        method: 'combined',
      };
    } else if (ocrCoords && ocrCoords.x > 0 && ocrCoords.y > 0) {
      // OCR만 있으면 터치 중인지 확인 필요
      // 좌표가 유효하면 반환 (터치 중일 때만 좌표가 표시됨)
      return {
        x: ocrCoords.x,
        y: ocrCoords.y,
        confidence: ocrCoords.confidence * 0.8, // 십자선 미감지로 신뢰도 하향
        method: 'ocr',
      };
    } else if (crosshair) {
      // 십자선만 있으면 근사 좌표 사용
      return {
        x: crosshair.x,
        y: crosshair.y,
        confidence: crosshair.confidence * 0.9,
        method: 'crosshair',
      };
    }

    return null;
  }

  /**
   * 연속 프레임에서 탭 이벤트 추출
   */
  async extractTapEvents(
    frames: FrameInfo[],
    options: {
      doubleTapThreshold?: number;
      longPressThreshold?: number;
      swipeMinDistance?: number;
    } = {}
  ): Promise<DetectedTap[]> {
    const {
      doubleTapThreshold = 300,
      longPressThreshold = 500,
      swipeMinDistance = 50,
    } = options;

    await this.initOcr();

    const taps: DetectedTap[] = [];
    let currentTouch: {
      startFrame: number;
      startTime: number;
      x: number;
      y: number;
      endFrame?: number;
      endTime?: number;
      endX?: number;
      endY?: number;
      positions: Array<{ x: number; y: number; time: number }>;
    } | null = null;

    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      if (!frame.imageBuffer) continue;

      const detection = await this.detectPointerLocation(frame.imageBuffer);

      if (detection) {
        // 터치 감지됨
        if (!currentTouch) {
          // 새 터치 시작
          currentTouch = {
            startFrame: frame.number,
            startTime: frame.timestamp,
            x: detection.x,
            y: detection.y,
            positions: [{ x: detection.x, y: detection.y, time: frame.timestamp }],
          };
        } else {
          // 터치 진행 중
          currentTouch.endFrame = frame.number;
          currentTouch.endTime = frame.timestamp;
          currentTouch.endX = detection.x;
          currentTouch.endY = detection.y;
          currentTouch.positions.push({
            x: detection.x,
            y: detection.y,
            time: frame.timestamp,
          });
        }
      } else if (currentTouch) {
        // 터치 종료
        const tap = this.classifyTouch(currentTouch, {
          longPressThreshold,
          swipeMinDistance,
        });
        taps.push(tap);
        currentTouch = null;
      }
    }

    // 마지막 터치 처리
    if (currentTouch) {
      const tap = this.classifyTouch(currentTouch, {
        longPressThreshold,
        swipeMinDistance,
      });
      taps.push(tap);
    }

    await this.terminateOcr();

    // 더블탭 병합
    return this.mergeDoubleTaps(taps, doubleTapThreshold);
  }

  /**
   * 터치 유형 분류
   */
  private classifyTouch(
    touch: {
      startFrame: number;
      startTime: number;
      x: number;
      y: number;
      endFrame?: number;
      endTime?: number;
      endX?: number;
      endY?: number;
      positions: Array<{ x: number; y: number; time: number }>;
    },
    options: {
      longPressThreshold: number;
      swipeMinDistance: number;
    }
  ): DetectedTap {
    const duration = (touch.endTime || touch.startTime) - touch.startTime;
    const endX = touch.endX ?? touch.x;
    const endY = touch.endY ?? touch.y;
    const distance = Math.sqrt(
      Math.pow(endX - touch.x, 2) + Math.pow(endY - touch.y, 2)
    );

    let tapType: 'tap' | 'longPress' | 'swipe' = 'tap';
    let direction: 'up' | 'down' | 'left' | 'right' | undefined;

    if (distance >= options.swipeMinDistance) {
      tapType = 'swipe';
      direction = this.calculateDirection(touch.x, touch.y, endX, endY);
    } else if (duration >= options.longPressThreshold) {
      tapType = 'longPress';
    }

    const result: DetectedTap = {
      frameNumber: touch.startFrame,
      timestamp: touch.startTime,
      x: touch.x,
      y: touch.y,
      confidence: 0.9,
      type: tapType,
    };

    if (tapType === 'swipe') {
      result.endX = endX;
      result.endY = endY;
      result.direction = direction;
    }

    return result;
  }

  /**
   * 스와이프 방향 계산
   */
  private calculateDirection(
    startX: number,
    startY: number,
    endX: number,
    endY: number
  ): 'up' | 'down' | 'left' | 'right' {
    const dx = endX - startX;
    const dy = endY - startY;

    if (Math.abs(dx) > Math.abs(dy)) {
      return dx > 0 ? 'right' : 'left';
    } else {
      return dy > 0 ? 'down' : 'up';
    }
  }

  /**
   * 더블탭 병합
   */
  private mergeDoubleTaps(taps: DetectedTap[], threshold: number): DetectedTap[] {
    if (taps.length < 2) return taps;

    const merged: DetectedTap[] = [];
    let i = 0;

    while (i < taps.length) {
      const current = taps[i];

      if (
        current.type === 'tap' &&
        i + 1 < taps.length &&
        taps[i + 1].type === 'tap'
      ) {
        const next = taps[i + 1];
        const timeDiff = next.timestamp - current.timestamp;
        const distance = Math.sqrt(
          Math.pow(next.x - current.x, 2) + Math.pow(next.y - current.y, 2)
        );

        if (timeDiff <= threshold && distance < 30) {
          merged.push({
            ...current,
            type: 'tap',
            confidence: 0.85,
          });
          i += 2;
          continue;
        }
      }

      merged.push(current);
      i++;
    }

    return merged;
  }
}

// 싱글톤 인스턴스
export const pointerLocationDetector = new PointerLocationDetector();
