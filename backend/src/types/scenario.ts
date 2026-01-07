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
  nodes: ScenarioNode[];
  edges: ScenarioEdge[];
  createdAt: string;
  updatedAt: string;
}

export interface ScenarioListItem {
  id: string;
  name: string;
  description?: string;
  nodeCount: number;
  createdAt: string;
  updatedAt: string;
}