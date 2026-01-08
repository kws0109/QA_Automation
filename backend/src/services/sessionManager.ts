import { remote, Browser } from 'webdriverio';
import { SessionInfo, DeviceInfo } from '../types';
import { Actions } from '../appium/actions';

interface ManagedSession {
  driver: Browser;
  actions: Actions;  // 추가
  info: SessionInfo;
}

class SessionManager {
  private sessions: Map<string, ManagedSession> = new Map();
  private appiumPort = 4723;  // 모든 세션이 같은 Appium 서버 사용
  private baseMjpegPort = 9100;
  private usedMjpegPorts: Set<number> = new Set();

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
   * 디바이스에 새 세션 생성
   */
  async createSession(device: DeviceInfo): Promise<SessionInfo> {
    const existing = this.sessions.get(device.id);
    if (existing) {
      console.log(`Session already exists for ${device.id}`);
      return existing.info;
    }

    const mjpegPort = this.getAvailableMjpegPort();

    const capabilities = {
      platformName: 'Android',
      'appium:automationName': 'UiAutomator2',
      'appium:udid': device.id,
      'appium:noReset': true,
      'appium:newCommandTimeout': 300,
      'appium:mjpegServerPort': mjpegPort,
      'appium:mjpegScreenshotUrl': `http://localhost:${mjpegPort}`,
    };

    try {
      console.log(`Creating session for ${device.id} on port ${this.appiumPort}...`);

      const driver = await remote({
        hostname: 'localhost',
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
      console.log(`Session created for ${device.id}: ${sessionInfo.sessionId}`);

      return sessionInfo;
    } catch (error) {
      console.error(`Failed to create session for ${device.id}:`, error);
      throw error;
    }
  }

  /**
   * 세션 종료
   */
  async destroySession(deviceId: string): Promise<boolean> {
    const session = this.sessions.get(deviceId);
    if (!session) {
      console.log(`No session found for ${deviceId}`);
      return false;
    }

    try {
      // Actions 중지
      session.actions.stop();

      // MJPEG 포트 해제
      this.usedMjpegPorts.delete(session.info.mjpegPort);

      await session.driver.deleteSession();
      this.sessions.delete(deviceId);
      console.log(`Session destroyed for ${deviceId}`);
      return true;
    } catch (error) {
      console.error(`Failed to destroy session for ${deviceId}:`, error);
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
    console.log('All sessions destroyed');
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
      console.log(`Session health check failed for ${deviceId}, removing dead session`);
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