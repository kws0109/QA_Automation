/**
 * 자연어 시나리오 파서
 *
 * 자연어로 작성된 테스트 시나리오를 분석하여
 * 노드 기반 플로우차트로 변환합니다.
 *
 * 격리된 모듈로 설계되어 삭제 시 다른 부분에 영향을 주지 않습니다.
 */

import { getAIProvider, isAIConfigured, getAIConfig } from './aiProvider';

// 간단한 UUID 생성 함수
function generateId(): string {
  return `node_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
import type {
  NaturalLanguageScenario,
  NaturalLanguageStep,
  ParsedNode,
  ConversionResult,
  ConversionError,
  ConversionResponse,
} from './types';

// ========================================
// 시스템 프롬프트
// ========================================

const SYSTEM_PROMPT = `당신은 모바일 앱 테스트 자동화 시나리오를 분석하는 전문가입니다.
사용자가 자연어로 작성한 테스트 시나리오를 분석하여 JSON 형식의 노드 목록으로 변환해주세요.

## 지원하는 액션 타입

1. **tap**: 화면 터치
   - x, y 좌표가 명시된 경우 사용
   - "~를 누른다", "~를 탭한다", "~를 클릭한다" 등

2. **doubleTap**: 더블 탭
   - "~를 두 번 누른다", "더블탭" 등

3. **longPress**: 길게 누르기
   - "~를 길게 누른다", "롱프레스" 등

4. **swipe**: 스와이프/스크롤
   - direction: up, down, left, right
   - "위로 스크롤", "오른쪽으로 스와이프" 등

5. **type**: 텍스트 입력
   - text: 입력할 텍스트
   - "~를 입력한다", "~를 작성한다" 등

6. **wait**: 대기
   - duration: 밀리초 단위
   - "~초 기다린다", "~초 대기" 등

7. **launchApp**: 앱 실행
   - packageName: 패키지명 (알 수 있는 경우)
   - appName: 앱 이름
   - "앱을 실행한다", "~를 연다" 등

8. **terminateApp**: 앱 종료
   - "앱을 종료한다", "앱을 닫는다" 등

9. **tapImage**: 이미지 기반 터치
   - templateDescription: 찾을 이미지 설명
   - "~이미지를 찾아서 누른다" 등

10. **waitUntilImage**: 이미지가 나타날 때까지 대기
    - "~가 나타날 때까지 기다린다" 등

11. **waitUntilImageGone**: 이미지가 사라질 때까지 대기
    - "~가 사라질 때까지 기다린다" 등

12. **pressKey**: 하드웨어 키 입력
    - keyName: back, home, enter, menu 등
    - "뒤로가기 버튼", "홈 버튼" 등

## 출력 형식

반드시 다음 JSON 형식으로만 응답해주세요:

{
  "nodes": [
    {
      "action": "액션타입",
      "label": "사용자에게 표시할 설명",
      "confidence": 0.0-1.0,
      "originalText": "원본 텍스트",
      "needsUserInput": true/false,
      "warnings": ["경고 메시지"],

      // 액션별 추가 필드
      "x": 숫자,
      "y": 숫자,
      "targetDescription": "대상 설명",
      "direction": "up/down/left/right",
      "text": "입력 텍스트",
      "duration": 밀리초,
      "packageName": "패키지명",
      "appName": "앱 이름",
      "templateDescription": "이미지 설명",
      "keyName": "키 이름"
    }
  ]
}

## 변환 규칙

1. **좌표가 명시되지 않은 터치 액션**
   - needsUserInput: true로 설정
   - targetDescription에 대상 설명 저장
   - 예: "로그인 버튼을 누른다" → targetDescription: "로그인 버튼"

2. **시간이 명시되지 않은 대기**
   - 기본값 3000ms 사용
   - warnings에 "기본 대기 시간 3초 적용됨" 추가

3. **패키지명을 모르는 앱 실행**
   - needsUserInput: true
   - appName에 앱 이름 저장

4. **모호한 지시**
   - confidence를 낮게 설정 (0.5 이하)
   - warnings에 해석 불확실성 명시

5. **이미지 기반 액션**
   - 항상 needsUserInput: true (템플릿 등록 필요)
   - templateDescription에 설명 저장`;

// ========================================
// 입력 텍스트 전처리
// ========================================

export function parseInputText(rawText: string): NaturalLanguageScenario {
  const lines = rawText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const steps: NaturalLanguageStep[] = [];
  let title: string | undefined;
  let description: string | undefined;

  for (const line of lines) {
    // 번호로 시작하는 라인 (1. 2. 3. 또는 1) 2) 3))
    const stepMatch = line.match(/^(\d+)[.)]\s*(.+)$/);
    if (stepMatch) {
      steps.push({
        stepNumber: parseInt(stepMatch[1], 10),
        text: stepMatch[2].trim(),
      });
      continue;
    }

    // - 또는 * 로 시작하는 라인
    const bulletMatch = line.match(/^[-*]\s*(.+)$/);
    if (bulletMatch) {
      steps.push({
        stepNumber: steps.length + 1,
        text: bulletMatch[1].trim(),
      });
      continue;
    }

    // 제목으로 추정되는 라인 (첫 번째 줄이고, # 또는 **로 시작)
    if (!title && (line.startsWith('#') || line.startsWith('**'))) {
      title = line.replace(/^#+\s*/, '').replace(/^\*+|\*+$/g, '').trim();
      continue;
    }

    // 설명으로 추정되는 라인
    if (title && !description && steps.length === 0) {
      description = line;
      continue;
    }

    // 그 외: 일반 텍스트를 스텝으로 처리
    if (line.length > 0) {
      steps.push({
        stepNumber: steps.length + 1,
        text: line,
      });
    }
  }

  return {
    title,
    description,
    steps,
    rawText,
  };
}

// ========================================
// AI 응답 파싱
// ========================================

interface AINodeResponse {
  action: string;
  label?: string;
  confidence?: number;
  originalText?: string;
  needsUserInput?: boolean;
  warnings?: string[];
  x?: number;
  y?: number;
  targetDescription?: string;
  direction?: string;
  text?: string;
  duration?: number;
  packageName?: string;
  appName?: string;
  templateDescription?: string;
  keyName?: string;
  startX?: number;
  startY?: number;
  endX?: number;
  endY?: number;
}

function parseAIResponse(responseText: string): ParsedNode[] {
  // JSON 블록 추출 시도
  let jsonStr = responseText;

  // ```json ... ``` 형식 처리
  const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  // 중괄호로 시작하는 부분만 추출
  const braceMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    jsonStr = braceMatch[0];
  }

  try {
    const parsed = JSON.parse(jsonStr);
    const nodes: AINodeResponse[] = parsed.nodes || parsed;

    return nodes.map((node, index) => ({
      id: generateId(),
      action: node.action as ParsedNode['action'],
      label: node.label || `Step ${index + 1}`,
      confidence: node.confidence ?? 0.8,
      originalText: node.originalText || '',
      needsUserInput: node.needsUserInput ?? false,
      warnings: node.warnings,
      // 액션별 필드
      x: node.x,
      y: node.y,
      targetDescription: node.targetDescription,
      direction: node.direction as 'up' | 'down' | 'left' | 'right' | undefined,
      text: node.text,
      duration: node.duration,
      packageName: node.packageName,
      appName: node.appName,
      templateDescription: node.templateDescription,
      keyName: node.keyName,
      startX: node.startX,
      startY: node.startY,
      endX: node.endX,
      endY: node.endY,
    })) as ParsedNode[];
  } catch (error) {
    console.error('[NLParser] Failed to parse AI response:', error);
    throw new Error('AI 응답을 파싱할 수 없습니다.');
  }
}

// ========================================
// 메인 변환 함수
// ========================================

export async function convertNaturalLanguage(
  rawText: string
): Promise<ConversionResponse> {
  const startTime = Date.now();

  // 설정 확인
  if (!isAIConfigured()) {
    return {
      success: false,
      error: 'AI가 설정되지 않았습니다. API 키와 모델을 먼저 설정해주세요.',
      code: 'CONFIG_ERROR',
    } as ConversionError;
  }

  const provider = getAIProvider();
  const config = getAIConfig();

  if (!provider || !config) {
    return {
      success: false,
      error: 'AI Provider를 가져올 수 없습니다.',
      code: 'CONFIG_ERROR',
    } as ConversionError;
  }

  // 입력 텍스트 전처리
  const scenario = parseInputText(rawText);

  if (scenario.steps.length === 0) {
    return {
      success: false,
      error: '변환할 스텝이 없습니다. 시나리오를 입력해주세요.',
      code: 'INVALID_INPUT',
    } as ConversionError;
  }

  // 프롬프트 구성
  const userPrompt = `다음 테스트 시나리오를 노드 목록으로 변환해주세요:

${scenario.title ? `제목: ${scenario.title}\n` : ''}
${scenario.description ? `설명: ${scenario.description}\n` : ''}

스텝:
${scenario.steps.map((s) => `${s.stepNumber}. ${s.text}`).join('\n')}

위 시나리오를 JSON 형식의 노드 목록으로 변환해주세요.`;

  try {
    // AI API 호출
    const response = await provider.chat({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      jsonMode: config.provider === 'openai',  // OpenAI만 JSON mode 지원
      temperature: 0.1,  // 일관된 결과를 위해 낮게 설정
    });

    // 응답 파싱
    const nodes = parseAIResponse(response.content);

    // 결과 집계
    const needsUserInputCount = nodes.filter((n) => n.needsUserInput).length;
    const allWarnings = nodes.flatMap((n) => n.warnings || []);

    const result: ConversionResult = {
      success: true,
      nodes,
      summary: {
        totalSteps: scenario.steps.length,
        parsedSteps: nodes.length,
        needsUserInput: needsUserInputCount,
        warnings: allWarnings,
      },
      metadata: {
        provider: config.provider,
        model: config.model,
        tokensUsed: response.usage
          ? {
              input: response.usage.inputTokens,
              output: response.usage.outputTokens,
            }
          : undefined,
        processingTime: Date.now() - startTime,
      },
    };

    return result;
  } catch (error) {
    console.error('[NLParser] Conversion error:', error);

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      code: 'API_ERROR',
      details: error,
    } as ConversionError;
  }
}

// ========================================
// 노드를 시나리오 형식으로 변환
// ========================================

export interface ScenarioNode {
  id: string;
  type: 'action' | 'start';
  action?: string;
  x?: number;
  y?: number;
  data?: Record<string, unknown>;
  label?: string;
}

export interface ScenarioEdge {
  id: string;
  source: string;
  target: string;
}

export function convertToScenarioFormat(nodes: ParsedNode[]): {
  nodes: ScenarioNode[];
  edges: ScenarioEdge[];
} {
  const scenarioNodes: ScenarioNode[] = [];
  const edges: ScenarioEdge[] = [];

  // Start 노드 추가
  const startNode: ScenarioNode = {
    id: 'start',
    type: 'start',
  };
  scenarioNodes.push(startNode);

  // 각 ParsedNode를 ScenarioNode로 변환
  let prevNodeId = 'start';

  for (const node of nodes) {
    const scenarioNode: ScenarioNode = {
      id: node.id,
      type: 'action',
      action: node.action,
      label: node.label,
      data: {
        originalText: node.originalText,
        needsUserInput: node.needsUserInput,
        confidence: node.confidence,
        warnings: node.warnings,
      },
    };

    // 액션별 데이터 추가
    switch (node.action) {
      case 'tap':
      case 'doubleTap':
      case 'longPress':
        if ('x' in node) scenarioNode.x = node.x;
        if ('y' in node) scenarioNode.data!.y = node.y;
        if ('targetDescription' in node) {
          scenarioNode.data!.targetDescription = node.targetDescription;
        }
        break;

      case 'swipe':
        if ('direction' in node) scenarioNode.data!.direction = node.direction;
        if ('startX' in node) scenarioNode.data!.startX = node.startX;
        if ('startY' in node) scenarioNode.data!.startY = node.startY;
        if ('endX' in node) scenarioNode.data!.endX = node.endX;
        if ('endY' in node) scenarioNode.data!.endY = node.endY;
        break;

      case 'type':
        if ('text' in node) scenarioNode.data!.text = node.text;
        if ('targetDescription' in node) {
          scenarioNode.data!.targetDescription = node.targetDescription;
        }
        break;

      case 'wait':
        if ('duration' in node) scenarioNode.data!.duration = node.duration;
        break;

      case 'launchApp':
      case 'terminateApp':
        if ('packageName' in node) scenarioNode.data!.packageName = node.packageName;
        if ('appName' in node) scenarioNode.data!.appName = node.appName;
        break;

      case 'tapImage':
      case 'waitUntilImage':
      case 'waitUntilImageGone':
        if ('templateDescription' in node) {
          scenarioNode.data!.templateDescription = node.templateDescription;
        }
        if ('templateId' in node) scenarioNode.data!.templateId = node.templateId;
        break;

      case 'pressKey':
        if ('keyName' in node) scenarioNode.data!.keyName = node.keyName;
        if ('keyCode' in node) scenarioNode.data!.keyCode = node.keyCode;
        break;
    }

    scenarioNodes.push(scenarioNode);

    // 엣지 추가
    edges.push({
      id: `${prevNodeId}-${node.id}`,
      source: prevNodeId,
      target: node.id,
    });

    prevNodeId = node.id;
  }

  return { nodes: scenarioNodes, edges };
}
