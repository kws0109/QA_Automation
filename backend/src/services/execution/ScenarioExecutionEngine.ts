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
import { actionExecutionService, SessionCrashError, isSessionCrashError } from './ActionExecutionService';
import { nodeNavigationService } from './NodeNavigationService';
import { performanceMetricsCollector } from './PerformanceMetricsCollector';

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
      const visitCount = new Map<string, number>();  // 노드별 방문 횟수 추적
      const MAX_TOTAL_ITERATIONS = 1000;  // 전체 최대 반복 (안전장치)
      let totalIterations = 0;

      while (currentNodeId && !state.stopRequested) {
        totalIterations++;
        if (totalIterations > MAX_TOTAL_ITERATIONS) {
          logger.error(`[ScenarioExecutionEngine] 최대 반복 횟수 초과 (${MAX_TOTAL_ITERATIONS}), 무한 루프 방지를 위해 중단`);
          throw new Error(`최대 반복 횟수 초과 (${MAX_TOTAL_ITERATIONS}회)`);
        }

        // 노드별 방문 횟수 증가
        const nodeVisits = (visitCount.get(currentNodeId) || 0) + 1;
        visitCount.set(currentNodeId, nodeVisits);

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
          logger.info(`[ScenarioExecutionEngine] End 노드 도달, 시나리오 종료`);
          break;
        }

        // 다음 노드 찾기
        const prevNodeId = currentNodeId;
        currentNodeId = this._findNextNode(currentNode, connections);
        logger.info(`[ScenarioExecutionEngine] 다음 노드: ${prevNodeId} → ${currentNodeId || '없음'}`);

        if (!currentNodeId) {
          logger.warn(`[ScenarioExecutionEngine] 다음 노드가 없음, 시나리오 종료`);
        }
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
      const isSessionCrash = err instanceof SessionCrashError || isSessionCrashError(error);

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
        error: isSessionCrash
          ? `[세션 크래시] ${error.message}`
          : error.message,
        sessionCrash: isSessionCrash,  // 세션 크래시 플래그
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
    logger.info(`[ScenarioExecutionEngine] ★ 노드 실행 시작: ${node.id}, 타입: ${node.type}, 라벨: ${node.label || '없음'}`);

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
        logger.info(`[ScenarioExecutionEngine] ▶ 조건 노드 진입: ${node.id}, 조건타입: ${node.params?.conditionType || '없음'}`);

        // 조건 노드 방문 횟수 추적 (maxRetry 기능용)
        const nodeWithMeta = node as ExecutionNode & {
          _conditionResult?: boolean;
          _visitCount?: number;
        };
        nodeWithMeta._visitCount = (nodeWithMeta._visitCount || 0) + 1;

        // maxLoops 체크 (설정된 경우) - 도달 시 반대 분기로 강제 이동
        const maxLoops = (node.params?.maxLoops || node.data?.maxLoops) as number | undefined;
        let conditionResult: boolean;
        let forcedByMaxLoops = false;

        if (maxLoops && maxLoops > 0 && nodeWithMeta._visitCount > maxLoops) {
          // 최대 반복 횟수 도달: 이전 결과의 반대로 강제 설정
          const lastResult = nodeWithMeta._conditionResult ?? true;
          conditionResult = !lastResult;
          forcedByMaxLoops = true;
          logger.info(
            `[ScenarioExecutionEngine] 조건 노드 ${node.id}: 최대 반복 ${maxLoops}회 도달, 반대 분기로 강제 이동`
          );
        } else {
          logger.info(`[ScenarioExecutionEngine] 조건 평가 시작...`);
          conditionResult = await this.evaluateCondition(actions, node);
          logger.info(`[ScenarioExecutionEngine] 조건 평가 완료: ${conditionResult}`);
        }

        nodeWithMeta._conditionResult = conditionResult;

        const branchLabel = conditionResult ? 'YES' : 'NO';
        logger.info(
          `[ScenarioExecutionEngine] ◀ 조건 노드 ${node.id}: 결과=${branchLabel}${forcedByMaxLoops ? '(강제)' : ''}, 방문=${nodeWithMeta._visitCount}${maxLoops ? `/${maxLoops}` : ''}`
        );
      }
    } catch (err) {
      const error = err as Error;

      // 세션 크래시 감지 - 즉시 상위로 전파하여 시나리오 실행 완전 중단
      if (err instanceof SessionCrashError || isSessionCrashError(error)) {
        logger.error(`[ScenarioExecutionEngine] ⚠️ 세션 크래시 감지됨 - 시나리오 실행 중단: ${error.message}`);

        // 세션 크래시 이벤트 발행
        this._emit('test:device:session_crash', {
          executionId: state.executionId,
          deviceId,
          deviceName: this._getDeviceName(state, deviceId),
          scenarioId: queueItem.scenarioId,
          nodeId: node.id,
          error: error.message,
        });

        // 상위로 전파하여 실행 루프 즉시 종료
        throw new SessionCrashError(
          `세션 크래시로 인한 실행 중단: ${error.message}`,
          error
        );
      }

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
      stepPerformance = performanceMetricsCollector.buildStepPerformance(
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
  /**
   * 액션 노드 실행
   * ActionExecutionService에 위임하여 중복 코드 제거
   *
   * @throws Error - 액션 실행 실패 시 (타임아웃, 요소 없음 등)
   */
  async executeActionNode(actions: Actions, node: ExecutionNode, appPackage: string): Promise<ActionResult | null> {
    const executionResult = await actionExecutionService.executeAction(actions, node, appPackage);

    // 액션 실행 실패 시 예외 발생 (타임아웃 포함)
    // 이를 통해 상위 executeNode에서 catch하여 실패 처리
    if (!executionResult.success) {
      throw new Error(executionResult.message || '액션 실행 실패');
    }

    return executionResult.result ?? null;
  }

  /**
   * 조건 노드 평가
   */
  /**
   * 조건 노드 평가
   * ActionExecutionService에 위임하여 중복 코드 제거
   */
  private async evaluateCondition(actions: Actions, node: ExecutionNode): Promise<boolean> {
    const result = await actionExecutionService.evaluateCondition(actions, node);
    return result.passed;
  }

  /**
   * 다음 노드 찾기
   */
  /**
   * 다음 실행할 노드 ID 찾기
   * NodeNavigationService에 위임하여 중복 코드 제거
   */
  private _findNextNode(
    currentNode: ExecutionNode,
    connections: Array<{ from: string; to: string; label?: string; branch?: string }>
  ): string | null {
    return nodeNavigationService.findNextNodeId(
      currentNode as ExecutionNode & { _conditionResult?: boolean },
      connections
    );
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
