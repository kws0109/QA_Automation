// backend/src/services/screenshotService.ts
// WiFi ADB 최적화를 위한 순차 폴링 기반 스크린샷 서비스

import { Server as SocketIOServer } from 'socket.io';
import { eventEmitter, SCREENSHOT_EVENTS } from '../events';
import { sessionManager } from './sessionManager';

// 스크린샷 캐시 데이터
export interface ScreenshotCache {
  deviceId: string;
  image: string;      // base64
  timestamp: Date;
  width: number;
  height: number;
}

// 폴링 설정
export interface PollingConfig {
  intervalMs: number;       // 디바이스당 폴링 간격 (기본: 500ms)
  maxConcurrent: number;    // 동시 캡처 수 (기본: 1, 순차 처리)
  cacheMaxAge: number;      // 캐시 유효 시간 (기본: 10000ms)
}

// 기본 설정
const DEFAULT_CONFIG: PollingConfig = {
  intervalMs: 500,
  maxConcurrent: 1,
  cacheMaxAge: 10000,
};

class ScreenshotService {
  private io: SocketIOServer | null = null;
  private cache: Map<string, ScreenshotCache> = new Map();
  private subscribers: Set<string> = new Set();  // 구독 중인 deviceIds
  private pollingTimer: NodeJS.Timeout | null = null;
  private deviceQueue: string[] = [];  // 폴링 큐
  private currentIndex = 0;
  private config: PollingConfig = DEFAULT_CONFIG;
  private isPolling = false;
  private activeClients = 0;  // 연결된 클라이언트 수

  /**
   * Socket.IO 서버 설정
   * @deprecated eventEmitter를 사용하세요. 하위 호환성을 위해 유지됩니다.
   */
  setSocketIO(io: SocketIOServer): void {
    this.io = io;
    console.log('📸 [ScreenshotService] Socket.IO 연결됨');
  }

  /**
   * 폴링 설정 변경
   */
  setConfig(config: Partial<PollingConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('📸 [ScreenshotService] 설정 변경:', this.config);
  }

  /**
   * 디바이스 구독 추가
   */
  subscribe(deviceIds: string[]): void {
    const newDevices: string[] = [];

    for (const deviceId of deviceIds) {
      if (!this.subscribers.has(deviceId)) {
        this.subscribers.add(deviceId);
        newDevices.push(deviceId);
      }
    }

    if (newDevices.length > 0) {
      console.log(`📸 [ScreenshotService] 구독 추가: ${newDevices.join(', ')}`);
      this.updateQueue();
    }
  }

  /**
   * 디바이스 구독 해제
   */
  unsubscribe(deviceIds: string[]): void {
    const removed: string[] = [];

    for (const deviceId of deviceIds) {
      if (this.subscribers.delete(deviceId)) {
        removed.push(deviceId);
        this.cache.delete(deviceId);
      }
    }

    if (removed.length > 0) {
      console.log(`📸 [ScreenshotService] 구독 해제: ${removed.join(', ')}`);
      this.updateQueue();
    }
  }

  /**
   * 모든 구독 해제
   */
  unsubscribeAll(): void {
    this.subscribers.clear();
    this.cache.clear();
    this.deviceQueue = [];
    console.log('📸 [ScreenshotService] 모든 구독 해제');
  }

  /**
   * 클라이언트 연결
   */
  addClient(): void {
    this.activeClients++;
    console.log(`📸 [ScreenshotService] 클라이언트 연결 (총 ${this.activeClients}개)`);

    // 첫 클라이언트 연결 시 폴링 시작
    if (this.activeClients === 1 && this.subscribers.size > 0) {
      this.startPolling();
    }
  }

  /**
   * 클라이언트 연결 해제
   */
  removeClient(): void {
    this.activeClients = Math.max(0, this.activeClients - 1);
    console.log(`📸 [ScreenshotService] 클라이언트 연결 해제 (총 ${this.activeClients}개)`);

    // 모든 클라이언트 종료 시 폴링 중지
    if (this.activeClients === 0) {
      this.stopPolling();
    }
  }

  /**
   * 폴링 큐 업데이트
   */
  private updateQueue(): void {
    this.deviceQueue = Array.from(this.subscribers);
    this.currentIndex = 0;

    if (this.deviceQueue.length > 0 && this.activeClients > 0 && !this.isPolling) {
      this.startPolling();
    } else if (this.deviceQueue.length === 0) {
      this.stopPolling();
    }
  }

  /**
   * 폴링 시작
   */
  startPolling(): void {
    if (this.isPolling) return;
    if (this.deviceQueue.length === 0) return;

    this.isPolling = true;
    console.log(`📸 [ScreenshotService] 폴링 시작 (${this.deviceQueue.length}대, ${this.config.intervalMs}ms 간격)`);

    this.poll();
  }

  /**
   * 폴링 중지
   */
  stopPolling(): void {
    if (!this.isPolling) return;

    this.isPolling = false;
    if (this.pollingTimer) {
      clearTimeout(this.pollingTimer);
      this.pollingTimer = null;
    }
    console.log('📸 [ScreenshotService] 폴링 중지');
  }

  /**
   * 다음 디바이스 폴링
   */
  private async poll(): Promise<void> {
    if (!this.isPolling || this.deviceQueue.length === 0) return;

    const deviceId = this.deviceQueue[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.deviceQueue.length;

    try {
      await this.captureAndEmit(deviceId);
    } catch (error) {
      const err = error as Error;
      console.error(`📸 [ScreenshotService] 캡처 실패 (${deviceId}):`, err.message);

      // 에러 이벤트 전송
      eventEmitter.emitToRoom('screenshot-room', SCREENSHOT_EVENTS.ERROR, {
        deviceId,
        error: err.message,
        timestamp: new Date().toISOString(),
      });
    }

    // 다음 폴링 예약
    if (this.isPolling) {
      this.pollingTimer = setTimeout(() => this.poll(), this.config.intervalMs);
    }
  }

  /**
   * 스크린샷 캡처 및 전송
   */
  private async captureAndEmit(deviceId: string): Promise<void> {
    // 세션 확인
    const driver = sessionManager.getDriver(deviceId);
    if (!driver) {
      throw new Error('세션 없음');
    }

    // 스크린샷 캡처
    const screenshot = await driver.takeScreenshot();
    const image = screenshot.startsWith('data:')
      ? screenshot
      : `data:image/png;base64,${screenshot}`;

    // 화면 크기 조회 (캐시된 값 사용 가능)
    let width = 1080;
    let height = 1920;
    try {
      const size = await driver.getWindowSize();
      width = size.width;
      height = size.height;
    } catch {
      // 크기 조회 실패 시 기본값 사용
    }

    // 캐시 업데이트
    const cacheData: ScreenshotCache = {
      deviceId,
      image,
      timestamp: new Date(),
      width,
      height,
    };
    this.cache.set(deviceId, cacheData);

    // Socket.IO로 전송
    eventEmitter.emitToRoom('screenshot-room', SCREENSHOT_EVENTS.UPDATE, {
      deviceId,
      image,
      timestamp: cacheData.timestamp.toISOString(),
      width,
      height,
    });
  }

  /**
   * 특정 디바이스의 최신 캐시 조회
   */
  getLatest(deviceId: string): ScreenshotCache | null {
    const cached = this.cache.get(deviceId);
    if (!cached) return null;

    // 캐시 유효성 검사
    const age = Date.now() - cached.timestamp.getTime();
    if (age > this.config.cacheMaxAge) {
      return null;
    }

    return cached;
  }

  /**
   * 모든 캐시된 스크린샷 조회
   */
  getAllLatest(): Map<string, ScreenshotCache> {
    const result = new Map<string, ScreenshotCache>();
    const now = Date.now();

    for (const [deviceId, cached] of this.cache) {
      const age = now - cached.timestamp.getTime();
      if (age <= this.config.cacheMaxAge) {
        result.set(deviceId, cached);
      }
    }

    return result;
  }

  /**
   * 즉시 스크린샷 캡처 (단일 디바이스)
   */
  async captureNow(deviceId: string): Promise<ScreenshotCache> {
    const driver = sessionManager.getDriver(deviceId);
    if (!driver) {
      throw new Error('세션이 없습니다');
    }

    const screenshot = await driver.takeScreenshot();
    const image = screenshot.startsWith('data:')
      ? screenshot
      : `data:image/png;base64,${screenshot}`;

    let width = 1080;
    let height = 1920;
    try {
      const size = await driver.getWindowSize();
      width = size.width;
      height = size.height;
    } catch {
      // 기본값 사용
    }

    const cacheData: ScreenshotCache = {
      deviceId,
      image,
      timestamp: new Date(),
      width,
      height,
    };
    this.cache.set(deviceId, cacheData);

    return cacheData;
  }

  /**
   * 현재 상태 조회
   */
  getStatus(): {
    isPolling: boolean;
    subscribers: string[];
    cacheSize: number;
    activeClients: number;
    config: PollingConfig;
  } {
    return {
      isPolling: this.isPolling,
      subscribers: Array.from(this.subscribers),
      cacheSize: this.cache.size,
      activeClients: this.activeClients,
      config: this.config,
    };
  }
}

export const screenshotService = new ScreenshotService();
export default screenshotService;
