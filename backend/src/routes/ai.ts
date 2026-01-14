/**
 * AI API 라우트
 *
 * 자연어 시나리오 변환 기능을 위한 API 엔드포인트입니다.
 * 이 라우트는 격리되어 있어 삭제 시 다른 부분에 영향을 주지 않습니다.
 *
 * 삭제 방법:
 * 1. 이 파일 삭제
 * 2. backend/src/index.ts에서 이 라우트의 import 및 app.use() 제거
 */

import { Router, Request, Response } from 'express';
import {
  configureAI,
  getAIConfig,
  isAIConfigured,
  convertNaturalLanguage,
  convertToScenarioFormat,
} from '../services/ai';
import type { AIConfig, AIProvider } from '../services/ai';

const router = Router();

// ========================================
// AI 설정 API
// ========================================

/**
 * GET /api/ai/config
 * 현재 AI 설정 조회 (API 키는 마스킹)
 */
router.get('/config', (_req: Request, res: Response) => {
  const config = getAIConfig();

  if (!config) {
    res.json({
      configured: false,
      config: null,
    });
    return;
  }

  // API 키 마스킹
  const maskedKey = config.apiKey
    ? `${config.apiKey.substring(0, 7)}...${config.apiKey.substring(config.apiKey.length - 4)}`
    : null;

  res.json({
    configured: true,
    config: {
      provider: config.provider,
      model: config.model,
      apiKey: maskedKey,
      maxTokens: config.maxTokens,
      temperature: config.temperature,
    },
  });
});

/**
 * POST /api/ai/config
 * AI 설정 저장
 */
router.post('/config', (req: Request, res: Response) => {
  try {
    const { provider, apiKey, model, maxTokens, temperature } = req.body;

    // 유효성 검사
    if (!provider || !['openai', 'anthropic'].includes(provider)) {
      res.status(400).json({
        error: 'Invalid provider. Must be "openai" or "anthropic".',
      });
      return;
    }

    if (!apiKey || typeof apiKey !== 'string') {
      res.status(400).json({
        error: 'API key is required.',
      });
      return;
    }

    if (!model || typeof model !== 'string') {
      res.status(400).json({
        error: 'Model is required.',
      });
      return;
    }

    // API 키 형식 검사
    if (provider === 'openai' && !apiKey.startsWith('sk-')) {
      res.status(400).json({
        error: 'Invalid OpenAI API key format. Must start with "sk-".',
      });
      return;
    }

    if (provider === 'anthropic' && !apiKey.startsWith('sk-ant-')) {
      res.status(400).json({
        error: 'Invalid Anthropic API key format. Must start with "sk-ant-".',
      });
      return;
    }

    const config: AIConfig = {
      provider: provider as AIProvider,
      apiKey,
      model,
      maxTokens: maxTokens || 4096,
      temperature: temperature ?? 0.2,
    };

    configureAI(config);

    console.log(`[AI] Configured: provider=${provider}, model=${model}`);

    res.json({
      success: true,
      message: 'AI configuration saved successfully.',
    });
  } catch (error) {
    console.error('[AI] Config error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to save configuration',
    });
  }
});

/**
 * GET /api/ai/models
 * 지원하는 모델 목록 조회
 */
router.get('/models', (_req: Request, res: Response) => {
  res.json({
    openai: [
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: '가장 저렴, 빠른 응답' },
      { id: 'gpt-4o', name: 'GPT-4o', description: '균형 잡힌 성능' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: '최고 성능' },
    ],
    anthropic: [
      {
        id: 'claude-3-5-haiku-20241022',
        name: 'Claude 3.5 Haiku',
        description: '빠르고 저렴',
      },
      {
        id: 'claude-3-5-sonnet-20241022',
        name: 'Claude 3.5 Sonnet',
        description: '최고 성능',
      },
    ],
  });
});

// ========================================
// 자연어 변환 API
// ========================================

/**
 * POST /api/ai/convert
 * 자연어 시나리오를 노드 목록으로 변환
 */
router.post('/convert', async (req: Request, res: Response) => {
  try {
    const { text } = req.body;

    if (!text || typeof text !== 'string') {
      res.status(400).json({
        error: 'Text is required.',
      });
      return;
    }

    if (!isAIConfigured()) {
      res.status(400).json({
        error: 'AI is not configured. Please set up API key first.',
        code: 'CONFIG_ERROR',
      });
      return;
    }

    console.log(`[AI] Converting natural language scenario (${text.length} chars)`);

    const result = await convertNaturalLanguage(text);

    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.json(result);
  } catch (error) {
    console.error('[AI] Convert error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Conversion failed',
      code: 'API_ERROR',
    });
  }
});

/**
 * POST /api/ai/convert-to-scenario
 * 자연어를 시나리오 형식 (노드 + 엣지)으로 변환
 */
router.post('/convert-to-scenario', async (req: Request, res: Response) => {
  try {
    const { text } = req.body;

    if (!text || typeof text !== 'string') {
      res.status(400).json({
        error: 'Text is required.',
      });
      return;
    }

    if (!isAIConfigured()) {
      res.status(400).json({
        error: 'AI is not configured. Please set up API key first.',
        code: 'CONFIG_ERROR',
      });
      return;
    }

    console.log(`[AI] Converting to scenario format (${text.length} chars)`);

    const result = await convertNaturalLanguage(text);

    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    // 시나리오 형식으로 변환
    const scenario = convertToScenarioFormat(result.nodes);

    res.json({
      success: true,
      ...scenario,
      summary: result.summary,
      metadata: result.metadata,
    });
  } catch (error) {
    console.error('[AI] Convert to scenario error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Conversion failed',
      code: 'API_ERROR',
    });
  }
});

/**
 * POST /api/ai/test
 * AI 설정 테스트 (간단한 요청으로 연결 확인)
 */
router.post('/test', async (req: Request, res: Response) => {
  try {
    if (!isAIConfigured()) {
      res.status(400).json({
        success: false,
        error: 'AI is not configured.',
      });
      return;
    }

    // 간단한 테스트 변환
    const testText = '1. 앱을 실행한다';
    const result = await convertNaturalLanguage(testText);

    if (!result.success) {
      res.status(400).json({
        success: false,
        error: 'API 연결 실패',
        details: result,
      });
      return;
    }

    res.json({
      success: true,
      message: 'AI connection successful',
      tokensUsed: result.metadata.tokensUsed,
      processingTime: result.metadata.processingTime,
    });
  } catch (error) {
    console.error('[AI] Test error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Test failed',
    });
  }
});

export default router;
