// backend/src/services/executor.js

const actions = require('../appium/actions');
const appiumDriver = require('../appium/driver');
const reportService = require('./report');  // 추가!

class ScenarioExecutor {
  constructor() {
    this.isRunning = false;
    this.currentScenario = null;
    this.currentNodeId = null;
    this.executionLog = [];
    this.io = null;
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

  _findNextNode(scenario, currentNodeId) {
    const connection = scenario.connections.find(conn => conn.from === currentNodeId);
    if (!connection) {
      return null;
    }
    
    const nextNode = scenario.nodes.find(node => node.id === connection.to);
    return nextNode || null;
  }

  async _executeNode(node) {
    this.currentNodeId = node.id;
    
    switch (node.type) {
      case 'start':
        this._log(node.id, 'success', '시나리오 시작');
        return { success: true };

      case 'end':
        this._log(node.id, 'success', '시나리오 종료');
        return { success: true };

      case 'action':
        return await this._executeAction(node);

      case 'condition':
        return await this._executeCondition(node);

      case 'loop':
        return await this._executeLoop(node);

      default:
        this._log(node.id, 'skip', `알 수 없는 노드 타입: ${node.type}`);
        return { success: true };
    }
  }

  async _executeAction(node) {
    const params = node.params || {};
    const actionType = params.actionType;

    this._log(node.id, 'start', `액션 실행: ${actionType}`, { params });

    try {
      let result;

      switch (actionType) {
        case 'tap':
          result = await actions.tap(params.x, params.y);
          break;

        case 'longPress':
          result = await actions.longPress(params.x, params.y, params.duration);
          break;

        case 'inputText':
          result = await actions.inputText(params.selector, params.text, params.strategy);
          break;

        case 'click':
          result = await actions.clickElement(params.selector, params.strategy);
          break;

        case 'wait':
          result = await actions.wait(params.duration);
          break;

        case 'back':
          result = await actions.pressBack();
          break;

        case 'home':
          result = await actions.pressHome();
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
          throw new Error(`알 수 없는 액션 타입: ${actionType}`);
      }

      this._log(node.id, 'success', `액션 완료: ${actionType}`, { result });
      return { success: true, result };

    } catch (error) {
      this._log(node.id, 'error', `액션 실패: ${actionType}`, { error: error.message });
      throw error;
    }
  }

  async _executeCondition(node) {
    this._log(node.id, 'skip', '조건 노드 (미구현)');
    return { success: true, condition: true };
  }

  async _executeLoop(node) {
    this._log(node.id, 'skip', '루프 노드 (미구현)');
    return { success: true };
  }

  async run(scenario) {
    if (this.isRunning) {
      throw new Error('이미 시나리오가 실행 중입니다.');
    }

    const status = appiumDriver.getStatus();
    if (!status.connected) {
      throw new Error('디바이스가 연결되어 있지 않습니다.');
    }

    this.isRunning = true;
    this.currentScenario = scenario;
    this.clearLog();

    console.log('========================================');
    console.log(`🎮 시나리오 실행 시작: ${scenario.name}`);
    console.log('========================================');

    this._emit('scenario:start', {
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      totalNodes: scenario.nodes.length,
    });

    let result;

    try {
      let currentNode = this._findStartNode(scenario);
      
      while (currentNode) {
        await this._executeNode(currentNode);

        if (currentNode.type === 'end') {
          break;
        }

        currentNode = this._findNextNode(scenario, currentNode.id);
      }

      console.log('========================================');
      console.log(`✅ 시나리오 실행 완료: ${scenario.name}`);
      console.log('========================================');

      result = {
        success: true,
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        totalNodes: this.executionLog.length,
        log: this.executionLog,
      };

      this._emit('scenario:complete', result);

    } catch (error) {
      console.error('========================================');
      console.error(`❌ 시나리오 실행 실패: ${error.message}`);
      console.error('========================================');

      result = {
        success: false,
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        error: error.message,
        log: this.executionLog,
      };

      this._emit('scenario:error', result);

    } finally {
      this.isRunning = false;
      this.currentScenario = null;
      this.currentNodeId = null;
    }

    // 리포트 저장
    try {
      const report = await reportService.create(result);
      result.reportId = report.id;
      console.log(`📊 리포트 저장됨: ID ${report.id}`);
    } catch (err) {
      console.error('리포트 저장 실패:', err.message);
    }

    return result;
  }

  stop() {
    if (!this.isRunning) {
      return { success: false, message: '실행 중인 시나리오가 없습니다.' };
    }

    this.isRunning = false;
    this._log(this.currentNodeId, 'stop', '사용자에 의해 중지됨');
    
    this._emit('scenario:stop', {
      scenarioId: this.currentScenario?.id,
      message: '시나리오 실행이 중지되었습니다.',
    });

    return { success: true, message: '시나리오 실행이 중지되었습니다.' };
  }
}

module.exports = new ScenarioExecutor();