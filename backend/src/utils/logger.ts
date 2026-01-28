// backend/src/utils/logger.ts
// 구조화된 로깅 시스템 (winston 없이 console 래퍼 방식)
// 개발 환경: 컬러 콘솔 출력
// 프로덕션 환경: JSON 포맷

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
 * 로그 컨텍스트
 */
interface LogContext {
  module: string;
  [key: string]: unknown;
}

/**
 * 환경 설정
 */
const isProduction = process.env.NODE_ENV === 'production';
const globalLogLevel = parseLogLevel(process.env.LOG_LEVEL);

/**
 * 비활성화된 모듈 목록 (쉼표 구분)
 * 예: LOG_DISABLED_MODULES=ScreenRecorder,SessionManager
 */
const disabledModules = new Set(
  (process.env.LOG_DISABLED_MODULES || '')
    .split(',')
    .map(m => m.trim())
    .filter(Boolean)
);

/**
 * ANSI 컬러 코드
 */
const colors = {
  reset: '\x1b[0m',
  // 레벨별 색상
  error: '\x1b[31m',    // 빨강
  warn: '\x1b[33m',     // 노랑
  info: '\x1b[36m',     // 시안
  debug: '\x1b[90m',    // 회색
  // 추가 색상
  dim: '\x1b[2m',       // 흐리게
  bright: '\x1b[1m',    // 굵게
  green: '\x1b[32m',    // 초록
  magenta: '\x1b[35m',  // 마젠타
};

/**
 * 타임스탬프 생성
 */
function getTimestamp(): string {
  return new Date().toISOString();
}

/**
 * JSON 포맷 로그 생성 (프로덕션용)
 */
function formatJson(
  level: string,
  module: string,
  message: string,
  context?: Record<string, unknown>
): string {
  const logEntry = {
    timestamp: getTimestamp(),
    level,
    module,
    message,
    ...context,
  };
  return JSON.stringify(logEntry);
}

/**
 * 컬러 콘솔 포맷 (개발용)
 */
function formatConsole(
  level: 'ERROR' | 'WARN' | 'INFO' | 'DEBUG',
  module: string,
  message: string,
  context?: Record<string, unknown>
): string {
  const levelColors: Record<string, string> = {
    ERROR: colors.error,
    WARN: colors.warn,
    INFO: colors.info,
    DEBUG: colors.debug,
  };

  const levelColor = levelColors[level] || colors.reset;
  const timestamp = colors.dim + getTimestamp() + colors.reset;
  const levelStr = levelColor + level.padEnd(5) + colors.reset;
  const moduleStr = colors.magenta + '[' + module + ']' + colors.reset;

  let output = `${timestamp} ${levelStr} ${moduleStr} ${message}`;

  // 컨텍스트가 있으면 추가
  if (context && Object.keys(context).length > 0) {
    const contextStr = Object.entries(context)
      .map(([k, v]) => `${colors.dim}${k}=${colors.reset}${JSON.stringify(v)}`)
      .join(' ');
    output += ` ${contextStr}`;
  }

  return output;
}

/**
 * Logger 클래스
 * 모듈별로 인스턴스 생성하여 사용
 */
class Logger {
  private module: string;
  private enabled: boolean;
  private defaultContext: Record<string, unknown>;

  constructor(module: string, defaultContext?: Record<string, unknown>) {
    this.module = module;
    this.enabled = !disabledModules.has(module);
    this.defaultContext = defaultContext || {};
  }

  /**
   * 전역 로그 레벨 조회 (정적 메서드)
   */
  static getGlobalLevel(): LogLevel {
    return globalLogLevel;
  }

  /**
   * 로그 출력 (내부용)
   */
  private log(
    level: LogLevel,
    levelName: 'ERROR' | 'WARN' | 'INFO' | 'DEBUG',
    message: string,
    context?: Record<string, unknown>
  ): void {
    // 레벨 필터링
    if (!this.enabled || globalLogLevel < level) return;

    // 컨텍스트 병합
    const mergedContext = { ...this.defaultContext, ...context };

    // 포맷 선택 (프로덕션: JSON, 개발: 컬러)
    const formattedMessage = isProduction
      ? formatJson(levelName, this.module, message, mergedContext)
      : formatConsole(levelName, this.module, message, mergedContext);

    // 콘솔 출력
    switch (levelName) {
      case 'ERROR':
        console.error(formattedMessage);
        break;
      case 'WARN':
        console.warn(formattedMessage);
        break;
      case 'DEBUG':
        console.debug(formattedMessage);
        break;
      default:
        console.log(formattedMessage);
    }
  }

  /**
   * ERROR 레벨 로그
   * 애플리케이션 오류, 예외 발생 시
   */
  error(message: string, context?: Record<string, unknown>): void;
  error(message: string, error: Error, context?: Record<string, unknown>): void;
  error(
    message: string,
    errorOrContext?: Error | Record<string, unknown>,
    context?: Record<string, unknown>
  ): void {
    let mergedContext = context || {};

    if (errorOrContext instanceof Error) {
      mergedContext = {
        ...mergedContext,
        error: errorOrContext.message,
        stack: errorOrContext.stack,
      };
    } else if (errorOrContext) {
      mergedContext = { ...errorOrContext, ...mergedContext };
    }

    this.log(LogLevel.ERROR, 'ERROR', message, mergedContext);
  }

  /**
   * WARN 레벨 로그
   * 경고 상황, 비권장 사용법 등
   */
  warn(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, 'WARN', message, context);
  }

  /**
   * INFO 레벨 로그
   * 일반 정보, 주요 이벤트
   */
  info(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, 'INFO', message, context);
  }

  /**
   * DEBUG 레벨 로그
   * 디버그용 상세 정보
   */
  debug(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, 'DEBUG', message, context);
  }

  /**
   * 항상 출력되는 로그 (레벨 무시)
   * 서버 시작/종료 등 중요한 메시지용
   */
  always(message: string, context?: Record<string, unknown>): void {
    const mergedContext = { ...this.defaultContext, ...context };

    const formattedMessage = isProduction
      ? formatJson('INFO', this.module, message, mergedContext)
      : formatConsole('INFO', this.module, message, mergedContext);

    console.log(formattedMessage);
  }

  /**
   * 자식 로거 생성 (추가 컨텍스트 포함)
   */
  child(additionalContext: Record<string, unknown>): Logger {
    const childLogger = new Logger(this.module, {
      ...this.defaultContext,
      ...additionalContext,
    });
    return childLogger;
  }
}

/**
 * Logger 인스턴스 생성 헬퍼
 * @param module 모듈/서비스 이름
 * @param defaultContext 기본 컨텍스트 (모든 로그에 포함)
 */
export function createLogger(
  module: string,
  defaultContext?: Record<string, unknown>
): Logger {
  return new Logger(module, defaultContext);
}

/**
 * 기본 Logger 인스턴스 (모듈명 미지정 시)
 */
export const logger = new Logger('App');

/**
 * 전역 로그 레벨 변경 (런타임)
 * @deprecated 환경 변수 LOG_LEVEL 사용 권장
 */
export function setGlobalLogLevel(level: LogLevel): void {
  console.log(`[Logger] Global log level change not supported at runtime. Use LOG_LEVEL env.`);
}

/**
 * 현재 로그 레벨 조회
 */
export function getGlobalLogLevel(): LogLevel {
  return globalLogLevel;
}

export { LogLevel as Level };
export default Logger;
