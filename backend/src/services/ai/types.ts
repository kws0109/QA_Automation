/**
 * AI 서비스 타입 정의
 *
 * 이 파일은 자연어 시나리오 변환 기능을 위한 타입을 정의합니다.
 * 격리된 모듈로 설계되어 삭제 시 다른 부분에 영향을 주지 않습니다.
 */

// ========================================
// AI Provider 설정
// ========================================

export type AIProvider = 'openai' | 'anthropic';

export interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
}

export interface OpenAIConfig extends AIConfig {
  provider: 'openai';
  model: 'gpt-4o' | 'gpt-4o-mini' | 'gpt-4-turbo';
}

export interface AnthropicConfig extends AIConfig {
  provider: 'anthropic';
  model: 'claude-3-5-sonnet-20241022' | 'claude-3-5-haiku-20241022';
}

// ========================================
// 자연어 입력/출력
// ========================================

export interface NaturalLanguageStep {
  stepNumber: number;
  text: string;
}

export interface NaturalLanguageScenario {
  title?: string;
  description?: string;
  steps: NaturalLanguageStep[];
  rawText: string;
}

// ========================================
// 파싱된 노드 (기존 시나리오 노드와 호환)
// ========================================

export type ParsedActionType =
  | 'tap'
  | 'doubleTap'
  | 'longPress'
  | 'swipe'
  | 'type'
  | 'wait'
  | 'launchApp'
  | 'terminateApp'
  | 'tapImage'
  | 'waitUntilImage'
  | 'waitUntilImageGone'
  | 'pressKey';

export interface ParsedNodeBase {
  id: string;
  action: ParsedActionType;
  label?: string;
  confidence: number;  // AI의 확신도 (0-1)
  originalText: string;  // 원본 자연어 텍스트
  needsUserInput: boolean;  // 사용자 입력 필요 여부
  warnings?: string[];  // 경고 메시지
}

export interface ParsedTapNode extends ParsedNodeBase {
  action: 'tap' | 'doubleTap' | 'longPress';
  x?: number;
  y?: number;
  targetDescription?: string;  // "로그인 버튼", "설정 아이콘" 등
}

export interface ParsedSwipeNode extends ParsedNodeBase {
  action: 'swipe';
  direction?: 'up' | 'down' | 'left' | 'right';
  startX?: number;
  startY?: number;
  endX?: number;
  endY?: number;
}

export interface ParsedTypeNode extends ParsedNodeBase {
  action: 'type';
  text?: string;
  targetDescription?: string;
}

export interface ParsedWaitNode extends ParsedNodeBase {
  action: 'wait';
  duration?: number;  // ms
}

export interface ParsedAppNode extends ParsedNodeBase {
  action: 'launchApp' | 'terminateApp';
  packageName?: string;
  appName?: string;
}

export interface ParsedImageNode extends ParsedNodeBase {
  action: 'tapImage' | 'waitUntilImage' | 'waitUntilImageGone';
  templateDescription?: string;  // "로그인 버튼 이미지" 등
  templateId?: string;  // 매칭된 템플릿 ID (있는 경우)
}

export interface ParsedKeyNode extends ParsedNodeBase {
  action: 'pressKey';
  keyCode?: number;
  keyName?: string;  // "back", "home", "enter" 등
}

export type ParsedNode =
  | ParsedTapNode
  | ParsedSwipeNode
  | ParsedTypeNode
  | ParsedWaitNode
  | ParsedAppNode
  | ParsedImageNode
  | ParsedKeyNode;

// ========================================
// 변환 결과
// ========================================

export interface ConversionResult {
  success: true;
  nodes: ParsedNode[];
  summary: {
    totalSteps: number;
    parsedSteps: number;
    needsUserInput: number;
    warnings: string[];
  };
  metadata: {
    provider: AIProvider;
    model: string;
    tokensUsed?: {
      input: number;
      output: number;
    };
    processingTime: number;  // ms
  };
}

export interface ConversionError {
  success: false;
  error: string;
  code: 'INVALID_INPUT' | 'API_ERROR' | 'PARSE_ERROR' | 'CONFIG_ERROR';
  details?: unknown;
}

export type ConversionResponse = ConversionResult | ConversionError;

// ========================================
// Vision 분석 (Phase 2에서 사용)
// ========================================

export interface ScreenAnalysisRequest {
  screenshotBase64: string;
  query: string;  // "로그인 버튼의 좌표를 알려줘"
}

export interface DetectedElement {
  description: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  confidence: number;
}

export interface ScreenAnalysisResult {
  success: boolean;
  elements: DetectedElement[];
  rawResponse?: string;
}
