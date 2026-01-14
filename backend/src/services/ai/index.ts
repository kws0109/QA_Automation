/**
 * AI 서비스 모듈 진입점
 *
 * 자연어 시나리오 변환을 위한 AI 서비스를 제공합니다.
 * 이 모듈은 격리되어 있어 삭제 시 다른 부분에 영향을 주지 않습니다.
 *
 * 삭제 방법:
 * 1. backend/src/services/ai/ 폴더 삭제
 * 2. backend/src/routes/ai.ts 삭제
 * 3. backend/src/index.ts에서 ai 라우트 import 제거
 * 4. frontend/src/components/NLConverter/ 폴더 삭제
 */

// Types
export * from './types';

// AI Provider
export {
  createAIProvider,
  configureAI,
  getAIProvider,
  getAIConfig,
  isAIConfigured,
  type ChatMessage,
  type ChatCompletionRequest,
  type ChatCompletionResponse,
} from './aiProvider';

// NL Parser
export {
  parseInputText,
  convertNaturalLanguage,
  convertToScenarioFormat,
} from './nlParser';
