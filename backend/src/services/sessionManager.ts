import { remote, Browser } from 'webdriverio';
import { SessionInfo, DeviceInfo } from '../types';
import { Actions } from '../appium/actions';
import axios from 'axios';
import { execSync } from 'child_process';
import { createLogger } from '../utils/logger';

const logger = createLogger('SessionManager');

interface ManagedSession {
  driver: Browser;
  actions: Actions;  // 추가
  info: SessionInfo;
}

interface AppiumSession {
  id: string;
  capabilities: {
    'appium:udid'?: string;
    udid?: string;
  };
}

// Appium 서버 호스트 (환경 변수 또는 기본값)
const APPIUM_HOST = process.env.APPIUM_HOST || '127.0.0.1';

class SessionManager {
  private sessions: Map<string, ManagedSession> = new Map();
  private appiumHost = APPIUM_HOST;
  private appiumPort = parseInt(process.env.APPIUM_PORT || '4900', 10);  // .env에서 설정 (Windows 예약 포트 회피)
  private baseMjpegPort = 9100;
  private usedMjpegPorts: Set<number> = new Set();

  // 세션 생성 중인 디바이스 추적 (race condition 방지)
  private creatingDevices: Map<string, Promise<SessionInfo>> = new Map();

  /**
   * 사용 가능한 MJPEG 포트 찾기
   */
  private getAvailableMjpegPort(): number {
    let port = this.baseMjpegPort;
    while (this.usedMjpegPorts.has(port)) {
      port++;
    }
    this.usedMjpegPorts.add(port);
    return port;
  }

  /**
   * Appium 서버에서 특정 디바이스의 기존 세션 강제 종료
   */
  private async cleanupAppiumSessions(deviceId: string): Promise<void> {
    try {
      // Appium 서버에서 모든 세션 조회
      const response = await axios.get<{ value: AppiumSession[] }>(
        `http://${this.appiumHost}:${this.appiumPort}/sessions`,
        { timeout: 5000 }
      );

      const sessions = response.data.value || [];

      for (const session of sessions) {
        const sessionUdid = session.capabilities?.['appium:udid'] || session.capabilities?.udid;

        // 해당 디바이스의 세션이면 종료
        if (sessionUdid === deviceId) {
          logger.info(`🧹 [${deviceId}] 기존 Appium 세션 정리: ${session.id}`);
          try {
            await axios.delete(
              `http://${this.appiumHost}:${this.appiumPort}/session/${session.id}`,
              { timeout: 5000 }
            );
          } catch (deleteErr) {
            logger.warn(`세션 삭제 실패 (무시): ${session.id}`);
          }
        }
      }
    } catch (err) {
      // 세션 조회 실패는 무시 (Appium 서버가 없거나 세션이 없는 경우)
      logger.info(`Appium 세션 조회 스킵: ${(err as Error).message}`);
    }
  }

  /**
   * Appium 서버의 모든 세션 강제 종료
   */
  async cleanupAllAppiumSessions(): Promise<void> {
    try {
      const response = await axios.get<{ value: AppiumSession[] }>(
        `http://${this.appiumHost}:${this.appiumPort}/sessions`,
        { timeout: 5000 }
      );

      const sessions = response.data.value || [];
      logger.info(`🧹 Appium 서버에서 ${sessions.length}개 세션 정리 중...`);

      for (const session of sessions) {
        try {
          await axios.delete(
            `http://${this.appiumHost}:${this.appiumPort}/session/${session.id}`,
            { timeout: 5000 }
          );
          logger.info(`  - 세션 종료: ${session.id}`);
        } catch (deleteErr) {
          logger.warn(`  - 세션 삭제 실패: ${session.id}`);
        }
      }

      // 내부 세션 맵도 정리
      this.sessions.clear();
      this.usedMjpegPorts.clear();
      logger.info('✅ 모든 Appium 세션 정리 완료');
    } catch (err) {
      logger.info(`Appium 세션 정리 스킵: ${(err as Error).message}`);
    }
  }

  /**
   * 디바이스에서 UiAutomator2 프로세스 강제 종료
   * 세션 크래시 복구 시 사용
   */
  private async killUiAutomator2Process(deviceId: string): Promise<void> {
    try {
      logger.info(`🔧 [${deviceId}] UiAutomator2 프로세스 강제 종료 중...`);

      // UiAutomator2 서버 패키지 강제 종료
      const packages = [
        'io.appium.uiautomator2.server',
        'io.appium.uiautomator2.server.test',
        'io.appium.settings',
      ];

      for (const pkg of packages) {
        try {
          execSync(`adb -s ${deviceId} shell am force-stop ${pkg}`, {
            encoding: 'utf-8',
            timeout: 5000,
            stdio: ['pipe', 'pipe', 'pipe'],
          });
          logger.info(`  - ${pkg} 종료됨`);
        } catch {
          // 패키지가 없거나 이미 종료된 경우 무시
        }
      }

      // UiAutomator2 instrumentation 프로세스 직접 종료
      try {
        const psOutput = execSync(`adb -s ${deviceId} shell ps | grep uiautomator`, {
          encoding: 'utf-8',
          timeout: 5000,
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        const lines = psOutput.split('\n').filter(line => line.trim());
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 2) {
            const pid = parts[1];
            try {
              execSync(`adb -s ${deviceId} shell kill -9 ${pid}`, {
                timeout: 3000,
                stdio: ['pipe', 'pipe', 'pipe'],
              });
              logger.info(`  - PID ${pid} 종료됨`);
            } catch {
              // 이미 종료된 경우 무시
            }
          }
        }
      } catch {
        // ps 명령 실패 무시
      }

      // ADB 포트 포워딩에서 UiAutomator2 관련 포트(8200, 8201) 제거
      try {
        const forwardList = execSync(`adb -s ${deviceId} forward --list`, {
          encoding: 'utf-8',
          timeout: 5000,
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        const lines = forwardList.split('\n');
        for (const line of lines) {
          // UiAutomator2 기본 포트 8200, 8201
          if (line.includes('tcp:8200') || line.includes('tcp:8201')) {
            const match = line.match(/tcp:(\d+)/);
            if (match) {
              try {
                execSync(`adb -s ${deviceId} forward --remove tcp:${match[1]}`, {
                  timeout: 3000,
                  stdio: ['pipe', 'pipe', 'pipe'],
                });
                logger.info(`  - 포트 포워딩 ${match[1]} 제거됨`);
              } catch {
                // 무시
              }
            }
          }
        }
      } catch {
        // forward 명령 실패 무시
      }

      logger.info(`✅ [${deviceId}] UiAutomator2 프로세스 정리 완료`);
    } catch (err) {
      logger.warn(`[${deviceId}] UiAutomator2 정리 실패: ${(err as Error).message}`);
    }
  }

  /**
   * 세션 크래시 복구 시도
   * UiAutomator2 프로세스를 완전히 정리하고 새 세션 생성
   */
  async recoverSession(device: DeviceInfo): Promise<SessionInfo> {
    logger.info(`🔄 [${device.id}] 세션 복구 시작...`);

    // 1. 내부 세션 정보 정리
    const existingSession = this.sessions.get(device.id);
    if (existingSession) {
      try {
        existingSession.actions.stop();
      } catch { /* 무시 */ }
      this.usedMjpegPorts.delete(existingSession.info.mjpegPort);
      this.sessions.delete(device.id);
    }

    // 2. Appium 서버에서 해당 디바이스 세션 정리
    await this.cleanupAppiumSessions(device.id);

    // 3. 디바이스에서 UiAutomator2 프로세스 강제 종료
    await this.killUiAutomator2Process(device.id);

    // 4. 잠시 대기 (프로세스 완전 종료 대기)
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 5. 새 세션 생성
    logger.info(`[${device.id}] 새 세션 생성 중...`);
    return this.doCreateSession(device);
  }

  /**
   * 디바이스에 새 세션 생성
   */
  async createSession(device: DeviceInfo): Promise<SessionInfo> {
    // 이미 세션 생성 중이면 해당 Promise 반환 (중복 생성 방지)
    const pendingCreation = this.creatingDevices.get(device.id);
    if (pendingCreation) {
      logger.info(`⏳ [${device.id}] 세션 생성 진행 중, 기존 요청 대기...`);
      return pendingCreation;
    }

    // 내부 세션 맵에 이미 있으면 반환
    const existing = this.sessions.get(device.id);
    if (existing) {
      // 기존 세션이 살아있는지 확인
      const isHealthy = await this.checkSessionHealth(device.id);
      if (isHealthy) {
        logger.info(`Session already exists for ${device.id}`);
        return existing.info;
      }
    }

    // 세션 생성 Promise 생성 및 등록
    const creationPromise = this.doCreateSession(device);
    this.creatingDevices.set(device.id, creationPromise);

    try {
      const result = await creationPromise;
      return result;
    } finally {
      // 완료 후 생성 중 목록에서 제거
      this.creatingDevices.delete(device.id);
    }
  }

  /**
   * 실제 세션 생성 로직 (내부용)
   */
  private async doCreateSession(device: DeviceInfo): Promise<SessionInfo> {
    // Appium 서버에서 해당 디바이스의 기존 세션 정리
    logger.info(`🔄 [${device.id}] 기존 세션 정리 후 새 세션 생성...`);
    await this.cleanupAppiumSessions(device.id);

    // 내부 세션 맵에서도 정리
    if (this.sessions.has(device.id)) {
      const oldSession = this.sessions.get(device.id);
      if (oldSession) {
        this.usedMjpegPorts.delete(oldSession.info.mjpegPort);
        oldSession.actions.stop();
      }
      this.sessions.delete(device.id);
    }

    // 디바이스에서 기존 UiAutomator2 프로세스 강제 정리 (크래시 방지)
    await this.killUiAutomator2Process(device.id);

    const mjpegPort = this.getAvailableMjpegPort();

    const capabilities = {
      platformName: 'Android',
      'appium:automationName': 'UiAutomator2',
      'appium:udid': device.id,
      'appium:noReset': true,
      'appium:newCommandTimeout': 600,  // 10분 (기존 5분 → 증가)
      'appium:mjpegServerPort': mjpegPort,
      'appium:mjpegScreenshotUrl': `http://${this.appiumHost}:${mjpegPort}`,
      'appium:mjpegScalingFactor': 100,  // 원본 해상도 (좌표 정확도 필수)
      'appium:allowInsecure': ['adb_shell'],  // pm clear 등 ADB shell 명령 허용
      'appium:unicodeKeyboard': true,  // Appium 유니코드 키보드 사용 (IME 우회)
      'appium:resetKeyboard': true,    // 세션 종료 시 원래 키보드 복원
      // UiAutomator2 안정성 개선
      'appium:uiautomator2ServerInstallTimeout': 120000,  // 서버 설치 타임아웃 120초 (증가)
      'appium:uiautomator2ServerLaunchTimeout': 120000,   // 서버 시작 타임아웃 120초 (증가)
      'appium:uiautomator2ServerReadTimeout': 60000,      // 서버 읽기 타임아웃 60초 (추가)
      'appium:skipServerInstallation': false,  // 서버 재설치 허용 (크래시 복구)
      'appium:disableWindowAnimation': true,   // 애니메이션 비활성화 (안정성)
      'appium:ignoreUnimportantViews': true,   // 불필요한 뷰 무시 (성능 개선)
      'appium:skipUnlock': true,               // 잠금해제 스킵 (이미 해제된 상태 가정)
      'appium:suppressKillServer': true,       // 세션 종료 시 서버 유지 (재사용)
    };

    try {
      logger.info(`Creating session for ${device.id} on port ${this.appiumPort}...`);

      const driver = await remote({
        hostname: this.appiumHost,
        port: this.appiumPort,
        path: '/',
        capabilities,
        logLevel: 'warn',
      });

      const sessionInfo: SessionInfo = {
        deviceId: device.id,
        sessionId: driver.sessionId || '',
        appiumPort: this.appiumPort,
        mjpegPort,
        createdAt: new Date(),
        status: 'active',
      };

      // Actions 인스턴스 생성 (드라이버 제공자 함수 전달)
      const actions = new Actions(
        async () => driver,
        device.id
      );

      this.sessions.set(device.id, { driver, actions, info: sessionInfo });
      logger.info(`Session created for ${device.id}: ${sessionInfo.sessionId}`);

      return sessionInfo;
    } catch (error) {
      logger.error('Failed to create session', error as Error, { deviceId: device.id });
      // 실패 시 포트 반환
      this.usedMjpegPorts.delete(mjpegPort);
      throw error;
    }
  }

  /**
   * 세션 종료
   */
  async destroySession(deviceId: string): Promise<boolean> {
    const session = this.sessions.get(deviceId);
    if (!session) {
      logger.info(`No session found for ${deviceId}`);
      return false;
    }

    try {
      // Actions 중지
      session.actions.stop();

      // MJPEG 포트 해제
      this.usedMjpegPorts.delete(session.info.mjpegPort);

      await session.driver.deleteSession();
      this.sessions.delete(deviceId);
      logger.info(`Session destroyed for ${deviceId}`);
      return true;
    } catch (error) {
      logger.error('Failed to destroy session', error as Error, { deviceId });
      // 실패해도 포트와 세션 정리
      this.usedMjpegPorts.delete(session.info.mjpegPort);
      this.sessions.delete(deviceId);
      return false;
    }
  }

  /**
   * 모든 세션 종료
   */
  async destroyAllSessions(): Promise<void> {
    const deviceIds = Array.from(this.sessions.keys());
    await Promise.all(deviceIds.map(id => this.destroySession(id)));
    logger.info('All sessions destroyed');
  }

  /**
   * 세션 드라이버 가져오기
   */
  getDriver(deviceId: string): Browser | null {
    return this.sessions.get(deviceId)?.driver || null;
  }

  /**
   * Actions 인스턴스 가져오기
   */
  getActions(deviceId: string): Actions | null {
    return this.sessions.get(deviceId)?.actions || null;
  }

  /**
   * 세션 정보 가져오기
   */
  getSessionInfo(deviceId: string): SessionInfo | null {
    return this.sessions.get(deviceId)?.info || null;
  }

  /**
   * 세션 상태 확인 (실제 동작 여부)
   */
  async checkSessionHealth(deviceId: string): Promise<boolean> {
    const session = this.sessions.get(deviceId);
    if (!session) return false;

    try {
      // 간단한 명령으로 세션이 실제로 작동하는지 확인
      await session.driver.getWindowSize();
      return true;
    } catch (error) {
      logger.info(`Session health check failed for ${deviceId}, removing dead session`);
      // 세션이 죽었으면 정리
      this.usedMjpegPorts.delete(session.info.mjpegPort);
      this.sessions.delete(deviceId);
      return false;
    }
  }

  /**
   * 세션 확인 또는 생성 (자동 복구)
   */
  async ensureSession(device: DeviceInfo): Promise<SessionInfo> {
    const existing = this.sessions.get(device.id);

    if (existing) {
      // 기존 세션이 있으면 상태 확인
      const isHealthy = await this.checkSessionHealth(device.id);
      if (isHealthy) {
        return existing.info;
      }
      // 세션이 죽었으면 checkSessionHealth에서 이미 정리됨
    }

    // 새 세션 생성
    return this.createSession(device);
  }

  /**
   * 여러 디바이스의 세션을 검증하고 필요시 재생성
   * @returns 검증/재생성 결과
   */
  async validateAndEnsureSessions(deviceIds: string[], devices: DeviceInfo[]): Promise<{
    validatedDeviceIds: string[];
    recreatedDeviceIds: string[];
    failedDeviceIds: string[];
  }> {
    const validatedDeviceIds: string[] = [];
    const recreatedDeviceIds: string[] = [];
    const failedDeviceIds: string[] = [];

    for (const deviceId of deviceIds) {
      const device = devices.find(d => d.id === deviceId);
      if (!device) {
        logger.warn(`[SessionManager] 디바이스 정보를 찾을 수 없음: ${deviceId}`);
        failedDeviceIds.push(deviceId);
        continue;
      }

      const existing = this.sessions.get(deviceId);

      if (existing) {
        // 기존 세션이 있으면 상태 확인
        const isHealthy = await this.checkSessionHealth(deviceId);
        if (isHealthy) {
          logger.info(`✅ [${deviceId}] 세션 유효함`);
          validatedDeviceIds.push(deviceId);
          continue;
        }

        // 세션이 죽었으면 재생성 시도
        logger.info(`🔄 [${deviceId}] 세션 무효 - 재생성 시도...`);
        try {
          await this.createSession(device);
          logger.info(`✅ [${deviceId}] 세션 재생성 완료`);
          recreatedDeviceIds.push(deviceId);
        } catch (err) {
          logger.error('Session recreation failed', err as Error, { deviceId });
          failedDeviceIds.push(deviceId);
        }
      } else {
        // 세션이 없으면 새로 생성
        logger.info(`[${deviceId}] No session - creating...`);
        try {
          await this.createSession(device);
          logger.info(`[${deviceId}] Session created`);
          recreatedDeviceIds.push(deviceId);
        } catch (err) {
          logger.error('Session creation failed', err as Error, { deviceId });
          failedDeviceIds.push(deviceId);
        }
      }
    }

    return { validatedDeviceIds, recreatedDeviceIds, failedDeviceIds };
  }

  /**
   * 모든 활성 세션 목록
   */
  getAllSessions(): SessionInfo[] {
    return Array.from(this.sessions.values()).map(s => s.info);
  }

  /**
   * 세션 존재 여부 확인
   */
  hasSession(deviceId: string): boolean {
    return this.sessions.has(deviceId);
  }

  /**
   * 활성 세션 수
   */
  getActiveSessionCount(): number {
    return this.sessions.size;
  }
}

export const sessionManager = new SessionManager();