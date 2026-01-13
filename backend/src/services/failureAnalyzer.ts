// backend/src/services/failureAnalyzer.ts
// 테스트 실패 분석 서비스

import { FailureType, FailureAnalysis } from '../types/reportEnhanced';

/**
 * 실패 컨텍스트 (분석에 필요한 정보)
 */
interface FailureContext {
  attemptedAction: string;
  actionParams?: Record<string, unknown>;
  previousAction?: string;
  previousActionResult?: string;
  expectedState?: string;
  actualState?: string;
  currentActivity?: string;
  appState?: 'foreground' | 'background' | 'not_running' | 'crashed';
  retryAttempts?: number;
  totalRetryTime?: number;
  screenshotPath?: string;
  logcatSnippet?: string;
}

/**
 * 에러 패턴 매칭을 위한 규칙
 */
interface ErrorPattern {
  pattern: RegExp;
  type: FailureType;
  description: string;
}

/**
 * 실패 분석 서비스
 */
class FailureAnalyzerService {
  private errorPatterns: ErrorPattern[] = [
    // 타임아웃 관련
    {
      pattern: /timeout|timed?\s*out|exceeded\s*time|wait.*expired/i,
      type: 'timeout',
      description: '대기 시간 초과',
    },
    // 요소 찾기 실패
    {
      pattern: /element.*not\s*found|no\s*such\s*element|unable\s*to\s*locate|selector.*failed/i,
      type: 'element_not_found',
      description: '요소를 찾을 수 없음',
    },
    // 이미지 매칭 실패
    {
      pattern: /image.*not\s*(found|matched)|template.*not\s*found|confidence.*below|match.*failed/i,
      type: 'image_not_matched',
      description: '이미지 매칭 실패',
    },
    // 텍스트 찾기 실패
    {
      pattern: /text.*not\s*found|string.*not\s*found|expected\s*text/i,
      type: 'text_not_found',
      description: '텍스트를 찾을 수 없음',
    },
    // 검증 실패
    {
      pattern: /assertion|assert|expect|should|verify.*failed/i,
      type: 'assertion_failed',
      description: '검증 실패',
    },
    // 앱 크래시
    {
      pattern: /app.*crash|application.*stopped|anr|not\s*responding|fatal\s*exception/i,
      type: 'app_crash',
      description: '앱 크래시',
    },
    // 앱 미실행
    {
      pattern: /app.*not\s*running|package.*not\s*found|activity.*not\s*found|unable\s*to\s*launch/i,
      type: 'app_not_running',
      description: '앱이 실행 중이 아님',
    },
    // 세션 오류
    {
      pattern: /session.*error|session.*invalid|session.*expired|webdriver.*error|appium.*error/i,
      type: 'session_error',
      description: 'Appium 세션 오류',
    },
    // 연결 오류
    {
      pattern: /connection.*refused|connection.*reset|device.*offline|adb.*error|usb.*error/i,
      type: 'connection_error',
      description: '디바이스 연결 오류',
    },
    // 네트워크 오류
    {
      pattern: /network.*error|http.*error|request.*failed|fetch.*failed|socket.*error/i,
      type: 'network_error',
      description: '네트워크 오류',
    },
    // 권한 거부
    {
      pattern: /permission.*denied|access.*denied|unauthorized|forbidden/i,
      type: 'permission_denied',
      description: '권한 거부',
    },
    // 리소스 부족
    {
      pattern: /out\s*of\s*memory|low\s*memory|storage.*full|disk.*space|resource.*exhausted/i,
      type: 'resource_exhausted',
      description: '리소스 부족',
    },
  ];

  /**
   * 에러 메시지로부터 실패 유형 분류
   */
  classifyFailure(error: Error | string): FailureType {
    const errorMessage = typeof error === 'string' ? error : error.message;

    for (const { pattern, type } of this.errorPatterns) {
      if (pattern.test(errorMessage)) {
        return type;
      }
    }

    return 'unknown';
  }

  /**
   * 실패 분석 수행
   */
  analyzeFailure(
    error: Error | string,
    context: FailureContext
  ): FailureAnalysis {
    const errorMessage = typeof error === 'string' ? error : error.message;
    const stackTrace = error instanceof Error ? error.stack : undefined;
    const failureType = this.classifyFailure(error);

    // 에러 코드 추출 (있는 경우)
    const errorCode = this._extractErrorCode(errorMessage);

    // 분석 결과 생성
    const analysis: FailureAnalysis = {
      failureType,
      errorMessage,
      errorCode,
      stackTrace,
      context: {
        attemptedAction: context.attemptedAction,
        actionParams: context.actionParams,
        previousAction: context.previousAction,
        previousActionResult: context.previousActionResult,
        expectedState: context.expectedState,
        actualState: context.actualState,
      },
      retryAttempts: context.retryAttempts,
      totalRetryTime: context.totalRetryTime,
      failureScreenshot: context.screenshotPath,
      appState: context.appState,
      currentActivity: context.currentActivity,
      logcatSnippet: context.logcatSnippet,
    };

    return analysis;
  }

  /**
   * 실패 유형별 권장 조치 제안
   */
  getSuggestedAction(failureType: FailureType): string {
    const suggestions: Record<FailureType, string> = {
      timeout: '대기 시간을 늘리거나, 조건을 확인하세요.',
      element_not_found: '선택자(selector)를 확인하거나, 요소가 로드되는 시간을 기다리세요.',
      image_not_matched: '템플릿 이미지를 업데이트하거나, 매칭 임계값을 조정하세요.',
      text_not_found: '텍스트 내용이 정확한지 확인하거나, 로케일 설정을 확인하세요.',
      assertion_failed: '기대 조건과 실제 상태를 비교 검토하세요.',
      app_crash: '앱 로그를 확인하고, 개발팀에 크래시 리포트를 전달하세요.',
      app_not_running: '앱 패키지명이 정확한지, 앱이 설치되어 있는지 확인하세요.',
      session_error: 'Appium 서버를 재시작하거나, 세션 설정을 확인하세요.',
      connection_error: 'USB 연결 상태를 확인하고, ADB 서버를 재시작하세요.',
      network_error: '네트워크 연결 상태를 확인하세요.',
      permission_denied: '필요한 권한이 부여되었는지 확인하세요.',
      resource_exhausted: '디바이스 메모리/스토리지를 정리하세요.',
      unknown: '에러 로그를 상세히 확인하세요.',
    };

    return suggestions[failureType] || suggestions.unknown;
  }

  /**
   * 실패 심각도 판단
   */
  getFailureSeverity(
    failureType: FailureType
  ): 'critical' | 'high' | 'medium' | 'low' {
    const severityMap: Record<FailureType, 'critical' | 'high' | 'medium' | 'low'> = {
      app_crash: 'critical',
      session_error: 'critical',
      connection_error: 'critical',
      resource_exhausted: 'high',
      app_not_running: 'high',
      permission_denied: 'high',
      element_not_found: 'medium',
      image_not_matched: 'medium',
      text_not_found: 'medium',
      assertion_failed: 'medium',
      timeout: 'medium',
      network_error: 'medium',
      unknown: 'low',
    };

    return severityMap[failureType] || 'low';
  }

  /**
   * 액션명으로 기대 상태 추론
   */
  inferExpectedState(actionType: string, actionParams?: Record<string, unknown>): string {
    switch (actionType) {
      case 'tap':
      case 'tapElement':
        return '탭 대상 요소가 화면에 표시되고 탭 가능한 상태';
      case 'tapImage':
        return `이미지 "${actionParams?.templateId || 'unknown'}"이(가) 화면에 표시된 상태`;
      case 'waitUntilExists':
      case 'waitUntilTextExists':
        return `요소/텍스트가 화면에 나타나는 상태`;
      case 'waitUntilGone':
      case 'waitUntilTextGone':
        return `요소/텍스트가 화면에서 사라지는 상태`;
      case 'waitUntilImage':
        return `이미지 "${actionParams?.templateId || 'unknown'}"이(가) 화면에 나타나는 상태`;
      case 'waitUntilImageGone':
        return `이미지 "${actionParams?.templateId || 'unknown'}"이(가) 화면에서 사라지는 상태`;
      case 'swipe':
        return '스와이프 동작이 정상적으로 수행되는 상태';
      case 'inputText':
        return '텍스트 입력이 가능한 상태';
      case 'launchApp':
        return '앱이 정상적으로 실행되는 상태';
      case 'terminateApp':
        return '앱이 정상적으로 종료되는 상태';
      default:
        return '액션이 정상적으로 수행되는 상태';
    }
  }

  /**
   * 에러 코드 추출
   */
  private _extractErrorCode(errorMessage: string): string | undefined {
    // 일반적인 에러 코드 패턴들
    const patterns = [
      /error\s*code[:\s]*(\d+)/i,
      /\[(\d+)\]/,
      /status[:\s]*(\d+)/i,
      /E(\d{4,})/,
    ];

    for (const pattern of patterns) {
      const match = errorMessage.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return undefined;
  }

  /**
   * 실패 패턴 통계 생성
   */
  generateFailureStats(
    failures: FailureAnalysis[]
  ): { type: FailureType; count: number; percentage: number }[] {
    const typeCount = new Map<FailureType, number>();

    for (const failure of failures) {
      const current = typeCount.get(failure.failureType) || 0;
      typeCount.set(failure.failureType, current + 1);
    }

    const total = failures.length;
    const stats: { type: FailureType; count: number; percentage: number }[] = [];

    for (const [type, count] of typeCount.entries()) {
      stats.push({
        type,
        count,
        percentage: Math.round((count / total) * 100 * 10) / 10,
      });
    }

    // 빈도순 정렬
    stats.sort((a, b) => b.count - a.count);

    return stats;
  }

  /**
   * 공통 실패 패턴 식별
   */
  identifyCommonPatterns(failures: FailureAnalysis[]): string[] {
    const patterns: string[] = [];

    // 연속 실패 패턴
    const consecutiveFailures = this._findConsecutiveFailures(failures);
    if (consecutiveFailures.length >= 3) {
      patterns.push(`연속 실패 ${consecutiveFailures.length}회 발생`);
    }

    // 동일 액션 실패 패턴
    const actionFailures = this._groupByAction(failures);
    for (const [action, count] of Object.entries(actionFailures)) {
      if (count >= 2) {
        patterns.push(`"${action}" 액션에서 ${count}회 실패`);
      }
    }

    // 동일 유형 반복 패턴
    const typeStats = this.generateFailureStats(failures);
    for (const stat of typeStats) {
      if (stat.percentage >= 50 && stat.count >= 2) {
        patterns.push(`실패의 ${stat.percentage}%가 "${stat.type}" 유형`);
      }
    }

    return patterns;
  }

  private _findConsecutiveFailures(failures: FailureAnalysis[]): FailureAnalysis[] {
    // 모든 실패가 연속적이라고 가정 (이미 실패만 필터링됨)
    return failures;
  }

  private _groupByAction(
    failures: FailureAnalysis[]
  ): Record<string, number> {
    const result: Record<string, number> = {};

    for (const failure of failures) {
      const action = failure.context.attemptedAction;
      result[action] = (result[action] || 0) + 1;
    }

    return result;
  }
}

export const failureAnalyzer = new FailureAnalyzerService();
