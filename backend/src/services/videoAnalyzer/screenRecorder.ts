/**
 * 화면 녹화기 (Device App + ADB 기반)
 *
 * Device App (QA Recorder) 또는 ADB screenrecord를 사용하여 Android 기기의 화면을 녹화합니다.
 * - Device App: 시간 제한 없음, 가로/세로 자동 감지, Appium 세션 독립적
 * - ADB screenrecord: 3분 제한, fallback용
 */

import { spawn, exec, ChildProcess } from 'child_process';
import fs from 'fs';
import fsPromises from 'fs/promises';
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
  /** 녹화 방식 (adb: ADB screenrecord, deviceApp: QA Recorder 앱) */
  method: 'adb' | 'deviceApp';
}

export interface RecordingOptions {
  /** 녹화 시간 제한 (초, 기본: 180, 최대: 180 for ADB, 무제한 for deviceApp) */
  maxDuration?: number;
  /** 비트레이트 (Mbps, 기본: 2) */
  bitrate?: number;
  /** 해상도 (예: "1280x720", 기본: 자동 감지) */
  resolution?: string;
  /** 버그 리포트 모드 (탭 표시 포함, Android 7.0+) */
  bugReport?: boolean;
  /** Device App 사용 여부 (시간 제한 없음, QA Recorder 앱 설치 필요) */
  useDeviceApp?: boolean;
}

/** Device App 결과 파일 타입 */
interface DeviceAppResult {
  type: string;
  success: boolean;
  message: string;
  timestamp: number;
}

// ========================================
// 상수
// ========================================

const UPLOAD_DIR = path.join(__dirname, '../../../uploads/videos');
const MAX_RECORDING_TIME = 180; // 3분 (Android ADB 제한)

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
   * Device App 설치 여부 확인 (QA Recorder 앱)
   */
  async isDeviceAppAvailable(deviceId: string): Promise<boolean> {
    try {
      const { stdout } = await execAsync(
        `adb -s ${deviceId} shell pm list packages com.qaautomation.recorder`
      );
      return stdout.includes('com.qaautomation.recorder');
    } catch {
      return false;
    }
  }

  /**
   * Device App 서비스 상태 확인
   */
  async isDeviceAppServiceRunning(deviceId: string): Promise<boolean> {
    try {
      const { stdout } = await execAsync(
        `adb -s ${deviceId} shell dumpsys activity services com.qaautomation.recorder/.RecorderService`
      );
      return stdout.includes('ServiceRecord');
    } catch {
      return false;
    }
  }

  /**
   * 디바이스 화면 방향 및 해상도 자동 감지
   * @returns { width, height, orientation } - 현재 화면 방향에 맞는 해상도
   */
  async getDeviceScreenInfo(deviceId: string): Promise<{
    width: number;
    height: number;
    orientation: 'portrait' | 'landscape';
    physicalWidth: number;
    physicalHeight: number;
  }> {
    try {
      // 물리적 화면 크기 조회
      const { stdout: sizeOutput } = await execAsync(`adb -s ${deviceId} shell wm size`);
      const sizeMatch = sizeOutput.match(/Physical size:\s*(\d+)x(\d+)/);

      let physicalWidth = 1080;
      let physicalHeight = 1920;

      if (sizeMatch) {
        physicalWidth = parseInt(sizeMatch[1], 10);
        physicalHeight = parseInt(sizeMatch[2], 10);
      }

      // 현재 화면 방향 조회 (0: portrait, 1: landscape, 2: reverse portrait, 3: reverse landscape)
      const { stdout: orientOutput } = await execAsync(
        `adb -s ${deviceId} shell "dumpsys input | grep SurfaceOrientation"`
      );
      const orientMatch = orientOutput.match(/SurfaceOrientation:\s*(\d)/);
      const orientValue = orientMatch ? parseInt(orientMatch[1], 10) : 0;

      // 가로 모드인지 확인 (1 또는 3)
      const isLandscape = orientValue === 1 || orientValue === 3;

      // 표준 해상도 사용 (MediaRecorder 호환성 보장)
      let width: number;
      let height: number;

      // 디바이스 비율 계산
      const aspectRatio = Math.max(physicalWidth, physicalHeight) / Math.min(physicalWidth, physicalHeight);

      if (isLandscape) {
        // 가로 모드
        width = 1280;
        if (aspectRatio >= 2.0) {
          height = 576; // 1280x576 (20:9)
        } else {
          height = 720; // 1280x720 (16:9)
        }
      } else {
        // 세로 모드
        height = 1280;
        if (aspectRatio >= 2.0) {
          width = 576;
        } else {
          width = 720;
        }
      }

      console.log(`[ScreenRecorder] Device ${deviceId} screen: ${physicalWidth}x${physicalHeight}, orientation: ${isLandscape ? 'landscape' : 'portrait'}, recording: ${width}x${height}`);

      return {
        width,
        height,
        orientation: isLandscape ? 'landscape' : 'portrait',
        physicalWidth,
        physicalHeight,
      };
    } catch (error) {
      console.error('[ScreenRecorder] Failed to get screen info:', error);
      return {
        width: 720,
        height: 1280,
        orientation: 'portrait',
        physicalWidth: 1080,
        physicalHeight: 1920,
      };
    }
  }

  /**
   * 녹화 시작
   */
  async startRecording(
    deviceId: string,
    options: RecordingOptions = {}
  ): Promise<{ success: boolean; sessionId: string; error?: string; method?: 'adb' | 'deviceApp' }> {
    // 이미 녹화 중이거나 중지 중인지 확인
    if (this.recordings.has(deviceId)) {
      const session = this.recordings.get(deviceId)!;
      if (session.status === 'recording') {
        return { success: false, sessionId: '', error: '이미 녹화 중입니다.' };
      }
      if (session.status === 'stopping') {
        return { success: false, sessionId: '', error: '녹화 중지 중입니다. 잠시 후 다시 시도하세요.' };
      }
    }

    const sessionId = `rec_${Date.now()}`;

    // Device App 사용
    if (options.useDeviceApp) {
      return this.startDeviceAppRecording(deviceId, sessionId, options);
    }

    // ADB screenrecord 사용 (fallback)
    return this.startAdbRecording(deviceId, sessionId, options);
  }

  /**
   * ADB screenrecord 기반 녹화 (3분 제한)
   */
  private async startAdbRecording(
    deviceId: string,
    sessionId: string,
    options: RecordingOptions
  ): Promise<{ success: boolean; sessionId: string; error?: string; method?: 'adb' | 'deviceApp' }> {
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
      const process = spawn('adb', args);

      const session: RecordingSession = {
        deviceId,
        status: 'recording',
        startedAt: new Date(),
        remotePath,
        process,
        method: 'adb',
      };

      this.recordings.set(deviceId, session);

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
   * Device App 기반 녹화 (시간 제한 없음)
   * QA Recorder 앱이 디바이스에 설치되어 있어야 함
   */
  private async startDeviceAppRecording(
    deviceId: string,
    sessionId: string,
    options: RecordingOptions
  ): Promise<{ success: boolean; sessionId: string; error?: string; method?: 'adb' | 'deviceApp' }> {
    const filename = `${sessionId}.mp4`;
    const remotePath = `/storage/emulated/0/Android/data/com.qaautomation.recorder/files/recordings/${filename}`;
    const resultPath = `/storage/emulated/0/Android/data/com.qaautomation.recorder/files/results/result.json`;

    // 비트레이트 (기본: 2Mbps)
    const bitrate = options.bitrate ? options.bitrate * 1000000 : 2000000;

    // 해상도: 지정되지 않으면 화면 방향 자동 감지
    let resolution = options.resolution;
    if (!resolution) {
      const screenInfo = await this.getDeviceScreenInfo(deviceId);
      resolution = `${screenInfo.width}x${screenInfo.height}`;
    }

    // am startservice 명령 구성
    const command = [
      'adb', '-s', deviceId,
      'shell', 'am', 'startservice',
      '-a', 'com.qaautomation.recorder.START_RECORDING',
      '--es', 'filename', filename,
      '--ei', 'bitrate', bitrate.toString(),
      '--es', 'resolution', resolution,
      '-n', 'com.qaautomation.recorder/.RecorderService'
    ].join(' ');

    console.log(`[ScreenRecorder] Starting Device App recording on ${deviceId}: ${command}`);

    try {
      // 이전 결과 파일 삭제
      try {
        await execAsync(`adb -s ${deviceId} shell "rm -f ${resultPath}"`);
      } catch {
        // 파일이 없을 수 있음
      }

      // 녹화 시작 명령 전송
      await execAsync(command);

      // 결과 확인 (최대 5초 대기)
      let result: DeviceAppResult | null = null;
      let foundResult = false;
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 500));
        try {
          const { stdout } = await execAsync(`adb -s ${deviceId} shell "cat ${resultPath}"`);
          const parsed = JSON.parse(stdout.trim()) as DeviceAppResult;
          if (parsed && parsed.type === 'recording') {
            result = parsed;
            foundResult = true;
            break;
          }
          // 다른 타입의 결과는 무시하고 계속 대기
        } catch {
          // 파일이 아직 없거나 파싱 실패
        }
      }

      // 타임아웃: 5초 내에 올바른 결과를 받지 못함
      if (!foundResult) {
        return {
          success: false,
          sessionId: '',
          error: 'Device App 응답 타임아웃 (5초). 앱 서비스가 실행 중인지 확인하세요.',
        };
      }

      if (!result!.success) {
        return {
          success: false,
          sessionId: '',
          error: result?.message || 'Device App 녹화 시작 실패. 앱이 실행 중인지 확인하세요.',
        };
      }

      // 세션 등록
      const session: RecordingSession = {
        deviceId,
        status: 'recording',
        startedAt: new Date(),
        remotePath,
        method: 'deviceApp',
      };

      this.recordings.set(deviceId, session);

      console.log(`[ScreenRecorder] Device App recording started: ${remotePath}`);

      return { success: true, sessionId, method: 'deviceApp' };
    } catch (error) {
      console.error('[ScreenRecorder] Device App start error:', error);
      return {
        success: false,
        sessionId: '',
        error: error instanceof Error ? error.message : 'Failed to start Device App recording',
      };
    }
  }

  /**
   * Device App 녹화 중지
   */
  private async stopDeviceAppRecording(deviceId: string, session: RecordingSession): Promise<{
    success: boolean;
    videoId?: string;
    localPath?: string;
    duration?: number;
    error?: string;
  }> {
    const resultPath = `/storage/emulated/0/Android/data/com.qaautomation.recorder/files/results/result.json`;

    try {
      // 녹화 중지 명령 전송
      const command = [
        'adb', '-s', deviceId,
        'shell', 'am', 'startservice',
        '-a', 'com.qaautomation.recorder.STOP_RECORDING',
        '-n', 'com.qaautomation.recorder/.RecorderService'
      ].join(' ');

      console.log(`[ScreenRecorder] Stopping Device App recording on ${deviceId}`);
      await execAsync(command);

      // 결과 확인 (최대 10초 대기)
      let result: DeviceAppResult | null = null;
      let foundResult = false;
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 500));
        try {
          const { stdout } = await execAsync(`adb -s ${deviceId} shell "cat ${resultPath}"`);
          const parsed = JSON.parse(stdout.trim()) as DeviceAppResult;
          if (parsed && parsed.type === 'recording_stop') {
            result = parsed;
            foundResult = true;
            break;
          }
          // 다른 타입의 결과는 무시하고 계속 대기
        } catch {
          // 파일이 아직 업데이트되지 않음
        }
      }

      // 타임아웃: 10초 내에 올바른 결과를 받지 못함
      if (!foundResult) {
        return {
          success: false,
          error: 'Device App 녹화 중지 응답 타임아웃 (10초). 앱 상태를 확인하세요.',
        };
      }

      if (!result!.success) {
        return {
          success: false,
          error: result?.message || 'Device App 녹화 중지 실패',
        };
      }

      // 파일 가져오기
      const videoId = `video-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const localPath = path.join(UPLOAD_DIR, `${videoId}.mp4`);

      console.log(`[ScreenRecorder] Pulling Device App recording from ${session.remotePath} to ${localPath}`);

      await execAsync(`adb -s ${deviceId} pull "${session.remotePath}" "${localPath}"`);

      // 디바이스에서 파일 삭제
      try {
        await execAsync(`adb -s ${deviceId} shell "rm ${session.remotePath}"`);
      } catch {
        // 삭제 실패해도 무시
      }

      const duration = (Date.now() - session.startedAt.getTime()) / 1000;

      return {
        success: true,
        videoId,
        localPath,
        duration,
      };
    } catch (error) {
      console.error('[ScreenRecorder] Device App stop error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to stop Device App recording',
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

    // Device App으로 녹화한 경우 (method 필드로 명시적 구분)
    if (session.method === 'deviceApp') {
      const result = await this.stopDeviceAppRecording(deviceId, session);
      if (result.success) {
        session.status = 'completed';
        session.localPath = result.localPath;
        session.duration = result.duration;
        this.recordings.delete(deviceId);
      } else {
        session.status = 'error';
        session.error = result.error;
      }
      return result;
    }

    // ADB screenrecord 녹화 중지
    try {
      if (session.process && session.process.pid) {
        const pid = session.process.pid;

        if (process.platform === 'win32') {
          console.log(`[ScreenRecorder] Stopping process ${pid} on Windows...`);

          // 강제 종료
          try {
            await execAsync(`taskkill /PID ${pid} /T /F`);
            console.log(`[ScreenRecorder] Process ${pid} killed`);
          } catch {
            console.log(`[ScreenRecorder] Process ${pid} already exited`);
          }
        } else {
          session.process.kill('SIGINT');
        }

        // 프로세스 종료 대기
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => resolve(), 3000);
          session.process?.on('close', () => {
            clearTimeout(timeout);
            resolve();
          });
        });

        console.log(`[ScreenRecorder] Process ${pid} stopped`);
      }

      // 디바이스에서 파일 가져오기
      const videoId = `video-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const localPath = path.join(UPLOAD_DIR, `${videoId}.mp4`);

      console.log(`[ScreenRecorder] Pulling file from ${session.remotePath} to ${localPath}`);

      await execAsync(`adb -s ${deviceId} pull "${session.remotePath}" "${localPath}"`);
      await execAsync(`adb -s ${deviceId} shell rm "${session.remotePath}"`);

      session.status = 'completed';
      session.localPath = localPath;
      session.duration = (Date.now() - session.startedAt.getTime()) / 1000;

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
      method: session.method,
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
        method: session.method,
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
      if (session.process) {
        session.process.kill('SIGKILL');
      }

      try {
        await execAsync(`adb -s ${deviceId} shell rm "${session.remotePath}"`);
      } catch {
        // 파일이 없을 수도 있음
      }

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

  // ========================================
  // 템플릿 동기화 (Device App OpenCV 매칭용)
  // ========================================

  /**
   * 템플릿 이미지를 디바이스로 푸시
   * @param deviceId 디바이스 ID
   * @param templatePath 로컬 템플릿 파일 경로
   * @param templateName 디바이스에 저장할 파일명
   */
  async pushTemplate(
    deviceId: string,
    templatePath: string,
    templateName: string
  ): Promise<{ success: boolean; remotePath?: string; error?: string }> {
    const remotePath = `/storage/emulated/0/Android/data/com.qaautomation.recorder/files/templates/${templateName}`;

    try {
      // 템플릿 디렉토리 생성
      await execAsync(`adb -s ${deviceId} shell "mkdir -p /storage/emulated/0/Android/data/com.qaautomation.recorder/files/templates"`);

      // 파일 푸시
      await execAsync(`adb -s ${deviceId} push "${templatePath}" "${remotePath}"`);

      console.log(`[ScreenRecorder] Template pushed: ${templateName} -> ${deviceId}`);
      return { success: true, remotePath };
    } catch (error) {
      console.error('[ScreenRecorder] pushTemplate error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to push template',
      };
    }
  }

  /**
   * 여러 템플릿을 디바이스로 푸시
   */
  async pushTemplates(
    deviceId: string,
    templates: Array<{ localPath: string; name: string }>
  ): Promise<{ success: boolean; pushed: number; failed: number; errors: string[] }> {
    const errors: string[] = [];
    let pushed = 0;
    let failed = 0;

    for (const template of templates) {
      const result = await this.pushTemplate(deviceId, template.localPath, template.name);
      if (result.success) {
        pushed++;
      } else {
        failed++;
        errors.push(`${template.name}: ${result.error}`);
      }
    }

    return { success: failed === 0, pushed, failed, errors };
  }

  /**
   * 디바이스의 템플릿 목록 조회
   */
  async listDeviceTemplates(deviceId: string): Promise<{ success: boolean; templates?: string[]; error?: string }> {
    try {
      const { stdout } = await execAsync(
        `adb -s ${deviceId} shell "ls /storage/emulated/0/Android/data/com.qaautomation.recorder/files/templates/ 2>/dev/null || echo ''"`
      );
      const templates = stdout.trim().split('\n').filter(f => f.length > 0);
      return { success: true, templates };
    } catch (error) {
      return { success: true, templates: [] }; // 디렉토리가 없으면 빈 배열
    }
  }

  /**
   * 디바이스의 템플릿 삭제
   */
  async deleteDeviceTemplate(deviceId: string, templateName: string): Promise<{ success: boolean; error?: string }> {
    try {
      await execAsync(
        `adb -s ${deviceId} shell "rm /storage/emulated/0/Android/data/com.qaautomation.recorder/files/templates/${templateName}"`
      );
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete template',
      };
    }
  }

  /**
   * Device App으로 템플릿 매칭 요청
   * @param deviceId 디바이스 ID
   * @param templateName 템플릿 파일명
   * @param threshold 매칭 임계값 (0.0 ~ 1.0)
   * @param region ROI 영역 (옵션)
   */
  async matchTemplateOnDevice(
    deviceId: string,
    templateName: string,
    threshold: number = 0.8,
    region?: { x: number; y: number; width: number; height: number }
  ): Promise<{
    success: boolean;
    found?: boolean;
    x?: number;
    y?: number;
    confidence?: number;
    matchTime?: number;
    highlightPath?: string;  // 로컬에 저장된 하이라이트 이미지 경로
    error?: string;
  }> {
    const resultPath = `/storage/emulated/0/Android/data/com.qaautomation.recorder/files/results/result.json`;

    try {
      // 매칭 명령 구성
      let command = `adb -s ${deviceId} shell am broadcast -a com.qaautomation.recorder.MATCH_TEMPLATE --es template "${templateName}" --ef threshold ${threshold}`;

      // ROI 영역이 있으면 추가
      if (region) {
        command += ` --ei roi_x ${region.x} --ei roi_y ${region.y} --ei roi_width ${region.width} --ei roi_height ${region.height}`;
      }

      console.log(`[ScreenRecorder] Requesting device-side template match: ${templateName}`);
      await execAsync(command);

      // 결과 대기 (최대 5초)
      let result: { type: string; success: boolean; message: string } | null = null;
      let foundResult = false;

      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 500));
        try {
          const { stdout } = await execAsync(`adb -s ${deviceId} shell "cat ${resultPath}"`);
          const parsed = JSON.parse(stdout.trim());
          if (parsed && parsed.type === 'match') {
            result = parsed;
            foundResult = true;
            break;
          }
        } catch {
          // 파일이 아직 업데이트되지 않음
        }
      }

      if (!foundResult) {
        return { success: false, error: 'Device App 매칭 응답 타임아웃 (5초)' };
      }

      // result.message에는 JSON 형태의 매칭 결과가 들어있음
      try {
        const matchResult = JSON.parse(result!.message);
        
        // 하이라이트 이미지가 있으면 로컬로 pull
        let localHighlightPath: string | undefined;
        if (matchResult.found && matchResult.highlightPath) {
          localHighlightPath = await this.pullHighlightImage(deviceId, matchResult.highlightPath, templateName);
        }

        return {
          success: true,
          found: matchResult.found,
          x: matchResult.x,
          y: matchResult.y,
          confidence: matchResult.confidence,
          matchTime: matchResult.matchTime,
          highlightPath: localHighlightPath,
        };
      } catch {
        return {
          success: result!.success,
          found: result!.success,
          error: result!.success ? undefined : result!.message,
        };
      }
    } catch (error) {
      console.error('[ScreenRecorder] matchTemplateOnDevice error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Device App matching failed',
      };
    }
  }


  /**
   * 디바이스에서 하이라이트 이미지를 로컬로 pull
   * @param deviceId 디바이스 ID
   * @param devicePath 디바이스 내 하이라이트 이미지 경로
   * @param templateName 템플릿 이름 (파일명 생성용)
   * @returns 로컬에 저장된 파일 경로 (상대 경로)
   */
  private async pullHighlightImage(
    deviceId: string,
    devicePath: string,
    templateName: string
  ): Promise<string | undefined> {
    try {
      // 하이라이트 이미지 저장 디렉토리
      const highlightsDir = path.join(__dirname, '../../reports/highlights');
      await fsPromises.mkdir(highlightsDir, { recursive: true });

      // 파일명 생성 (deviceId_templateName_timestamp.jpg)
      const safeDeviceId = deviceId.replace(/[^a-zA-Z0-9.-]/g, '_');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${safeDeviceId}_${templateName}_${timestamp}.jpg`;
      const localPath = path.join(highlightsDir, filename);

      // ADB pull 명령 실행
      await execAsync(`adb -s ${deviceId} pull "${devicePath}" "${localPath}"`);

      // 디바이스에서 원본 파일 삭제 (저장 공간 확보)
      await execAsync(`adb -s ${deviceId} shell rm "${devicePath}"`).catch(() => {
        // 삭제 실패 무시
      });

      console.log(`[ScreenRecorder] 하이라이트 이미지 pull 완료: ${filename}`);

      // 상대 경로 반환 (리포트에서 사용)
      return `highlights/${filename}`;
    } catch (error) {
      console.warn(`[ScreenRecorder] 하이라이트 이미지 pull 실패:`, error);
      return undefined;
    }
  }

  // ========================================
  // 디바이스 앱 상태 확인
  // ========================================

  // 디바이스별 OpenCV 준비 상태 캐시 (5분 TTL)
  private deviceOpenCVCache: Map<string, { ready: boolean; timestamp: number }> = new Map();
  private readonly OPENCV_CACHE_TTL = 5 * 60 * 1000; // 5분

  /**
   * 디바이스 앱 상태 확인
   * @param deviceId 디바이스 ID
   * @returns 서비스 상태 정보
   */
  async checkDeviceAppStatus(deviceId: string): Promise<{
    success: boolean;
    serviceRunning?: boolean;
    isRecording?: boolean;
    isOpenCVReady?: boolean;
    message?: string;
    error?: string;
  }> {
    const resultPath = `/storage/emulated/0/Android/data/com.qaautomation.recorder/files/results/result.json`;

    try {
      // GET_STATUS 브로드캐스트 전송
      await execAsync(
        `adb -s ${deviceId} shell am broadcast -a com.qaautomation.recorder.GET_STATUS`
      );

      // 결과 대기 (최대 3초)
      for (let i = 0; i < 6; i++) {
        await new Promise((r) => setTimeout(r, 500));
        try {
          const { stdout } = await execAsync(`adb -s ${deviceId} shell "cat ${resultPath}"`);
          const parsed = JSON.parse(stdout.trim());
          if (parsed && parsed.type === 'status') {
            // 캐시 업데이트
            this.deviceOpenCVCache.set(deviceId, {
              ready: parsed.isOpenCVReady === true,
              timestamp: Date.now(),
            });

            return {
              success: true,
              serviceRunning: parsed.serviceRunning,
              isRecording: parsed.isRecording,
              isOpenCVReady: parsed.isOpenCVReady,
              message: parsed.message,
            };
          }
        } catch {
          // 파일이 아직 업데이트되지 않음
        }
      }

      return { success: false, error: 'Device App 상태 응답 타임아웃' };
    } catch (error) {
      console.error('[ScreenRecorder] checkDeviceAppStatus error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to check device app status',
      };
    }
  }

  /**
   * 디바이스 매칭 사용 가능 여부 확인 (캐시 사용)
   * @param deviceId 디바이스 ID
   * @param forceRefresh 캐시 무시하고 새로 확인
   * @returns OpenCV 매칭 사용 가능 여부
   */
  async isDeviceMatchingAvailable(deviceId: string, forceRefresh = false): Promise<boolean> {
    // 캐시 확인
    const cached = this.deviceOpenCVCache.get(deviceId);
    if (!forceRefresh && cached && Date.now() - cached.timestamp < this.OPENCV_CACHE_TTL) {
      return cached.ready;
    }

    // 상태 확인
    const status = await this.checkDeviceAppStatus(deviceId);
    return status.success && status.isOpenCVReady === true;
  }

  /**
   * 디바이스 OpenCV 캐시 초기화
   * @param deviceId 특정 디바이스 ID (없으면 전체 초기화)
   */
  clearDeviceCache(deviceId?: string): void {
    if (deviceId) {
      this.deviceOpenCVCache.delete(deviceId);
    } else {
      this.deviceOpenCVCache.clear();
    }
  }

  /**
   * 템플릿 동기화 후 디바이스 매칭 사용 가능 여부 확인
   * 필요한 템플릿을 디바이스에 푸시하고 OpenCV 상태 확인
   * @param deviceId 디바이스 ID
   * @param templateIds 필요한 템플릿 ID 목록
   * @returns 성공 여부 및 동기화 결과
   */
  async syncAndCheckDeviceMatching(
    deviceId: string,
    templateIds: string[]
  ): Promise<{
    success: boolean;
    isDeviceMatchingAvailable: boolean;
    syncedTemplates: string[];
    failedTemplates: string[];
  }> {
    const syncedTemplates: string[] = [];
    const failedTemplates: string[] = [];

    // 디바이스에 있는 템플릿 목록 확인
    const { templates: deviceTemplates = [] } = await this.listDeviceTemplates(deviceId);

    // 템플릿 동기화
    for (const templateId of templateIds) {
      const templatePath = path.join(process.cwd(), 'templates', templateId);

      // 이미 디바이스에 있으면 스킵
      if (deviceTemplates.includes(templateId)) {
        syncedTemplates.push(templateId);
        continue;
      }

      // 파일이 존재하는지 확인
      try {
        await fsPromises.access(templatePath);
        const result = await this.pushTemplate(deviceId, templatePath, templateId);
        if (result.success) {
          syncedTemplates.push(templateId);
        } else {
          failedTemplates.push(templateId);
        }
      } catch {
        failedTemplates.push(templateId);
      }
    }

    // OpenCV 상태 확인
    const isAvailable = await this.isDeviceMatchingAvailable(deviceId, true);

    console.log(
      `[ScreenRecorder] Template sync complete: ${syncedTemplates.length} synced, ` +
        `${failedTemplates.length} failed, OpenCV: ${isAvailable}`
    );

    return {
      success: failedTemplates.length === 0,
      isDeviceMatchingAvailable: isAvailable,
      syncedTemplates,
      failedTemplates,
    };
  }
}

// 싱글톤 인스턴스
export const screenRecorder = new ScreenRecorder();
