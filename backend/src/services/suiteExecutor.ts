// backend/src/services/suiteExecutor.ts
// Test Suite 실행 엔진
// - 각 디바이스에서 시나리오를 순차 실행
// - 디바이스 간 병렬 실행

import { Server as SocketIOServer } from 'socket.io';
import {
  TestSuite,
  SuiteExecutionResult,
  DeviceSuiteResult,
  ScenarioSuiteResult,
  StepSuiteResult,
  SuiteProgress,
  SuiteExecutionStats,
  ScreenshotInfo,
} from '../types';
import suiteService from './suiteService';
import scenarioService from './scenario';
import { sessionManager } from './sessionManager';
import { deviceManager } from './deviceManager';
import { testReportService } from './testReportService';
import { Actions } from '../appium/actions';
import suiteReportService from './suiteReportService';
import packageService from './package';
import { imageMatchEmitter } from './screenshotEventService';
import { screenRecorder } from './videoAnalyzer';

/**
 * Suite 실행 상태
 */
interface SuiteExecutionState {
  suiteId: string;
  suite: TestSuite;
  stopRequested: boolean;
  deviceProgress: Map<string, {
    currentScenarioIndex: number;
    status: 'running' | 'completed' | 'failed' | 'stopped';
  }>;
  startedAt: Date;
}

/**
 * Suite Executor 클래스
 */
class SuiteExecutor {
  private io: SocketIOServer | null = null;
  private activeExecutions: Map<string, SuiteExecutionState> = new Map();

  /**
   * Socket.IO 설정
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
   * Suite 실행 상태 조회
   */
  getStatus(): { isRunning: boolean; activeSuites: string[] } {
    const activeSuites = Array.from(this.activeExecutions.keys());
    return {
      isRunning: activeSuites.length > 0,
      activeSuites,
    };
  }

  /**
   * Suite 실행
   */
  async executeSuite(suiteId: string): Promise<SuiteExecutionResult> {
    const suite = await suiteService.getSuiteById(suiteId);
    if (!suite) {
      throw new Error(`Suite not found: ${suiteId}`);
    }

    // 실행 상태 초기화
    const state: SuiteExecutionState = {
      suiteId,
      suite,
      stopRequested: false,
      deviceProgress: new Map(),
      startedAt: new Date(),
    };
    this.activeExecutions.set(suiteId, state);

    // 시작 이벤트
    this._emit('suite:start', {
      suiteId,
      suiteName: suite.name,
      deviceIds: suite.deviceIds,
      scenarioIds: suite.scenarioIds,
    });

    console.log(`[SuiteExecutor] Starting suite: ${suite.name} (${suiteId})`);
    console.log(`[SuiteExecutor] Devices: ${suite.deviceIds.join(', ')}`);
    console.log(`[SuiteExecutor] Scenarios: ${suite.scenarioIds.join(', ')}`);

    try {
      // 디바이스별 병렬 실행
      const deviceResultPromises = suite.deviceIds.map(deviceId =>
        this._executeOnDevice(state, deviceId)
      );

      const deviceResults = await Promise.allSettled(deviceResultPromises);

      // 결과 수집
      const completedResults: DeviceSuiteResult[] = [];
      for (const result of deviceResults) {
        if (result.status === 'fulfilled' && result.value) {
          completedResults.push(result.value);
        }
      }

      // 통계 계산
      const stats = this._calculateStats(suite, completedResults);

      // 최종 결과
      const executionResult: SuiteExecutionResult = {
        id: `suite_result_${Date.now()}`,
        suiteId,
        suiteName: suite.name,
        startedAt: state.startedAt.toISOString(),
        completedAt: new Date().toISOString(),
        totalDuration: Date.now() - state.startedAt.getTime(),
        deviceResults: completedResults,
        stats,
      };

      // 리포트 저장
      await suiteReportService.saveReport(executionResult);

      // 완료/중단 이벤트
      if (state.stopRequested) {
        this._emit('suite:stopped', {
          suiteId,
          result: executionResult,
        });
        console.log(`[SuiteExecutor] Suite stopped: ${suite.name}`);
      } else {
        this._emit('suite:complete', {
          suiteId,
          result: executionResult,
        });
        console.log(`[SuiteExecutor] Suite completed: ${suite.name}`);
      }
      console.log(`[SuiteExecutor] Stats: ${stats.passed}/${stats.totalExecutions} passed`);

      return executionResult;

    } finally {
      this.activeExecutions.delete(suiteId);
    }
  }

  /**
   * 단일 디바이스에서 Suite 실행
   */
  private async _executeOnDevice(
    state: SuiteExecutionState,
    deviceId: string
  ): Promise<DeviceSuiteResult | null> {
    const { suite, suiteId } = state;

    // 디바이스 정보 조회
    const deviceInfo = await deviceManager.getDeviceDetails(deviceId);
    // DeviceInfo에 alias가 없으므로 캐스팅 사용
    const deviceName = (deviceInfo as { alias?: string } | null)?.alias || deviceInfo?.model || deviceId;

    // 진행 상태 초기화
    state.deviceProgress.set(deviceId, {
      currentScenarioIndex: 0,
      status: 'running',
    });

    // 디바이스 시작 이벤트
    this._emit('suite:device:start', {
      suiteId,
      deviceId,
      deviceName,
    });

    console.log(`[SuiteExecutor] Device ${deviceName} starting suite execution`);

    const deviceStartedAt = new Date();
    const scenarioResults: ScenarioSuiteResult[] = [];
    let continueExecution = true;

    // 시나리오 순차 실행
    for (let i = 0; i < suite.scenarioIds.length && continueExecution; i++) {
      if (state.stopRequested) {
        console.log(`[SuiteExecutor] Stop requested for device ${deviceName}`);
        break;
      }

      const scenarioId = suite.scenarioIds[i];
      const progress = state.deviceProgress.get(deviceId)!;
      progress.currentScenarioIndex = i;

      // 진행률 이벤트
      this._emitProgress(state, deviceId, deviceName, i);

      // 시나리오 실행
      const scenarioResult = await this._executeScenario(
        state,
        deviceId,
        deviceName,
        scenarioId,
        i
      );

      scenarioResults.push(scenarioResult);

      // 실패 시 다음 시나리오 스킵 (옵션)
      if (scenarioResult.status === 'failed') {
        // 현재는 실패해도 계속 진행
        // continueExecution = false;
      }
    }

    // 남은 시나리오 스킵 처리
    if (state.stopRequested) {
      for (let i = scenarioResults.length; i < suite.scenarioIds.length; i++) {
        const scenarioId = suite.scenarioIds[i];
        const scenario = await scenarioService.getById(scenarioId);
        scenarioResults.push({
          scenarioId,
          scenarioName: scenario?.name || scenarioId,
          status: 'skipped',
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          duration: 0,
          stepResults: [],
          screenshots: [],
        });
      }
    }

    // 디바이스 결과
    const deviceResult: DeviceSuiteResult = {
      deviceId,
      deviceName,
      startedAt: deviceStartedAt.toISOString(),
      completedAt: new Date().toISOString(),
      duration: Date.now() - deviceStartedAt.getTime(),
      scenarioResults,
      stats: {
        total: scenarioResults.length,
        passed: scenarioResults.filter(r => r.status === 'passed').length,
        failed: scenarioResults.filter(r => r.status === 'failed').length,
        skipped: scenarioResults.filter(r => r.status === 'skipped').length,
      },
    };

    // 디바이스 완료 이벤트
    this._emit('suite:device:complete', {
      suiteId,
      deviceId,
      result: deviceResult,
    });

    console.log(`[SuiteExecutor] Device ${deviceName} completed: ${deviceResult.stats.passed}/${deviceResult.stats.total} passed`);

    return deviceResult;
  }

  /**
   * 단일 시나리오 실행
   */
  private async _executeScenario(
    state: SuiteExecutionState,
    deviceId: string,
    deviceName: string,
    scenarioId: string,
    scenarioIndex: number
  ): Promise<ScenarioSuiteResult> {
    const { suiteId } = state;
    const scenario = await scenarioService.getById(scenarioId);

    if (!scenario) {
      return {
        scenarioId,
        scenarioName: scenarioId,
        status: 'failed',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        duration: 0,
        error: `Scenario not found: ${scenarioId}`,
        stepResults: [],
        screenshots: [],
      };
    }

    // 시나리오 시작 이벤트
    this._emit('suite:scenario:start', {
      suiteId,
      deviceId,
      scenarioId,
      scenarioName: scenario.name,
    });

    console.log(`[SuiteExecutor] [${deviceName}] Starting scenario: ${scenario.name}`);

    const startedAt = new Date();
    const stepResults: StepSuiteResult[] = [];
    const screenshots: ScreenshotInfo[] = [];
    let scenarioStatus: 'passed' | 'failed' = 'passed';
    let scenarioError: string | undefined;
    let videoPath: string | undefined;
    let recordingStarted = false;

    // 스크린샷 저장 이벤트 핸들러 (try 블록 밖에서 정의하여 finally에서 접근 가능)
    const handleScreenshotSaved = (data: {
      deviceId: string;
      nodeId: string;
      templateId: string;
      confidence: number;
      path: string;
      timestamp: string;
      type: 'highlight';
    }) => {
      // 현재 디바이스의 스크린샷만 수집
      if (data.deviceId === deviceId) {
        screenshots.push({
          nodeId: data.nodeId,
          timestamp: data.timestamp,
          path: data.path,
          type: data.type,
          templateId: data.templateId,
          confidence: data.confidence,
        });
        console.log(`[SuiteExecutor] [${deviceName}] Screenshot saved: ${data.path}`);
      }
    };

    try {
      // 세션 확인
      const session = sessionManager.getSessionInfo(deviceId);
      if (!session) {
        throw new Error(`No active session for device: ${deviceId}`);
      }

      const actions = sessionManager.getActions(deviceId);
      if (!actions) {
        throw new Error(`No actions available for device: ${deviceId}`);
      }

      // 패키지에서 앱 패키지명 조회
      let appPackageName: string | undefined;
      if (scenario.packageId) {
        try {
          const pkg = await packageService.getById(scenario.packageId);
          appPackageName = pkg.packageName;
          console.log(`[SuiteExecutor] [${deviceName}] App package: ${appPackageName}`);
        } catch (err) {
          console.warn(`[SuiteExecutor] [${deviceName}] Failed to get package info:`, err);
        }
      }

      // 비디오 녹화 시작 (Device App 사용, 자동 방향 감지)
      try {
        const recordResult = await screenRecorder.startRecording(deviceId, {
          useDeviceApp: true,
          autoOrientation: true,  // 가로/세로 앱 자동 대응
        });
        if (recordResult.success) {
          recordingStarted = true;
          console.log(`[SuiteExecutor] [${deviceName}] Video recording started`);
        } else {
          console.warn(`[SuiteExecutor] [${deviceName}] Failed to start video recording: ${recordResult.error}`);
        }
      } catch (err) {
        console.warn(`[SuiteExecutor] [${deviceName}] Video recording not available:`, err);
      }

      // 스크린샷 저장을 위한 컨텍스트 등록
      const screenshotReportId = `suite_${suiteId}_${scenarioId}`;
      imageMatchEmitter.registerContext(deviceId, screenshotReportId);

      // 이벤트 리스너 등록
      imageMatchEmitter.onScreenshotSaved(handleScreenshotSaved);

      // 노드 실행
      const nodes = scenario.nodes || [];
      const connections = scenario.connections || [];
      const startNode = nodes.find(n => n.type === 'start');

      console.log(`[SuiteExecutor] [${deviceName}] Nodes count: ${nodes.length}`);
      console.log(`[SuiteExecutor] [${deviceName}] Connections count: ${connections.length}`);
      console.log(`[SuiteExecutor] [${deviceName}] Start node: ${startNode?.id || 'NOT FOUND'}`);

      if (startNode) {
        const firstConnection = connections.find(c => c.from === startNode.id);
        console.log(`[SuiteExecutor] [${deviceName}] First connection from start: ${firstConnection?.to || 'NOT FOUND'}`);

        await this._executeNodes(
          state,
          deviceId,
          deviceName,
          scenarioId,
          scenario.name,
          actions,
          nodes,
          connections,
          startNode.id,
          stepResults,
          screenshots,
          appPackageName
        );

        console.log(`[SuiteExecutor] [${deviceName}] Steps executed: ${stepResults.length}`);
      } else {
        console.warn(`[SuiteExecutor] [${deviceName}] No start node found in scenario!`);
      }

      // 실패한 스텝이 있으면 시나리오도 실패
      if (stepResults.some(s => s.status === 'failed')) {
        scenarioStatus = 'failed';
        const failedStep = stepResults.find(s => s.status === 'failed');
        scenarioError = failedStep?.error;
      }

    } catch (err) {
      scenarioStatus = 'failed';
      scenarioError = err instanceof Error ? err.message : String(err);
      console.error(`[SuiteExecutor] [${deviceName}] Scenario error:`, scenarioError);
    } finally {
      // 스크린샷 이벤트 리스너 해제
      imageMatchEmitter.offScreenshotSaved(handleScreenshotSaved);
      // 스크린샷 컨텍스트 해제
      imageMatchEmitter.unregisterContext(deviceId);

      // 비디오 녹화 중지 (녹화가 시작된 경우에만)
      if (recordingStarted) {
        try {
          const stopResult = await screenRecorder.stopRecording(deviceId);
          if (stopResult.success && stopResult.localPath) {
            videoPath = stopResult.localPath;
            console.log(`[SuiteExecutor] [${deviceName}] Video saved: ${videoPath}`);
          } else if (stopResult.error) {
            console.warn(`[SuiteExecutor] [${deviceName}] Failed to stop video recording: ${stopResult.error}`);
          }
        } catch (err) {
          console.warn(`[SuiteExecutor] [${deviceName}] Error stopping video recording:`, err);
        }
      }
    }

    const result: ScenarioSuiteResult = {
      scenarioId,
      scenarioName: scenario.name,
      status: scenarioStatus,
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      duration: Date.now() - startedAt.getTime(),
      error: scenarioError,
      stepResults,
      videoPath,
      screenshots,
    };

    // 시나리오 완료 이벤트
    this._emit('suite:scenario:complete', {
      suiteId,
      deviceId,
      scenarioId,
      result,
    });

    console.log(`[SuiteExecutor] [${deviceName}] Scenario ${scenario.name}: ${scenarioStatus}`);

    return result;
  }

  /**
   * 노드 실행 (재귀)
   */
  private async _executeNodes(
    state: SuiteExecutionState,
    deviceId: string,
    deviceName: string,
    scenarioId: string,
    scenarioName: string,
    actions: Actions,
    nodes: any[],
    connections: Array<{ from: string; to: string; branch?: string }>,
    currentNodeId: string,
    stepResults: StepSuiteResult[],
    screenshots: ScreenshotInfo[],
    appPackageName?: string,
    visited: Set<string> = new Set()
  ): Promise<void> {
    if (state.stopRequested) return;
    if (visited.has(currentNodeId)) return;
    visited.add(currentNodeId);

    const node = nodes.find(n => n.id === currentNodeId);
    if (!node) return;

    // start/end 노드는 스킵
    if (node.type === 'start') {
      const nextNodeId = this._getNextNodeId(connections, currentNodeId);
      if (nextNodeId) {
        await this._executeNodes(state, deviceId, deviceName, scenarioId, scenarioName, actions, nodes, connections, nextNodeId, stepResults, screenshots, appPackageName, visited);
      }
      return;
    }

    if (node.type === 'end') {
      return;
    }

    // 액션 노드 실행
    const stepStartedAt = new Date();
    let stepStatus: 'passed' | 'failed' = 'passed';
    let stepError: string | undefined;

    // 대기 액션 목록
    const waitActions = [
      'waitUntilExists', 'waitUntilGone',
      'waitUntilTextExists', 'waitUntilTextGone',
      'waitUntilImage', 'waitUntilImageGone',
    ];

    // 대기 액션인지 확인
    const actionType = node.params?.actionType;
    const isWaitAction = node.type === 'action' && actionType && waitActions.includes(actionType);

    // 스텝 시작 이벤트
    this._emit('suite:step:start', {
      suiteId: state.suiteId,
      deviceId,
      scenarioId,
      nodeId: node.id,
      nodeName: node.label || node.params?.actionType || node.type,
      actionType: actionType || node.type,
    });

    // 대기 액션인 경우: waiting 상태 먼저 기록
    if (isWaitAction) {
      const waitingResult: StepSuiteResult = {
        nodeId: node.id,
        nodeName: node.label || actionType || node.type,
        actionType: actionType || node.type,
        status: 'waiting',
        duration: 0,
        timestamp: stepStartedAt.toISOString(),
      };
      stepResults.push(waitingResult);

      // waiting 이벤트 emit
      this._emit('suite:step:waiting', {
        suiteId: state.suiteId,
        deviceId,
        scenarioId,
        nodeId: node.id,
        nodeName: node.label || actionType || node.type,
        actionType: actionType || node.type,
        status: 'waiting',
      });

      console.log(`[SuiteExecutor] [${deviceName}] Step ${node.label || actionType || node.type}: waiting`);
    }

    try {
      const result = await this._executeAction(actions, node, deviceId, appPackageName);

      if (!result.success) {
        stepStatus = 'failed';
        stepError = result.message || 'Action failed';

        // 실패 스크린샷
        try {
          const screenshot = await testReportService.captureScreenshot(
            `suite_${state.suiteId}`,
            deviceId,
            node.id,
            'failed'
          );
          if (screenshot) {
            screenshots.push(screenshot);
          }
        } catch {
          // Ignore screenshot errors
        }
      }

    } catch (err) {
      stepStatus = 'failed';
      stepError = err instanceof Error ? err.message : String(err);
    }

    // 스텝 결과 저장
    const stepResult: StepSuiteResult = {
      nodeId: node.id,
      nodeName: node.label || node.params?.actionType || node.type,
      actionType: node.params?.actionType || node.type,
      status: stepStatus,
      duration: Date.now() - stepStartedAt.getTime(),
      error: stepError,
      timestamp: stepStartedAt.toISOString(),
    };
    stepResults.push(stepResult);

    // 스텝 완료 이벤트
    this._emit('suite:step:complete', {
      suiteId: state.suiteId,
      deviceId,
      scenarioId,
      nodeId: node.id,
      result: stepResult,
    });

    console.log(`[SuiteExecutor] [${deviceName}] Step ${node.label || node.params?.actionType || node.type}: ${stepStatus}`);

    // 실패 시 중단
    if (stepStatus === 'failed') {
      return;
    }

    // 다음 노드로 이동
    if (node.type === 'condition') {
      // 조건 노드: 결과에 따라 분기
      // TODO: 조건 평가 로직 추가
      const nextNodeId = this._getNextNodeId(connections, currentNodeId, 'yes');
      if (nextNodeId) {
        await this._executeNodes(state, deviceId, deviceName, scenarioId, scenarioName, actions, nodes, connections, nextNodeId, stepResults, screenshots, appPackageName, visited);
      }
    } else {
      const nextNodeId = this._getNextNodeId(connections, currentNodeId);
      if (nextNodeId) {
        await this._executeNodes(state, deviceId, deviceName, scenarioId, scenarioName, actions, nodes, connections, nextNodeId, stepResults, screenshots, appPackageName, visited);
      }
    }
  }

  /**
   * 다음 노드 ID 찾기
   * connections 배열에서 from이 currentNodeId인 연결을 찾아 to를 반환
   */
  private _getNextNodeId(
    connections: Array<{ from: string; to: string; branch?: string }>,
    currentNodeId: string,
    branch?: string
  ): string | null {
    // branch가 지정된 경우 해당 branch 연결 찾기
    if (branch) {
      const branchConnection = connections.find(
        c => c.from === currentNodeId && c.branch === branch
      );
      if (branchConnection) {
        return branchConnection.to;
      }
    }

    // 기본 연결 찾기 (첫 번째 매칭)
    const defaultConnection = connections.find(c => c.from === currentNodeId);
    return defaultConnection?.to || null;
  }

  /**
   * 액션 실행
   * NOTE: Actions 클래스에 일부 메서드가 누락되어 있어 any 캐스트 사용
   */
  private async _executeAction(
    actions: Actions,
    node: any,
    _deviceId: string,
    appPackageName?: string
  ): Promise<{ success: boolean; message?: string }> {
    // 노드 데이터는 node.params에 저장됨 (node.data가 아님)
    const params = node.params || node.data || {};
    const actionType = params.actionType || node.type;

    // 패키지명은 params에 명시적으로 있으면 사용, 없으면 시나리오 패키지에서 가져옴
    const packageName = params.packageName || appPackageName;

    // Actions 클래스에 일부 메서드가 정의되지 않아 any 캐스트 필요
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const act = actions as any;

    try {
      let result: any;

      switch (actionType) {
        case 'tap':
          result = await actions.tap(params.x, params.y);
          break;
        case 'doubleTap':
          result = await act.doubleTap(params.x, params.y);
          break;
        case 'longPress':
          result = await actions.longPress(params.x, params.y, params.duration || 1000);
          break;
        case 'swipe':
          result = await act.swipe(params.startX, params.startY, params.endX, params.endY, params.duration || 300);
          break;
        case 'inputText':
          result = await act.inputText(params.text);
          break;
        case 'pressKey':
          result = await act.pressKey(params.keycode);
          break;
        case 'wait':
          result = await actions.wait(params.duration || 1000);
          break;
        case 'launchApp':
          result = await actions.launchApp(packageName);
          break;
        case 'terminateApp':
          result = await actions.terminateApp(packageName);
          break;
        case 'clearAppData':
        case 'clearData':  // alias
          result = await actions.clearAppData(packageName);
          break;
        case 'waitUntilExists':
          result = await act.waitUntilExists(params.selector, params.selectorType || 'text', params.timeout || 30000);
          break;
        case 'waitUntilGone':
          result = await act.waitUntilGone(params.selector, params.selectorType || 'text', params.timeout || 30000);
          break;
        case 'tapImage':
          result = await actions.tapImage(params.templateId, {
            threshold: params.threshold || 0.8,
            region: params.region,
            nodeId: node.id,
          });
          break;
        case 'waitUntilImage':
          result = await actions.waitUntilImage(params.templateId, params.timeout || 30000, 1000, {
            threshold: params.threshold || 0.8,
            region: params.region,
            tapAfterWait: params.tapAfterWait || false,
            nodeId: node.id,
          });
          break;
        case 'waitUntilImageGone':
          result = await actions.waitUntilImageGone(params.templateId, params.timeout || 30000, 1000, {
            threshold: params.threshold || 0.8,
            region: params.region,
          });
          break;
        case 'tapTextOcr':
          result = await actions.tapTextOcr(params.text, {
            matchType: params.matchType || 'contains',
            caseSensitive: params.caseSensitive || false,
            region: params.region,
            nodeId: node.id,
          });
          break;
        case 'waitUntilTextExists':
          result = await actions.waitUntilTextExists(params.text, params.timeout || 30000, 500, {
            tapAfterWait: params.tapAfterWait || false,
          });
          break;
        case 'waitUntilTextGone':
          result = await actions.waitUntilTextGone(params.text, params.timeout || 30000);
          break;
        case 'waitUntilTextOcr':
          result = await actions.waitUntilTextOcr(params.text, params.timeout || 30000, 1000, {
            matchType: params.matchType || 'contains',
            caseSensitive: params.caseSensitive || false,
            region: params.region,
            tapAfterWait: params.tapAfterWait || false,
            nodeId: node.id,
          });
          break;
        case 'waitUntilTextGoneOcr':
          result = await actions.waitUntilTextGoneOcr(params.text, params.timeout || 30000, 1000, {
            matchType: params.matchType || 'contains',
            caseSensitive: params.caseSensitive || false,
            region: params.region,
          });
          break;
        default:
          return { success: false, message: `Unknown action type: ${actionType}` };
      }

      return {
        success: result?.success ?? true,
        message: result?.message,
      };
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * 진행률 이벤트 emit
   */
  private _emitProgress(
    state: SuiteExecutionState,
    deviceId: string,
    deviceName: string,
    scenarioIndex: number
  ): void {
    const { suite, suiteId } = state;
    const totalDevices = suite.deviceIds.length;
    const totalScenarios = suite.scenarioIds.length;

    // 완료된 디바이스 수 계산
    let completedDevices = 0;
    for (const [_, progress] of state.deviceProgress) {
      if (progress.status === 'completed') {
        completedDevices++;
      }
    }

    // 전체 진행률 계산
    const totalExecutions = totalDevices * totalScenarios;
    const completedExecutions = completedDevices * totalScenarios + scenarioIndex;
    const overallProgress = Math.round((completedExecutions / totalExecutions) * 100);

    const progress: SuiteProgress = {
      suiteId,
      suiteName: suite.name,
      currentDevice: deviceName,
      currentScenario: suite.scenarioIds[scenarioIndex] || '',
      deviceProgress: {
        current: completedDevices + 1,
        total: totalDevices,
      },
      scenarioProgress: {
        current: scenarioIndex + 1,
        total: totalScenarios,
      },
      overallProgress,
    };

    this._emit('suite:progress', progress);
  }

  /**
   * 통계 계산
   */
  private _calculateStats(suite: TestSuite, deviceResults: DeviceSuiteResult[]): SuiteExecutionStats {
    const totalScenarios = suite.scenarioIds.length;
    const totalDevices = suite.deviceIds.length;
    const totalExecutions = totalScenarios * totalDevices;

    let passed = 0;
    let failed = 0;
    let skipped = 0;

    for (const deviceResult of deviceResults) {
      passed += deviceResult.stats.passed;
      failed += deviceResult.stats.failed;
      skipped += deviceResult.stats.skipped;
    }

    return {
      totalScenarios,
      totalDevices,
      totalExecutions,
      passed,
      failed,
      skipped,
    };
  }

  /**
   * Suite 실행 중지
   */
  stopSuite(suiteId: string): boolean {
    const state = this.activeExecutions.get(suiteId);
    if (state) {
      state.stopRequested = true;
      console.log(`[SuiteExecutor] Stop requested for suite: ${suiteId}`);
      return true;
    }
    return false;
  }

  /**
   * 모든 Suite 실행 중지
   */
  stopAll(): void {
    for (const [suiteId, state] of this.activeExecutions) {
      state.stopRequested = true;
      console.log(`[SuiteExecutor] Stop requested for suite: ${suiteId}`);
    }
  }
}

export const suiteExecutor = new SuiteExecutor();
export default suiteExecutor;
