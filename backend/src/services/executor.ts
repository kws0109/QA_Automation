// backend/src/services/executor.ts

import { Server as SocketIOServer } from 'socket.io';
import actions from '../appium/actions';
import reportService from './report';

// 시나리오 노드 인터페이스
interface ScenarioNode {
  id: string;
  type: 'start' | 'end' | 'action' | 'condition' | 'loop';
  params?: {
    actionType?: string;
    conditionType?: string;
    loopType?: string;
    count?: number;
    selector?: string;
    strategy?: 'id' | 'xpath' | 'accessibility id' | 'text';
    timeout?: number;
    interval?: number;
    text?: string;
    x?: number;
    y?: number;
    startX?: number;
    startY?: number;
    endX?: number;
    endY?: number;
    duration?: number;
    appPackage?: string;
    continueOnError?: boolean;
    // 이미지 액션용 추가
    templateId?: string;
    threshold?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

// 시나리오 연결 인터페이스
interface ScenarioConnection {
  from: string;
  to: string;
  branch?: 'yes' | 'no' | 'loop' | 'exit';
}

// 시나리오 인터페이스
interface Scenario {
  id: string;
  name: string;
  description?: string;
  nodes: ScenarioNode[];
  connections: ScenarioConnection[];
  createdAt: string;
  updatedAt: string;
}

// 로그 엔트리 인터페이스
interface LogEntry {
  timestamp: string;
  nodeId: string;
  status: 'start' | 'success' | 'error' | 'skip' | 'warn';
  message: string;
  [key: string]: unknown;
}

// 실행 상태 인터페이스
interface ExecutorStatus {
  isRunning: boolean;
  currentScenario: string | null;
  currentNodeId: string | null;
  logCount: number;
}

// 실행 결과 인터페이스
interface ExecutionResult {
  success: boolean;
  duration: number;
  log: LogEntry[];
  error?: string;
  report?: unknown;
}

// 액션 실행 결과
interface ActionExecutionResult {
  success: boolean;
  error?: string;
  continued?: boolean;
  [key: string]: unknown;
}

// 조건 실행 결과
interface ConditionExecutionResult {
  conditionMet: boolean;
}

// 루프 실행 결과
interface LoopExecutionResult {
  shouldLoop: boolean;
}

// 노드 실행 결과 타입
type NodeExecutionResult = ActionExecutionResult | ConditionExecutionResult | LoopExecutionResult | Record<string, never>;

class ScenarioExecutor {
  private isRunning: boolean = false;
  private shouldStop: boolean = false;
  private currentScenario: Scenario | null = null;
  private currentNodeId: string | null = null;
  private executionLog: LogEntry[] = [];
  private io: SocketIOServer | null = null;
  private loopCounters: Record<string, number> = {};

  /**
   * Socket.IO 인스턴스 설정
   */
  setSocketIO(io: SocketIOServer): void {
    this.io = io;
  }

  /**
   * 이벤트 emit
   */
  private _emit(event: string, data: unknown): void {
    if (this.io) {
      this.io.emit(event, data);
    }
  }

  /**
   * 실행 상태 조회
   */
  getStatus(): ExecutorStatus {
    return {
      isRunning: this.isRunning,
      currentScenario: this.currentScenario?.name || null,
      currentNodeId: this.currentNodeId,
      logCount: this.executionLog.length,
    };
  }

  /**
   * 실행 로그 조회
   */
  getLog(): LogEntry[] {
    return this.executionLog;
  }

  /**
   * 실행 로그 초기화
   */
  clearLog(): void {
    this.executionLog = [];
    this.loopCounters = {};
  }

  /**
   * 로그 추가
   */
  private _log(
    nodeId: string,
    status: LogEntry['status'],
    message: string,
    details: Record<string, unknown> = {}
  ): LogEntry {
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      nodeId,
      status,
      message,
      ...details,
    };
    this.executionLog.push(logEntry);
    console.log(`[${status.toUpperCase()}] ${nodeId}: ${message}`);

    this._emit('scenario:node', {
      scenarioId: this.currentScenario?.id,
      scenarioName: this.currentScenario?.name,
      ...logEntry,
    });

    return logEntry;
  }

  /**
   * 시작 노드 찾기
   */
  private _findStartNode(scenario: Scenario): ScenarioNode {
    const startNode = scenario.nodes.find(node => node.type === 'start');
    if (!startNode) {
      throw new Error('시작 노드를 찾을 수 없습니다.');
    }
    return startNode;
  }

  /**
   * 다음 노드 찾기
   */
  private _findNextNode(
    scenario: Scenario,
    nodeId: string,
    result: NodeExecutionResult = {}
  ): string | undefined {
    const node = scenario.nodes.find(n => n.id === nodeId);

    // 조건 노드: 결과에 따라 분기
    if (node?.type === 'condition') {
      const conditionResult = result as ConditionExecutionResult;
      const branch = conditionResult.conditionMet ? 'yes' : 'no';
      const connection = scenario.connections.find(
        conn => conn.from === nodeId && conn.branch === branch
      );
      return connection?.to;
    }

    // 루프 노드: 반복 여부에 따라 분기
    if (node?.type === 'loop') {
      const loopResult = result as LoopExecutionResult;
      const branch = loopResult.shouldLoop ? 'loop' : 'exit';
      const connection = scenario.connections.find(
        conn => conn.from === nodeId && conn.branch === branch
      );
      return connection?.to;
    }

    // 일반 노드
    const connection = scenario.connections.find(conn => conn.from === nodeId);
    return connection?.to;
  }

  /**
   * 시나리오 실행
   */
  async run(scenario: Scenario): Promise<ExecutionResult> {
    if (this.isRunning) {
      throw new Error('이미 실행 중인 시나리오가 있습니다.');
    }

    this.shouldStop = false;
    actions.reset();

    this.isRunning = true;
    this.currentScenario = scenario;
    this.executionLog = [];
    this.loopCounters = {};

    const startTime = Date.now();

    this._emit('scenario:start', {
      scenarioId: scenario.id,
      scenarioName: scenario.name,
    });

    try {
      const startNode = this._findStartNode(scenario);
      await this._executeFromNode(scenario, startNode.id);

      const duration = Date.now() - startTime;

      this._emit('scenario:complete', {
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        status: 'success',
        duration,
      });

      // 리포트 저장
      const report = await reportService.create({
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        status: 'success',
        startedAt: new Date(startTime).toISOString(),
        completedAt: new Date().toISOString(),
        duration,
        nodeCount: scenario.nodes.length,
        executedCount: this.executionLog.filter(l => l.status === 'success').length,
        successCount: this.executionLog.filter(l => l.status === 'success').length,
        failCount: this.executionLog.filter(l => l.status === 'error').length,
        logs: this.executionLog,
      });

      return {
        success: true,
        duration,
        log: this.executionLog,
        report,
      };
    } catch (e) {
      const error = e as Error;
      const duration = Date.now() - startTime;

      this._log(this.currentNodeId || 'unknown', 'error', error.message);

      this._emit('scenario:complete', {
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        status: 'failed',
        error: error.message,
        duration,
      });

      // 실패 리포트 저장
      await reportService.create({
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        status: 'failed',
        error: error.message,
        startedAt: new Date(startTime).toISOString(),
        completedAt: new Date().toISOString(),
        duration,
        nodeCount: scenario.nodes.length,
        executedCount: this.executionLog.length,
        successCount: this.executionLog.filter(l => l.status === 'success').length,
        failCount: this.executionLog.filter(l => l.status === 'error').length,
        logs: this.executionLog,
      });

      return {
        success: false,
        error: error.message,
        duration,
        log: this.executionLog,
      };
    } finally {
      this.isRunning = false;
      this.currentScenario = null;
      this.currentNodeId = null;
    }
  }

  /**
   * 노드부터 실행
   */
  private async _executeFromNode(scenario: Scenario, nodeId: string): Promise<void> {
    if (this.shouldStop) {
      this._log(nodeId, 'skip', '실행 중지됨');
      return;
    }

    const node = scenario.nodes.find(n => n.id === nodeId);
    if (!node) {
      this._log(nodeId, 'error', '노드를 찾을 수 없음');
      return;
    }

    this.currentNodeId = nodeId;

    let result: NodeExecutionResult = {};

    switch (node.type) {
      case 'start':
        this._log(nodeId, 'success', '시나리오 시작');
        break;

      case 'end':
        this._log(nodeId, 'success', '시나리오 종료');
        return; // 여기서 실행 종료

      case 'action':
        result = await this._executeAction(node);
        break;

      case 'condition':
        result = await this._executeCondition(node);
        break;

      case 'loop':
        result = await this._executeLoop(node);
        break;

      default:
        this._log(nodeId, 'skip', `알 수 없는 노드 타입: ${node.type}`);
    }

    // 다음 노드로 이동
    const nextNodeId = this._findNextNode(scenario, nodeId, result);
    if (nextNodeId) {
      await this._executeFromNode(scenario, nextNodeId);
    }
  }

  /**
   * 액션 실행
   */
  private async _executeAction(node: ScenarioNode): Promise<ActionExecutionResult> {
    const { actionType, ...params } = node.params || {};

    if (!actionType) {
      this._log(node.id, 'error', '액션 타입이 지정되지 않음');
      return { success: false };
    }

    this._log(node.id, 'start', `액션 실행: ${actionType}`);

    try {
      let result: unknown;

      switch (actionType) {
        case 'tap':
          result = await actions.tap(params.x as number, params.y as number, { retryCount: 2 });
          break;
        case 'tapElement':
          result = await actions.tapElement(
            params.selector as string,
            params.strategy as 'id' | 'xpath' | 'accessibility id' | 'text',
            { retryCount: 3 }
          );
          break;
        case 'longPress':
          result = await actions.longPress(
            params.x as number,
            params.y as number,
            params.duration as number
          );
          break;
        case 'wait':
          result = await actions.wait(params.duration as number);
          break;
        case 'waitUntilGone':
          result = await actions.waitUntilGone(
            params.selector as string,
            params.strategy as 'id' | 'xpath' | 'accessibility id' | 'text',
            params.timeout as number,
            params.interval as number
          );
          break;
        case 'waitUntilExists':
          result = await actions.waitUntilExists(
            params.selector as string,
            params.strategy as 'id' | 'xpath' | 'accessibility id' | 'text',
            params.timeout as number,
            params.interval as number
          );
          break;
        case 'waitUntilTextGone':
          result = await actions.waitUntilTextGone(
            params.text as string,
            params.timeout as number,
            params.interval as number
          );
          break;
        case 'waitUntilTextExists':
          result = await actions.waitUntilTextExists(
            params.text as string,
            params.timeout as number,
            params.interval as number
          );
          break;
        case 'back':
          result = await actions.back();
          break;
        case 'home':
          result = await actions.home();
          break;
        case 'restart':
          result = await actions.restartApp();
          break;
        case 'clearData':
          result = await actions.clearAppData(params.appPackage as string | undefined);
          break;
        case 'clearCache':
          result = await actions.clearAppCache(params.appPackage as string | undefined);
          break;
        
        // ========== 이미지 액션 ==========
        case 'tapImage':
          result = await actions.tapImage(
            params.templateId as string,
            {
              threshold: params.threshold as number | undefined,
              retryCount: 3,
              retryDelay: 1000,
            }
          );
          break;
        case 'waitUntilImage':
          result = await actions.waitUntilImage(
            params.templateId as string,
            params.timeout as number || 30000,
            params.interval as number || 1000,
            { threshold: params.threshold as number | undefined }
          );
          break;
        case 'waitUntilImageGone':
          result = await actions.waitUntilImageGone(
            params.templateId as string,
            params.timeout as number || 30000,
            params.interval as number || 1000,
            { threshold: params.threshold as number | undefined }
          );
          break;
        
        default:
          throw new Error(`알 수 없는 액션: ${actionType}`);
      }

      this._log(node.id, 'success', `액션 완료: ${actionType}`, result as Record<string, unknown>);
      return { success: true, ...(result as Record<string, unknown>) };

    } catch (e) {
      const error = e as Error;
      const errorInfo = {
        message: error.message,
        actionType,
        params,
      };

      this._log(node.id, 'error', `액션 실패: ${error.message}`, errorInfo);

      if (params.continueOnError) {
        this._log(node.id, 'warn', '에러 무시하고 계속 진행');
        return { success: false, error: error.message, continued: true };
      }

      throw error;
    }
  }

   /**
   * 조건 실행
   */
  private async _executeCondition(node: ScenarioNode): Promise<ConditionExecutionResult> {
    const { conditionType, ...params } = node.params || {};

    if (!conditionType) {
      this._log(node.id, 'error', '조건 타입이 지정되지 않음');
      return { conditionMet: false };
    }

    this._log(node.id, 'start', `조건 검사: ${conditionType}`);

    try {
      let conditionMet = false;

      switch (conditionType) {
        case 'elementExists': {
          const result = await actions.elementExists(
            params.selector as string,
            params.strategy as 'id' | 'xpath' | 'accessibility id' | 'text',
            params.timeout as number
          );
          conditionMet = result.exists;
          break;
        }
        case 'elementNotExists': {
          const result = await actions.elementExists(
            params.selector as string,
            params.strategy as 'id' | 'xpath' | 'accessibility id' | 'text',
            params.timeout as number
          );
          conditionMet = !result.exists;
          break;
        }
        case 'textContains': {
          const result = await actions.elementTextContains(
            params.selector as string,
            params.text as string,
            params.strategy as 'id' | 'xpath' | 'accessibility id' | 'text',
            params.timeout as number
          );
          conditionMet = result.contains;
          break;
        }
        case 'screenContainsText': {
          const result = await actions.screenContainsText(
            params.text as string,
            params.timeout as number
          );
          conditionMet = result.contains;
          break;
        }
        case 'waitUntilGone':
          await actions.waitUntilGone(
            params.selector as string,
            params.strategy as 'id' | 'xpath' | 'accessibility id' | 'text',
            params.timeout as number,
            params.interval as number
          );
          conditionMet = true;
          break;
        case 'waitUntilExists':
          await actions.waitUntilExists(
            params.selector as string,
            params.strategy as 'id' | 'xpath' | 'accessibility id' | 'text',
            params.timeout as number,
            params.interval as number
          );
          conditionMet = true;
          break;
        case 'waitUntilTextGone':
          await actions.waitUntilTextGone(
            params.text as string,
            params.timeout as number,
            params.interval as number
          );
          conditionMet = true;
          break;
        case 'waitUntilTextExists':
          await actions.waitUntilTextExists(
            params.text as string,
            params.timeout as number,
            params.interval as number
          );
          conditionMet = true;
          break;
        default:
          throw new Error(`알 수 없는 조건: ${conditionType}`);
      }

      this._log(node.id, 'success', `조건 결과: ${conditionMet ? 'Yes' : 'No'}`);
      return { conditionMet };
    } catch (e) {
      const error = e as Error;
      this._log(node.id, 'error', `조건 검사 실패: ${error.message}`);
      return { conditionMet: false };
    }
  }

  /**
   * 루프 실행
   */
  private async _executeLoop(node: ScenarioNode): Promise<LoopExecutionResult> {
    const { loopType, count, selector, strategy, timeout } = node.params || {};

    if (!loopType) {
      this._log(node.id, 'error', '루프 타입이 지정되지 않음');
      return { shouldLoop: false };
    }

    // 루프 카운터 초기화 (처음 방문 시)
    if (this.loopCounters[node.id] === undefined) {
      this.loopCounters[node.id] = 0;
    }

    let shouldLoop = false;

    switch (loopType) {
      case 'count':
        // 지정 횟수 반복
        this.loopCounters[node.id]++;
        shouldLoop = this.loopCounters[node.id] <= (count as number);
        this._log(
          node.id,
          'success',
          `루프 ${this.loopCounters[node.id]}/${count} (${shouldLoop ? '계속' : '종료'})`
        );
        break;

      case 'whileExists': {
        // 요소가 존재하는 동안 반복
        const existsResult = await actions.elementExists(
          selector as string,
          (strategy as 'id' | 'xpath' | 'accessibility id' | 'text') || 'id',
          (timeout as number) || 3000
        );
        shouldLoop = existsResult.exists;
        this.loopCounters[node.id]++;
        this._log(
          node.id,
          'success',
          `루프 ${this.loopCounters[node.id]}회 - 요소 ${shouldLoop ? '존재' : '없음'}`
        );
        break;
      }

      case 'whileNotExists': {
        // 요소가 없는 동안 반복
        const notExistsResult = await actions.elementExists(
          selector as string,
          (strategy as 'id' | 'xpath' | 'accessibility id' | 'text') || 'id',
          (timeout as number) || 3000
        );
        shouldLoop = !notExistsResult.exists;
        this.loopCounters[node.id]++;
        this._log(
          node.id,
          'success',
          `루프 ${this.loopCounters[node.id]}회 - 요소 ${notExistsResult.exists ? '존재' : '없음'}`
        );
        break;
      }

      default:
        this._log(node.id, 'error', `알 수 없는 루프 타입: ${loopType}`);
        return { shouldLoop: false };
    }

    // 루프 종료 시 카운터 리셋
    if (!shouldLoop) {
      this.loopCounters[node.id] = 0;
    }

    return { shouldLoop };
  }

  /**
   * 실행 중지
   */
  stop(): void {
    this.shouldStop = true;

    // actions 모듈에도 중지 신호 전달
    actions.stop();

    this._log(this.currentNodeId || 'unknown', 'skip', '사용자에 의해 중지됨');

    this._emit('scenario:stop', {
      scenarioId: this.currentScenario?.id,
      message: '시나리오 실행이 중지되었습니다.',
    });
  }
}

// 싱글톤 인스턴스 export
const scenarioExecutor = new ScenarioExecutor();
export default scenarioExecutor;