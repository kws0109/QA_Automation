// 실행 관련 타입 정의

export type ExecutionStatus = 'pending' | 'running' | 'waiting' | 'passed' | 'failed' | 'error';

export interface StepResult {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  status: ExecutionStatus;
  startTime: string;
  endTime?: string;
  duration?: number;
  error?: string;
  screenshot?: string;
}

export interface ExecutionResult {
  id: string;
  scenarioId: string;
  scenarioName: string;
  status: ExecutionStatus;
  startTime: string;
  endTime?: string;
  duration?: number;
  steps: StepResult[];
}

export interface ExecutionLog {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  nodeId?: string;
}