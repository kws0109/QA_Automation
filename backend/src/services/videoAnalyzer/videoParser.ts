/**
 * 비디오 파서
 *
 * 비디오 파일에서 프레임을 추출하고 분석합니다.
 * ffmpeg를 사용하여 프레임 추출을 수행합니다.
 *
 * 이 모듈은 격리되어 있어 삭제 시 다른 부분에 영향을 주지 않습니다.
 */

import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import { TapDetector } from './tapDetector';
import { PointerLocationDetector } from './pointerLocationDetector';
import type {
  FrameInfo,
  FrameExtractionOptions,
  VideoAnalysisResult,
  DetectedTap,
  GeneratedScenarioNode,
  ScenarioGenerationOptions,
  ScenarioGenerationResult,
  DetectionMethod,
} from './types';

// ========================================
// 상수 및 기본 설정
// ========================================

const TEMP_DIR = path.join(__dirname, '../../../temp/video-analysis');
const DEFAULT_FPS = 10;

// 임시 폴더 생성
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// 간단한 UUID 생성
function generateId(): string {
  return `node_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// ========================================
// VideoParser 클래스
// ========================================

export class VideoParser extends EventEmitter {
  private tapDetector: TapDetector;
  private pointerDetector: PointerLocationDetector;

  constructor() {
    super();
    this.tapDetector = new TapDetector();
    this.pointerDetector = new PointerLocationDetector();
  }

  /**
   * 비디오 정보 추출
   */
  getVideoInfo(videoPath: string): {
    duration: number;
    fps: number;
    width: number;
    height: number;
    totalFrames: number;
  } | null {
    try {
      // ffprobe로 비디오 정보 추출
      const result = execSync(
        `ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate,nb_frames,duration -of json "${videoPath}"`,
        { encoding: 'utf-8' }
      );

      const data = JSON.parse(result);
      const stream = data.streams?.[0];

      if (!stream) return null;

      // FPS 파싱 (예: "30/1" → 30)
      const fpsMatch = stream.r_frame_rate?.match(/(\d+)\/(\d+)/);
      const fps = fpsMatch
        ? parseInt(fpsMatch[1]) / parseInt(fpsMatch[2])
        : 30;

      const duration = parseFloat(stream.duration) || 0;
      const totalFrames = parseInt(stream.nb_frames) || Math.floor(duration * fps);

      return {
        duration,
        fps,
        width: parseInt(stream.width) || 0,
        height: parseInt(stream.height) || 0,
        totalFrames,
      };
    } catch (error) {
      console.error('[VideoParser] Failed to get video info:', error);
      return null;
    }
  }

  /**
   * 비디오에서 프레임 추출
   */
  async extractFrames(
    videoPath: string,
    outputDir: string,
    options: FrameExtractionOptions = {}
  ): Promise<string[]> {
    const { fps = DEFAULT_FPS, startTime, endTime, width, height } = options;

    // 출력 폴더 생성
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    return new Promise((resolve, reject) => {
      const args: string[] = ['-i', videoPath];

      // 시작/종료 시간
      if (startTime !== undefined) {
        args.push('-ss', startTime.toString());
      }
      if (endTime !== undefined) {
        args.push('-to', endTime.toString());
      }

      // FPS 필터
      let filterComplex = `fps=${fps}`;

      // 리사이즈
      if (width && height) {
        filterComplex += `,scale=${width}:${height}`;
      }

      args.push('-vf', filterComplex);
      args.push('-q:v', '2'); // JPEG 품질
      args.push(path.join(outputDir, 'frame_%05d.jpg'));

      const ffmpeg = spawn('ffmpeg', args);

      let stderr = '';
      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
        // 진행 상황 파싱 (옵션)
        const timeMatch = stderr.match(/time=(\d+):(\d+):(\d+\.\d+)/);
        if (timeMatch) {
          const seconds =
            parseInt(timeMatch[1]) * 3600 +
            parseInt(timeMatch[2]) * 60 +
            parseFloat(timeMatch[3]);
          this.emit('extractProgress', { seconds });
        }
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          // 추출된 프레임 목록 반환
          const frames = fs
            .readdirSync(outputDir)
            .filter((f) => f.endsWith('.jpg'))
            .sort()
            .map((f) => path.join(outputDir, f));
          resolve(frames);
        } else {
          reject(new Error(`ffmpeg exited with code ${code}: ${stderr}`));
        }
      });

      ffmpeg.on('error', reject);
    });
  }

  /**
   * 비디오 분석 (프레임 추출 + 탭 감지)
   */
  async analyzeVideo(
    videoPath: string,
    options: {
      fps?: number;
      doubleTapThreshold?: number;
      longPressThreshold?: number;
      swipeMinDistance?: number;
      detectionMethod?: DetectionMethod;
    } = {}
  ): Promise<VideoAnalysisResult> {
    const startTime = Date.now();
    const videoId = path.basename(videoPath, path.extname(videoPath));
    const outputDir = path.join(TEMP_DIR, videoId);
    const detectionMethod = options.detectionMethod || 'showTaps';

    try {
      // 1. 비디오 정보 추출
      this.emit('progress', { status: 'extracting', progress: 0, step: '비디오 정보 추출 중...' });
      const videoInfo = this.getVideoInfo(videoPath);

      if (!videoInfo) {
        return {
          success: false,
          videoInfo: {
            filename: path.basename(videoPath),
            duration: 0,
            fps: 0,
            width: 0,
            height: 0,
            totalFrames: 0,
          },
          detectedTaps: [],
          stats: {
            analyzedFrames: 0,
            tapCount: 0,
            longPressCount: 0,
            swipeCount: 0,
            processingTime: Date.now() - startTime,
          },
          error: '비디오 정보를 추출할 수 없습니다.',
        };
      }

      // 2. 프레임 추출
      this.emit('progress', { status: 'extracting', progress: 10, step: '프레임 추출 중...' });
      const framePaths = await this.extractFrames(videoPath, outputDir, {
        fps: options.fps || DEFAULT_FPS,
      });

      // 3. 감지 방식에 따라 분기
      let detectedTaps: DetectedTap[];
      const frames: FrameInfo[] = [];

      if (detectionMethod === 'pointerLocation') {
        // 포인터 위치 방식 (OCR + 십자선)
        this.emit('progress', { status: 'analyzing', progress: 30, step: '포인터 위치 감지 중 (OCR)...' });
        
        for (let i = 0; i < framePaths.length; i++) {
          const framePath = framePaths[i];
          const frameBuffer = fs.readFileSync(framePath);
          const timestamp = (i / (options.fps || DEFAULT_FPS)) * 1000;

          frames.push({
            number: i,
            timestamp,
            imagePath: framePath,
            imageBuffer: frameBuffer,
            circles: [],
          });

          if (i % 20 === 0) {
            const progress = 30 + Math.floor((i / framePaths.length) * 30);
            this.emit('progress', {
              status: 'analyzing',
              progress,
              step: `프레임 로드 중... (${i + 1}/${framePaths.length})`,
            });
          }
        }

        this.emit('progress', { status: 'analyzing', progress: 60, step: 'OCR 분석 중...' });
        detectedTaps = await this.pointerDetector.extractTapEvents(frames, {
          doubleTapThreshold: options.doubleTapThreshold,
          longPressThreshold: options.longPressThreshold,
          swipeMinDistance: options.swipeMinDistance,
        });
      } else {
        // 탭한 항목 표시 방식 (원 감지)
        this.emit('progress', { status: 'analyzing', progress: 30, step: '탭 표시기 감지 중...' });
        const totalFrames = framePaths.length;

        for (let i = 0; i < framePaths.length; i++) {
          const framePath = framePaths[i];
          const frameBuffer = fs.readFileSync(framePath);
          const timestamp = (i / (options.fps || DEFAULT_FPS)) * 1000;

          const circles = this.tapDetector.detectTapIndicators(frameBuffer);

          frames.push({
            number: i,
            timestamp,
            imagePath: framePath,
            circles,
          });

          if (i % 10 === 0) {
            const progress = 30 + Math.floor((i / totalFrames) * 60);
            this.emit('progress', {
              status: 'analyzing',
              progress,
              step: `프레임 분석 중... (${i + 1}/${totalFrames})`,
            });
          }
        }

        this.emit('progress', { status: 'generating', progress: 90, step: '탭 이벤트 추출 중...' });
        detectedTaps = this.tapDetector.extractTapEvents(frames, {
          doubleTapThreshold: options.doubleTapThreshold,
          longPressThreshold: options.longPressThreshold,
          swipeMinDistance: options.swipeMinDistance,
        });
      }

      // 5. 통계 계산
      const stats = {
        analyzedFrames: frames.length,
        tapCount: detectedTaps.filter((t) => t.type === 'tap').length,
        longPressCount: detectedTaps.filter((t) => t.type === 'longPress').length,
        swipeCount: detectedTaps.filter((t) => t.type === 'swipe').length,
        processingTime: Date.now() - startTime,
      };

      this.emit('progress', { status: 'completed', progress: 100, step: '완료' });

      return {
        success: true,
        videoInfo: {
          filename: path.basename(videoPath),
          ...videoInfo,
        },
        detectedTaps,
        stats,
      };
    } catch (error) {
      console.error('[VideoParser] Analysis error:', error);
      return {
        success: false,
        videoInfo: {
          filename: path.basename(videoPath),
          duration: 0,
          fps: 0,
          width: 0,
          height: 0,
          totalFrames: 0,
        },
        detectedTaps: [],
        stats: {
          analyzedFrames: 0,
          tapCount: 0,
          longPressCount: 0,
          swipeCount: 0,
          processingTime: Date.now() - startTime,
        },
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * 감지된 탭을 시나리오 노드로 변환
   */
  generateScenario(
    detectedTaps: DetectedTap[],
    frames: FrameInfo[],
    options: ScenarioGenerationOptions = {}
  ): ScenarioGenerationResult {
    const {
      insertWaitSteps = true,
      waitRegion = { offsetX: 0, offsetY: -100, width: 200, height: 100 },
    } = options;

    try {
      const nodes: GeneratedScenarioNode[] = [];
      const edges: Array<{ id: string; source: string; target: string }> = [];

      let prevNodeId = 'start';

      for (let i = 0; i < detectedTaps.length; i++) {
        const tap = detectedTaps[i];

        // waitUntilImage 노드 삽입 (첫 번째 탭 제외)
        if (insertWaitSteps && i > 0 && frames.length > 0) {
          // 탭 직전 프레임에서 대기 조건용 스크린샷 추출
          const frameIndex = frames.findIndex((f) => f.timestamp >= tap.timestamp) - 1;
          if (frameIndex >= 0 && frames[frameIndex].imagePath) {
            const waitNode: GeneratedScenarioNode = {
              id: generateId(),
              action: 'waitUntilImage',
              label: `화면 대기 (${i})`,
              templateDescription: `탭 ${i} 이전 화면 상태`,
              timestamp: tap.timestamp - 100,
              confidence: 0.7,
            };

            nodes.push(waitNode);
            edges.push({
              id: `${prevNodeId}-${waitNode.id}`,
              source: prevNodeId,
              target: waitNode.id,
            });
            prevNodeId = waitNode.id;
          }
        }

        // 탭 노드 생성
        const tapNode: GeneratedScenarioNode = {
          id: generateId(),
          action: tap.type,
          label: `${this.getActionLabel(tap.type)} (${tap.x}, ${tap.y})`,
          x: tap.x,
          y: tap.y,
          timestamp: tap.timestamp,
          confidence: tap.confidence,
        };

        if (tap.type === 'swipe') {
          tapNode.startX = tap.x;
          tapNode.startY = tap.y;
          tapNode.endX = tap.endX;
          tapNode.endY = tap.endY;
          tapNode.direction = tap.direction;
          tapNode.label = `스와이프 ${tap.direction} (${tap.x}, ${tap.y}) → (${tap.endX}, ${tap.endY})`;
        }

        nodes.push(tapNode);
        edges.push({
          id: `${prevNodeId}-${tapNode.id}`,
          source: prevNodeId,
          target: tapNode.id,
        });
        prevNodeId = tapNode.id;
      }

      // 통계
      const summary = {
        totalNodes: nodes.length,
        tapNodes: nodes.filter((n) => n.action === 'tap' || n.action === 'longPress').length,
        waitNodes: nodes.filter((n) => n.action === 'waitUntilImage').length,
        swipeNodes: nodes.filter((n) => n.action === 'swipe').length,
      };

      return {
        success: true,
        nodes,
        edges,
        summary,
      };
    } catch (error) {
      return {
        success: false,
        nodes: [],
        edges: [],
        summary: {
          totalNodes: 0,
          tapNodes: 0,
          waitNodes: 0,
          swipeNodes: 0,
        },
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * 액션 라벨 생성
   */
  private getActionLabel(type: 'tap' | 'longPress' | 'swipe' | 'doubleTap'): string {
    const labels: Record<string, string> = {
      tap: '탭',
      doubleTap: '더블탭',
      longPress: '길게 누르기',
      swipe: '스와이프',
    };
    return labels[type] || type;
  }

  /**
   * 임시 파일 정리
   */
  cleanupTempFiles(videoId: string): void {
    const dir = path.join(TEMP_DIR, videoId);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  /**
   * 모든 임시 파일 정리
   */
  cleanupAllTempFiles(): void {
    if (fs.existsSync(TEMP_DIR)) {
      fs.rmSync(TEMP_DIR, { recursive: true, force: true });
      fs.mkdirSync(TEMP_DIR, { recursive: true });
    }
  }
}

// 싱글톤 인스턴스
export const videoParser = new VideoParser();
