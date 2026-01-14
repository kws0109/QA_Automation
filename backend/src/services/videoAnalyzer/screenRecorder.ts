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
  /** 녹화 시간 제한 (초, 기본: 180, 최대: 180) */
  maxDuration?: number;
  /** 비트레이트 (Mbps, 기본: 4) */
  bitrate?: number;
  /** 해상도 (예: "1280x720", 기본: 기기 해상도) */
  resolution?: string;
  /** 버그 리포트 모드 (탭 표시 포함, Android 7.0+) */
  bugReport?: boolean;
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
   * 녹화 시작
   */
  async startRecording(
    deviceId: string,
    options: RecordingOptions = {}
  ): Promise<{ success: boolean; sessionId: string; error?: string }> {
    // 이미 녹화 중인지 확인
    if (this.recordings.has(deviceId)) {
      const session = this.recordings.get(deviceId)!;
      if (session.status === 'recording') {
        return { success: false, sessionId: '', error: '이미 녹화 중입니다.' };
      }
    }

    const sessionId = `rec_${Date.now()}`;
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

    console.log(`[ScreenRecorder] Starting recording on ${deviceId}: adb ${args.join(' ')}`);

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

      return { success: true, sessionId };
    } catch (error) {
      console.error('[ScreenRecorder] Start error:', error);
      return {
        success: false,
        sessionId: '',
        error: error instanceof Error ? error.message : 'Failed to start recording',
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

    try {
      // screenrecord 프로세스 중지 (Ctrl+C 시뮬레이션)
      if (session.process) {
        session.process.kill('SIGINT');
        // 프로세스가 종료될 때까지 대기
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      // 디바이스에서 파일 가져오기
      const videoId = `video-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const localPath = path.join(UPLOAD_DIR, `${videoId}.mp4`);

      console.log(`[ScreenRecorder] Pulling file from ${session.remotePath} to ${localPath}`);

      await execAsync(`adb -s ${deviceId} pull "${session.remotePath}" "${localPath}"`);

      // 디바이스에서 파일 삭제
      await execAsync(`adb -s ${deviceId} shell rm "${session.remotePath}"`);

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
