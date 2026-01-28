// backend/src/appium/actions/types.ts

import { Browser } from 'webdriverio';

// 액션 결과 인터페이스
export interface ActionResult {
  success: boolean;
  action?: string;
  [key: string]: unknown;
}

// 재시도 옵션 인터페이스
export interface RetryOptions {
  retryCount?: number;
  retryDelay?: number;
  onRetry?: (attempt: number, error: Error) => Promise<void>;
  shouldRetry?: (error: Error) => boolean;
}

// 요소 존재 결과
export interface ElementExistsResult {
  success: boolean;
  exists: boolean;
  selector: string;
}

// 텍스트 포함 결과
export interface TextContainsResult {
  success: boolean;
  contains: boolean;
  actualText?: string;
  expectedText?: string;
  error?: string;
}

// 요소 상태 결과
export interface ElementStateResult {
  success: boolean;
  enabled?: boolean;
  displayed?: boolean;
  selector?: string;
  error?: string;
}

// 대기 결과
export interface WaitResult {
  success: boolean;
  action: string;
  waited?: number;
  selector?: string;
  text?: string;
  tapped?: boolean; // tapAfterWait 사용 시 탭 여부
}

export type SelectorStrategy = 'id' | 'xpath' | 'accessibility id' | 'text';

// 드라이버 제공자 타입
export type DriverProvider = () => Promise<Browser>;

// 폴링 결과 타입
export interface PollResult<T> {
  success: boolean;
  result?: T;
  waited: number;
}

// 이미지 매칭 결과 타입
export interface ImageMatchResult {
  found: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  matchTime?: number;
  highlightedBuffer?: Buffer;
}
