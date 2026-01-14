/**
 * 화면 녹화기 (ADB 기반)
 *
 * ADB screenrecord 명령을 사용하여 Android 기기의 화면을 녹화합니다.
 *
 * 이 모듈은 격리되어 있어 삭제 시 다른 부분에 영향을 주지 않습니다.
 */

import { spawn, exec, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ========================================
// 타입 정의
// ========================================

export interface RecordingSession {
  deviceId: string;
  status: 'recording' | 'stopping' | 'completed' | 'error';
  startedAt: Date;
  remotePath: string;
  localPath?: string;
  duration?: number;
  error?: string;
  process?: ChildProcess;
}

export interface RecordingOptions {
  /** 녹화 시간 제한 (초, 기본: 180, 최대: 180 for ADB, 무제한 for scrcpy) */
  maxDuration?: number;
  /** 비트레이트 (Mbps, 기본: 4) */
  bitrate?: number;
  /** 해상도 (예: "1280x720", 기본: 기기 해상도) */
  resolution?: string;
  /** 버그 리포트 모드 (탭 표시 포함, Android 7.0+) */
  bugReport?: boolean;
  /** scrcpy 사용 여부 (시간 제한 없음, scrcpy 설치 필요) */
  useScrcpy?: boolean;
}

// ========================================
// 상수
// ========================================

const UPLOAD_DIR = path.join(__dirname, '../../../uploads/videos');
const MAX_RECORDING_TIME = 180; // 3분 (Android 제한)

// 폴더 생성
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// ========================================
// ScreenRecorder 클래스
// ========================================

class ScreenRecorder {
  private recordings = new Map<string, RecordingSession>();

  /**
   * scrcpy 설치 여부 확인
   */
  async isScrcpyAvailable(): Promise<boolean> {
    try {
      await execAsync('scrcpy --version');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 녹화 시작
   */
  async startRecording(
    deviceId: string,
    options: RecordingOptions = {}
  ): Promise<{ success: boolean; sessionId: string; error?: string; method?: 'adb' | 'scrcpy' }> {
    // 이미 녹화 중인지 확인
    if (this.recordings.has(deviceId)) {
      const session = this.recordings.get(deviceId)!;
      if (session.status === 'recording') {
        return { success: false, sessionId: '', error: '이미 녹화 중입니다.' };
      }
    }

    const sessionId = `rec_${Date.now()}`;

    // scrcpy 사용 여부 결정
    if (options.useScrcpy) {
      return this.startScrcpyRecording(deviceId, sessionId, options);
    }

    // ADB screenrecord 사용 (기본)
    return this.startAdbRecording(deviceId, sessionId, options);
  }

  /**
   * ADB screenrecord 기반 녹화 (3분 제한)
   */
  private async startAdbRecording(
    deviceId: string,
    sessionId: string,
    options: RecordingOptions
  ): Promise<{ success: boolean; sessionId: string; error?: string; method?: 'adb' | 'scrcpy' }> {
    const remotePath = `/sdcard/recording_${sessionId}.mp4`;

    // screenrecord 명령 구성
    const args = ['-s', deviceId, 'shell', 'screenrecord'];

    // 옵션 추가
    const maxDuration = Math.min(options.maxDuration || MAX_RECORDING_TIME, MAX_RECORDING_TIME);
    args.push('--time-limit', maxDuration.toString());

    if (options.bitrate) {
      args.push('--bit-rate', `${options.bitrate}000000`);
    }

    if (options.resolution) {
      args.push('--size', options.resolution);
    }

    if (options.bugReport) {
      args.push('--bugreport');
    }

    args.push(remotePath);

    console.log(`[ScreenRecorder] Starting ADB recording on ${deviceId}: adb ${args.join(' ')}`);

    try {
      // ADB screenrecord 실행
      const process = spawn('adb', args);

      const session: RecordingSession = {
        deviceId,
        status: 'recording',
        startedAt: new Date(),
        remotePath,
        process,
      };

      this.recordings.set(deviceId, session);

      // 프로세스 이벤트 핸들링
      process.stderr.on('data', (data) => {
        console.error(`[ScreenRecorder] ${deviceId} stderr:`, data.toString());
      });

      process.on('close', (code) => {
        console.log(`[ScreenRecorder] ${deviceId} process exited with code ${code}`);
        const currentSession = this.recordings.get(deviceId);
        if (currentSession && currentSession.status === 'recording') {
          currentSession.status = 'completed';
          currentSession.duration = (Date.now() - currentSession.startedAt.getTime()) / 1000;
        }
      });

      process.on('error', (err) => {
        console.error(`[ScreenRecorder] ${deviceId} process error:`, err);
        const currentSession = this.recordings.get(deviceId);
        if (currentSession) {
          currentSession.status = 'error';
          currentSession.error = err.message;
        }
      });

      return { success: true, sessionId, method: 'adb' };
    } catch (error) {
      console.error('[ScreenRecorder] ADB start error:', error);
      return {
        success: false,
        sessionId: '',
        error: error instanceof Error ? error.message : 'Failed to start recording',
      };
    }
  }

  /**
   * scrcpy 기반 녹화 (시간 제한 없음)
   */
  private async startScrcpyRecording(
    deviceId: string,
    sessionId: string,
    options: RecordingOptions
  ): Promise<{ success: boolean; sessionId: string; error?: string; method?: 'adb' | 'scrcpy' }> {
    // scrcpy 설치 확인
    const scrcpyAvailable = await this.isScrcpyAvailable();
    if (!scrcpyAvailable) {
      return {
        success: false,
        sessionId: '',
        error: 'scrcpy가 설치되어 있지 않습니다. choco install scrcpy 또는 https://github.com/Genymobile/scrcpy 에서 설치하세요.',
      };
    }

    const localPath = path.join(UPLOAD_DIR, `${sessionId}.mp4`);

    // scrcpy 명령 구성
    const args = [
      '-s', deviceId,
      '--record', localPath,
      '--no-window',        // 미러링 창 표시 안함
      '--no-audio',         // 오디오 없음 (더 안정적)
    ];

    if (options.bitrate) {
      args.push('--video-bit-rate', `${options.bitrate}M`);
    }

    if (options.resolution) {
      args.push('--max-size', options.resolution.split('x')[0]); // 가로 해상도만 사용
    }

    if (options.maxDuration) {
      args.push('--time-limit', options.maxDuration.toString());
    }

    console.log(`[ScreenRecorder] Starting scrcpy recording on ${deviceId}: scrcpy ${args.join(' ')}`);

    try {
      const process = spawn('scrcpy', args);

      const session: RecordingSession = {
        deviceId,
        status: 'recording',
        startedAt: new Date(),
        remotePath: '', // scrcpy는 로컬에 직접 저장
        localPath,
        process,
      };

      this.recordings.set(deviceId, session);

      // 프로세스 이벤트 핸들링
      process.stderr.on('data', (data) => {
        const msg = data.toString();
        // scrcpy 정보 메시지는 무시
        if (!msg.includes('INFO')) {
          console.error(`[ScreenRecorder] ${deviceId} scrcpy stderr:`, msg);
        }
      });

      process.stdout.on('data', (data) => {
        console.log(`[ScreenRecorder] ${deviceId} scrcpy stdout:`, data.toString());
      });

      process.on('close', (code) => {
        console.log(`[ScreenRecorder] ${deviceId} scrcpy exited with code ${code}`);
        const currentSession = this.recordings.get(deviceId);
        if (currentSession && currentSession.status === 'recording') {
          currentSession.status = 'completed';
          currentSession.duration = (Date.now() - currentSession.startedAt.getTime()) / 1000;
        }
      });

      process.on('error', (err) => {
        console.error(`[ScreenRecorder] ${deviceId} scrcpy error:`, err);
        const currentSession = this.recordings.get(deviceId);
        if (currentSession) {
          currentSession.status = 'error';
          currentSession.error = err.message;
        }
      });

      return { success: true, sessionId, method: 'scrcpy' };
    } catch (error) {
      console.error('[ScreenRecorder] scrcpy start error:', error);
      return {
        success: false,
        sessionId: '',
        error: error instanceof Error ? error.message : 'Failed to start scrcpy recording',
      };
    }
  }

  /**
   * 녹화 중지 및 파일 가져오기
   */
  async stopRecording(deviceId: string): Promise<{
    success: boolean;
    videoId?: string;
    localPath?: string;
    duration?: number;
    error?: string;
  }> {
    const session = this.recordings.get(deviceId);

    if (!session) {
      return { success: false, error: '녹화 세션을 찾을 수 없습니다.' };
    }

    if (session.status !== 'recording') {
      return { success: false, error: '녹화 중이 아닙니다.' };
    }

    session.status = 'stopping';

    // scrcpy로 녹화한 경우 (localPath가 이미 설정됨)
    const isScrcpy = !session.remotePath && session.localPath;

    try {
      // 프로세스 중지
      if (session.process && session.process.pid) {
        const pid = session.process.pid;

        if (process.platform === 'win32') {
          // Windows: taskkill로 종료
          console.log(`[ScreenRecorder] Stopping process ${pid} on Windows...`);

          // 1단계: graceful 종료 시도 (/T: 자식 프로세스 포함)
          try {
            await execAsync(`taskkill /PID ${pid} /T`);
            console.log(`[ScreenRecorder] Graceful termination sent to ${pid}`);
          } catch (e) {
            console.log(`[ScreenRecorder] Graceful termination failed:`, e);
          }

          // 2초 대기 후 강제 종료 (아직 실행 중이면)
          await new Promise((r) => setTimeout(r, 2000));

          try {
            // 프로세스가 아직 실행 중인지 확인 후 강제 종료
            await execAsync(`taskkill /PID ${pid} /T /F`);
            console.log(`[ScreenRecorder] Force killed ${pid}`);
          } catch {
            // 이미 종료됨 - 정상
            console.log(`[ScreenRecorder] Process ${pid} already exited`);
          }
        } else {
          // Unix: SIGINT 사용
          session.process.kill('SIGINT');
        }

        // 프로세스가 완전히 종료될 때까지 대기 (moov 기록 시간 필요)
        await new Promise<void>((resolve) => {
          let resolved = false;
          const timeout = setTimeout(() => {
            if (!resolved) {
              resolved = true;
              resolve();
            }
          }, 5000); // 5초 대기 (2초에서 증가)

          session.process?.on('close', () => {
            if (!resolved) {
              resolved = true;
              clearTimeout(timeout);
              resolve();
            }
          });
        });

        console.log(`[ScreenRecorder] Process ${pid} stopped`);
      }

      let videoId: string;
      let localPath: string;

      if (isScrcpy) {
        // scrcpy: 이미 로컬에 저장되어 있음
        localPath = session.localPath!;
        videoId = path.basename(localPath, '.mp4');
        console.log(`[ScreenRecorder] scrcpy recording saved to ${localPath}`);
      } else {
        // ADB: 디바이스에서 파일 가져오기
        videoId = `video-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        localPath = path.join(UPLOAD_DIR, `${videoId}.mp4`);

        console.log(`[ScreenRecorder] Pulling file from ${session.remotePath} to ${localPath}`);

        await execAsync(`adb -s ${deviceId} pull "${session.remotePath}" "${localPath}"`);

        // 디바이스에서 파일 삭제
        await execAsync(`adb -s ${deviceId} shell rm "${session.remotePath}"`);
      }

      // 세션 업데이트
      session.status = 'completed';
      session.localPath = localPath;
      session.duration = (Date.now() - session.startedAt.getTime()) / 1000;

      // 세션 정리
      this.recordings.delete(deviceId);

      return {
        success: true,
        videoId,
        localPath,
        duration: session.duration,
      };
    } catch (error) {
      console.error('[ScreenRecorder] Stop error:', error);
      session.status = 'error';
      session.error = error instanceof Error ? error.message : 'Failed to stop recording';

      return {
        success: false,
        error: session.error,
      };
    }
  }

  /**
   * 녹화 상태 조회
   */
  getRecordingStatus(deviceId: string): RecordingSession | null {
    const session = this.recordings.get(deviceId);
    if (!session) return null;

    // process 객체는 직렬화 불가능하므로 제외
    return {
      deviceId: session.deviceId,
      status: session.status,
      startedAt: session.startedAt,
      remotePath: session.remotePath,
      localPath: session.localPath,
      duration: session.status === 'recording'
        ? (Date.now() - session.startedAt.getTime()) / 1000
        : session.duration,
      error: session.error,
    };
  }

  /**
   * 모든 활성 녹화 목록
   */
  getActiveRecordings(): RecordingSession[] {
    const sessions: RecordingSession[] = [];
    this.recordings.forEach((session) => {
      sessions.push({
        deviceId: session.deviceId,
        status: session.status,
        startedAt: session.startedAt,
        remotePath: session.remotePath,
        localPath: session.localPath,
        duration: session.status === 'recording'
          ? (Date.now() - session.startedAt.getTime()) / 1000
          : session.duration,
        error: session.error,
      });
    });
    return sessions;
  }

  /**
   * 녹화 취소 (파일 저장 없이 중지)
   */
  async cancelRecording(deviceId: string): Promise<{ success: boolean; error?: string }> {
    const session = this.recordings.get(deviceId);

    if (!session) {
      return { success: false, error: '녹화 세션을 찾을 수 없습니다.' };
    }

    try {
      // 프로세스 종료
      if (session.process) {
        session.process.kill('SIGKILL');
      }

      // 디바이스에서 파일 삭제
      try {
        await execAsync(`adb -s ${deviceId} shell rm "${session.remotePath}"`);
      } catch {
        // 파일이 없을 수도 있음
      }

      // 세션 정리
      this.recordings.delete(deviceId);

      return { success: true };
    } catch (error) {
      console.error('[ScreenRecorder] Cancel error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to cancel recording',
      };
    }
  }

  /**
   * 탭 표시 활성화/비활성화
   */
  async setShowTaps(deviceId: string, enabled: boolean): Promise<{ success: boolean; error?: string }> {
    try {
      const value = enabled ? 1 : 0;
      await execAsync(`adb -s ${deviceId} shell settings put system show_touches ${value}`);
      console.log(`[ScreenRecorder] Show taps ${enabled ? 'enabled' : 'disabled'} on ${deviceId}`);
      return { success: true };
    } catch (error) {
      console.error('[ScreenRecorder] setShowTaps error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to set show_touches',
      };
    }
  }

  /**
   * 탭 표시 상태 조회
   */
  async getShowTaps(deviceId: string): Promise<{ success: boolean; enabled?: boolean; error?: string }> {
    try {
      const { stdout } = await execAsync(`adb -s ${deviceId} shell settings get system show_touches`);
      const enabled = stdout.trim() === '1';
      return { success: true, enabled };
    } catch (error) {
      console.error('[ScreenRecorder] getShowTaps error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get show_touches',
      };
    }
  }
}

// 싱글톤 인스턴스
export const screenRecorder = new ScreenRecorder();
