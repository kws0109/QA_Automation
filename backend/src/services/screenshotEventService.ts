/**
 * 스크린샷 이벤트 서비스
 * - 이미지 매칭 성공 시 하이라이트 스크린샷 저장을 이벤트 기반으로 처리
 * - 디바이스별 큐로 병렬 처리 및 메모리 관리
 */

import { EventEmitter } from 'events';
import fs from 'fs/promises';
import path from 'path';

// 상수
const SCREENSHOTS_DIR = path.join(__dirname, '../../reports/screenshots');
const MAX_QUEUE_PER_DEVICE = 10;  // 디바이스당 최대 큐 크기

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

// OCR 텍스트 매칭 이벤트 타입
export interface TextMatchEvent {
  deviceId: string;
  nodeId: string;
  searchText: string;
  foundText: string;
  confidence: number;
  highlightedBuffer: Buffer;
  matchRegion: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  centerX: number;
  centerY: number;
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
 * 디바이스별 스크린샷 저장 큐
 * - 디바이스당 동시 저장 1개
 * - 큐 최대 크기 제한으로 메모리 보호
 * - fire-and-forget 방식으로 단순화
 */
class DeviceScreenshotQueue {
  private queue: ScreenshotSaveTask[] = [];
  private isProcessing = false;
  private readonly deviceId: string;
  private readonly maxQueueSize: number;
  private readonly onSaveComplete: (result: ScreenshotSaveResult & { task: ScreenshotSaveTask }) => void;

  constructor(
    deviceId: string,
    onSaveComplete: (result: ScreenshotSaveResult & { task: ScreenshotSaveTask }) => void,
    maxQueueSize: number = MAX_QUEUE_PER_DEVICE
  ) {
    this.deviceId = deviceId;
    this.onSaveComplete = onSaveComplete;
    this.maxQueueSize = maxQueueSize;
  }

  /**
   * 작업 추가 (fire-and-forget)
   */
  enqueue(task: ScreenshotSaveTask): boolean {
    // 큐 초과 시 드롭
    if (this.queue.length >= this.maxQueueSize) {
      console.warn(`[DeviceQueue:${this.deviceId}] 큐 초과 (${this.queue.length}/${this.maxQueueSize}) - 스크린샷 드롭: ${task.nodeId}`);
      // Buffer 즉시 해제
      task.buffer = null;
      return false;
    }

    this.queue.push(task);
    this.processNext();
    return true;
  }

  /**
   * 다음 작업 처리
   */
  private async processNext(): Promise<void> {
    // 이미 처리 중이거나 큐가 비어있으면 스킵
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;
    const task = this.queue.shift()!;

    try {
      const result = await this.saveToFile(task);
      this.onSaveComplete({ ...result, task });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`[DeviceQueue:${this.deviceId}] 저장 실패:`, errorMessage);
      this.onSaveComplete({
        success: false,
        error: errorMessage,
        task,
      });
    } finally {
      // Buffer 해제 유도
      task.buffer = null;
      this.isProcessing = false;

      // 다음 작업 처리
      if (this.queue.length > 0) {
        // setImmediate로 스택 오버플로우 방지
        setImmediate(() => this.processNext());
      }
    }
  }

  /**
   * 파일로 저장
   */
  private async saveToFile(task: ScreenshotSaveTask): Promise<ScreenshotSaveResult> {
    if (!task.buffer) {
      return { success: false, error: 'Buffer is null' };
    }

    // deviceId에 콜론(:)이 포함될 수 있음 - Windows 경로 호환성
    const safeDeviceId = task.deviceId.replace(/[^a-zA-Z0-9.-]/g, '_');
    const screenshotDir = path.join(SCREENSHOTS_DIR, task.reportId, safeDeviceId);

    // 디렉토리 생성
    await fs.mkdir(screenshotDir, { recursive: true });

    // 파일명 생성
    const safeTimestamp = task.timestamp.replace(/[:.]/g, '-');
    const filename = `${task.nodeId}_highlight_${safeTimestamp}.png`;
    const filepath = path.join(screenshotDir, filename);

    // 파일 저장
    await fs.writeFile(filepath, task.buffer);

    const relativePath = `screenshots/${task.reportId}/${safeDeviceId}/${filename}`;

    console.log(`[DeviceQueue:${this.deviceId}] 하이라이트 스크린샷 저장: ${relativePath}`);

    return {
      success: true,
      path: relativePath,
    };
  }

  get pendingCount(): number {
    return this.queue.length;
  }

  get processing(): boolean {
    return this.isProcessing;
  }

  /**
   * 큐 정리 (디바이스 컨텍스트 해제 시)
   */
  clear(): void {
    // 남은 Buffer들 해제
    for (const task of this.queue) {
      task.buffer = null;
    }
    this.queue = [];
    console.log(`[DeviceQueue:${this.deviceId}] 큐 정리 완료`);
  }
}

/**
 * 이미지 매칭 이벤트 이미터
 * - Actions에서 emit, testExecutor에서 listen
 * - 디바이스별 큐로 병렬 처리
 */
class ImageMatchEventEmitter extends EventEmitter {
  private static instance: ImageMatchEventEmitter;
  private reportContextMap: Map<string, string> = new Map(); // deviceId -> reportId
  private deviceQueues: Map<string, DeviceScreenshotQueue> = new Map(); // deviceId -> Queue

  private constructor() {
    super();
    this.setMaxListeners(100); // 50대 디바이스 × 2 (여유)
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
   * - 디바이스별 큐 생성
   */
  registerContext(deviceId: string, reportId: string): void {
    this.reportContextMap.set(deviceId, reportId);

    // 디바이스별 큐 생성 (없으면)
    if (!this.deviceQueues.has(deviceId)) {
      const queue = new DeviceScreenshotQueue(
        deviceId,
        (result) => this.handleSaveComplete(deviceId, result)
      );
      this.deviceQueues.set(deviceId, queue);
    }

    console.log(`[ImageMatchEmitter] 컨텍스트 등록: ${deviceId} -> ${reportId}`);
  }

  /**
   * 실행 컨텍스트 해제
   */
  unregisterContext(deviceId: string): void {
    this.reportContextMap.delete(deviceId);

    // 디바이스 큐 정리
    const queue = this.deviceQueues.get(deviceId);
    if (queue) {
      queue.clear();
      this.deviceQueues.delete(deviceId);
    }

    console.log(`[ImageMatchEmitter] 컨텍스트 해제: ${deviceId}`);
  }

  /**
   * 저장 완료 핸들러
   */
  private handleSaveComplete(
    deviceId: string,
    result: ScreenshotSaveResult & { task: ScreenshotSaveTask }
  ): void {
    if (result.success && result.path) {
      // 저장 성공 이벤트 발생 (testExecutor에서 리포트에 추가)
      this.emit('screenshot:saved', {
        deviceId,
        nodeId: result.task.nodeId,
        templateId: result.task.templateId,
        confidence: result.task.confidence,
        path: result.path,
        timestamp: result.task.timestamp,
        type: 'highlight' as const,
      });
    } else {
      console.warn(`[ImageMatchEmitter] 스크린샷 저장 실패 (${deviceId}): ${result.error}`);
    }
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

    const queue = this.deviceQueues.get(event.deviceId);
    if (!queue) {
      console.warn(`[ImageMatchEmitter] 큐 없음 (deviceId: ${event.deviceId}) - 스크린샷 저장 스킵`);
      return;
    }

    console.log(`[ImageMatchEmitter] 매칭 성공 이벤트: ${event.deviceId}/${event.nodeId} (confidence: ${(event.confidence * 100).toFixed(1)}%)`);

    // 디바이스 큐에 추가 (fire-and-forget)
    queue.enqueue({
      reportId,
      deviceId: event.deviceId,
      nodeId: event.nodeId,
      templateId: event.templateId,
      confidence: event.confidence,
      buffer: event.highlightedBuffer,
      timestamp: event.timestamp,
    });
  }

  /**
   * OCR 텍스트 매칭 성공 이벤트 발생 (Actions에서 호출)
   */
  emitTextMatchSuccess(event: TextMatchEvent): void {
    const reportId = this.reportContextMap.get(event.deviceId);

    if (!reportId) {
      console.warn(`[ImageMatchEmitter] reportId 없음 (deviceId: ${event.deviceId}) - OCR 스크린샷 저장 스킵`);
      return;
    }

    const queue = this.deviceQueues.get(event.deviceId);
    if (!queue) {
      console.warn(`[ImageMatchEmitter] 큐 없음 (deviceId: ${event.deviceId}) - OCR 스크린샷 저장 스킵`);
      return;
    }

    console.log(`[ImageMatchEmitter] OCR 매칭 성공 이벤트: ${event.deviceId}/${event.nodeId} 텍스트: "${event.foundText}" (confidence: ${(event.confidence * 100).toFixed(1)}%)`);

    // 디바이스 큐에 추가 (fire-and-forget)
    // templateId 대신 searchText를 사용 (OCR은 템플릿이 없음)
    queue.enqueue({
      reportId,
      deviceId: event.deviceId,
      nodeId: event.nodeId,
      templateId: `ocr:${event.searchText}`, // OCR 텍스트 표시
      confidence: event.confidence,
      buffer: event.highlightedBuffer,
      timestamp: event.timestamp,
    });
  }


  /**
   * 디바이스 매칭 성공 이벤트 발생 (디바이스에서 생성된 하이라이트 이미지용)
   * - 이미 로컬에 저장된 하이라이트 이미지 경로를 직접 이벤트로 발송
   * - 버퍼 저장 과정 없이 바로 screenshot:saved 이벤트 발생
   */
  emitDeviceMatchSuccess(event: {
    deviceId: string;
    nodeId: string;
    templateId: string;
    confidence: number;
    highlightPath: string;  // 이미 저장된 로컬 파일 경로 (상대 경로)
    timestamp: string;
  }): void {
    const reportId = this.reportContextMap.get(event.deviceId);

    if (!reportId) {
      console.warn(`[ImageMatchEmitter] reportId 없음 (deviceId: ${event.deviceId}) - 디바이스 하이라이트 이벤트 스킵`);
      return;
    }

    console.log(`[ImageMatchEmitter] 디바이스 매칭 성공: ${event.deviceId}/${event.nodeId} (confidence: ${(event.confidence * 100).toFixed(1)}%, path: ${event.highlightPath})`);

    // 직접 screenshot:saved 이벤트 발생 (버퍼 저장 과정 스킵)
    this.emit('screenshot:saved', {
      deviceId: event.deviceId,
      nodeId: event.nodeId,
      templateId: event.templateId,
      confidence: event.confidence,
      path: event.highlightPath,
      timestamp: event.timestamp,
      type: 'highlight' as const,
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
    deviceQueueStats: Array<{
      deviceId: string;
      pending: number;
      processing: boolean;
    }>;
  } {
    const deviceQueueStats: Array<{
      deviceId: string;
      pending: number;
      processing: boolean;
    }> = [];

    for (const [deviceId, queue] of this.deviceQueues) {
      deviceQueueStats.push({
        deviceId,
        pending: queue.pendingCount,
        processing: queue.processing,
      });
    }

    return {
      registeredDevices: this.reportContextMap.size,
      deviceQueueStats,
    };
  }
}

// 싱글톤 인스턴스 export
export const imageMatchEmitter = ImageMatchEventEmitter.getInstance();

export default imageMatchEmitter;
