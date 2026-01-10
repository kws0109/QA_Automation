// 시나리오 관련 타입 정의

import { Action } from './action';

// 카테고리 (대분류)
export interface Category {
  id: string;           // 케밥케이스 (login, payment)
  name: string;         // 한글명 (로그인, 결제)
  description?: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCategoryData {
  id?: string;          // 없으면 자동 생성
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

export interface Scenario {
  id: string;
  name: string;
  description?: string;
  categoryId: string;     // 대분류 ID (신규)
  packageId: string;      // 중분류 - 소속 패키지 ID
  nodes: ScenarioNode[];
  edges: ScenarioEdge[];
  createdAt: string;
  updatedAt: string;
}

export interface ScenarioListItem {
  id: string;
  name: string;
  description?: string;
  categoryId: string;     // 대분류 ID (신규)
  categoryName?: string;  // 대분류 표시명 (조회 시 조인)
  packageId: string;      // 중분류 - 소속 패키지 ID
  packageName?: string;   // 패키지 표시명 (조회 시 조인)
  nodeCount: number;
  createdAt: string;
  updatedAt: string;
}