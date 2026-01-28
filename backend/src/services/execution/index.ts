// backend/src/services/execution/index.ts
// 실행 모듈 진입점

// 타입 내보내기
export * from './types';

// 서비스 내보내기
export { ExecutionStateManager, executionStateManager } from './ExecutionStateManager';
export { ExecutionMediaManager, executionMediaManager } from './ExecutionMediaManager';
export { ScenarioExecutionEngine, scenarioExecutionEngine } from './ScenarioExecutionEngine';
export { PerformanceMetricsCollector, performanceMetricsCollector } from './PerformanceMetricsCollector';

// 기존 testExecutor 하위 호환성 유지
// testExecutor는 이 모듈들을 내부적으로 사용하지만
// 외부 API는 변경되지 않음
