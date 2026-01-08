// backend/src/services/parallelExecutor.ts

import { Server as SocketIOServer } from 'socket.io';
import { sessionManager } from './sessionManager';
import scenarioService from './scenario';
import reportService from './report';
import { ParallelExecutionResult, StepResult, ExecutionStatus } from '../types';
import { Actions } from '../appium/actions';

// 시나리오 노드 인터페이스 (내부용)
interface ScenarioNodeParams {
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
  templateId?: string;
  threshold?: number;
  [key: string]: unknown;
}

interface ScenarioNode {
  id: string;
  type: string;
  params?: ScenarioNodeParams;
  [key: string]: unknown;
}

// 시나리오 연결 인터페이스
interface ScenarioConnection {
  from: string;
  to: string;
  branch?: string;
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

// 디바이스별 실행 결과
interface DeviceExecutionResult {
  deviceId: string;
  success: boolean;
  duration: number;
  error?: string;
  steps: StepResult[];
}

// 노드 실행 결과 타입
interface ActionExecutionResult {
  success: boolean;
  error?: string;
  continued?: boolean;
  [key: string]: unknown;
}

interface ConditionExecutionResult {
  conditionMet: boolean;
}

interface LoopExecutionResult {
  shouldLoop: boolean;
}

type NodeExecutionResult = ActionExecutionResult | ConditionExecutionResult | LoopExecutionResult | Record<string, never>;

/**
 * 병렬 실행 엔진
 * 여러 디바이스에서 동시에 시나리오를 실행합니다.
 */
class ParallelExecutor {
  private io: SocketIOServer | null = null;
  private isRunning: boolean = false;
  private activeExecutions: Map<string, boolean> = new Map(); // deviceId -> shouldStop

  /**
   * Socket.IO 인스턴스 설정
   */
  setSocketIO(io: SocketIOServer): void {
    this.io = io;
  }

  /**
   * 이벤트 emit (전체)
   */
  private _emit(event: string, data: unknown): void {
    if (this.io) {
      this.io.emit(event, data);
    }
  }

  /**
   * 디바이스별 이벤트 emit
   */
  private _emitToDevice(deviceId: string, event: string, data: unknown): void {
    if (this.io) {
      this.io.emit(event, { deviceId, ...data as object });
    }
  }

  /**
   * 병렬 실행 상태 조회
   */
  getStatus(): { isRunning: boolean; activeDevices: string[] } {
    return {
      isRunning: this.isRunning,
      activeDevices: Array.from(this.activeExecutions.keys()),
    };
  }

  /**
   * 병렬 시나리오 실행
   */
  async executeParallel(
    scenarioId: string,
    deviceIds: string[]
  ): Promise<ParallelExecutionResult> {
    if (this.isRunning) {
      throw new Error('이미 병렬 실행 중입니다.');
    }

    // 시나리오 로드
    const scenario = await scenarioService.getById(scenarioId);
    if (!scenario) {
      throw new Error(`시나리오를 찾을 수 없습니다: ${scenarioId}`);
    }

    // 세션 확인
    const validDeviceIds = deviceIds.filter(id => sessionManager.hasSession(id));
    if (validDeviceIds.length === 0) {
      throw new Error('활성 세션이 있는 디바이스가 없습니다.');
    }

    this.isRunning = true;
    const startedAt = new Date();

    // 실행 상태 초기화
    validDeviceIds.forEach(id => this.activeExecutions.set(id, false));

    this._emit('parallel:start', {
      scenarioId,
      scenarioName: scenario.name,
      deviceIds: validDeviceIds,
      startedAt: startedAt.toISOString(),
    });

    console.log(`[ParallelExecutor] 병렬 실행 시작: ${scenario.name} on ${validDeviceIds.length}개 디바이스`);

    try {
      // 각 디바이스에서 병렬로 시나리오 실행
      const results = await Promise.allSettled(
        validDeviceIds.map(deviceId =>
          this._executeOnDevice(deviceId, scenario)
        )
      );

      const completedAt = new Date();
      const totalDuration = completedAt.getTime() - startedAt.getTime();

      // 결과 정리
      const deviceResults: DeviceExecutionResult[] = results.map((result, index) => {
        const deviceId = validDeviceIds[index];

        if (result.status === 'fulfilled') {
          return result.value;
        } else {
          return {
            deviceId,
            success: false,
            duration: 0,
            error: result.reason?.message || '알 수 없는 오류',
            steps: [],
          };
        }
      });

      const parallelResult: ParallelExecutionResult = {
        scenarioId,
        results: deviceResults,
        totalDuration,
        startedAt,
        completedAt,
      };

      this._emit('parallel:complete', {
        scenarioId,
        scenarioName: scenario.name,
        totalDuration,
        results: deviceResults.map(r => ({
          deviceId: r.deviceId,
          success: r.success,
          duration: r.duration,
          error: r.error,
        })),
      });

      console.log(`[ParallelExecutor] 병렬 실행 완료: ${totalDuration}ms`);

      // 각 디바이스별 리포트 저장
      for (const result of deviceResults) {
        await reportService.create({
          scenarioId,
          scenarioName: `${scenario.name} [${result.deviceId}]`,
          status: result.success ? 'success' : 'failed',
          error: result.error,
          startedAt: startedAt.toISOString(),
          completedAt: completedAt.toISOString(),
          duration: result.duration,
          nodeCount: scenario.nodes.length,
          executedCount: result.steps.length,
          successCount: result.steps.filter(s => s.status === 'passed').length,
          failCount: result.steps.filter(s => s.status === 'failed' || s.status === 'error').length,
          logs: result.steps.map(s => {
            // ExecutionStatus → LogEntry status 매핑
            let logStatus: 'start' | 'success' | 'error' | 'skip' | 'warn' = 'success';
            if (s.status === 'passed') logStatus = 'success';
            else if (s.status === 'failed' || s.status === 'error') logStatus = 'error';
            else if (s.status === 'running') logStatus = 'start';
            else if (s.status === 'pending') logStatus = 'skip';

            return {
              timestamp: s.startTime,
              nodeId: s.nodeId,
              status: logStatus,
              message: s.error || `${s.nodeType}: ${s.nodeName}`,
            };
          }),
        });
      }

      return parallelResult;

    } finally {
      this.isRunning = false;
      this.activeExecutions.clear();
    }
  }

  /**
   * 단일 디바이스에서 시나리오 실행
   */
  private async _executeOnDevice(
    deviceId: string,
    scenario: Scenario
  ): Promise<DeviceExecutionResult> {
    const actions = sessionManager.getActions(deviceId);
    if (!actions) {
      throw new Error(`디바이스 세션을 찾을 수 없습니다: ${deviceId}`);
    }

    const startTime = Date.now();
    const steps: StepResult[] = [];
    const loopCounters: Record<string, number> = {};

    actions.reset();

    this._emitToDevice(deviceId, 'device:scenario:start', {
      scenarioId: scenario.id,
      scenarioName: scenario.name,
    });

    console.log(`[${deviceId}] 시나리오 시작: ${scenario.name}`);

    try {
      const startNode = scenario.nodes.find(n => n.type === 'start');
      if (!startNode) {
        throw new Error('시작 노드를 찾을 수 없습니다.');
      }

      await this._executeFromNode(deviceId, actions, scenario, startNode.id, steps, loopCounters);

      const duration = Date.now() - startTime;

      this._emitToDevice(deviceId, 'device:scenario:complete', {
        scenarioId: scenario.id,
        status: 'success',
        duration,
      });

      console.log(`[${deviceId}] 시나리오 완료: ${duration}ms`);

      return {
        deviceId,
        success: true,
        duration,
        steps,
      };

    } catch (e) {
      const error = e as Error;
      const duration = Date.now() - startTime;

      this._emitToDevice(deviceId, 'device:scenario:complete', {
        scenarioId: scenario.id,
        status: 'failed',
        error: error.message,
        duration,
      });

      console.log(`[${deviceId}] 시나리오 실패: ${error.message}`);

      return {
        deviceId,
        success: false,
        duration,
        error: error.message,
        steps,
      };
    }
  }

  /**
   * 노드부터 실행
   */
  private async _executeFromNode(
    deviceId: string,
    actions: Actions,
    scenario: Scenario,
    nodeId: string,
    steps: StepResult[],
    loopCounters: Record<string, number>
  ): Promise<void> {
    // 중지 확인
    if (this.activeExecutions.get(deviceId)) {
      console.log(`[${deviceId}] 실행 중지됨`);
      return;
    }

    const node = scenario.nodes.find(n => n.id === nodeId);
    if (!node) {
      console.log(`[${deviceId}] 노드를 찾을 수 없음: ${nodeId}`);
      return;
    }

    const stepStartTime = new Date().toISOString();
    let result: NodeExecutionResult = {};
    let stepStatus: ExecutionStatus = 'passed';
    let stepError: string | undefined;

    switch (node.type) {
      case 'start':
        this._emitToDevice(deviceId, 'device:node', {
          nodeId,
          status: 'success',
          message: '시나리오 시작',
        });
        break;

      case 'end':
        this._emitToDevice(deviceId, 'device:node', {
          nodeId,
          status: 'success',
          message: '시나리오 종료',
        });
        steps.push({
          nodeId,
          nodeName: 'End',
          nodeType: 'end',
          status: 'passed',
          startTime: stepStartTime,
          endTime: new Date().toISOString(),
        });
        return; // 실행 종료

      case 'action':
        try {
          result = await this._executeAction(deviceId, actions, node);
          stepStatus = (result as ActionExecutionResult).success ? 'passed' : 'failed';
          stepError = (result as ActionExecutionResult).error;
        } catch (e) {
          const error = e as Error;
          stepStatus = 'error';
          stepError = error.message;
          if (!node.params?.continueOnError) {
            steps.push({
              nodeId,
              nodeName: node.params?.actionType || 'action',
              nodeType: 'action',
              status: stepStatus,
              startTime: stepStartTime,
              endTime: new Date().toISOString(),
              error: stepError,
            });
            throw error;
          }
        }
        break;

      case 'condition':
        try {
          result = await this._executeCondition(deviceId, actions, node);
          stepStatus = 'passed';
        } catch (e) {
          const error = e as Error;
          stepStatus = 'error';
          stepError = error.message;
          result = { conditionMet: false };
        }
        break;

      case 'loop':
        result = await this._executeLoop(deviceId, actions, node, loopCounters);
        break;

      default:
        console.log(`[${deviceId}] 알 수 없는 노드 타입: ${node.type}`);
    }

    // 스텝 기록 (start 노드 제외)
    if (node.type !== 'start') {
      steps.push({
        nodeId,
        nodeName: node.params?.actionType || node.params?.conditionType || node.params?.loopType || node.type,
        nodeType: node.type,
        status: stepStatus,
        startTime: stepStartTime,
        endTime: new Date().toISOString(),
        error: stepError,
      });
    }

    // 다음 노드 찾기
    const nextNodeId = this._findNextNode(scenario, nodeId, node, result);
    if (nextNodeId) {
      await this._executeFromNode(deviceId, actions, scenario, nextNodeId, steps, loopCounters);
    }
  }

  /**
   * 다음 노드 찾기
   */
  private _findNextNode(
    scenario: Scenario,
    nodeId: string,
    node: ScenarioNode,
    result: NodeExecutionResult
  ): string | undefined {
    if (node.type === 'condition') {
      const conditionResult = result as ConditionExecutionResult;
      const branch = conditionResult.conditionMet ? 'yes' : 'no';
      const connection = scenario.connections.find(
        conn => conn.from === nodeId && conn.branch === branch
      );
      return connection?.to;
    }

    if (node.type === 'loop') {
      const loopResult = result as LoopExecutionResult;
      const branch = loopResult.shouldLoop ? 'loop' : 'exit';
      const connection = scenario.connections.find(
        conn => conn.from === nodeId && conn.branch === branch
      );
      return connection?.to;
    }

    const connection = scenario.connections.find(conn => conn.from === nodeId);
    return connection?.to;
  }

  /**
   * 액션 실행
   */
  private async _executeAction(
    deviceId: string,
    actions: Actions,
    node: ScenarioNode
  ): Promise<ActionExecutionResult> {
    const { actionType, ...params } = node.params || {};

    if (!actionType) {
      throw new Error('액션 타입이 지정되지 않음');
    }

    this._emitToDevice(deviceId, 'device:node', {
      nodeId: node.id,
      status: 'start',
      message: `액션 실행: ${actionType}`,
    });

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

    this._emitToDevice(deviceId, 'device:node', {
      nodeId: node.id,
      status: 'success',
      message: `액션 완료: ${actionType}`,
    });

    return { success: true, ...(result as Record<string, unknown>) };
  }

  /**
   * 조건 실행
   */
  private async _executeCondition(
    deviceId: string,
    actions: Actions,
    node: ScenarioNode
  ): Promise<ConditionExecutionResult> {
    const { conditionType, ...params } = node.params || {};

    if (!conditionType) {
      throw new Error('조건 타입이 지정되지 않음');
    }

    this._emitToDevice(deviceId, 'device:node', {
      nodeId: node.id,
      status: 'start',
      message: `조건 검사: ${conditionType}`,
    });

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
      default:
        throw new Error(`알 수 없는 조건: ${conditionType}`);
    }

    this._emitToDevice(deviceId, 'device:node', {
      nodeId: node.id,
      status: 'success',
      message: `조건 결과: ${conditionMet ? 'Yes' : 'No'}`,
    });

    return { conditionMet };
  }

  /**
   * 루프 실행
   */
  private async _executeLoop(
    deviceId: string,
    actions: Actions,
    node: ScenarioNode,
    loopCounters: Record<string, number>
  ): Promise<LoopExecutionResult> {
    const { loopType, count, selector, strategy, timeout } = node.params || {};

    if (!loopType) {
      throw new Error('루프 타입이 지정되지 않음');
    }

    if (loopCounters[node.id] === undefined) {
      loopCounters[node.id] = 0;
    }

    let shouldLoop = false;

    switch (loopType) {
      case 'count':
        loopCounters[node.id]++;
        shouldLoop = loopCounters[node.id] <= (count as number);
        this._emitToDevice(deviceId, 'device:node', {
          nodeId: node.id,
          status: 'success',
          message: `루프 ${loopCounters[node.id]}/${count} (${shouldLoop ? '계속' : '종료'})`,
        });
        break;

      case 'whileExists': {
        const result = await actions.elementExists(
          selector as string,
          (strategy as 'id' | 'xpath' | 'accessibility id' | 'text') || 'id',
          (timeout as number) || 3000
        );
        shouldLoop = result.exists;
        loopCounters[node.id]++;
        this._emitToDevice(deviceId, 'device:node', {
          nodeId: node.id,
          status: 'success',
          message: `루프 ${loopCounters[node.id]}회 - 요소 ${shouldLoop ? '존재' : '없음'}`,
        });
        break;
      }

      case 'whileNotExists': {
        const result = await actions.elementExists(
          selector as string,
          (strategy as 'id' | 'xpath' | 'accessibility id' | 'text') || 'id',
          (timeout as number) || 3000
        );
        shouldLoop = !result.exists;
        loopCounters[node.id]++;
        this._emitToDevice(deviceId, 'device:node', {
          nodeId: node.id,
          status: 'success',
          message: `루프 ${loopCounters[node.id]}회 - 요소 ${result.exists ? '존재' : '없음'}`,
        });
        break;
      }

      default:
        throw new Error(`알 수 없는 루프 타입: ${loopType}`);
    }

    if (!shouldLoop) {
      loopCounters[node.id] = 0;
    }

    return { shouldLoop };
  }

  /**
   * 특정 디바이스 실행 중지
   */
  stopDevice(deviceId: string): void {
    if (this.activeExecutions.has(deviceId)) {
      this.activeExecutions.set(deviceId, true);
      const actions = sessionManager.getActions(deviceId);
      actions?.stop();
      console.log(`[${deviceId}] 실행 중지 요청`);
    }
  }

  /**
   * 모든 실행 중지
   */
  stopAll(): void {
    for (const deviceId of this.activeExecutions.keys()) {
      this.stopDevice(deviceId);
    }
    console.log('[ParallelExecutor] 모든 실행 중지 요청');
  }
}

// 싱글톤 인스턴스 export
export const parallelExecutor = new ParallelExecutor();
