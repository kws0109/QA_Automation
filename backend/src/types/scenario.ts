// 시나리오 관련 타입 정의

import { Action } from './action';

// 카테고리 (중분류) - 패키지에 종속
export interface Category {
  id: string;
  packageId: string;    // 소속 패키지 ID
  name: string;         // 한글명 (로그인, 결제)
  description?: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCategoryData {
  packageId: string;    // 필수: 소속 패키지
  name: string;
  description?: string;
}

export interface UpdateCategoryData {
  name?: string;
  description?: string;
  order?: number;
}

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

// 시나리오 (소분류) - 카테고리에 종속
export interface Scenario {
  id: string;
  name: string;
  description?: string;
  packageId: string;      // 대분류 - 소속 패키지 ID
  categoryId: string;     // 중분류 - 소속 카테고리 ID
  nodes: ScenarioNode[];
  edges: ScenarioEdge[];
  createdAt: string;
  updatedAt: string;
}

export interface ScenarioListItem {
  id: string;
  name: string;
  description?: string;
  packageId: string;      // 대분류 - 소속 패키지 ID
  packageName?: string;   // 패키지 표시명 (조회 시 조인)
  categoryId: string;     // 중분류 - 소속 카테고리 ID
  categoryName?: string;  // 카테고리 표시명 (조회 시 조인)
  nodeCount: number;
  createdAt: string;
  updatedAt: string;
}