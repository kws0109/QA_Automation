// backend/src/services/executor.js

const actions = require('../appium/actions');
const appiumDriver = require('../appium/driver');
const reportService = require('./report');

class ScenarioExecutor {
  constructor() {
    this.isRunning = false;
    this.shouldStop = false;
    this.currentScenario = null;
    this.currentNodeId = null;
    this.executionLog = [];
    this.io = null;
    this.loopCounters = {};  // 루프 카운터 저장
  }

  setSocketIO(io) {
    this.io = io;
  }

  _emit(event, data) {
    if (this.io) {
      this.io.emit(event, data);
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      currentScenario: this.currentScenario?.name || null,
      currentNodeId: this.currentNodeId,
      logCount: this.executionLog.length,
    };
  }

  getLog() {
    return this.executionLog;
  }

  clearLog() {
    this.executionLog = [];
    this.loopCounters = {};  // 루프 카운터도 초기화
  }

  _log(nodeId, status, message, details = {}) {
    const logEntry = {
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

  _findStartNode(scenario) {
    const startNode = scenario.nodes.find(node => node.type === 'start');
    if (!startNode) {
      throw new Error('시작 노드를 찾을 수 없습니다.');
    }
    return startNode;
  }

  _findNextNode(scenario, nodeId, result = {}) {
    const node = scenario.nodes.find(n => n.id === nodeId);

    // 조건 노드: 결과에 따라 분기
    if (node.type === 'condition') {
      const branch = result.conditionMet ? 'yes' : 'no';
      const connection = scenario.connections.find(
        conn => conn.from === nodeId && conn.branch === branch,
      );
      return connection?.to;
    }

    // 루프 노드: 반복 여부에 따라 분기
    if (node.type === 'loop') {
      const branch = result.shouldLoop ? 'loop' : 'exit';
      const connection = scenario.connections.find(
        conn => conn.from === nodeId && conn.branch === branch,
      );
      return connection?.to;
    }

    // 일반 노드
    const connection = scenario.connections.find(conn => conn.from === nodeId);
    return connection?.to;
  }

  async run(scenario) {
    if (this.isRunning) {
      throw new Error('이미 실행 중인 시나리오가 있습니다.');
    }

    this.shouldStop = false;
    actions.reset();  // 추가!
    
    this.isRunning = true;
    this.currentScenario = scenario;
    this.executionLog = [];
    this.loopCounters = {};  // 루프 카운터 초기화

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
    } catch (error) {
      const duration = Date.now() - startTime;

      this._log(this.currentNodeId, 'error', error.message);

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

  async _executeFromNode(scenario, nodeId) {
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

    let result = {};

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

  async _executeAction(node) {
    const { actionType, ...params } = node.params || {};

    if (!actionType) {
      this._log(node.id, 'error', '액션 타입이 지정되지 않음');
      return { success: false };
    }

    this._log(node.id, 'start', `액션 실행: ${actionType}`);

    try {
      let result;

      switch (actionType) {
      case 'tap':
        result = await actions.tap(params.x, params.y, { retryCount: 2 });
        break;
      case 'tapElement':
        result = await actions.tapElement(params.selector, params.strategy, { retryCount: 3 });
        break;
      case 'longPress':
        result = await actions.longPress(params.x, params.y, params.duration);
        break;
      case 'swipe':
        result = await actions.swipe(params.startX, params.startY, params.endX, params.endY, params.duration);
        break;
      case 'wait':
        result = await actions.wait(params.duration);
        break;
      case 'waitUntilGone':
        result = await actions.waitUntilGone(params.selector, params.strategy, params.timeout, params.interval);
        break;
      case 'waitUntilExists':
        result = await actions.waitUntilExists(params.selector, params.strategy, params.timeout, params.interval);
        break;
      case 'waitUntilTextGone':
        result = await actions.waitUntilTextGone(params.text, params.timeout, params.interval);
        break;
      case 'waitUntilTextExists':
        result = await actions.waitUntilTextExists(params.text, params.timeout, params.interval);
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
        result = await actions.clearAppData(params.appPackage);
        break;
      case 'clearCache':
        result = await actions.clearAppCache(params.appPackage);
        break;
      default:
        throw new Error(`알 수 없는 액션: ${actionType}`);
      }

      this._log(node.id, 'success', `액션 완료: ${actionType}`, result);
      return { success: true, ...result };

    } catch (error) {
      // 에러 상세 정보 로깅
      const errorInfo = {
        message: error.message,
        actionType,
        params,
      };

      this._log(node.id, 'error', `액션 실패: ${error.message}`, errorInfo);

      // 치명적이지 않은 에러는 계속 진행 옵션
      if (params.continueOnError) {
        this._log(node.id, 'warn', '에러 무시하고 계속 진행');
        return { success: false, error: error.message, continued: true };
      }

      throw error;
    }
  }
  async _executeCondition(node) {
    const { conditionType, ...params } = node.params || {};

    if (!conditionType) {
      this._log(node.id, 'error', '조건 타입이 지정되지 않음');
      return { conditionMet: false };
    }

    this._log(node.id, 'start', `조건 검사: ${conditionType}`);

    try {
      let result;
      let conditionMet = false;

      switch (conditionType) {
      case 'elementExists':
        result = await actions.elementExists(params.selector, params.strategy, params.timeout);
        conditionMet = result.exists;
        break;
      case 'elementNotExists':
        result = await actions.elementExists(params.selector, params.strategy, params.timeout);
        conditionMet = !result.exists;
        break;
      case 'textContains':
        result = await actions.elementTextContains(params.selector, params.text, params.strategy, params.timeout);
        conditionMet = result.contains;
        break;
      case 'screenContainsText':
        result = await actions.screenContainsText(params.text, params.timeout);
        conditionMet = result.contains;
        break;
      case 'waitUntilGone':
        result = await actions.waitUntilGone(params.selector, params.strategy, params.timeout, params.interval);
        break;
      case 'waitUntilExists':
        result = await actions.waitUntilExists(params.selector, params.strategy, params.timeout, params.interval);
        break;
      case 'waitUntilTextGone':
        result = await actions.waitUntilTextGone(params.text, params.timeout, params.interval);
        break;
      case 'waitUntilTextExists':
        result = await actions.waitUntilTextExists(params.text, params.timeout, params.interval);
        break;

      default:
        throw new Error(`알 수 없는 조건: ${conditionType}`);
      }

      this._log(node.id, 'success', `조건 결과: ${conditionMet ? 'Yes' : 'No'}`);
      return { conditionMet };
    } catch (error) {
      this._log(node.id, 'error', `조건 검사 실패: ${error.message}`);
      return { conditionMet: false };
    }
  }

  async _executeLoop(node) {
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
      shouldLoop = this.loopCounters[node.id] <= count;
      this._log(node.id, 'success', `루프 ${this.loopCounters[node.id]}/${count} (${shouldLoop ? '계속' : '종료'})`);
      break;

    case 'whileExists':
      // 요소가 존재하는 동안 반복
      const existsResult = await actions.elementExists(selector, strategy, timeout || 3000);
      shouldLoop = existsResult.exists;
      this.loopCounters[node.id]++;
      this._log(node.id, 'success', `루프 ${this.loopCounters[node.id]}회 - 요소 ${shouldLoop ? '존재' : '없음'}`);
      break;

    case 'whileNotExists':
      // 요소가 없는 동안 반복
      const notExistsResult = await actions.elementExists(selector, strategy, timeout || 3000);
      shouldLoop = !notExistsResult.exists;
      this.loopCounters[node.id]++;
      this._log(node.id, 'success', `루프 ${this.loopCounters[node.id]}회 - 요소 ${notExistsResult.exists ? '존재' : '없음'}`);
      break;

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

  stop() {
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

module.exports = new ScenarioExecutor();
