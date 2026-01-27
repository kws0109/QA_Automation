// backend/src/utils/logger.ts
// 중앙 집중식 로깅 유틸리티
// 로그 레벨 및 출력 설정 관리

/**
 * 로그 레벨 enum
 * 숫자가 높을수록 더 상세한 로그
 */
export enum LogLevel {
  ERROR = 0,   // 오류만
  WARN = 1,    // 경고 + 오류
  INFO = 2,    // 일반 정보 + 경고 + 오류
  DEBUG = 3,   // 디버그 + 일반 정보 + 경고 + 오류
}

/**
 * 로그 레벨 문자열 → enum 변환
 */
function parseLogLevel(level: string | undefined): LogLevel {
  if (!level) return LogLevel.INFO;

  switch (level.toUpperCase()) {
    case 'ERROR': return LogLevel.ERROR;
    case 'WARN': return LogLevel.WARN;
    case 'INFO': return LogLevel.INFO;
    case 'DEBUG': return LogLevel.DEBUG;
    default: return LogLevel.INFO;
  }
}

/**
 * 로그 컨텍스트 (모듈/서비스 이름)
 */
interface LogContext {
  module: string;
}

/**
 * Logger 클래스
 * 모듈별로 인스턴스 생성하여 사용
 */
class Logger {
  private static globalLevel: LogLevel = parseLogLevel(process.env.LOG_LEVEL);
  private context: LogContext;
  private enabled: boolean;

  constructor(module: string) {
    this.context = { module };
    // 특정 모듈 비활성화 옵션 (쉼표 구분)
    // 예: LOG_DISABLED_MODULES=ScreenRecorder,SessionManager
    const disabledModules = (process.env.LOG_DISABLED_MODULES || '').split(',').map(m => m.trim());
    this.enabled = !disabledModules.includes(module);
  }

  /**
   * 전역 로그 레벨 설정
   */
  static setGlobalLevel(level: LogLevel): void {
    Logger.globalLevel = level;
    console.log(`[Logger] Global log level set to: ${LogLevel[level]}`);
  }

  /**
   * 전역 로그 레벨 조회
   */
  static getGlobalLevel(): LogLevel {
    return Logger.globalLevel;
  }

  /**
   * 타임스탬프 생성
   */
  private getTimestamp(): string {
    return new Date().toISOString();
  }

  /**
   * 포맷된 메시지 생성
   */
  private formatMessage(level: string, message: string): string {
    return `[${this.getTimestamp()}] [${level}] [${this.context.module}] ${message}`;
  }

  /**
   * DEBUG 레벨 로그
   */
  debug(message: string, ...args: unknown[]): void {
    if (!this.enabled || Logger.globalLevel < LogLevel.DEBUG) return;
    console.debug(this.formatMessage('DEBUG', message), ...args);
  }

  /**
   * INFO 레벨 로그
   */
  info(message: string, ...args: unknown[]): void {
    if (!this.enabled || Logger.globalLevel < LogLevel.INFO) return;
    console.log(this.formatMessage('INFO', message), ...args);
  }

  /**
   * WARN 레벨 로그
   */
  warn(message: string, ...args: unknown[]): void {
    if (!this.enabled || Logger.globalLevel < LogLevel.WARN) return;
    console.warn(this.formatMessage('WARN', message), ...args);
  }

  /**
   * ERROR 레벨 로그
   */
  error(message: string, ...args: unknown[]): void {
    if (!this.enabled || Logger.globalLevel < LogLevel.ERROR) return;
    console.error(this.formatMessage('ERROR', message), ...args);
  }

  /**
   * 항상 출력되는 로그 (레벨 무시)
   * 서버 시작/종료 등 중요한 메시지용
   */
  always(message: string, ...args: unknown[]): void {
    console.log(this.formatMessage('INFO', message), ...args);
  }
}

/**
 * Logger 인스턴스 생성 헬퍼
 * @param module 모듈/서비스 이름
 */
export function createLogger(module: string): Logger {
  return new Logger(module);
}

/**
 * 기본 Logger 인스턴스 (모듈명 미지정 시)
 */
export const logger = new Logger('App');

export default Logger;
