/**
 * 스크린샷 이벤트 서비스
 * - 이미지 매칭 성공 시 하이라이트 스크린샷 저장을 이벤트 기반으로 처리
 * - 메모리 관리를 위한 저장 큐 포함
 */

import { EventEmitter } from 'events';
import fs from 'fs/promises';
import path from 'path';

// 상수
const SCREENSHOTS_DIR = path.join(__dirname, '../../reports/screenshots');
const MAX_CONCURRENT_SAVES = 2;

// 타입 정의
export interface ImageMatchEvent {
  deviceId: string;
  nodeId: string;
  templateId: string;
  confidence: number;
  highlightedBuffer: Buffer;
  matchRegion: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  timestamp: string;
}

export interface ScreenshotSaveTask {
  reportId: string;
  deviceId: string;
  nodeId: string;
  templateId: string;
  confidence: number;
  buffer: Buffer | null;
  timestamp: string;
}

export interface ScreenshotSaveResult {
  success: boolean;
  path?: string;
  error?: string;
}

/**
 * 스크린샷 저장 큐
 * - 동시 저장 수 제한으로 메모리 스파이크 방지
 * - 저장 완료 후 Buffer 즉시 해제
 */
class ScreenshotSaveQueue {
  private queue: ScreenshotSaveTask[] = [];
  private activeCount = 0;
  private readonly maxConcurrent: number;

  constructor(maxConcurrent: number = MAX_CONCURRENT_SAVES) {
    this.maxConcurrent = maxConcurrent;
  }

  async enqueue(task: ScreenshotSaveTask, reportId: string): Promise<ScreenshotSaveResult> {
    return new Promise((resolve) => {
      const taskWithCallback = {
        ...task,
        reportId,
        resolve,
      };
      this.queue.push(task);
      this.processNext(reportId, resolve);
    });
  }

  private async processNext(
    reportId: string,
    resolve: (result: ScreenshotSaveResult) => void
  ): Promise<void> {
    if (this.activeCount >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    const task = this.queue.shift();
    if (!task || !task.buffer) {
      resolve({ success: false, error: 'No buffer to save' });
      return;
    }

    this.activeCount++;

    try {
      const result = await this.saveToFile(task, reportId);
      resolve(result);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`[ScreenshotQueue] 저장 실패:`, errorMessage);
      resolve({ success: false, error: errorMessage });
    } finally {
      // Buffer 해제 유도
      task.buffer = null;
      this.activeCount--;

      // 다음 작업 처리 (있다면)
      if (this.queue.length > 0) {
        const nextTask = this.queue[0];
        this.processNext(reportId, () => {});
      }
    }
  }

  private async saveToFile(
    task: ScreenshotSaveTask,
    reportId: string
  ): Promise<ScreenshotSaveResult> {
    if (!task.buffer) {
      return { success: false, error: 'Buffer is null' };
    }

    // deviceId에 콜론(:)이 포함될 수 있음 - Windows 경로 호환성
    const safeDeviceId = task.deviceId.replace(/[^a-zA-Z0-9.-]/g, '_');
    const screenshotDir = path.join(SCREENSHOTS_DIR, reportId, safeDeviceId);

    // 디렉토리 생성
    await fs.mkdir(screenshotDir, { recursive: true });

    // 파일명 생성
    const safeTimestamp = task.timestamp.replace(/[:.]/g, '-');
    const filename = `${task.nodeId}_highlight_${safeTimestamp}.png`;
    const filepath = path.join(screenshotDir, filename);

    // 파일 저장
    await fs.writeFile(filepath, task.buffer);

    const relativePath = `screenshots/${reportId}/${safeDeviceId}/${filename}`;

    console.log(`[ScreenshotQueue] 하이라이트 스크린샷 저장: ${relativePath}`);

    return {
      success: true,
      path: relativePath,
    };
  }

  get pendingCount(): number {
    return this.queue.length;
  }

  get activeTaskCount(): number {
    return this.activeCount;
  }
}

/**
 * 이미지 매칭 이벤트 이미터
 * - Actions에서 emit, testExecutor에서 listen
 */
class ImageMatchEventEmitter extends EventEmitter {
  private static instance: ImageMatchEventEmitter;
  private saveQueue: ScreenshotSaveQueue;
  private reportContextMap: Map<string, string> = new Map(); // deviceId -> reportId

  private constructor() {
    super();
    this.saveQueue = new ScreenshotSaveQueue();
    this.setMaxListeners(50); // 50대 디바이스 지원
  }

  static getInstance(): ImageMatchEventEmitter {
    if (!ImageMatchEventEmitter.instance) {
      ImageMatchEventEmitter.instance = new ImageMatchEventEmitter();
    }
    return ImageMatchEventEmitter.instance;
  }

  /**
   * 실행 컨텍스트 등록 (testExecutor에서 호출)
   * - deviceId와 reportId 매핑
   */
  registerContext(deviceId: string, reportId: string): void {
    this.reportContextMap.set(deviceId, reportId);
    console.log(`[ImageMatchEmitter] 컨텍스트 등록: ${deviceId} -> ${reportId}`);
  }

  /**
   * 실행 컨텍스트 해제
   */
  unregisterContext(deviceId: string): void {
    this.reportContextMap.delete(deviceId);
    console.log(`[ImageMatchEmitter] 컨텍스트 해제: ${deviceId}`);
  }

  /**
   * 이미지 매칭 성공 이벤트 발생 (Actions에서 호출)
   */
  emitMatchSuccess(event: ImageMatchEvent): void {
    const reportId = this.reportContextMap.get(event.deviceId);

    if (!reportId) {
      console.warn(`[ImageMatchEmitter] reportId 없음 (deviceId: ${event.deviceId}) - 스크린샷 저장 스킵`);
      return;
    }

    console.log(`[ImageMatchEmitter] 매칭 성공 이벤트: ${event.deviceId}/${event.nodeId} (confidence: ${(event.confidence * 100).toFixed(1)}%)`);

    // 비동기로 저장 큐에 추가 (fire-and-forget)
    this.saveQueue.enqueue(
      {
        reportId,
        deviceId: event.deviceId,
        nodeId: event.nodeId,
        templateId: event.templateId,
        confidence: event.confidence,
        buffer: event.highlightedBuffer,
        timestamp: event.timestamp,
      },
      reportId
    ).then((result) => {
      if (result.success) {
        // 저장 성공 이벤트 발생 (testExecutor에서 리포트에 추가)
        this.emit('screenshot:saved', {
          deviceId: event.deviceId,
          nodeId: event.nodeId,
          templateId: event.templateId,
          confidence: event.confidence,
          path: result.path,
          timestamp: event.timestamp,
          type: 'highlight',
        });
      } else {
        console.warn(`[ImageMatchEmitter] 스크린샷 저장 실패: ${result.error}`);
      }
    }).catch((err) => {
      console.error(`[ImageMatchEmitter] 스크린샷 저장 오류:`, err);
    });
  }

  /**
   * 스크린샷 저장 완료 리스너 등록
   */
  onScreenshotSaved(
    callback: (data: {
      deviceId: string;
      nodeId: string;
      templateId: string;
      confidence: number;
      path: string;
      timestamp: string;
      type: 'highlight';
    }) => void
  ): void {
    this.on('screenshot:saved', callback);
  }

  /**
   * 리스너 해제
   */
  offScreenshotSaved(
    callback: (data: {
      deviceId: string;
      nodeId: string;
      templateId: string;
      confidence: number;
      path: string;
      timestamp: string;
      type: 'highlight';
    }) => void
  ): void {
    this.off('screenshot:saved', callback);
  }

  /**
   * 상태 조회
   */
  getStatus(): {
    registeredDevices: number;
    pendingSaves: number;
    activeSaves: number;
  } {
    return {
      registeredDevices: this.reportContextMap.size,
      pendingSaves: this.saveQueue.pendingCount,
      activeSaves: this.saveQueue.activeTaskCount,
    };
  }
}

// 싱글톤 인스턴스 export
export const imageMatchEmitter = ImageMatchEventEmitter.getInstance();

export default imageMatchEmitter;
