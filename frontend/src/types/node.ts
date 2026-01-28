// frontend/src/types/node.ts
// 노드, 연결, 시나리오 관련 타입

export type NodeType = 'start' | 'action' | 'condition' | 'loop' | 'end';

export interface NodeParams {
  actionType?: string;
  x?: number;
  y?: number;
  duration?: number;
  startX?: number;
  startY?: number;
  endX?: number;
  endY?: number;
  text?: string;
  selector?: string;
  selectorType?: string;
  timeout?: number;
  interval?: number;
  conditionType?: string;
  loopType?: string;
  loopCount?: number;
  currentIteration?: number;
  packageName?: string;
  continueOnError?: boolean;
  retryCount?: number;
  retryDelay?: number;
  templateId?: string;
  templateName?: string;
  threshold?: number;
}

export interface FlowNode {
  id: string;
  type: NodeType;
  label?: string;  // 노드 설명 (예: "로그인 버튼 클릭")
  x: number;
  y: number;
  params: NodeParams;
}

export interface Connection {
  from: string;
  to: string;
  label?: string;
}

// ========== Action 관련 ==========
export interface ActionType {
  value: string;
  label: string;
  group: 'touch' | 'wait' | 'system';
}

export interface ConditionType {
  value: string;
  label: string;
}

export interface LoopType {
  value: string;
  label: string;
}

export interface SelectorStrategy {
  value: string;
  label: string;
}

// ========== Scenario 관련 ==========
export interface Scenario {
  id: string;
  name: string;
  description?: string;
  packageId: string;      // 소속 패키지 ID (대분류)
  categoryId: string;     // 소속 카테고리 ID (중분류)
  nodes: FlowNode[];
  connections: Connection[];
  createdAt: string;
  updatedAt: string;
}

export interface ScenarioSummary {
  id: string;
  name: string;
  description?: string;
  packageId: string;      // 소속 패키지 ID (대분류)
  packageName?: string;   // 패키지 표시명
  categoryId: string;     // 소속 카테고리 ID (중분류)
  categoryName?: string;  // 카테고리 표시명
  nodeCount: number;
  createdAt: string;
  updatedAt: string;
}

// ========== 시나리오 흐름 요약 ==========

// 노드 순회 결과
export interface TraversalNode {
  node: FlowNode;
  depth: number;                              // 들여쓰기 레벨 (분기/루프 깊이)
  branch?: 'yes' | 'no' | 'loop' | 'exit';    // 분기 라벨
  stepNumber: number;                         // 순서 번호
}

// 시나리오 흐름 요약 결과
export interface ScenarioFlowSummary {
  scenarioName: string;
  scenarioId?: string;
  totalNodes: number;
  totalSteps: number;
  hasConditions: boolean;
  hasLoops: boolean;
  disconnectedNodes: FlowNode[];              // 연결되지 않은 노드들
  traversalOrder: TraversalNode[];
  textSummary: string;
}
