// backend/src/services/scrcpyStreamService.ts
// scrcpy H.264 스트림을 WebSocket으로 전달하는 서비스

import { WebSocket, WebSocketServer } from 'ws';
import * as http from 'http';
import { createLogger } from '../utils/logger';
import { scrcpyManager, ScrcpyOptions } from './scrcpyManager';

const logger = createLogger('ScrcpyStreamService');

// deviceId 검증용 정규식
const DEVICE_ID_REGEX = /^[a-zA-Z0-9._:-]+$/;

interface ClientInfo {
  ws: WebSocket;
  deviceId: string;
}

interface DeviceClients {
  deviceId: string;
  clients: Set<WebSocket>;
  isStreaming: boolean;
  isStarting: boolean;  // 스트림 시작 중 플래그
}

class ScrcpyStreamService {
  private wss: WebSocketServer | null = null;
  private deviceClients: Map<string, DeviceClients> = new Map();
  static readonly PATH = '/ws/scrcpy';

  /**
   * WebSocket 서버 초기화 (noServer 모드)
   * Cloudflare Tunnel 등 리버스 프록시 뒤에서도 동작하도록 수동 upgrade 처리
   */
  initialize(server: http.Server): void {
    // noServer: true로 생성하여 수동으로 upgrade 처리
    this.wss = new WebSocketServer({ noServer: true });

    this.wss.on('connection', (ws, req) => {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const deviceId = url.searchParams.get('deviceId');

      if (!deviceId) {
        logger.warn('WebSocket 연결 거부: deviceId 없음');
        ws.close(4000, 'deviceId required');
        return;
      }

      // deviceId 형식 검증
      if (!DEVICE_ID_REGEX.test(deviceId)) {
        logger.warn(`WebSocket 연결 거부: 잘못된 deviceId 형식: ${deviceId}`);
        ws.close(4001, 'Invalid deviceId format');
        return;
      }

      logger.info(`[${deviceId}] scrcpy WebSocket 클라이언트 연결`);
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
        logger.info(`[${deviceId}] scrcpy WebSocket 클라이언트 연결 해제`);
        this.removeClient(deviceId, ws);
      });

      ws.on('error', (err) => {
        logger.error(`[${deviceId}] scrcpy WebSocket 에러`, err);
        this.removeClient(deviceId, ws);
      });
    });

    // HTTP 서버의 upgrade 이벤트 직접 처리
    server.on('upgrade', (request, socket, head) => {
      const pathname = new URL(request.url || '', `http://${request.headers.host}`).pathname;

      if (pathname === ScrcpyStreamService.PATH) {
        logger.info(`[WebSocket] scrcpy upgrade 요청 수신: ${request.url}`);

        this.wss!.handleUpgrade(request, socket, head, (ws) => {
          this.wss!.emit('connection', ws, request);
        });
      }
      // 다른 경로는 무시 (다른 WebSocket 서버가 처리)
    });

    logger.info('ScrcpyStreamService WebSocket 서버 초기화 완료 (path: /ws/scrcpy, noServer 모드)');
  }

  /**
   * 클라이언트 메시지 처리
   */
  private handleMessage(
    deviceId: string,
    ws: WebSocket,
    data: { type: string; payload?: ScrcpyOptions }
  ): void {
    switch (data.type) {
      case 'start':
        this.startStream(deviceId, data.payload);
        break;
      case 'stop':
        this.stopStream(deviceId);
        break;
      default:
        logger.warn(`[${deviceId}] 알 수 없는 메시지 타입: ${data.type}`);
    }
  }

  /**
   * 클라이언트 추가
   */
  private addClient(deviceId: string, ws: WebSocket): void {
    let clients = this.deviceClients.get(deviceId);

    if (!clients) {
      clients = {
        deviceId,
        clients: new Set(),
        isStreaming: false,
        isStarting: false,
      };
      this.deviceClients.set(deviceId, clients);
    }

    clients.clients.add(ws);

    // 클라이언트에 연결 성공 알림
    ws.send(JSON.stringify({
      type: 'connected',
      deviceId,
      message: 'Connected to scrcpy stream service',
    }));
  }

  /**
   * 클라이언트 제거
   */
  private removeClient(deviceId: string, ws: WebSocket): void {
    const clients = this.deviceClients.get(deviceId);
    if (!clients) return;

    clients.clients.delete(ws);

    // 클라이언트가 없으면 스트림 중지
    if (clients.clients.size === 0) {
      // 시작 중이거나 실행 중인 경우 모두 중지
      if (clients.isStarting || clients.isStreaming) {
        scrcpyManager.stopStream(deviceId);
      }
      this.deviceClients.delete(deviceId);
    }
  }

  /**
   * scrcpy 스트림 시작
   */
  private async startStream(deviceId: string, options?: ScrcpyOptions): Promise<void> {
    const clients = this.deviceClients.get(deviceId);
    if (!clients) return;

    if (clients.isStreaming || clients.isStarting) {
      logger.info(`[${deviceId}] 이미 스트리밍 중 또는 시작 중`);
      return;
    }

    // scrcpy-server 존재 확인
    if (!scrcpyManager.checkServerExists()) {
      const errorMsg = 'scrcpy-server 바이너리가 없습니다. backend/bin/scrcpy-server 파일이 필요합니다.';
      logger.error(errorMsg);
      this.broadcastError(deviceId, 'SCRCPY_SERVER_NOT_FOUND', errorMsg);
      return;
    }

    logger.info(`[${deviceId}] scrcpy 스트림 시작 요청`);
    clients.isStarting = true;

    // 스트림 시작
    const success = await scrcpyManager.startStream(deviceId, options, {
      onData: (data) => {
        // H.264 데이터를 모든 클라이언트에 브로드캐스트
        this.broadcastData(deviceId, data);
      },
      onError: (error) => {
        const currentClients = this.deviceClients.get(deviceId);
        if (currentClients) {
          this.broadcastError(deviceId, 'STREAM_ERROR', error.message);
          currentClients.isStreaming = false;
          currentClients.isStarting = false;
        }
      },
      onClose: () => {
        const currentClients = this.deviceClients.get(deviceId);
        if (currentClients) {
          this.broadcastMessage(deviceId, 'stream_closed', 'scrcpy stream closed');
          currentClients.isStreaming = false;
          currentClients.isStarting = false;
        }
      },
    });

    // 클라이언트가 여전히 연결되어 있는지 확인
    const currentClients = this.deviceClients.get(deviceId);
    if (!currentClients || currentClients.clients.size === 0) {
      logger.warn(`[${deviceId}] 스트림 시작 완료 전 클라이언트 연결 해제됨`);
      scrcpyManager.stopStream(deviceId);
      return;
    }

    currentClients.isStarting = false;

    if (success) {
      currentClients.isStreaming = true;
      this.broadcastMessage(deviceId, 'stream_started', 'scrcpy stream started');
    } else {
      this.broadcastError(deviceId, 'STREAM_START_FAILED', 'Failed to start scrcpy stream');
    }
  }

  /**
   * scrcpy 스트림 중지
   */
  private stopStream(deviceId: string): void {
    const clients = this.deviceClients.get(deviceId);
    if (!clients) return;

    // 스트리밍 중이거나 시작 중인 경우 중지
    if (!clients.isStreaming && !clients.isStarting) return;

    scrcpyManager.stopStream(deviceId);
    clients.isStreaming = false;
    clients.isStarting = false;
    this.broadcastMessage(deviceId, 'stream_stopped', 'scrcpy stream stopped');
  }

  /**
   * H.264 데이터 브로드캐스트 (바이너리)
   */
  private broadcastData(deviceId: string, data: Buffer): void {
    const clients = this.deviceClients.get(deviceId);
    if (!clients) return;

    for (const client of clients.clients) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(data, { binary: true });
        } catch {
          // 전송 실패 무시
        }
      }
    }
  }

  /**
   * JSON 메시지 브로드캐스트
   */
  private broadcastMessage(deviceId: string, type: string, message: string): void {
    const clients = this.deviceClients.get(deviceId);
    if (!clients) return;

    const payload = JSON.stringify({ type, message });
    for (const client of clients.clients) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(payload);
        } catch {
          // 전송 실패 무시
        }
      }
    }
  }

  /**
   * 에러 브로드캐스트
   */
  private broadcastError(deviceId: string, code: string, message: string): void {
    const clients = this.deviceClients.get(deviceId);
    if (!clients) return;

    const payload = JSON.stringify({ type: 'error', code, message });
    for (const client of clients.clients) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(payload);
        } catch {
          // 전송 실패 무시
        }
      }
    }
  }

  /**
   * 스트림 상태 조회
   */
  getStreamStatus(deviceId: string): { isStreaming: boolean; clientCount: number } | null {
    const clients = this.deviceClients.get(deviceId);
    if (!clients) return null;

    return {
      isStreaming: clients.isStreaming,
      clientCount: clients.clients.size,
    };
  }

  /**
   * 모든 스트림 중지
   */
  stopAllStreams(): void {
    for (const [deviceId] of this.deviceClients) {
      this.stopStream(deviceId);
    }
    scrcpyManager.stopAllStreams();
    this.deviceClients.clear();
    logger.info('모든 scrcpy 스트림 중지됨');
  }
}

export const scrcpyStreamService = new ScrcpyStreamService();
