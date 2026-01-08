// 시나리오 관련 타입 정의

import { Action } from './action';

export interface Position {
  x: number;
  y: number;
}

export interface NodeData {
  label: string;
  action?: Action;
  [key: string]: unknown;
}

export interface ScenarioNode {
  id: string;
  type: string;
  position: Position;
  data: NodeData;
}

export interface ScenarioEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface Scenario {
  id: string;
  name: string;
  description?: string;
  packageId: string;      // 소속 패키지 ID
  nodes: ScenarioNode[];
  edges: ScenarioEdge[];
  createdAt: string;
  updatedAt: string;
}

export interface ScenarioListItem {
  id: string;
  name: string;
  description?: string;
  packageId: string;      // 소속 패키지 ID
  packageName?: string;   // 패키지 표시명 (조회 시 조인)
  nodeCount: number;
  createdAt: string;
  updatedAt: string;
}