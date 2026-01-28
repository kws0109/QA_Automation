// backend/src/services/execution/ScenarioExecutionEngine.ts
// 시나리오 실행 엔진 - 실제 테스트 실행 로직

import type {
  ScenarioQueueItem,
  StepResult,
  ExecutionNode,
  ActionResult,
} from '../../types';
import type { ExecutionState, DeviceProgress, ScenarioExecutionResult } from './types';
import type { DeviceEnvironment, AppInfo } from '../../types/reportEnhanced';
import { sessionManager } from '../sessionManager';
import { eventEmitter } from '../../events';
import scenarioService from '../scenario';
import { environmentCollector } from '../environmentCollector';
import { failureAnalyzer } from '../failureAnalyzer';
import { screenRecorder } from '../videoAnalyzer';
import { testReportService } from '../testReportService';
import { Actions } from '../../appium/actions';
import { createLogger } from '../../utils/logger';

const logger = createLogger('ScenarioExecutionEngine');

/**
 * 시나리오 실행 엔진
 * 디바이스별 시나리오 실행 로직을 담당합니다.
 */
export class ScenarioExecutionEngine {
  /**
   * 이벤트 emit
   */
  private _emit(event: string, data: unknown): void {
    eventEmitter.emit(event, data);
  }

  /**
   * 지연 대기
   */
  private _delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 디바이스 표시 이름 조회
   */
  private _getDeviceName(state: ExecutionState, deviceId: string): string {
    return state.deviceNames.get(deviceId) || deviceId;
  }

  /**
   * 단일 디바이스의 시나리오 세트 실행
   */
  async executeDeviceScenarios(
    state: ExecutionState,
    deviceId: string
  ): Promise<ScenarioExecutionResult[]> {
    const results: ScenarioExecutionResult[] = [];

    const progress = state.deviceProgress.get(deviceId);
    if (!progress) return results;

    // 디바이스 시작 이벤트
    this._emit('test:device:start', {
      executionId: state.executionId,
      deviceId,
      deviceName: this._getDeviceName(state, deviceId),
      totalScenarios: state.scenarioQueue.length,
    });

    // 환경 정보 수집
    const deviceEnv = await this.collectDeviceEnvironment(deviceId);
    if (deviceEnv) {
      state.deviceEnvironments.set(deviceId, deviceEnv);
    }

    // 앱 정보 캐시 (중복 수집 방지)
    const collectedApps = new Set<string>();

    for (let i = 0; i < state.scenarioQueue.length; i++) {
      // 중지 요청 확인
      if (state.stopRequested) {
        progress.status = 'stopped';
        logger.info(`[ScenarioExecutionEngine] [${state.executionId}] 디바이스 ${deviceId}: 중지됨`);
        break;
      }

      const queueItem = state.scenarioQueue[i];
      const scenarioKey = `${queueItem.scenarioId}-${queueItem.repeatIndex}`;

      // 진행 상태 업데이트
      progress.currentScenarioIndex = i;
      progress.currentScenarioId = queueItem.scenarioId;
      progress.currentScenarioName = queueItem.scenarioName;

      // 앱 정보 수집 (새 패키지일 때만)
      if (queueItem.appPackage && !collectedApps.has(queueItem.appPackage)) {
        const appInfo = await this.collectAppInfo(deviceId, queueItem.appPackage);
        if (appInfo) {
          let deviceAppMap = state.deviceAppInfos.get(deviceId);
          if (!deviceAppMap) {
            deviceAppMap = new Map();
            state.deviceAppInfos.set(deviceId, deviceAppMap);
          }
          deviceAppMap.set(queueItem.appPackage, appInfo);
        }
        collectedApps.add(queueItem.appPackage);
      }

      // 비디오 녹화 설정
      const ENABLE_RECORDING = true;
      let recordingStartTime = 0;
      let isRecording = false;
      let recordingMethod: 'adb' | 'deviceApp' | null = null;

      // launchApp 후 녹화 시작 콜백
      const startRecordingCallback = async (): Promise<void> => {
        if (isRecording || !ENABLE_RECORDING) return;

        try {
          const deviceAppAvailable = await screenRecorder.isDeviceAppAvailable(deviceId);
          const deviceAppServiceRunning = deviceAppAvailable
            ? await screenRecorder.isDeviceAppServiceRunning(deviceId)
            : false;

          let result;
          if (deviceAppServiceRunning) {
            result = await screenRecorder.startRecording(deviceId, {
              useDeviceApp: true,
              bitrate: 2,
            });
          } else {
            const screenInfo = await screenRecorder.getDeviceScreenInfo(deviceId);
            result = await screenRecorder.startRecording(deviceId, {
              bitrate: 2,
              resolution: `${screenInfo.width}x${screenInfo.height}`,
            });
          }

          if (result.success) {
            isRecording = true;
            recordingStartTime = Date.now();
            recordingMethod = result.method || 'adb';
            logger.info(`[ScenarioExecutionEngine] [${state.executionId}] 디바이스 ${deviceId}: 비디오 녹화 시작`);
          }
        } catch (err) {
          logger.warn(`[ScenarioExecutionEngine] 비디오 녹화 시작 실패: ${(err as Error).message}`);
        }
      };

      // 시나리오 시작 이벤트
      this._emit('test:device:scenario:start', {
        executionId: state.executionId,
        deviceId,
        deviceName: this._getDeviceName(state, deviceId),
        scenarioId: queueItem.scenarioId,
        scenarioName: queueItem.scenarioName,
        packageName: queueItem.packageName,
        appPackage: queueItem.appPackage,
        categoryName: queueItem.categoryName,
        repeatIndex: queueItem.repeatIndex,
        order: i + 1,
        total: state.scenarioQueue.length,
      });

      logger.info(`[ScenarioExecutionEngine] [${state.executionId}] 디바이스 ${deviceId}: 시나리오 [${i + 1}/${state.scenarioQueue.length}] ${queueItem.scenarioName}`);

      // 시나리오 실행
      const result = await this.executeSingleScenarioOnDevice(state, deviceId, queueItem, startRecordingCallback);
      results.push(result);

      if (result.success) {
        progress.completedScenarios++;
      } else {
        progress.failedScenarios++;
      }

      // 비디오 녹화 종료
      if (isRecording) {
        try {
          const recordingDuration = Date.now() - recordingStartTime;
          const stopResult = await screenRecorder.stopRecording(deviceId);

          if (stopResult.success && stopResult.localPath) {
            const videoInfo = await testReportService.saveVideoFromPath(
              state.reportId,
              deviceId,
              scenarioKey,
              stopResult.localPath,
              recordingDuration,
              new Date(recordingStartTime).toISOString()
            );

            if (videoInfo) {
              if (!state.deviceVideos.has(deviceId)) {
                state.deviceVideos.set(deviceId, new Map());
              }
              state.deviceVideos.get(deviceId)!.set(scenarioKey, videoInfo);
              logger.info(`[ScenarioExecutionEngine] 비디오 저장 완료: ${scenarioKey}`);
            }
          }
        } catch (err) {
          logger.warn(`[ScenarioExecutionEngine] 비디오 녹화 종료 실패: ${(err as Error).message}`);
        }
      }

      // 시나리오 완료 이벤트
      this._emit('test:device:scenario:complete', {
        executionId: state.executionId,
        deviceId,
        deviceName: this._getDeviceName(state, deviceId),
        scenarioId: queueItem.scenarioId,
        scenarioName: queueItem.scenarioName,
        repeatIndex: queueItem.repeatIndex,
        order: i + 1,
        status: result.success ? 'passed' : 'failed',
        duration: result.duration,
        error: result.error,
      });

      // 실패 시 해당 디바이스 중단
      if (!result.success) {
        progress.status = 'failed';
        logger.info(`[ScenarioExecutionEngine] [${state.executionId}] 디바이스 ${deviceId}: 시나리오 실패로 중단`);
        break;
      }

      // 시나리오 간 인터벌
      if (state.scenarioInterval > 0 && i < state.scenarioQueue.length - 1 && !state.stopRequested) {
        await this._delay(state.scenarioInterval);
      }
    }

    // 디바이스 완료 처리
    if (progress.status === 'running') {
      progress.status = 'completed';
    }

    // 디바이스 완료 이벤트
    this._emit('test:device:complete', {
      executionId: state.executionId,
      deviceId,
      deviceName: this._getDeviceName(state, deviceId),
      status: progress.status,
      completedScenarios: progress.completedScenarios,
      failedScenarios: progress.failedScenarios,
      totalScenarios: state.scenarioQueue.length,
    });

    return results;
  }

  /**
   * 단일 디바이스에서 단일 시나리오 실행
   */
  async executeSingleScenarioOnDevice(
    state: ExecutionState,
    deviceId: string,
    queueItem: ScenarioQueueItem,
    onLaunchApp?: () => Promise<void>
  ): Promise<ScenarioExecutionResult> {
    const startTime = Date.now();
    const steps: StepResult[] = [];

    try {
      // 시나리오 로드
      const scenario = await scenarioService.getById(queueItem.scenarioId);
      if (!scenario) {
        throw new Error(`시나리오를 찾을 수 없습니다: ${queueItem.scenarioId}`);
      }

      // Actions 인스턴스
      const actions = sessionManager.getActions(deviceId);
      if (!actions) {
        throw new Error(`디바이스 세션이 없습니다: ${deviceId}`);
      }

      const nodes = scenario.nodes || [];
      const connections = scenario.connections || [];

      // Start 노드 찾기
      const startNode = nodes.find(n => n.type === 'start');
      if (!startNode) {
        throw new Error('Start 노드가 없습니다.');
      }

      // 노드 실행
      let currentNodeId: string | null = startNode.id;
      const visited = new Set<string>();

      while (currentNodeId && !state.stopRequested) {
        if (visited.has(currentNodeId)) {
          logger.warn(`[ScenarioExecutionEngine] 순환 감지: ${currentNodeId}`);
          break;
        }
        visited.add(currentNodeId);

        const currentNode = nodes.find(n => n.id === currentNodeId) as ExecutionNode;
        if (!currentNode) break;

        const stepResult = await this.executeNode(
          state,
          deviceId,
          queueItem,
          currentNode,
          actions,
          steps,
          onLaunchApp
        );

        steps.push(stepResult);

        // 실패 시 중단
        if (stepResult.status === 'failed') {
          throw new Error(stepResult.error || '노드 실행 실패');
        }

        // End 노드면 종료
        if (currentNode.type === 'end') {
          break;
        }

        // 다음 노드 찾기
        currentNodeId = this._findNextNode(currentNode, connections);
      }

      const duration = Date.now() - startTime;
      return {
        scenarioId: queueItem.scenarioId,
        scenarioName: queueItem.scenarioName,
        packageId: queueItem.packageId,
        packageName: queueItem.packageName,
        appPackage: queueItem.appPackage,
        categoryId: queueItem.categoryId,
        categoryName: queueItem.categoryName,
        repeatIndex: queueItem.repeatIndex,
        success: true,
        duration,
        steps,
      };
    } catch (err) {
      const error = err as Error;
      const duration = Date.now() - startTime;

      return {
        scenarioId: queueItem.scenarioId,
        scenarioName: queueItem.scenarioName,
        packageId: queueItem.packageId,
        packageName: queueItem.packageName,
        appPackage: queueItem.appPackage,
        categoryId: queueItem.categoryId,
        categoryName: queueItem.categoryName,
        repeatIndex: queueItem.repeatIndex,
        success: false,
        duration,
        error: error.message,
        steps,
      };
    }
  }

  /**
   * 단일 노드 실행
   */
  private async executeNode(
    state: ExecutionState,
    deviceId: string,
    queueItem: ScenarioQueueItem,
    node: ExecutionNode,
    actions: Actions,
    steps: StepResult[],
    onLaunchApp?: () => Promise<void>
  ): Promise<StepResult> {
    const stepStartTime = Date.now();
    let stepStatus: 'passed' | 'failed' | 'error' = 'passed';
    let stepError: string | undefined;
    let stepFailureAnalysis: StepResult['failureAnalysis'];
    let stepPerformance: StepResult['performance'];

    // 대기 액션 확인
    const waitActions = [
      'waitUntilExists', 'waitUntilGone',
      'waitUntilTextExists', 'waitUntilTextGone',
      'waitUntilImage', 'waitUntilImageGone'
    ];
    const actionType = node.params?.actionType as string | undefined;
    const isWaitAction = node.type === 'action' && !!actionType && waitActions.includes(actionType);

    // 노드 실행 시작 이벤트
    this._emit('test:device:node', {
      executionId: state.executionId,
      deviceId,
      deviceName: this._getDeviceName(state, deviceId),
      scenarioId: queueItem.scenarioId,
      nodeId: node.id,
      nodeName: node.label || node.type,
      status: 'running',
    });

    // 대기 액션: waiting 상태 먼저 기록
    if (isWaitAction) {
      steps.push({
        nodeId: node.id,
        nodeName: node.label || node.type,
        nodeType: node.type,
        status: 'waiting',
        startTime: new Date().toISOString(),
      });

      this._emit('test:device:node', {
        executionId: state.executionId,
        deviceId,
        deviceName: this._getDeviceName(state, deviceId),
        scenarioId: queueItem.scenarioId,
        nodeId: node.id,
        nodeName: node.label || node.type,
        status: 'waiting',
      });
    }

    let actionResult: ActionResult | null = null;

    try {
      if (node.type === 'action') {
        actionResult = await this.executeActionNode(actions, node, queueItem.appPackage);

        // launchApp 후 콜백 호출
        if (actionType === 'launchApp' && onLaunchApp) {
          await this._delay(1000);
          await onLaunchApp();
        }
      } else if (node.type === 'condition') {
        const conditionResult = await this.evaluateCondition(actions, node);
        (node as ExecutionNode & { _conditionResult?: boolean })._conditionResult = conditionResult;
      }
    } catch (err) {
      const error = err as Error;
      stepStatus = 'failed';
      stepError = error.message;
      logger.error(`[ScenarioExecutionEngine] 노드 ${node.id} 실패: ${error.message}`);

      // 실패 분석
      try {
        const prevStep = steps.length > 0 ? steps[steps.length - 1] : undefined;
        stepFailureAnalysis = failureAnalyzer.analyzeFailure(error, {
          attemptedAction: actionType || node.type,
          actionParams: node.params as Record<string, unknown>,
          previousAction: prevStep?.nodeName,
          expectedState: failureAnalyzer.inferExpectedState(actionType || '', node.params as Record<string, unknown>),
        });
      } catch (analyzeErr) {
        logger.warn(`[ScenarioExecutionEngine] 실패 분석 오류: ${(analyzeErr as Error).message}`);
      }

      // 실패 시 스크린샷 캡처
      await this._captureFailedScreenshot(state, deviceId, queueItem, node.id);
    }

    const stepEndTime = Date.now();
    const stepDuration = stepEndTime - stepStartTime;

    // 성능 메트릭 계산
    if (node.type === 'action') {
      stepPerformance = this._buildStepPerformance(
        stepDuration,
        isWaitAction,
        actionResult,
        node.params as Record<string, unknown> || {}
      );
    }

    // 노드 완료 이벤트
    this._emit('test:device:node', {
      executionId: state.executionId,
      deviceId,
      deviceName: this._getDeviceName(state, deviceId),
      scenarioId: queueItem.scenarioId,
      nodeId: node.id,
      nodeName: node.label || node.type,
      status: stepStatus,
      duration: stepDuration,
      error: stepError,
    });

    return {
      nodeId: node.id,
      nodeName: node.label || node.type,
      nodeType: node.type,
      status: stepStatus,
      startTime: isWaitAction
        ? new Date(stepEndTime).toISOString()
        : new Date(stepStartTime).toISOString(),
      endTime: new Date(stepEndTime).toISOString(),
      duration: stepDuration,
      error: stepError,
      failureAnalysis: stepFailureAnalysis,
      performance: stepPerformance,
    };
  }

  /**
   * 액션 노드 실행
   */
  async executeActionNode(actions: Actions, node: ExecutionNode, appPackage: string): Promise<ActionResult | null> {
    const params = node.params || {};
    const actionType = params.actionType as string | undefined;

    let result: ActionResult | null = null;

    switch (actionType) {
      case 'tap':
        await actions.tap(params.x as number, params.y as number);
        break;
      case 'doubleTap':
        await actions.doubleTap(params.x as number, params.y as number);
        break;
      case 'longPress':
        await actions.longPress(params.x as number, params.y as number, (params.duration as number) || 1000);
        break;
      case 'swipe':
        await actions.swipe(
          params.startX as number,
          params.startY as number,
          params.endX as number,
          params.endY as number,
          (params.duration as number) || 500
        );
        break;
      case 'inputText':
        await actions.typeText(params.text as string);
        break;
      case 'clearText':
        await actions.clearText();
        break;
      case 'pressKey':
        await actions.pressKey(params.keycode as number);
        break;
      case 'wait':
        await actions.wait((params.duration as number) || 1000);
        break;
      case 'waitUntilExists':
        result = await actions.waitUntilExists(
          params.selector as string,
          params.selectorType as 'id' | 'xpath' | 'accessibility id' | 'text',
          (params.timeout as number) || 10000,
          500,
          { tapAfterWait: (params.tapAfterWait as boolean) || false }
        );
        break;
      case 'waitUntilGone':
        await actions.waitUntilGone(
          params.selector as string,
          params.selectorType as 'id' | 'xpath' | 'accessibility id' | 'text',
          (params.timeout as number) || 10000
        );
        break;
      case 'waitUntilTextExists':
        result = await actions.waitUntilTextExists(
          params.text as string,
          (params.timeout as number) || 10000,
          500,
          { tapAfterWait: (params.tapAfterWait as boolean) || false }
        );
        break;
      case 'waitUntilTextGone':
        await actions.waitUntilTextGone(params.text as string, (params.timeout as number) || 10000);
        break;
      case 'tapElement':
        await actions.tapElement(
          params.selector as string,
          params.selectorType as 'id' | 'xpath' | 'accessibility id' | 'text'
        );
        break;
      case 'tapText':
        await actions.tapText(params.text as string);
        break;
      case 'tapImage':
        result = await actions.tapImage(params.templateId as string, {
          threshold: (params.threshold as number) || 0.8,
          region: params.region as { x: number; y: number; width: number; height: number } | undefined,
          nodeId: node.id,
        });
        break;
      case 'waitUntilImage':
        result = await actions.waitUntilImage(
          params.templateId as string,
          (params.timeout as number) || 30000,
          1000,
          {
            threshold: (params.threshold as number) || 0.8,
            region: params.region as { x: number; y: number; width: number; height: number } | undefined,
            tapAfterWait: params.tapAfterWait as boolean || false,
            nodeId: node.id,
          }
        );
        break;
      case 'waitUntilImageGone':
        await actions.waitUntilImageGone(
          params.templateId as string,
          (params.timeout as number) || 30000,
          1000,
          { threshold: (params.threshold as number) || 0.8, region: params.region as { x: number; y: number; width: number; height: number } | undefined }
        );
        break;
      case 'tapTextOcr':
        result = await actions.tapTextOcr(params.text as string, {
          matchType: (params.matchType as 'exact' | 'contains' | 'regex') || 'contains',
          caseSensitive: params.caseSensitive as boolean || false,
          region: params.region as { x: number; y: number; width: number; height: number } | undefined,
          index: (params.index as number) || 0,
          offset: params.offset as { x: number; y: number } | undefined,
          retryCount: (params.retryCount as number) || 3,
          retryDelay: (params.retryDelay as number) || 1000,
          nodeId: node.id,
        });
        break;
      case 'waitUntilTextOcr':
        result = await actions.waitUntilTextOcr(
          params.text as string,
          (params.timeout as number) || 30000,
          1000,
          {
            matchType: (params.matchType as 'exact' | 'contains' | 'regex') || 'contains',
            caseSensitive: params.caseSensitive as boolean || false,
            region: params.region as { x: number; y: number; width: number; height: number } | undefined,
            tapAfterWait: params.tapAfterWait as boolean || false,
            nodeId: node.id,
          }
        );
        break;
      case 'waitUntilTextGoneOcr':
        result = await actions.waitUntilTextGoneOcr(
          params.text as string,
          (params.timeout as number) || 30000,
          1000,
          {
            matchType: (params.matchType as 'exact' | 'contains' | 'regex') || 'contains',
            caseSensitive: params.caseSensitive as boolean || false,
            region: params.region as { x: number; y: number; width: number; height: number } | undefined,
          }
        );
        break;
      case 'assertTextOcr':
        result = await actions.assertTextOcr(params.text as string, {
          matchType: (params.matchType as 'exact' | 'contains' | 'regex') || 'contains',
          caseSensitive: params.caseSensitive as boolean || false,
          region: params.region as { x: number; y: number; width: number; height: number } | undefined,
          shouldExist: (params.shouldExist as boolean) ?? true,
        });
        break;
      case 'launchApp':
        await actions.launchApp((params.packageName as string) || appPackage);
        break;
      case 'terminateApp':
        await actions.terminateApp((params.packageName as string) || appPackage);
        break;
      case 'clearData':
        await actions.clearData((params.packageName as string) || appPackage);
        break;
      case 'clearCache':
        await actions.clearCache((params.packageName as string) || appPackage);
        break;
      case 'screenshot':
        await actions.takeScreenshot();
        break;
      default:
        logger.warn(`[ScenarioExecutionEngine] 알 수 없는 액션 타입: ${actionType}`);
    }

    return result;
  }

  /**
   * 조건 노드 평가
   */
  private async evaluateCondition(actions: Actions, node: ExecutionNode): Promise<boolean> {
    const params = node.params || {};
    const conditionType = params.conditionType as string;
    const selector = params.selector as string;
    const selectorType = (params.selectorType as 'id' | 'xpath' | 'accessibility id' | 'text') || 'id';
    const text = params.text as string;

    logger.info(`🔀 [${actions.getDeviceId()}] 조건 평가: ${conditionType}`);

    try {
      switch (conditionType) {
        case 'elementExists': {
          const result = await actions.elementExists(selector, selectorType);
          return result.exists;
        }
        case 'elementNotExists': {
          const result = await actions.elementExists(selector, selectorType);
          return !result.exists;
        }
        case 'textContains': {
          const result = await actions.elementTextContains(selector, text, selectorType);
          return result.contains;
        }
        case 'screenContainsText': {
          const result = await actions.screenContainsText(text);
          return result.contains;
        }
        case 'elementEnabled': {
          const result = await actions.elementIsEnabled(selector, selectorType);
          return result.enabled === true;
        }
        case 'elementDisplayed': {
          const result = await actions.elementIsDisplayed(selector, selectorType);
          return result.displayed === true;
        }
        default:
          logger.warn(`[ScenarioExecutionEngine] 알 수 없는 조건 타입: ${conditionType}`);
          return true;
      }
    } catch (error) {
      logger.error(`[ScenarioExecutionEngine] 조건 평가 실패: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * 다음 노드 찾기
   */
  private _findNextNode(
    currentNode: ExecutionNode,
    connections: Array<{ from: string; to: string; label?: string; branch?: string }>
  ): string | null {
    if (currentNode.type === 'condition') {
      const conditionResult = (currentNode as ExecutionNode & { _conditionResult?: boolean })._conditionResult;
      const branchLabel = conditionResult ? 'yes' : 'no';

      let nextConnection = connections.find(
        c => c.from === currentNode.id && (c.label === branchLabel || c.branch === branchLabel)
      );

      if (!nextConnection) {
        nextConnection = connections.find(c => c.from === currentNode.id);
      }

      return nextConnection?.to || null;
    }

    const nextConnection = connections.find(c => c.from === currentNode.id);
    return nextConnection?.to || null;
  }

  /**
   * 성능 메트릭 빌드
   */
  private _buildStepPerformance(
    stepDuration: number,
    isWaitAction: boolean,
    actionResult: ActionResult | null,
    nodeParams: Record<string, unknown>
  ): StepResult['performance'] | undefined {
    if (stepDuration <= 0) return undefined;

    const waitTime = isWaitAction ? stepDuration : undefined;
    const actionTime = isWaitAction ? 0 : stepDuration;

    const imageMatchInfo = (actionResult?.matchTime && actionResult?.confidence !== undefined)
      ? {
          templateId: actionResult.templateId || '',
          matched: true,
          confidence: actionResult.confidence,
          threshold: (nodeParams?.threshold as number) || 0.8,
          matchTime: actionResult.matchTime,
          roiUsed: !!(nodeParams?.region),
        }
      : undefined;

    return {
      totalTime: stepDuration,
      waitTime,
      actionTime: actionTime > 0 ? actionTime : undefined,
      imageMatch: imageMatchInfo,
    };
  }

  /**
   * 실패 스크린샷 캡처
   */
  private async _captureFailedScreenshot(
    state: ExecutionState,
    deviceId: string,
    queueItem: ScenarioQueueItem,
    nodeId: string
  ): Promise<void> {
    try {
      const screenshot = await testReportService.captureScreenshot(
        state.reportId,
        deviceId,
        nodeId,
        'failed'
      );

      if (screenshot) {
        if (!state.deviceScreenshots.has(deviceId)) {
          state.deviceScreenshots.set(deviceId, new Map());
        }
        const deviceMap = state.deviceScreenshots.get(deviceId)!;
        const scenarioKey = `${queueItem.scenarioId}-${queueItem.repeatIndex}`;
        if (!deviceMap.has(scenarioKey)) {
          deviceMap.set(scenarioKey, []);
        }
        deviceMap.get(scenarioKey)!.push(screenshot);
      }
    } catch (err) {
      logger.error(`[ScenarioExecutionEngine] 실패 스크린샷 캡처 실패:`, err as Error);
    }
  }

  /**
   * 디바이스 환경 정보 수집
   */
  async collectDeviceEnvironment(deviceId: string): Promise<DeviceEnvironment | undefined> {
    try {
      const env = await environmentCollector.collectDeviceEnvironment(deviceId);
      logger.info(`[ScenarioExecutionEngine] 환경 정보 수집 완료: ${deviceId}`);
      return env;
    } catch (error) {
      logger.warn(`[ScenarioExecutionEngine] 환경 정보 수집 실패: ${(error as Error).message}`);
      return undefined;
    }
  }

  /**
   * 앱 정보 수집
   */
  async collectAppInfo(deviceId: string, packageName: string): Promise<AppInfo | undefined> {
    try {
      const driver = sessionManager.getDriver(deviceId);
      if (!driver) return undefined;

      const appInfo = await environmentCollector.collectAppInfo(driver, packageName, deviceId);
      logger.info(`[ScenarioExecutionEngine] 앱 정보 수집 완료: ${packageName}@${deviceId}`);
      return appInfo;
    } catch (error) {
      logger.warn(`[ScenarioExecutionEngine] 앱 정보 수집 실패: ${(error as Error).message}`);
      return undefined;
    }
  }
}

// 싱글톤 인스턴스
export const scenarioExecutionEngine = new ScenarioExecutionEngine();
