// backend/src/services/scrcpyManager.ts
// scrcpy 프로세스 관리 서비스 - H.264 스트리밍용

import { spawn, ChildProcess, execSync } from 'child_process';
import { createServer, Server, Socket } from 'net';
import { createLogger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

const logger = createLogger('ScrcpyManager');

// ========== 상수 정의 ==========
// deviceId 검증용 정규식
const DEVICE_ID_REGEX = /^[a-zA-Z0-9._:-]+$/;

// scrcpy-server 경로
const SCRCPY_SERVER_PATH = path.join(__dirname, '../../bin/scrcpy-server');
const SCRCPY_SERVER_DEVICE_PATH = '/data/local/tmp/scrcpy-server.jar';

// 프로토콜 상수
const SCRCPY_HEADER_SIZE = 68;           // scrcpy 디바이스 정보 헤더 크기 (bytes)
const SCRCPY_VERSION = '2.4';            // scrcpy-server 버전

// 네트워크 상수
const DEFAULT_LOCAL_PORT_START = 27183;  // scrcpy 기본 포트
const MAX_LOCAL_PORT = 27283;            // 최대 포트 (100개 풀)
const TCP_CONNECT_TIMEOUT_MS = 10000;    // TCP 연결 타임아웃
const ADB_COMMAND_TIMEOUT_MS = 5000;     // ADB 명령 타임아웃
const SERVER_PUSH_TIMEOUT_MS = 30000;    // scrcpy-server 푸시 타임아웃
const SERVER_START_DELAY_MS = 500;       // scrcpy-server 시작 대기 시간

export interface ScrcpyOptions {
  maxFps?: number;           // 최대 FPS (기본: 30)
  bitRate?: number;          // 비트레이트 bps (기본: 2000000 = 2Mbps)
  maxSize?: number;          // 최대 해상도 (기본: 1080)
  tunnelForward?: boolean;   // 터널 포워딩 (기본: true)
}

const DEFAULT_OPTIONS: Required<ScrcpyOptions> = {
  maxFps: 30,
  bitRate: 2000000,
  maxSize: 1080,
  tunnelForward: true,
};

interface ScrcpyStream {
  deviceId: string;
  process: ChildProcess | null;
  tcpServer: Server | null;
  tcpSocket: Socket | null;
  localPort: number;
  options: Required<ScrcpyOptions>;
  isRunning: boolean;
  onData: ((data: Buffer) => void) | null;
  onError: ((error: Error) => void) | null;
  onClose: (() => void) | null;
}

class ScrcpyManager {
  private streams: Map<string, ScrcpyStream> = new Map();
  private nextPort = DEFAULT_LOCAL_PORT_START;
  private serverPushed: Set<string> = new Set(); // scrcpy-server 푸시된 디바이스

  /**
   * scrcpy-server 바이너리가 있는지 확인
   */
  checkServerExists(): boolean {
    return fs.existsSync(SCRCPY_SERVER_PATH);
  }

  /**
   * scrcpy-server를 디바이스에 푸시
   */
  private async pushServerToDevice(deviceId: string): Promise<boolean> {
    // 이미 푸시된 디바이스는 스킵
    if (this.serverPushed.has(deviceId)) {
      return true;
    }

    if (!this.checkServerExists()) {
      logger.error(`scrcpy-server 바이너리 없음: ${SCRCPY_SERVER_PATH}`);
      return false;
    }

    try {
      // scrcpy-server를 디바이스에 푸시
      execSync(`adb -s ${deviceId} push "${SCRCPY_SERVER_PATH}" ${SCRCPY_SERVER_DEVICE_PATH}`, {
        timeout: SERVER_PUSH_TIMEOUT_MS,
      });
      logger.info(`[${deviceId}] scrcpy-server 푸시 완료`);
      this.serverPushed.add(deviceId);
      return true;
    } catch (err) {
      logger.error(`[${deviceId}] scrcpy-server 푸시 실패`, err as Error);
      return false;
    }
  }

  /**
   * 사용 가능한 포트 할당 (포트 풀 범위 내에서 순환)
   */
  private allocatePort(): number {
    const port = this.nextPort++;
    // 최대 포트 초과 시 시작 포트로 순환
    if (this.nextPort > MAX_LOCAL_PORT) {
      this.nextPort = DEFAULT_LOCAL_PORT_START;
      logger.info('포트 풀 순환: 시작 포트로 리셋');
    }
    return port;
  }

  /**
   * scrcpy 스트림 시작
   */
  async startStream(
    deviceId: string,
    options?: ScrcpyOptions,
    callbacks?: {
      onData?: (data: Buffer) => void;
      onError?: (error: Error) => void;
      onClose?: () => void;
    }
  ): Promise<boolean> {
    // deviceId 검증
    if (!DEVICE_ID_REGEX.test(deviceId)) {
      logger.error(`잘못된 deviceId 형식: ${deviceId}`);
      return false;
    }

    // 이미 실행 중인 스트림 확인
    if (this.streams.has(deviceId)) {
      const existing = this.streams.get(deviceId)!;
      if (existing.isRunning) {
        logger.info(`[${deviceId}] 이미 스트림 실행 중`);
        return true;
      }
    }

    // scrcpy-server 푸시
    const pushed = await this.pushServerToDevice(deviceId);
    if (!pushed) {
      return false;
    }

    const opts = { ...DEFAULT_OPTIONS, ...options };
    const localPort = this.allocatePort();

    const stream: ScrcpyStream = {
      deviceId,
      process: null,
      tcpServer: null,
      tcpSocket: null,
      localPort,
      options: opts,
      isRunning: false,
      onData: callbacks?.onData || null,
      onError: callbacks?.onError || null,
      onClose: callbacks?.onClose || null,
    };

    this.streams.set(deviceId, stream);

    try {
      // 1. ADB 포트 포워딩 설정
      execSync(`adb -s ${deviceId} forward tcp:${localPort} localabstract:scrcpy`, {
        timeout: ADB_COMMAND_TIMEOUT_MS,
      });
      logger.info(`[${deviceId}] ADB 포워딩 설정: localhost:${localPort} -> scrcpy`);

      // 2. scrcpy-server 실행
      const serverArgs = [
        '-s', deviceId,
        'shell',
        `CLASSPATH=${SCRCPY_SERVER_DEVICE_PATH}`,
        'app_process',
        '/',
        'com.genymobile.scrcpy.Server',
        SCRCPY_VERSION,
        `tunnel_forward=true`,
        `video_bit_rate=${opts.bitRate}`,
        `max_fps=${opts.maxFps}`,
        `max_size=${opts.maxSize}`,
        'video_codec=h264',
        'audio=false',  // 오디오 비활성화
        'control=false', // 입력 제어 비활성화 (프리뷰 전용)
        'send_frame_meta=false', // 프레임 메타데이터 비활성화 (순수 H.264)
      ];

      stream.process = spawn('adb', serverArgs);

      stream.process.stdout?.on('data', (data) => {
        logger.debug(`[${deviceId}] scrcpy stdout: ${data.toString().trim()}`);
      });

      stream.process.stderr?.on('data', (data) => {
        const msg = data.toString().trim();
        if (msg) {
          logger.debug(`[${deviceId}] scrcpy stderr: ${msg}`);
        }
      });

      stream.process.on('error', (err) => {
        logger.error(`[${deviceId}] scrcpy 프로세스 에러`, err);
        stream.onError?.(err);
        this.stopStream(deviceId);
      });

      stream.process.on('exit', (code) => {
        logger.info(`[${deviceId}] scrcpy 프로세스 종료 (code: ${code})`);
        stream.onClose?.();
        stream.isRunning = false;
      });

      // 3. TCP 소켓으로 스트림 수신 (scrcpy-server 시작 대기 후)
      await this.delay(SERVER_START_DELAY_MS);

      await this.connectToStream(stream);

      stream.isRunning = true;
      logger.info(`[${deviceId}] scrcpy 스트림 시작 완료 (port: ${localPort}, fps: ${opts.maxFps}, bitrate: ${opts.bitRate})`);
      return true;
    } catch (err) {
      logger.error(`[${deviceId}] scrcpy 스트림 시작 실패`, err as Error);
      this.stopStream(deviceId);
      return false;
    }
  }

  /**
   * TCP 소켓으로 scrcpy 스트림에 연결
   */
  private connectToStream(stream: ScrcpyStream): Promise<void> {
    return new Promise((resolve, reject) => {
      const { deviceId, localPort } = stream;

      const socket = new Socket();
      socket.setTimeout(TCP_CONNECT_TIMEOUT_MS);

      socket.on('connect', () => {
        logger.info(`[${deviceId}] scrcpy 스트림 TCP 연결 성공`);
        stream.tcpSocket = socket;

        // 첫 바이트 수신 시 H.264 스트림 시작
        let headerReceived = false;
        let headerBuffer = Buffer.alloc(0);

        socket.on('data', (rawData: Buffer | string) => {
          // string인 경우 Buffer로 변환
          const data = typeof rawData === 'string' ? Buffer.from(rawData) : rawData;

          if (!headerReceived) {
            // scrcpy는 처음에 디바이스 정보 헤더를 보냄
            headerBuffer = Buffer.concat([headerBuffer, data]);
            if (headerBuffer.length >= SCRCPY_HEADER_SIZE) {
              headerReceived = true;
              // 헤더 이후의 데이터가 있으면 전달
              const remaining = headerBuffer.slice(SCRCPY_HEADER_SIZE);
              if (remaining.length > 0) {
                stream.onData?.(remaining);
              }
              logger.info(`[${deviceId}] scrcpy 헤더 수신 완료, H.264 스트림 시작`);
            }
          } else {
            // H.264 데이터 전달
            stream.onData?.(data);
          }
        });

        resolve();
      });

      socket.on('timeout', () => {
        logger.error(`[${deviceId}] scrcpy TCP 연결 타임아웃`);
        socket.destroy();
        reject(new Error('Connection timeout'));
      });

      socket.on('error', (err) => {
        logger.error(`[${deviceId}] scrcpy TCP 연결 에러`, err);
        reject(err);
      });

      socket.on('close', () => {
        logger.info(`[${deviceId}] scrcpy TCP 연결 종료`);
        stream.onClose?.();
      });

      socket.connect(localPort, '127.0.0.1');
    });
  }

  /**
   * scrcpy 스트림 중지
   */
  stopStream(deviceId: string): void {
    const stream = this.streams.get(deviceId);
    if (!stream) return;

    logger.info(`[${deviceId}] scrcpy 스트림 중지 중...`);

    // TCP 소켓 종료
    if (stream.tcpSocket) {
      stream.tcpSocket.destroy();
      stream.tcpSocket = null;
    }

    // TCP 서버 종료
    if (stream.tcpServer) {
      stream.tcpServer.close();
      stream.tcpServer = null;
    }

    // 프로세스 종료
    if (stream.process) {
      stream.process.kill('SIGTERM');
      stream.process = null;
    }

    // ADB 포워딩 제거
    try {
      execSync(`adb -s ${deviceId} forward --remove tcp:${stream.localPort}`, {
        timeout: ADB_COMMAND_TIMEOUT_MS,
      });
    } catch {
      // 무시 (이미 제거되었을 수 있음)
    }

    stream.isRunning = false;
    this.streams.delete(deviceId);
    logger.info(`[${deviceId}] scrcpy 스트림 중지 완료`);
  }

  /**
   * 스트림 상태 조회
   */
  getStreamStatus(deviceId: string): { isRunning: boolean; options: ScrcpyOptions } | null {
    const stream = this.streams.get(deviceId);
    if (!stream) return null;

    return {
      isRunning: stream.isRunning,
      options: stream.options,
    };
  }

  /**
   * 데이터 콜백 설정
   */
  setDataCallback(deviceId: string, callback: (data: Buffer) => void): void {
    const stream = this.streams.get(deviceId);
    if (stream) {
      stream.onData = callback;
    }
  }

  /**
   * 모든 스트림 중지
   */
  stopAllStreams(): void {
    for (const [deviceId] of this.streams) {
      this.stopStream(deviceId);
    }
    logger.info('모든 scrcpy 스트림 중지됨');
  }

  /**
   * 유틸: 딜레이
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const scrcpyManager = new ScrcpyManager();
