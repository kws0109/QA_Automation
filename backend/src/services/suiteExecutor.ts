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
 * 액션 실행 결과 (성능 메트릭 포함)
 */
interface ActionExecutionResult {
  success: boolean;
  message?: string;
  performance?: {
    matchTime?: number;
    confidence?: number;
    templateId?: string;
    ocrTime?: number;
    searchText?: string;
    matchType?: string;
  };
}

/**
 * Suite 실행 옵션
 */
export interface SuiteExecutionOptions {
  repeatCount?: number;        // 반복 횟수 (기본: 1)
  scenarioInterval?: number;   // 시나리오 간격 ms (기본: 0)
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
  options: Required<SuiteExecutionOptions>;
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
  async executeSuite(suiteId: string, options?: SuiteExecutionOptions): Promise<SuiteExecutionResult> {
    const suite = await suiteService.getSuiteById(suiteId);
    if (!suite) {
      throw new Error(`Suite not found: ${suiteId}`);
    }

    // 옵션 기본값 설정
    const resolvedOptions: Required<SuiteExecutionOptions> = {
      repeatCount: options?.repeatCount ?? 1,
      scenarioInterval: options?.scenarioInterval ?? 0,
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

    console.log(`[SuiteExecutor] Starting suite: ${suite.name} (${suiteId})`);
    console.log(`[SuiteExecutor] Devices: ${suite.deviceIds.join(', ')}`);
    console.log(`[SuiteExecutor] Scenarios: ${suite.scenarioIds.join(', ')}`);
    console.log(`[SuiteExecutor] Options: repeatCount=${resolvedOptions.repeatCount}, scenarioInterval=${resolvedOptions.scenarioInterval}ms`);

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
        console.log(`[SuiteExecutor] Metrics collected for suite: ${suite.name}`);
      } catch (metricsError) {
        console.error(`[SuiteExecutor] Failed to collect metrics:`, metricsError);
        // 메트릭 수집 실패는 Suite 실행 결과에 영향을 주지 않음
      }

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

      // Slack 알림 전송 (비동기, 실패해도 실행 결과에 영향 없음)
      slackNotificationService.notifySuiteComplete(executionResult, {
        reportUrl: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/suite-reports/${executionResult.id}`,
      }).catch((err) => {
        console.error(`[SuiteExecutor] Slack 알림 전송 실패:`, err);
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

    console.log(`[SuiteExecutor] Device ${deviceName} starting suite execution`);

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
      console.log(`[SuiteExecutor] [${deviceName}] Environment collected`);
    } catch (err) {
      console.warn(`[SuiteExecutor] [${deviceName}] Failed to collect environment:`, err);
    }

    // 반복 횟수 및 시나리오 간격 적용
    const { repeatCount, scenarioInterval } = state.options;
    const totalScenarios = suite.scenarioIds.length;

    // 반복 실행
    for (let repeat = 1; repeat <= repeatCount && continueExecution; repeat++) {
      if (state.stopRequested) {
        console.log(`[SuiteExecutor] Stop requested for device ${deviceName}`);
        break;
      }

      if (repeatCount > 1) {
        console.log(`[SuiteExecutor] [${deviceName}] Starting repeat ${repeat}/${repeatCount}`);
      }

      // 시나리오 순차 실행
      for (let i = 0; i < totalScenarios && continueExecution; i++) {
        if (state.stopRequested) {
          console.log(`[SuiteExecutor] Stop requested for device ${deviceName}`);
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
          console.log(`[SuiteExecutor] [${deviceName}] Waiting ${scenarioInterval}ms before next scenario`);
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
              console.log(`[SuiteExecutor] [${deviceName}] App info collected: ${pkg.packageName}`);
            }
          }
        }
      } catch (err) {
        console.warn(`[SuiteExecutor] [${deviceName}] Failed to collect app info:`, err);
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

    console.log(`[SuiteExecutor] [${deviceName}] Starting scenario: ${scenario.name}${repeatInfo}`);

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
      console.log(`[SuiteExecutor] [${deviceName}] Ensuring session is healthy...`);
      let session;
      try {
        session = await sessionManager.ensureSession(deviceInfo);
        console.log(`[SuiteExecutor] [${deviceName}] Session ready (id: ${session.sessionId})`);
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
          console.log(`[SuiteExecutor] [${deviceName}] App package: ${appPackageName}`);
        } catch (err) {
          console.warn(`[SuiteExecutor] [${deviceName}] Failed to get package info:`, err);
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
          console.log(`[SuiteExecutor] [${deviceName}] Video recording started (Device App)`);
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

      console.log(`[SuiteExecutor] [${deviceName}] Step ${node.label || actionType || node.type}: waiting`);
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

      // 성능 메트릭 변환
      if (result.performance) {
        const stepEndTimeForPerf = new Date();
        actionPerformance = {
          totalTime: stepEndTimeForPerf.getTime() - stepStartedAt.getTime(),
        };

        // 이미지 매칭 메트릭
        if (result.performance.matchTime !== undefined || result.performance.confidence !== undefined) {
          actionPerformance.imageMatch = {
            templateId: (result.performance.templateId as string) || '',
            matched: result.success,
            confidence: (result.performance.confidence as number) || 0,
            threshold: (node.params?.threshold as number) || 0.8,
            matchTime: (result.performance.matchTime as number) || 0,
            roiUsed: !!node.params?.region,
          };
        }

        // OCR 매칭 메트릭
        if (result.performance.ocrTime !== undefined || result.performance.searchText !== undefined) {
          actionPerformance.ocrMatch = {
            searchText: result.performance.searchText || '',
            matchType: (result.performance.matchType as 'exact' | 'contains' | 'regex') || 'contains',
            matched: result.success,
            confidence: result.performance.confidence || 0,
            ocrTime: result.performance.ocrTime || 0,
            apiProvider: 'google',  // Google Cloud Vision API 사용
          };
        }
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

    console.log(`[SuiteExecutor] [${deviceName}] Step ${node.label || node.params?.actionType || node.type}: ${stepStatus}`);

    // 실패 시 중단
    if (stepStatus === 'failed') {
      return;
    }

    // 다음 노드로 이동
    if (node.type === 'condition') {
      // 조건 노드: 평가 결과에 따라 분기
      const conditionResult = await this._evaluateCondition(actions, node, deviceName);
      const branchLabel = conditionResult ? 'yes' : 'no';
      console.log(`[SuiteExecutor] [${deviceName}] 조건 평가 결과: ${branchLabel}`);
      const nextNodeId = this._getNextNodeId(connections, currentNodeId, branchLabel);
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
   * NOTE: 프론트엔드는 `label`, 백엔드 타입은 `branch` 사용 - 양쪽 지원
   */
  private _getNextNodeId(
    connections: Array<{ from: string; to: string; branch?: string; label?: string }>,
    currentNodeId: string,
    branch?: string
  ): string | null {
    // branch가 지정된 경우 해당 branch 연결 찾기 (label 또는 branch 속성 체크)
    if (branch) {
      const branchConnection = connections.find(
        c => c.from === currentNodeId && (c.branch === branch || c.label === branch)
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
   * 조건 노드 평가
   * @returns true면 'yes' 분기, false면 'no' 분기
   */
  private async _evaluateCondition(actions: Actions, node: ScenarioNode, deviceName: string): Promise<boolean> {
    const params = node.params || {};
    const conditionType = params.conditionType as string;
    const selector = params.selector as string;
    const selectorType = (params.selectorType as 'id' | 'xpath' | 'accessibility id' | 'text') || 'id';
    const text = params.text as string;

    console.log(`🔀 [SuiteExecutor] [${deviceName}] 조건 평가: ${conditionType}`);

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
          console.warn(`[SuiteExecutor] 알 수 없는 조건 타입: ${conditionType}, 기본값 true`);
          return true;
      }
    } catch (error) {
      console.error(`[SuiteExecutor] [${deviceName}] 조건 평가 실패: ${(error as Error).message}`);
      // 조건 평가 실패 시 false 반환 (no 분기)
      return false;
    }
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
  ): Promise<ActionExecutionResult> {
    // 노드 데이터는 node.params에 저장됨 (node.data가 아님)
    const params = node.params || node.data || {};
    const actionType = params.actionType || node.type;

    // 패키지명은 params에 명시적으로 있으면 사용, 없으면 시나리오 패키지에서 가져옴
    const packageName = params.packageName || appPackageName;

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let result: any;

      switch (actionType) {
        case 'tap':
          result = await actions.tap(params.x as number, params.y as number);
          break;
        case 'doubleTap':
          result = await actions.doubleTap(params.x as number, params.y as number);
          break;
        case 'longPress':
          result = await actions.longPress(params.x as number, params.y as number, (params.duration as number) || 1000);
          break;
        case 'swipe':
          result = await actions.swipe(
            params.startX as number,
            params.startY as number,
            params.endX as number,
            params.endY as number,
            (params.duration as number) || 300
          );
          break;
        case 'inputText':
          result = await actions.typeText(params.text as string);
          break;
        case 'pressKey':
          result = await actions.pressKey(params.keycode as number);
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
          result = await actions.waitUntilExists(
            params.selector as string,
            (params.selectorType as 'id' | 'xpath' | 'accessibility id' | 'text') || 'text',
            (params.timeout as number) || 30000
          );
          break;
        case 'waitUntilGone':
          result = await actions.waitUntilGone(
            params.selector as string,
            (params.selectorType as 'id' | 'xpath' | 'accessibility id' | 'text') || 'text',
            (params.timeout as number) || 30000
          );
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

      // 성능 메트릭 추출
      const performance: ActionExecutionResult['performance'] = {};
      if (result?.matchTime !== undefined && result.matchTime !== null) {
        performance.matchTime = result.matchTime as number;
      }
      if (result?.confidence !== undefined && result.confidence !== null) {
        performance.confidence = result.confidence as number;
      }
      if (result?.templateId !== undefined && result.templateId !== null) {
        performance.templateId = result.templateId as string;
      }
      if (result?.ocrTime !== undefined && result.ocrTime !== null) {
        performance.ocrTime = result.ocrTime as number;
      }
      if (result?.searchText !== undefined || params.text !== undefined) {
        performance.searchText = (result?.searchText || params.text) as string;
      }
      // OCR 액션의 경우 matchType 추가
      if (params.matchType) {
        performance.matchType = params.matchType as string;
      }

      return {
        success: result?.success ?? true,
        message: result?.message,
        performance: Object.keys(performance).length > 0 ? performance : undefined,
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
