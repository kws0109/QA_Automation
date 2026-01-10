/**
 * 시나리오 흐름 요약 서비스
 * 노드 연결을 순회하여 텍스트로 요약
 */

import type {
  FlowNode,
  Connection,
  TraversalNode,
  ScenarioFlowSummary,
  NodeParams,
} from '../types';

/**
 * 시나리오 노드를 Start부터 End까지 DFS로 순회
 */
export function traverseScenario(
  nodes: FlowNode[],
  connections: Connection[]
): { traversalOrder: TraversalNode[]; disconnectedNodes: FlowNode[] } {
  const result: TraversalNode[] = [];
  const visited = new Set<string>();
  let stepNumber = 1;

  // 노드 ID로 노드 찾기
  const findNode = (id: string) => nodes.find((n) => n.id === id);

  // 특정 노드에서 나가는 연결 찾기
  const findOutgoingConnections = (nodeId: string, label?: string) => {
    if (label) {
      return connections.filter((c) => c.from === nodeId && c.label === label);
    }
    return connections.filter((c) => c.from === nodeId);
  };

  // DFS 순회
  function traverse(
    nodeId: string,
    depth: number,
    branch?: 'yes' | 'no' | 'loop' | 'exit'
  ) {
    const node = findNode(nodeId);
    if (!node) return;

    // 무한 루프 방지 (같은 depth에서 같은 노드 재방문 허용 - 분기 합류점)
    const visitKey = `${nodeId}:${depth}:${branch || ''}`;
    if (visited.has(visitKey)) return;
    visited.add(visitKey);

    // 결과에 추가
    result.push({
      node,
      depth,
      branch,
      stepNumber: stepNumber++,
    });

    // End 노드면 종료
    if (node.type === 'end') return;

    // 노드 타입별 처리
    if (node.type === 'condition') {
      // Yes 분기
      const yesConns = findOutgoingConnections(nodeId, 'yes');
      yesConns.forEach((conn) => {
        traverse(conn.to, depth + 1, 'yes');
      });

      // No 분기
      const noConns = findOutgoingConnections(nodeId, 'no');
      noConns.forEach((conn) => {
        traverse(conn.to, depth + 1, 'no');
      });
    } else if (node.type === 'loop') {
      // Loop 내부
      const loopConns = findOutgoingConnections(nodeId, 'loop');
      loopConns.forEach((conn) => {
        traverse(conn.to, depth + 1, 'loop');
      });

      // Exit 분기
      const exitConns = findOutgoingConnections(nodeId, 'exit');
      exitConns.forEach((conn) => {
        traverse(conn.to, depth, 'exit');
      });
    } else {
      // 일반 노드 - 라벨 없는 연결 따라가기
      const nextConns = findOutgoingConnections(nodeId).filter((c) => !c.label);
      nextConns.forEach((conn) => {
        traverse(conn.to, depth, undefined);
      });
    }
  }

  // Start 노드 찾기
  const startNode = nodes.find((n) => n.type === 'start');
  if (startNode) {
    traverse(startNode.id, 0, undefined);
  }

  // 연결되지 않은 노드 찾기
  const visitedNodeIds = new Set(result.map((r) => r.node.id));
  const disconnectedNodes = nodes.filter((n) => !visitedNodeIds.has(n.id));

  return { traversalOrder: result, disconnectedNodes };
}

/**
 * 액션 타입을 한글 라벨로 변환
 */
function getActionLabel(actionType: string): string {
  const labels: Record<string, string> = {
    tap: '탭',
    longPress: '롱프레스',
    swipe: '스와이프',
    wait: '대기',
    waitUntilGone: '요소 사라짐 대기',
    waitUntilExists: '요소 나타남 대기',
    waitUntilTextGone: '텍스트 사라짐 대기',
    waitUntilTextExists: '텍스트 나타남 대기',
    tapImage: '이미지 탭',
    waitUntilImage: '이미지 나타남 대기',
    waitUntilImageGone: '이미지 사라짐 대기',
    back: '뒤로가기',
    home: '홈',
    launchApp: '앱 실행',
    terminateApp: '앱 종료',
    restart: '앱 재시작',
    clearData: '데이터 삭제',
    clearCache: '캐시 삭제',
    input: '텍스트 입력',
  };
  return labels[actionType] || actionType;
}

/**
 * 조건 타입을 한글 라벨로 변환
 */
function getConditionLabel(conditionType: string): string {
  const labels: Record<string, string> = {
    elementExists: '요소 존재 확인',
    elementNotExists: '요소 미존재 확인',
    textContains: '텍스트 포함 확인',
    screenContainsText: '화면 텍스트 검색',
    imageExists: '이미지 존재 확인',
  };
  return labels[conditionType] || conditionType;
}

/**
 * 루프 타입을 한글 라벨로 변환
 */
function getLoopLabel(loopType: string, loopCount?: number): string {
  const labels: Record<string, string> = {
    count: `${loopCount || 0}회 반복`,
    whileExists: '요소 존재하는 동안 반복',
    whileNotExists: '요소 없는 동안 반복',
  };
  return labels[loopType] || loopType;
}

/**
 * 노드 파라미터를 텍스트로 변환
 */
function formatParams(params: NodeParams, templateNames?: Map<string, string>): string[] {
  const lines: string[] = [];
  const { actionType } = params;

  switch (actionType) {
    case 'tap':
      if (params.x !== undefined && params.y !== undefined) {
        lines.push(`좌표: (${params.x}, ${params.y})`);
      }
      break;

    case 'longPress':
      if (params.x !== undefined && params.y !== undefined) {
        lines.push(`좌표: (${params.x}, ${params.y})`);
      }
      if (params.duration) {
        lines.push(`시간: ${params.duration}ms`);
      }
      break;

    case 'swipe':
      if (params.startX !== undefined && params.startY !== undefined) {
        lines.push(`시작: (${params.startX}, ${params.startY})`);
      }
      if (params.endX !== undefined && params.endY !== undefined) {
        lines.push(`끝: (${params.endX}, ${params.endY})`);
      }
      if (params.duration) {
        lines.push(`시간: ${params.duration}ms`);
      }
      break;

    case 'wait':
      if (params.duration) {
        lines.push(`시간: ${params.duration}ms`);
      }
      break;

    case 'waitUntilGone':
    case 'waitUntilExists':
      if (params.selector) {
        lines.push(`선택자: ${params.selector}`);
      }
      if (params.selectorType) {
        lines.push(`방식: ${params.selectorType}`);
      }
      if (params.timeout) {
        lines.push(`타임아웃: ${params.timeout}ms`);
      }
      break;

    case 'waitUntilTextGone':
    case 'waitUntilTextExists':
      if (params.text) {
        lines.push(`텍스트: "${params.text}"`);
      }
      if (params.timeout) {
        lines.push(`타임아웃: ${params.timeout}ms`);
      }
      break;

    case 'tapImage':
    case 'waitUntilImage':
    case 'waitUntilImageGone':
      if (params.templateId) {
        const templateName = templateNames?.get(params.templateId) || params.templateName || params.templateId;
        lines.push(`템플릿: ${templateName}`);
      }
      if (params.threshold) {
        lines.push(`임계값: ${(params.threshold * 100).toFixed(0)}%`);
      }
      if (actionType !== 'tapImage' && params.timeout) {
        lines.push(`타임아웃: ${params.timeout}ms`);
      }
      break;

    case 'launchApp':
    case 'terminateApp':
    case 'restart':
    case 'clearData':
    case 'clearCache':
      if (params.packageName) {
        lines.push(`패키지: ${params.packageName}`);
      }
      break;

    case 'input':
      if (params.text) {
        lines.push(`텍스트: "${params.text}"`);
      }
      if (params.selector) {
        lines.push(`선택자: ${params.selector}`);
      }
      break;
  }

  return lines;
}

/**
 * 단일 노드를 텍스트로 변환
 */
export function nodeToText(
  traversalNode: TraversalNode,
  templateNames?: Map<string, string>
): string {
  const { node, depth, branch, stepNumber } = traversalNode;
  const indent = '  '.repeat(depth);
  const lines: string[] = [];

  // 분기 라벨
  let branchPrefix = '';
  if (branch === 'yes') branchPrefix = '[YES] ';
  else if (branch === 'no') branchPrefix = '[NO] ';
  else if (branch === 'loop') branchPrefix = '[반복] ';
  else if (branch === 'exit') branchPrefix = '[탈출] ';

  // 노드 타입별 텍스트
  const nodeLabel = node.label || '';
  const params = node.params;

  switch (node.type) {
    case 'start':
      lines.push(`${indent}${stepNumber}. ${branchPrefix}[START] 시나리오 시작`);
      break;

    case 'end':
      lines.push(`${indent}${stepNumber}. ${branchPrefix}[END] 시나리오 종료`);
      break;

    case 'action': {
      const actionLabel = getActionLabel(params.actionType || '');
      lines.push(`${indent}${stepNumber}. ${branchPrefix}[ACTION] ${actionLabel}`);
      if (nodeLabel) {
        lines.push(`${indent}   - 설명: ${nodeLabel}`);
      }
      const paramLines = formatParams(params, templateNames);
      paramLines.forEach((line) => {
        lines.push(`${indent}   - ${line}`);
      });
      break;
    }

    case 'condition': {
      const conditionLabel = getConditionLabel(params.conditionType || '');
      lines.push(`${indent}${stepNumber}. ${branchPrefix}[CONDITION] ${conditionLabel}`);
      if (nodeLabel) {
        lines.push(`${indent}   - 설명: ${nodeLabel}`);
      }
      if (params.selector) {
        lines.push(`${indent}   - 선택자: ${params.selector}`);
      }
      if (params.text) {
        lines.push(`${indent}   - 텍스트: "${params.text}"`);
      }
      if (params.templateId) {
        const templateName = templateNames?.get(params.templateId) || params.templateName || params.templateId;
        lines.push(`${indent}   - 템플릿: ${templateName}`);
      }
      break;
    }

    case 'loop': {
      const loopLabel = getLoopLabel(params.loopType || '', params.loopCount);
      lines.push(`${indent}${stepNumber}. ${branchPrefix}[LOOP] ${loopLabel}`);
      if (nodeLabel) {
        lines.push(`${indent}   - 설명: ${nodeLabel}`);
      }
      if (params.selector) {
        lines.push(`${indent}   - 선택자: ${params.selector}`);
      }
      break;
    }
  }

  return lines.join('\n');
}

/**
 * 전체 시나리오를 텍스트로 요약
 */
export function generateSummary(
  scenarioName: string,
  nodes: FlowNode[],
  connections: Connection[],
  options?: {
    scenarioId?: string;
    templateNames?: Map<string, string>;
  }
): ScenarioFlowSummary {
  const { traversalOrder, disconnectedNodes } = traverseScenario(nodes, connections);

  // 통계 계산
  const hasConditions = nodes.some((n) => n.type === 'condition');
  const hasLoops = nodes.some((n) => n.type === 'loop');

  // 텍스트 요약 생성
  const textLines: string[] = [];
  textLines.push(`[시나리오: ${scenarioName}]`);
  textLines.push('='.repeat(45));
  textLines.push('');

  traversalOrder.forEach((tn) => {
    textLines.push(nodeToText(tn, options?.templateNames));
    textLines.push('');
  });

  // 연결되지 않은 노드 표시
  if (disconnectedNodes.length > 0) {
    textLines.push('');
    textLines.push('--- 연결되지 않은 노드 ---');
    disconnectedNodes.forEach((node) => {
      const actionLabel = node.params.actionType
        ? getActionLabel(node.params.actionType)
        : node.type;
      textLines.push(`- [${node.type.toUpperCase()}] ${node.label || actionLabel} (ID: ${node.id})`);
    });
  }

  return {
    scenarioName,
    scenarioId: options?.scenarioId,
    totalNodes: nodes.length,
    totalSteps: traversalOrder.length,
    hasConditions,
    hasLoops,
    disconnectedNodes,
    traversalOrder,
    textSummary: textLines.join('\n'),
  };
}

/**
 * 마크다운 형식으로 변환
 */
export function toMarkdown(summary: ScenarioFlowSummary): string {
  const lines: string[] = [];

  lines.push(`# ${summary.scenarioName}`);
  lines.push('');
  lines.push('## 요약 정보');
  lines.push('');
  lines.push(`- **총 노드 수**: ${summary.totalNodes}개`);
  lines.push(`- **실행 단계**: ${summary.totalSteps}개`);
  lines.push(`- **조건 분기**: ${summary.hasConditions ? '있음' : '없음'}`);
  lines.push(`- **반복 루프**: ${summary.hasLoops ? '있음' : '없음'}`);
  lines.push('');
  lines.push('## 실행 흐름');
  lines.push('');
  lines.push('```');
  lines.push(summary.textSummary);
  lines.push('```');

  if (summary.disconnectedNodes.length > 0) {
    lines.push('');
    lines.push('## 연결되지 않은 노드');
    lines.push('');
    summary.disconnectedNodes.forEach((node) => {
      lines.push(`- ${node.label || node.id} (${node.type})`);
    });
  }

  return lines.join('\n');
}
