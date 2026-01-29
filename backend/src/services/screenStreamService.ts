// backend/src/services/screenStreamService.ts
// ADB screencap 기반 WebSocket 스크린 스트리밍 서비스

import { WebSocket, WebSocketServer } from 'ws';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as http from 'http';
import sharp from 'sharp';
import { createLogger } from '../utils/logger';

const execAsync = promisify(exec);
const logger = createLogger('ScreenStreamService');

// deviceId 검증용 정규식 (ADB device ID 형식)
// 허용: 영문, 숫자, 점, 밑줄, 콜론, 하이픈
// 예: "emulator-5554", "192.168.1.100:5555", "R3CN90XXXXX"
const DEVICE_ID_REGEX = /^[a-zA-Z0-9._:-]+$/;

interface DeviceStream {
  deviceId: string;
  clients: Set<WebSocket>;
  isStreaming: boolean;
  isCapturing: boolean;  // 캡처 중 플래그 (큐 누적 방지)
  intervalId: ReturnType<typeof setInterval> | null;
  lastFrame: Buffer | null;
  frameCount: number;
  errorCount: number;
}

interface StreamOptions {
  fps?: number;        // 프레임레이트 (기본: 10)
  quality?: number;    // JPEG 품질 0-100 (기본: 70)
  scale?: number;      // 스케일 0.1-1.0 (기본: 0.5)
}

const DEFAULT_OPTIONS: Required<StreamOptions> = {
  fps: 10,
  quality: 70,
  scale: 0.5,
};

class ScreenStreamService {
  private wss: WebSocketServer | null = null;
  private streams: Map<string, DeviceStream> = new Map();
  private options: Required<StreamOptions> = DEFAULT_OPTIONS;

  /**
   * WebSocket 서버 초기화
   */
  initialize(server: http.Server): void {
    this.wss = new WebSocketServer({
      server,
      path: '/ws/screen',
    });

    this.wss.on('connection', (ws, req) => {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const deviceId = url.searchParams.get('deviceId');

      if (!deviceId) {
        logger.warn('WebSocket 연결 거부: deviceId 없음');
        ws.close(4000, 'deviceId required');
        return;
      }

      // deviceId 형식 검증 (Command Injection 방지)
      if (!DEVICE_ID_REGEX.test(deviceId)) {
        logger.warn(`WebSocket 연결 거부: 잘못된 deviceId 형식: ${deviceId}`);
        ws.close(4001, 'Invalid deviceId format');
        return;
      }

      logger.info(`[${deviceId}] WebSocket 클라이언트 연결`);
      this.addClient(deviceId, ws);

      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message.toString());
          this.handleMessage(deviceId, ws, data);
        } catch (err) {
          logger.warn(`[${deviceId}] 잘못된 메시지 형식`);
        }
      });

      ws.on('close', () => {
        logger.info(`[${deviceId}] WebSocket 클라이언트 연결 해제`);
        this.removeClient(deviceId, ws);
      });

      ws.on('error', (err) => {
        logger.error(`[${deviceId}] WebSocket 에러`, err);
        this.removeClient(deviceId, ws);
      });
    });

    logger.info('ScreenStreamService WebSocket 서버 초기화 완료 (path: /ws/screen)');
  }

  /**
   * 클라이언트 메시지 처리
   */
  private handleMessage(deviceId: string, ws: WebSocket, data: { type: string; payload?: StreamOptions }): void {
    switch (data.type) {
      case 'start':
        this.startStream(deviceId, data.payload);
        break;
      case 'stop':
        this.stopStream(deviceId);
        break;
      case 'options':
        if (data.payload) {
          this.updateOptions(deviceId, data.payload);
        }
        break;
      default:
        logger.warn(`[${deviceId}] 알 수 없는 메시지 타입: ${data.type}`);
    }
  }

  /**
   * 클라이언트 추가
   */
  private addClient(deviceId: string, ws: WebSocket): void {
    let stream = this.streams.get(deviceId);

    if (!stream) {
      stream = {
        deviceId,
        clients: new Set(),
        isStreaming: false,
        isCapturing: false,
        intervalId: null,
        lastFrame: null,
        frameCount: 0,
        errorCount: 0,
      };
      this.streams.set(deviceId, stream);
    }

    stream.clients.add(ws);

    // 마지막 프레임이 있으면 즉시 전송 (빠른 초기 렌더링)
    if (stream.lastFrame) {
      this.sendFrame(ws, stream.lastFrame);
    }
  }

  /**
   * 클라이언트 제거
   */
  private removeClient(deviceId: string, ws: WebSocket): void {
    const stream = this.streams.get(deviceId);
    if (!stream) return;

    stream.clients.delete(ws);

    // 클라이언트가 없으면 스트림 중지
    if (stream.clients.size === 0) {
      this.stopStream(deviceId);
      this.streams.delete(deviceId);
    }
  }

  /**
   * 스트림 시작
   */
  startStream(deviceId: string, options?: StreamOptions): void {
    const stream = this.streams.get(deviceId);
    if (!stream) return;

    if (stream.isStreaming) {
      logger.info(`[${deviceId}] 이미 스트리밍 중`);
      return;
    }

    const opts = { ...this.options, ...options };
    const interval = Math.floor(1000 / opts.fps);

    stream.isStreaming = true;
    stream.errorCount = 0;
    stream.frameCount = 0;

    logger.info(`[${deviceId}] 스트림 시작 (fps: ${opts.fps}, quality: ${opts.quality}, scale: ${opts.scale})`);

    // 즉시 첫 프레임 캡처
    this.captureAndBroadcast(deviceId, opts);

    // 주기적 캡처 시작
    stream.intervalId = setInterval(() => {
      this.captureAndBroadcast(deviceId, opts);
    }, interval);
  }

  /**
   * 스트림 중지
   */
  stopStream(deviceId: string): void {
    const stream = this.streams.get(deviceId);
    if (!stream) return;

    if (stream.intervalId) {
      clearInterval(stream.intervalId);
      stream.intervalId = null;
    }

    stream.isStreaming = false;
    logger.info(`[${deviceId}] 스트림 중지 (총 ${stream.frameCount} 프레임)`);
  }

  /**
   * 옵션 업데이트
   */
  private updateOptions(deviceId: string, options: StreamOptions): void {
    const stream = this.streams.get(deviceId);
    if (!stream) return;

    // 스트리밍 중이면 재시작
    if (stream.isStreaming) {
      this.stopStream(deviceId);
      this.startStream(deviceId, options);
    }
  }

  /**
   * 스크린 캡처 및 브로드캐스트
   */
  private async captureAndBroadcast(deviceId: string, opts: Required<StreamOptions>): Promise<void> {
    const stream = this.streams.get(deviceId);
    if (!stream || !stream.isStreaming) return;

    // 이전 캡처가 진행 중이면 스킵 (큐 누적 방지)
    if (stream.isCapturing) {
      return;
    }

    stream.isCapturing = true;

    try {
      const frame = await this.captureScreen(deviceId, opts);

      // 디바이스 연결 끊김 → 즉시 스트림 중지
      if (frame === 'device_not_found') {
        logger.info(`[${deviceId}] 디바이스 연결 끊김으로 스트림 즉시 중지`);
        this.stopStream(deviceId);

        // 클라이언트에 디바이스 연결 끊김 알림
        for (const client of stream.clients) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
              type: 'error',
              code: 'DEVICE_DISCONNECTED',
              message: 'Device disconnected',
            }));
          }
        }
        return;
      }

      if (frame) {
        stream.lastFrame = frame;
        stream.frameCount++;
        stream.errorCount = 0;

        // 모든 클라이언트에 브로드캐스트
        for (const client of stream.clients) {
          if (client.readyState === WebSocket.OPEN) {
            this.sendFrame(client, frame);
          }
        }
      } else {
        // 일반 캡처 실패
        stream.errorCount++;

        if (stream.errorCount >= 5) {
          logger.error(`[${deviceId}] 연속 5회 캡처 실패, 스트림 중지`);
          this.stopStream(deviceId);

          // 클라이언트에 에러 알림
          for (const client of stream.clients) {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({ type: 'error', message: 'Screen capture failed' }));
            }
          }
        }
      }
    } catch (err) {
      stream.errorCount++;
      logger.error(`[${deviceId}] 캡처 중 예외 발생`, err as Error);

      if (stream.errorCount >= 5) {
        this.stopStream(deviceId);
      }
    } finally {
      stream.isCapturing = false;
    }
  }

  /**
   * ADB screencap으로 스크린 캡처
   * @returns Buffer (성공), null (일시적 실패), 'device_not_found' (디바이스 연결 끊김)
   */
  private async captureScreen(deviceId: string, opts: Required<StreamOptions>): Promise<Buffer | null | 'device_not_found'> {
    try {
      // ADB screencap을 PNG로 캡처 (stdout으로 출력)
      const { stdout } = await execAsync(
        `adb -s ${deviceId} exec-out screencap -p`,
        { encoding: 'buffer', maxBuffer: 50 * 1024 * 1024 }
      );

      if (!stdout || stdout.length === 0) {
        return null;
      }

      // sharp로 리사이즈 + JPEG 변환
      const processed = await sharp(stdout)
        .resize({ width: Math.floor(1080 * opts.scale) }) // 기준 너비 1080px 기준 스케일
        .jpeg({ quality: opts.quality })
        .toBuffer();

      return processed;
    } catch (err) {
      const errorMessage = (err as Error).message || '';

      // 디바이스 연결 끊김 감지 (즉시 스트림 중지 필요)
      if (errorMessage.includes('not found') ||
          errorMessage.includes('offline') ||
          errorMessage.includes('unauthorized')) {
        logger.warn(`[${deviceId}] 디바이스 연결 끊김 감지: ${errorMessage}`);
        return 'device_not_found';
      }

      // 일반 오류: 로그 스팸 방지 (첫 번째 오류만 로그)
      const stream = this.streams.get(deviceId);
      if (stream && stream.errorCount === 0) {
        logger.warn(`[${deviceId}] screencap 실패: ${errorMessage}`);
      }
      return null;
    }
  }

  /**
   * 프레임 전송 (바이너리)
   */
  private sendFrame(ws: WebSocket, frame: Buffer): void {
    try {
      ws.send(frame, { binary: true });
    } catch (err) {
      // 전송 실패 무시 (클라이언트 연결 끊김)
    }
  }

  /**
   * 단일 스크린샷 캡처 (정적 이미지용)
   */
  async captureScreenshot(deviceId: string): Promise<Buffer | null> {
    try {
      const { stdout } = await execAsync(
        `adb -s ${deviceId} exec-out screencap -p`,
        { encoding: 'buffer', maxBuffer: 50 * 1024 * 1024 }
      );

      return stdout && stdout.length > 0 ? stdout : null;
    } catch (err) {
      logger.error(`[${deviceId}] 스크린샷 캡처 실패`, err as Error);
      return null;
    }
  }

  /**
   * 특정 디바이스의 스트림 상태 조회
   */
  getStreamStatus(deviceId: string): { isStreaming: boolean; clientCount: number; frameCount: number } | null {
    const stream = this.streams.get(deviceId);
    if (!stream) return null;

    return {
      isStreaming: stream.isStreaming,
      clientCount: stream.clients.size,
      frameCount: stream.frameCount,
    };
  }

  /**
   * 모든 스트림 중지 (서버 종료 시)
   */
  stopAllStreams(): void {
    for (const [deviceId] of this.streams) {
      this.stopStream(deviceId);
    }
    this.streams.clear();
    logger.info('모든 스크린 스트림 중지됨');
  }
}

export const screenStreamService = new ScreenStreamService();
