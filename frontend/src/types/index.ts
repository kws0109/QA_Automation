// frontend/src/types/index.ts

// ========== Node 관련 ==========
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
}

export interface FlowNode {
  id: string;
  type: NodeType;
  x: number;
  y: number;
  params: NodeParams;
}

export interface Connection {
  from: string;
  to: string;
  label?: string;
}

// ========== Device 관련 ==========
export interface DeviceStatus {
  connected: boolean;
  deviceId?: string;
  platformVersion?: string;
  appPackage?: string;
  sessionId?: string;
}

export interface ConnectionConfig {
  deviceId: string;
  platformVersion: string;
  appPackage: string;
  appActivity: string;
  automationName: string;
  noReset: boolean;
}

export interface ConnectionPreset {
  id: string;
  name: string;
  config: ConnectionConfig;
}

// ========== Scenario 관련 ==========
export interface Scenario {
  id: string;
  name: string;
  description?: string;
  nodes: FlowNode[];
  connections: Connection[];
  createdAt: string;
  updatedAt: string;
}

export interface ScenarioSummary {
  id: string;
  name: string;
  description?: string;
  nodeCount: number;
  createdAt: string;
  updatedAt: string;
}

// ========== Execution 관련 ==========
export type ExecutionStatus = 'running' | 'success' | 'error' | 'skipped' | 'stopped';

export interface ExecutionLog {
  timestamp: string;
  nodeId: string;
  status: ExecutionStatus;
  message: string;
  duration?: number;
  error?: string;
}

export interface ExecutionResult {
  scenarioId: string;
  scenarioName: string;
  startTime: string;
  endTime: string;
  duration: number;
  status: 'success' | 'error' | 'stopped';
  nodeResults: ExecutionLog[];
  summary: {
    total: number;
    success: number;
    error: number;
    skipped: number;
  };
}

// ========== Report 관련 ==========
export interface Report {
  id: string;
  scenarioId: string;
  scenarioName: string;
  executedAt: string;
  duration: number;
  status: 'success' | 'error' | 'stopped';
  summary: {
    total: number;
    success: number;
    error: number;
    skipped: number;
  };
  nodeResults: ExecutionLog[];
}

export interface ReportSummary {
  id: string;
  scenarioName: string;
  executedAt: string;
  status: 'success' | 'error' | 'stopped';
  duration: number;
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

// ========== API Response ==========
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// ========== Socket Events ==========
export interface SocketEvents {
  'scenario:start': { scenarioId: string };
  'scenario:node': ExecutionLog;
  'scenario:complete': ExecutionResult;
  'scenario:error': { error: string };
  'scenario:stop': { scenarioId: string };
}

// ========== Device Element (Preview용) ==========
export interface DeviceElement {
  resourceId?: string;
  text?: string;
  contentDesc?: string;
  className?: string;
  clickable?: boolean;
  enabled?: boolean;
  bounds?: {
    left: number;
    top: number;
    right: number;
    bottom: number;
    // 또는 x, y, width, height 형태로도 사용 가능
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  };
}

// ========== Connection Form ==========
export interface ConnectionFormData {
  deviceName: string;
  appPackage: string;
  appActivity: string;
}