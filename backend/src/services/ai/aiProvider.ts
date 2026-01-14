/**
 * AI Provider 추상화 레이어
 *
 * OpenAI와 Anthropic API를 통합하여 일관된 인터페이스를 제공합니다.
 * 격리된 모듈로 설계되어 삭제 시 다른 부분에 영향을 주지 않습니다.
 */

import type { AIConfig, AIProvider } from './types';

// ========================================
// 공통 인터페이스
// ========================================

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentPart[];
}

export interface ContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: {
    url: string;  // base64 data URL
    detail?: 'low' | 'high' | 'auto';
  };
}

export interface ChatCompletionRequest {
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
}

export interface ChatCompletionResponse {
  content: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  finishReason: 'stop' | 'length' | 'content_filter' | 'error';
}

// ========================================
// Provider 추상 클래스
// ========================================

export abstract class BaseAIProvider {
  protected config: AIConfig;

  constructor(config: AIConfig) {
    this.config = config;
  }

  abstract chat(request: ChatCompletionRequest): Promise<ChatCompletionResponse>;

  abstract validateConfig(): boolean;
}

// ========================================
// OpenAI Provider
// ========================================

export class OpenAIProvider extends BaseAIProvider {
  private baseUrl = 'https://api.openai.com/v1';

  validateConfig(): boolean {
    return !!(
      this.config.apiKey &&
      this.config.apiKey.startsWith('sk-') &&
      this.config.model
    );
  }

  async chat(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: request.messages.map((msg) => this.convertMessage(msg)),
        max_tokens: request.maxTokens || this.config.maxTokens || 4096,
        temperature: request.temperature ?? this.config.temperature ?? 0.2,
        ...(request.jsonMode && { response_format: { type: 'json_object' } }),
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(
        `OpenAI API error: ${response.status} - ${error.error?.message || 'Unknown error'}`
      );
    }

    interface OpenAIResponse {
      choices?: Array<{
        message?: { content?: string };
        finish_reason?: string;
      }>;
      usage?: {
        prompt_tokens: number;
        completion_tokens: number;
      };
    }

    const data = await response.json() as OpenAIResponse;
    const choice = data.choices?.[0];

    return {
      content: choice?.message?.content || '',
      usage: data.usage
        ? {
            inputTokens: data.usage.prompt_tokens,
            outputTokens: data.usage.completion_tokens,
          }
        : undefined,
      finishReason: this.mapFinishReason(choice?.finish_reason || 'error'),
    };
  }

  private convertMessage(msg: ChatMessage): object {
    if (typeof msg.content === 'string') {
      return { role: msg.role, content: msg.content };
    }

    // Vision message with images
    return {
      role: msg.role,
      content: msg.content.map((part) => {
        if (part.type === 'text') {
          return { type: 'text', text: part.text };
        }
        return {
          type: 'image_url',
          image_url: {
            url: part.image_url?.url,
            detail: part.image_url?.detail || 'auto',
          },
        };
      }),
    };
  }

  private mapFinishReason(reason: string): ChatCompletionResponse['finishReason'] {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'length':
        return 'length';
      case 'content_filter':
        return 'content_filter';
      default:
        return 'error';
    }
  }
}

// ========================================
// Anthropic Provider
// ========================================

export class AnthropicProvider extends BaseAIProvider {
  private baseUrl = 'https://api.anthropic.com/v1';

  validateConfig(): boolean {
    return !!(
      this.config.apiKey &&
      this.config.apiKey.startsWith('sk-ant-') &&
      this.config.model
    );
  }

  async chat(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const { systemMessage, userMessages } = this.extractSystemMessage(request.messages);

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: request.maxTokens || this.config.maxTokens || 4096,
        ...(systemMessage && { system: systemMessage }),
        messages: userMessages.map((msg) => this.convertMessage(msg)),
        temperature: request.temperature ?? this.config.temperature ?? 0.2,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(
        `Anthropic API error: ${response.status} - ${error.error?.message || 'Unknown error'}`
      );
    }

    interface AnthropicResponse {
      content?: Array<{ text?: string }>;
      usage?: {
        input_tokens: number;
        output_tokens: number;
      };
      stop_reason?: string;
    }

    const data = await response.json() as AnthropicResponse;

    return {
      content: data.content?.[0]?.text || '',
      usage: data.usage
        ? {
            inputTokens: data.usage.input_tokens,
            outputTokens: data.usage.output_tokens,
          }
        : undefined,
      finishReason: this.mapStopReason(data.stop_reason || 'error'),
    };
  }

  private extractSystemMessage(messages: ChatMessage[]): {
    systemMessage: string | null;
    userMessages: ChatMessage[];
  } {
    const systemMessages = messages.filter((m) => m.role === 'system');
    const userMessages = messages.filter((m) => m.role !== 'system');

    return {
      systemMessage: systemMessages
        .map((m) => (typeof m.content === 'string' ? m.content : ''))
        .join('\n'),
      userMessages,
    };
  }

  private convertMessage(msg: ChatMessage): object {
    if (typeof msg.content === 'string') {
      return { role: msg.role, content: msg.content };
    }

    // Vision message with images
    return {
      role: msg.role,
      content: msg.content.map((part) => {
        if (part.type === 'text') {
          return { type: 'text', text: part.text };
        }
        // Anthropic uses different image format
        const url = part.image_url?.url || '';
        const match = url.match(/^data:image\/(\w+);base64,(.+)$/);
        if (match) {
          return {
            type: 'image',
            source: {
              type: 'base64',
              media_type: `image/${match[1]}`,
              data: match[2],
            },
          };
        }
        return { type: 'text', text: '[Invalid image]' };
      }),
    };
  }

  private mapStopReason(reason: string): ChatCompletionResponse['finishReason'] {
    switch (reason) {
      case 'end_turn':
      case 'stop_sequence':
        return 'stop';
      case 'max_tokens':
        return 'length';
      default:
        return 'error';
    }
  }
}

// ========================================
// Provider Factory
// ========================================

export function createAIProvider(config: AIConfig): BaseAIProvider {
  switch (config.provider) {
    case 'openai':
      return new OpenAIProvider(config);
    case 'anthropic':
      return new AnthropicProvider(config);
    default:
      throw new Error(`Unsupported AI provider: ${config.provider}`);
  }
}

// ========================================
// 설정 관리
// ========================================

let currentConfig: AIConfig | null = null;
let currentProvider: BaseAIProvider | null = null;

export function configureAI(config: AIConfig): void {
  currentConfig = config;
  currentProvider = createAIProvider(config);

  if (!currentProvider.validateConfig()) {
    currentProvider = null;
    throw new Error('Invalid AI configuration');
  }
}

export function getAIProvider(): BaseAIProvider | null {
  return currentProvider;
}

export function getAIConfig(): AIConfig | null {
  return currentConfig;
}

export function isAIConfigured(): boolean {
  return currentProvider !== null;
}
