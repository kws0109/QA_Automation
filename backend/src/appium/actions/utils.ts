// backend/src/appium/actions/utils.ts

import type { SelectorStrategy, RetryOptions } from './types';

/**
 * 셀렉터 빌드 유틸리티
 */
export function buildSelector(selector: string, strategy: SelectorStrategy): string {
  switch (strategy) {
    case 'id':
      return `android=new UiSelector().resourceId("${selector}")`;
    case 'xpath':
      return selector;
    case 'accessibility id':
      return `~${selector}`;
    case 'text':
      return `android=new UiSelector().text("${selector}")`;
    default:
      return selector;
  }
}

/**
 * 세션이 크래시되었는지 확인 (즉시 실패 처리 필요)
 */
export function isSessionCrashedError(error: Error): boolean {
  const crashMessages = [
    'instrumentation process is not running',
    'probably crashed',
    'session deleted',
    'invalid session id',
    'session not found',
    'A session is either terminated or not started',
  ];
  return crashMessages.some(msg => error.message.toLowerCase().includes(msg.toLowerCase()));
}

/**
 * 재시도 가능한 에러인지 판단
 */
export function isRetryableError(error: Error): boolean {
  // 세션 크래시 에러는 재시도하지 않음
  if (isSessionCrashedError(error)) {
    return false;
  }

  const retryableMessages = [
    'no such element',
    'stale element',
    'element not interactable',
    'timeout',
    'ETIMEDOUT',
    'ECONNREFUSED',
    'session not created',
  ];

  const message = error.message?.toLowerCase() || '';
  return retryableMessages.some(msg => message.includes(msg.toLowerCase()));
}

/**
 * ActionsBase 클래스 - 모든 액션 모듈의 기본 클래스
 */
export abstract class ActionsBase {
  protected shouldStop: boolean = false;
  protected defaultRetryCount: number = 3;
  protected defaultRetryDelay: number = 1000;
  protected deviceId: string;

  constructor(deviceId: string) {
    this.deviceId = deviceId;
  }

  /**
   * 중지 신호
   */
  stop(): void {
    this.shouldStop = true;
    console.log(`[${this.deviceId}] 액션 중지 요청`);
  }

  /**
   * 중지 상태 리셋
   */
  reset(): void {
    this.shouldStop = false;
  }

  /**
   * 중지 확인 헬퍼
   */
  protected checkStop(): void {
    if (this.shouldStop) {
      throw new Error('사용자에 의해 중지됨');
    }
  }

  /**
   * 폴링 헬퍼: 조건이 충족될 때까지 반복 실행
   */
  protected async pollUntil<T>(
    predicate: () => Promise<{ found: boolean; result?: T }>,
    options: { timeout?: number; interval?: number } = {}
  ): Promise<{ success: boolean; result?: T; waited: number }> {
    const { timeout = 30000, interval = 500 } = options;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      this.checkStop();
      const iterationStart = Date.now();

      const { found, result } = await predicate();
      if (found) {
        return { success: true, result, waited: Date.now() - startTime };
      }

      // 순차 폴링: 이전 작업 완료 후 남은 시간만 대기
      const elapsed = Date.now() - iterationStart;
      const waitTime = Math.max(interval - elapsed, 0);
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    return { success: false, waited: Date.now() - startTime };
  }

  /**
   * 재시도 래퍼 함수
   */
  async withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
    const {
      retryCount = this.defaultRetryCount,
      retryDelay = this.defaultRetryDelay,
      onRetry = null,
      shouldRetry = () => true,
    } = options;

    let lastError: Error = new Error('Unknown error');

    for (let attempt = 1; attempt <= retryCount; attempt++) {
      try {
        return await fn();
      } catch (e) {
        lastError = e as Error;

        if (this.shouldStop) {
          throw lastError;
        }

        if (!shouldRetry(lastError)) {
          throw lastError;
        }

        if (attempt === retryCount) {
          throw lastError;
        }

        console.log(`[${this.deviceId}] 시도 ${attempt}/${retryCount} 실패: ${lastError.message}`);
        console.log(`   ${retryDelay}ms 후 재시도...`);

        if (onRetry) {
          await onRetry(attempt, lastError);
        }

        await this.delayMs(retryDelay);
      }
    }

    throw lastError;
  }

  /**
   * 내부 대기 (중지 확인 포함) - 재시도 딜레이용
   */
  protected async delayMs(ms: number): Promise<void> {
    const interval = 100;
    let waited = 0;

    while (waited < ms) {
      this.checkStop();

      const waitTime = Math.min(interval, ms - waited);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      waited += waitTime;
    }
  }
}
