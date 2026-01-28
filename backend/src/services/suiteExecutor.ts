// backend/src/services/suiteExecutor.ts
// Test Suite 실행 엔진
// - 각 디바이스에서 시나리오를 순차 실행
// - 디바이스 간 병렬 실행

import { Server as SocketIOServer } from 'socket.io';
import { eventEmitter, SUITE_EVENTS } from '../events';
import {
  TestSuite,
  SuiteExecutionResult,
  DeviceSuiteResult,
  ScenarioSuiteResult,
  StepSuiteResult,
  SuiteProgress,
  SuiteExecutionStats,
  ScreenshotInfo,
  DeviceSuiteEnvironment,
  AppSuiteInfo,
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
import { environmentCollector } from './environmentCollector';
import { metricsCollector } from './metricsCollector';
import { slackNotificationService } from './slackNotificationService';
import { createLogger } from '../utils/logger';
import {
  actionExecutionService,
  ActionExecutionResult,
  nodeNavigationService,
  NodeConnection,
  performanceMetricsCollector,
} from './execution';

const logger = createLogger('SuiteExecutor');

/**
 * 시나리오 노드 (조건 평가용)
 */
interface ScenarioNode {
  id: string;
  type: string;
  label?: string;
  params?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Suite 실행 옵션
 */
export interface SuiteExecutionOptions {
  repeatCount?: number;        // 반복 횟수 (기본: 1)
  scenarioInterval?: number;   // 시나리오 간격 ms (기본: 0)
  requesterName?: string;      // 요청자 이름 (Slack 알림용)
  requesterSlackId?: string;   // 요청자 Slack ID (멘션용)
}

/**
 * Suite 실행 상태
 */
interface SuiteExecutionState {
  suiteId: string;
  suite: TestSuite;
  stopRequested: boolean;
  deviceProgress: Map<string, {
    currentScenarioIndex: number;
    currentRepeat: number;
    status: 'running' | 'completed' | 'failed' | 'stopped';
  }>;
  startedAt: Date;
  options: {
    repeatCount: number;
    scenarioInterval: number;
    requesterName?: string;
    requesterSlackId?: string;
  };
}

/**
 * Suite Executor 클래스
 */
class SuiteExecutor {
  private io: SocketIOServer | null = null;
  private activeExecutions: Map<string, SuiteExecutionState> = new Map();

  /**
   * Socket.IO 설정
   * @deprecated eventEmitter를 사용하세요. 하위 호환성을 위해 유지됩니다.
   */
  setSocketIO(io: SocketIOServer): void {
    this.io = io;
  }

  /**
   * 이벤트 emit (eventEmitter 사용)
   */
  private _emit(event: string, data: unknown): void {
    eventEmitter.emit(event, data);
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
  async executeSuite(suiteId: string, options?: SuiteExecutionOptions): Promise<SuiteExecutionResult> {
    const suite = await suiteService.getSuiteById(suiteId);
    if (!suite) {
      throw new Error(`Suite not found: ${suiteId}`);
    }

    // 옵션 기본값 설정
    const resolvedOptions = {
      repeatCount: options?.repeatCount ?? 1,
      scenarioInterval: options?.scenarioInterval ?? 0,
      requesterName: options?.requesterName,
      requesterSlackId: options?.requesterSlackId,
    };

    // 실행 상태 초기화
    const state: SuiteExecutionState = {
      suiteId,
      suite,
      stopRequested: false,
      deviceProgress: new Map(),
      startedAt: new Date(),
      options: resolvedOptions,
    };
    this.activeExecutions.set(suiteId, state);

    // 시작 이벤트
    this._emit('suite:start', {
      suiteId,
      suiteName: suite.name,
      deviceIds: suite.deviceIds,
      scenarioIds: suite.scenarioIds,
      repeatCount: resolvedOptions.repeatCount,
      scenarioInterval: resolvedOptions.scenarioInterval,
    });

    logger.info(`[SuiteExecutor] Starting suite: ${suite.name} (${suiteId})`);
    logger.info(`[SuiteExecutor] Devices: ${suite.deviceIds.join(', ')}`);
    logger.info(`[SuiteExecutor] Scenarios: ${suite.scenarioIds.join(', ')}`);
    logger.info(`[SuiteExecutor] Options: repeatCount=${resolvedOptions.repeatCount}, scenarioInterval=${resolvedOptions.scenarioInterval}ms`);

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

      // 메트릭 DB에 저장
      try {
        await metricsCollector.collectSuite(executionResult);
        logger.info(`[SuiteExecutor] Metrics collected for suite: ${suite.name}`);
      } catch (metricsError) {
        logger.error(`[SuiteExecutor] Failed to collect metrics:`, metricsError as Error);
        // 메트릭 수집 실패는 Suite 실행 결과에 영향을 주지 않음
      }

      // 완료/중단 이벤트
      if (state.stopRequested) {
        this._emit('suite:stopped', {
          suiteId,
          result: executionResult,
        });
        logger.info(`[SuiteExecutor] Suite stopped: ${suite.name}`);
      } else {
        this._emit('suite:complete', {
          suiteId,
          result: executionResult,
        });
        logger.info(`[SuiteExecutor] Suite completed: ${suite.name}`);
      }
      logger.info(`[SuiteExecutor] Stats: ${stats.passed}/${stats.totalExecutions} passed`);

      // Slack 알림 전송 (비동기, 실패해도 실행 결과에 영향 없음)
      slackNotificationService.notifySuiteComplete(executionResult, {
        reportUrl: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/suite-reports/${executionResult.id}`,
        requesterName: state.options.requesterName,
        requesterSlackId: state.options.requesterSlackId,
      }).catch((err) => {
        logger.error(`[SuiteExecutor] Slack 알림 전송 실패:`, err as Error);
      });

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
      currentRepeat: 1,
      status: 'running',
    });

    // 디바이스 시작 이벤트
    this._emit('suite:device:start', {
      suiteId,
      deviceId,
      deviceName,
    });

    logger.info(`[SuiteExecutor] Device ${deviceName} starting suite execution`);

    const deviceStartedAt = new Date();
    const scenarioResults: ScenarioSuiteResult[] = [];
    let continueExecution = true;

    // 환경정보 수집
    let deviceEnvironment: DeviceSuiteEnvironment | undefined;
    let appInfo: AppSuiteInfo | undefined;
    try {
      const envInfo = await environmentCollector.collectDeviceEnvironment(deviceId);
      deviceEnvironment = {
        brand: envInfo.brand,
        model: envInfo.model,
        androidVersion: envInfo.androidVersion,
        sdkVersion: envInfo.sdkVersion,
        screenResolution: envInfo.screenResolution,
        batteryLevel: envInfo.batteryLevel,
        batteryStatus: envInfo.batteryStatus,
        availableMemory: envInfo.availableMemory,
        totalMemory: envInfo.totalMemory,
        networkType: envInfo.networkType,
      };
      logger.info(`[SuiteExecutor] [${deviceName}] Environment collected`);
    } catch (err) {
      logger.warn(`[SuiteExecutor] [${deviceName}] Failed to collect environment: ${(err as Error).message}`);
    }

    // 반복 횟수 및 시나리오 간격 적용
    const { repeatCount, scenarioInterval } = state.options;
    const totalScenarios = suite.scenarioIds.length;

    // 반복 실행
    for (let repeat = 1; repeat <= repeatCount && continueExecution; repeat++) {
      if (state.stopRequested) {
        logger.info(`[SuiteExecutor] Stop requested for device ${deviceName}`);
        break;
      }

      if (repeatCount > 1) {
        logger.info(`[SuiteExecutor] [${deviceName}] Starting repeat ${repeat}/${repeatCount}`);
      }

      // 시나리오 순차 실행
      for (let i = 0; i < totalScenarios && continueExecution; i++) {
        if (state.stopRequested) {
          logger.info(`[SuiteExecutor] Stop requested for device ${deviceName}`);
          break;
        }

        const scenarioId = suite.scenarioIds[i];
        const progress = state.deviceProgress.get(deviceId)!;
        progress.currentScenarioIndex = i;
        progress.currentRepeat = repeat;

        // 진행률 이벤트 (반복 정보 포함)
        this._emitProgress(state, deviceId, deviceName, i, repeat);

        // 시나리오 실행
        const scenarioResult = await this._executeScenario(
          state,
          deviceId,
          deviceName,
          scenarioId,
          i,
          repeat
        );

        scenarioResults.push(scenarioResult);

        // 실패 시 다음 시나리오 스킵 (옵션)
        if (scenarioResult.status === 'failed') {
          // 현재는 실패해도 계속 진행
          // continueExecution = false;
        }

        // 시나리오 간격 대기 (마지막 시나리오가 아닌 경우)
        const isLastScenario = i === totalScenarios - 1;
        const isLastRepeat = repeat === repeatCount;
        if (scenarioInterval > 0 && !(isLastScenario && isLastRepeat)) {
          logger.info(`[SuiteExecutor] [${deviceName}] Waiting ${scenarioInterval}ms before next scenario`);
          await new Promise(resolve => setTimeout(resolve, scenarioInterval));
        }
      }
    }

    // 남은 시나리오 스킵 처리 (중지 요청 시)
    if (state.stopRequested) {
      const executedCount = scenarioResults.length;
      const totalExpected = totalScenarios * repeatCount;
      for (let i = executedCount; i < totalExpected; i++) {
        const scenarioIndex = i % totalScenarios;
        const scenarioId = suite.scenarioIds[scenarioIndex];
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

    // 앱 정보 수집 (첫 번째 시나리오의 패키지명 사용)
    if (scenarioResults.length > 0) {
      try {
        const firstScenario = await scenarioService.getById(suite.scenarioIds[0]);
        if (firstScenario?.packageId) {
          const pkg = await packageService.getById(firstScenario.packageId);
          if (pkg?.packageName) {
            const driver = sessionManager.getDriver(deviceId);
            if (driver) {
              const collectedAppInfo = await environmentCollector.collectAppInfo(
                driver,
                pkg.packageName,
                deviceId
              );
              appInfo = {
                packageName: collectedAppInfo.packageName,
                appName: collectedAppInfo.appName,
                versionName: collectedAppInfo.versionName,
                versionCode: collectedAppInfo.versionCode,
                targetSdk: collectedAppInfo.targetSdk,
              };
              logger.info(`[SuiteExecutor] [${deviceName}] App info collected: ${pkg.packageName}`);
            }
          }
        }
      } catch (err) {
        logger.warn(`[SuiteExecutor] [${deviceName}] Failed to collect app info: ${(err as Error).message}`);
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
      environment: deviceEnvironment,
      appInfo,
    };

    // 디바이스 완료 이벤트
    this._emit('suite:device:complete', {
      suiteId,
      deviceId,
      result: deviceResult,
    });

    logger.info(`[SuiteExecutor] Device ${deviceName} completed: ${deviceResult.stats.passed}/${deviceResult.stats.total} passed`);

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
    scenarioIndex: number,
    currentRepeat: number = 1
  ): Promise<ScenarioSuiteResult> {
    const { suiteId, options } = state;
    const { repeatCount } = options;
    const scenario = await scenarioService.getById(scenarioId);
    const repeatInfo = repeatCount > 1 ? ` (repeat ${currentRepeat}/${repeatCount})` : '';

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
      currentRepeat,
      totalRepeats: repeatCount,
    });

    logger.info(`[SuiteExecutor] [${deviceName}] Starting scenario: ${scenario.name}${repeatInfo}`);

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
        logger.info(`[SuiteExecutor] [${deviceName}] Screenshot saved: ${data.path}`);
      }
    };

    try {
      // 디바이스 정보 조회
      const deviceInfo = await deviceManager.getDeviceDetails(deviceId);
      if (!deviceInfo) {
        throw new Error(`Device not found: ${deviceId}`);
      }

      // 디바이스가 연결되어 있는지 확인
      if (deviceInfo.status !== 'connected') {
        throw new Error(`Device not connected: ${deviceId} (status: ${deviceInfo.status})`);
      }

      // 세션 확인 및 유효성 검사 (죽은 세션 자동 재생성)
      logger.info(`[SuiteExecutor] [${deviceName}] Ensuring session is healthy...`);
      let session;
      try {
        session = await sessionManager.ensureSession(deviceInfo);
        logger.info(`[SuiteExecutor] [${deviceName}] Session ready (id: ${session.sessionId})`);
      } catch (sessionErr) {
        throw new Error(`Failed to ensure session for device ${deviceId}: ${(sessionErr as Error).message}`);
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
          logger.info(`[SuiteExecutor] [${deviceName}] App package: ${appPackageName}`);
        } catch (err) {
          logger.warn(`[SuiteExecutor] [${deviceName}] Failed to get package info: ${(err as Error).message}`);
        }
      }

      // 비디오 녹화 시작 (Device App 사용)
      try {
        const recordResult = await screenRecorder.startRecording(deviceId, {
          useDeviceApp: true,
          bitrate: 2,  // 2Mbps
        });

        if (recordResult.success) {
          recordingStarted = true;
          logger.info(`[SuiteExecutor] [${deviceName}] Video recording started (Device App)`);
        } else {
          logger.warn(`[SuiteExecutor] [${deviceName}] Failed to start video recording: ${recordResult.error}`);
        }
      } catch (err) {
        logger.warn(`[SuiteExecutor] [${deviceName}] Video recording not available: ${(err as Error).message}`);
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

      logger.info(`[SuiteExecutor] [${deviceName}] Nodes count: ${nodes.length}`);
      logger.info(`[SuiteExecutor] [${deviceName}] Connections count: ${connections.length}`);
      logger.info(`[SuiteExecutor] [${deviceName}] Start node: ${startNode?.id || 'NOT FOUND'}`);

      if (startNode) {
        const firstConnection = connections.find(c => c.from === startNode.id);
        logger.info(`[SuiteExecutor] [${deviceName}] First connection from start: ${firstConnection?.to || 'NOT FOUND'}`);

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

        logger.info(`[SuiteExecutor] [${deviceName}] Steps executed: ${stepResults.length}`);
      } else {
        logger.warn(`[SuiteExecutor] [${deviceName}] No start node found in scenario!`);
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
      logger.error(`[SuiteExecutor] [${deviceName}] Scenario error: ${scenarioError}`);
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
            logger.info(`[SuiteExecutor] [${deviceName}] Video saved: ${videoPath}`);
          } else if (stopResult.error) {
            logger.warn(`[SuiteExecutor] [${deviceName}] Failed to stop video recording: ${stopResult.error}`);
          }
        } catch (err) {
          logger.warn(`[SuiteExecutor] [${deviceName}] Error stopping video recording: ${(err as Error).message}`);
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

    logger.info(`[SuiteExecutor] [${deviceName}] Scenario ${scenario.name}: ${scenarioStatus}`);

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
    nodes: ScenarioNode[],
    connections: Array<{ from: string; to: string; branch?: string; label?: string }>,
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
      const nextNodeId = nodeNavigationService.findNextNodeId(node, connections as NodeConnection[]);
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
    const actionType = (node.params?.actionType as string | undefined) || '';
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

      logger.info(`[SuiteExecutor] [${deviceName}] Step ${node.label || actionType || node.type}: waiting`);
    }

    // 성능 메트릭 저장용 변수
    let actionPerformance: StepSuiteResult['performance'];

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

      // 성능 메트릭 변환 (PerformanceMetricsCollector 사용)
      if (result.performance) {
        const stepEndTimeForPerf = new Date();
        const stepDuration = stepEndTimeForPerf.getTime() - stepStartedAt.getTime();
        actionPerformance = performanceMetricsCollector.buildFromExecutionResult(
          stepDuration,
          isWaitAction,
          result.performance,
          node.params || {},
          result.success
        );
      }

    } catch (err) {
      stepStatus = 'failed';
      stepError = err instanceof Error ? err.message : String(err);
    }

    // 스텝 결과 저장
    const stepEndTime = new Date();
    const stepResult: StepSuiteResult = {
      nodeId: node.id,
      nodeName: (node.label as string) || actionType || node.type,
      actionType: actionType || node.type,
      status: stepStatus,
      duration: stepEndTime.getTime() - stepStartedAt.getTime(),
      error: stepError,
      // 대기 액션인 경우 종료 시간 사용 (타임라인에서 대기시작-완료 마커 구분)
      timestamp: isWaitAction ? stepEndTime.toISOString() : stepStartedAt.toISOString(),
      // 성능 메트릭 추가
      performance: actionPerformance,
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

    logger.info(`[SuiteExecutor] [${deviceName}] Step ${node.label || node.params?.actionType || node.type}: ${stepStatus}`);

    // 실패 시 중단
    if (stepStatus === 'failed') {
      return;
    }

    // 다음 노드로 이동
    if (node.type === 'condition') {
      // 조건 노드: 평가 결과에 따라 분기
      const conditionResult = await this._evaluateCondition(actions, node, deviceName);
      logger.info(`[SuiteExecutor] [${deviceName}] 조건 평가 결과: ${conditionResult ? 'yes' : 'no'}`);
      // nodeNavigationService는 _conditionResult를 읽어 분기 결정
      const nodeWithResult = { ...node, _conditionResult: conditionResult };
      const nextNodeId = nodeNavigationService.findNextNodeId(nodeWithResult, connections as NodeConnection[]);
      if (nextNodeId) {
        await this._executeNodes(state, deviceId, deviceName, scenarioId, scenarioName, actions, nodes, connections, nextNodeId, stepResults, screenshots, appPackageName, visited);
      }
    } else {
      const nextNodeId = nodeNavigationService.findNextNodeId(node, connections as NodeConnection[]);
      if (nextNodeId) {
        await this._executeNodes(state, deviceId, deviceName, scenarioId, scenarioName, actions, nodes, connections, nextNodeId, stepResults, screenshots, appPackageName, visited);
      }
    }
  }

  /**
   * 조건 노드 평가
   * ActionExecutionService에 위임하여 중복 코드 제거
   * @returns true면 'yes' 분기, false면 'no' 분기
   */
  private async _evaluateCondition(actions: Actions, node: ScenarioNode, _deviceName: string): Promise<boolean> {
    const result = await actionExecutionService.evaluateCondition(actions, node);
    return result.passed;
  }

  /**
   * 액션 실행
   * ActionExecutionService에 위임하여 중복 코드 제거
   */
  private async _executeAction(
    actions: Actions,
    node: ScenarioNode,
    _deviceId: string,
    appPackageName?: string
  ): Promise<ActionExecutionResult> {
    return await actionExecutionService.executeAction(actions, node, appPackageName || '');
  }

  /**
   * 진행률 이벤트 emit
   */
  private _emitProgress(
    state: SuiteExecutionState,
    deviceId: string,
    deviceName: string,
    scenarioIndex: number,
    currentRepeat: number = 1
  ): void {
    const { suite, suiteId, options } = state;
    const totalDevices = suite.deviceIds.length;
    const totalScenarios = suite.scenarioIds.length;
    const { repeatCount } = options;

    // 완료된 디바이스 수 계산
    let completedDevices = 0;
    for (const [_, progress] of state.deviceProgress) {
      if (progress.status === 'completed') {
        completedDevices++;
      }
    }

    // 전체 진행률 계산 (반복 횟수 포함)
    const totalExecutionsPerDevice = totalScenarios * repeatCount;
    const totalExecutions = totalDevices * totalExecutionsPerDevice;
    const currentDeviceExecutions = (currentRepeat - 1) * totalScenarios + scenarioIndex;
    const completedExecutions = completedDevices * totalExecutionsPerDevice + currentDeviceExecutions;
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
        current: (currentRepeat - 1) * totalScenarios + scenarioIndex + 1,
        total: totalScenarios * repeatCount,
      },
      overallProgress,
      // 반복 정보 추가
      repeatProgress: repeatCount > 1 ? {
        current: currentRepeat,
        total: repeatCount,
      } : undefined,
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
      logger.info(`[SuiteExecutor] Stop requested for suite: ${suiteId}`);
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
      logger.info(`[SuiteExecutor] Stop requested for suite: ${suiteId}`);
    }
  }
}

export const suiteExecutor = new SuiteExecutor();
export default suiteExecutor;
