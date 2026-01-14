/**
 * 탭 감지기 (OpenCV 기반)
 *
 * Android "탭한 항목 표시" 개발자 옵션에서 생성되는
 * 흰색/회색 원형 표시기를 감지합니다.
 *
 * 이 모듈은 격리되어 있어 삭제 시 다른 부분에 영향을 주지 않습니다.
 */

import cv from '@u4/opencv4nodejs';
import type {
  DetectedCircle,
  DetectedTap,
  TapDetectionOptions,
  FrameInfo,
} from './types';

// ========================================
// 기본 설정
// ========================================

const DEFAULT_OPTIONS: Required<TapDetectionOptions> = {
  minRadius: 15,
  maxRadius: 50,
  param1: 100,  // Canny 에지 감지 상위 임계값
  param2: 30,   // 누적 임계값 (낮을수록 더 많은 원 감지)
  minDist: 50,  // 감지된 원 간 최소 거리
  colorRange: {
    // 흰색/밝은 회색 범위 (HSV)
    lower: [0, 0, 180],   // 채도 낮음, 밝기 높음
    upper: [180, 50, 255],
  },
};

// ========================================
// TapDetector 클래스
// ========================================

export class TapDetector {
  private options: Required<TapDetectionOptions>;

  constructor(options: TapDetectionOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * 이미지에서 탭 표시기(원) 감지
   */
  detectCircles(imageBuffer: Buffer): DetectedCircle[] {
    try {
      // 버퍼를 OpenCV Mat으로 변환
      const mat = cv.imdecode(imageBuffer);

      // 그레이스케일 변환
      const gray = mat.cvtColor(cv.COLOR_BGR2GRAY);

      // 가우시안 블러 (노이즈 감소)
      const blurred = gray.gaussianBlur(new cv.Size(9, 9), 2);

      // Hough 원 감지 - Vec3[] 반환
      const circles = blurred.houghCircles(
        cv.HOUGH_GRADIENT,
        1,                       // dp: 해상도 비율
        this.options.minDist,    // 원 중심 간 최소 거리
        this.options.param1,     // Canny 상위 임계값
        this.options.param2,     // 누적 임계값
        this.options.minRadius,  // 최소 반지름
        this.options.maxRadius   // 최대 반지름
      );

      // 결과 변환 (Vec3[] 형식: {x, y, z})
      const detected: DetectedCircle[] = [];

      for (const circle of circles) {
        detected.push({
          x: Math.round(circle.x),
          y: Math.round(circle.y),
          radius: Math.round(circle.z),
        });
      }

      // 메모리 해제
      mat.release();
      gray.release();
      blurred.release();

      return detected;
    } catch (error) {
      console.error('[TapDetector] Circle detection error:', error);
      return [];
    }
  }

  /**
   * 탭 표시기 감지 (간소화 버전)
   * 원 감지 + 밝기 필터링
   */
  detectTapIndicators(imageBuffer: Buffer): DetectedCircle[] {
    try {
      const mat = cv.imdecode(imageBuffer);

      // 그레이스케일 변환
      const gray = mat.cvtColor(cv.COLOR_BGR2GRAY);

      // 가우시안 블러
      const blurred = gray.gaussianBlur(new cv.Size(9, 9), 2);

      // Hough 원 감지
      const circles = blurred.houghCircles(
        cv.HOUGH_GRADIENT,
        1,
        this.options.minDist,
        this.options.param1,
        this.options.param2,
        this.options.minRadius,
        this.options.maxRadius
      );

      const detected: DetectedCircle[] = [];

      for (const circle of circles) {
        const x = Math.round(circle.x);
        const y = Math.round(circle.y);

        // 밝기 검증: 해당 위치의 그레이스케일 값 확인
        if (x >= 0 && x < gray.cols && y >= 0 && y < gray.rows) {
          const brightness = gray.at(y, x);
          // 180 이상이면 밝은 것으로 판단 (탭 표시기)
          if (brightness >= 180) {
            detected.push({
              x,
              y,
              radius: Math.round(circle.z),
            });
          }
        }
      }

      // 메모리 해제
      mat.release();
      gray.release();
      blurred.release();

      return detected;
    } catch (error) {
      console.error('[TapDetector] Tap indicator detection error:', error);
      return [];
    }
  }

  /**
   * 연속 프레임에서 탭 이벤트 추출
   */
  extractTapEvents(
    frames: FrameInfo[],
    options: {
      doubleTapThreshold?: number;  // 더블탭 판정 시간 (ms)
      longPressThreshold?: number;  // 롱프레스 판정 시간 (ms)
      swipeMinDistance?: number;    // 스와이프 최소 거리 (px)
    } = {}
  ): DetectedTap[] {
    const {
      doubleTapThreshold = 300,
      longPressThreshold = 500,
      swipeMinDistance = 50,
    } = options;

    const taps: DetectedTap[] = [];
    let currentTap: {
      startFrame: number;
      startTime: number;
      x: number;
      y: number;
      endFrame?: number;
      endTime?: number;
      endX?: number;
      endY?: number;
    } | null = null;

    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      const circles = frame.circles;

      if (circles.length > 0) {
        // 원이 감지됨 - 탭 시작 또는 진행 중
        const circle = circles[0]; // 가장 먼저 감지된 원 사용

        if (!currentTap) {
          // 새 탭 시작
          currentTap = {
            startFrame: frame.number,
            startTime: frame.timestamp,
            x: circle.x,
            y: circle.y,
          };
        } else {
          // 탭 진행 중 - 위치 업데이트 (스와이프 감지용)
          currentTap.endFrame = frame.number;
          currentTap.endTime = frame.timestamp;
          currentTap.endX = circle.x;
          currentTap.endY = circle.y;
        }
      } else if (currentTap) {
        // 원이 사라짐 - 탭 종료
        const duration = (currentTap.endTime || frame.timestamp) - currentTap.startTime;
        const distance = currentTap.endX !== undefined && currentTap.endY !== undefined
          ? Math.sqrt(
              Math.pow(currentTap.endX - currentTap.x, 2) +
              Math.pow(currentTap.endY - currentTap.y, 2)
            )
          : 0;

        let tapType: 'tap' | 'longPress' | 'swipe' = 'tap';
        let direction: 'up' | 'down' | 'left' | 'right' | undefined;

        if (distance >= swipeMinDistance) {
          // 스와이프
          tapType = 'swipe';
          direction = this.calculateDirection(
            currentTap.x,
            currentTap.y,
            currentTap.endX!,
            currentTap.endY!
          );
        } else if (duration >= longPressThreshold) {
          // 롱프레스
          tapType = 'longPress';
        }

        const detectedTap: DetectedTap = {
          frameNumber: currentTap.startFrame,
          timestamp: currentTap.startTime,
          x: currentTap.x,
          y: currentTap.y,
          confidence: 0.9,
          type: tapType,
        };

        if (tapType === 'swipe') {
          detectedTap.endX = currentTap.endX;
          detectedTap.endY = currentTap.endY;
          detectedTap.direction = direction;
        }

        taps.push(detectedTap);
        currentTap = null;
      }
    }

    // 마지막 탭 처리
    if (currentTap) {
      taps.push({
        frameNumber: currentTap.startFrame,
        timestamp: currentTap.startTime,
        x: currentTap.x,
        y: currentTap.y,
        confidence: 0.8,
        type: 'tap',
      });
    }

    // 더블탭 병합
    return this.mergeDoubleTaps(taps, doubleTapThreshold);
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
   * 연속된 탭을 더블탭으로 병합
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
          Math.pow(next.x - current.x, 2) +
          Math.pow(next.y - current.y, 2)
        );

        // 시간차가 짧고 거리가 가까우면 더블탭
        if (timeDiff <= threshold && distance < 30) {
          merged.push({
            ...current,
            type: 'tap', // doubleTap으로 변경하려면 여기 수정
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
export const tapDetector = new TapDetector();
