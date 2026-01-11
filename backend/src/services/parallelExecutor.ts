// backend/src/services/parallelExecutor.ts

import { Server as SocketIOServer } from 'socket.io';
import { sessionManager } from './sessionManager';
import { deviceManager } from './deviceManager';
import scenarioService from './scenario';
import reportService from './report';
import packageService from './package';
import { parallelReportService } from './parallelReport';
import { ParallelExecutionResult, StepResult, ExecutionStatus, DeviceReportResult, ScreenshotInfo, VideoInfo } from '../types';
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
  label?: string;  // 노드 설명 (예: "로그인 버튼 클릭")
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
  packageId?: string;
  nodes: ScenarioNode[];
  connections: ScenarioConnection[];
  createdAt: string;
  updatedAt: string;
}

// 디바이스별 실행 결과 (내부용)
interface DeviceExecutionResultInternal {
  deviceId: string;
  deviceName: string;
  success: boolean;
  duration: number;
  error?: string;
  steps: StepResult[];
  screenshots: ScreenshotInfo[];
  video?: VideoInfo;
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
// 실행 옵션
interface ExecutionOptions {
  captureScreenshots?: boolean;  // 스크린샷 캡처 여부
  captureOnComplete?: boolean;   // 완료 시 스크린샷 캡처 (비디오 없을 때만)
  recordVideo?: boolean;         // 비디오 녹화 여부
}

class ParallelExecutor {
  private io: SocketIOServer | null = null;
  private isRunning: boolean = false;
  private activeExecutions: Map<string, boolean> = new Map(); // deviceId -> shouldStop
  private currentReportId: string | null = null;  // 현재 실행 중인 리포트 ID

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
    deviceIds: string[],
    options: ExecutionOptions = {}
  ): Promise<ParallelExecutionResult> {
    if (this.isRunning) {
      throw new Error('이미 병렬 실행 중입니다.');
    }

    // 기본 옵션 설정
    const execOptions: ExecutionOptions = {
      captureScreenshots: options.captureScreenshots ?? false,
      captureOnComplete: options.captureOnComplete ?? true,  // 완료 시 기본 캡처 (비디오 없을 때만)
      recordVideo: options.recordVideo ?? true,  // 비디오 녹화 기본 활성화
    };

    // 시나리오 로드
    const scenario = await scenarioService.getById(scenarioId);
    if (!scenario) {
      throw new Error(`시나리오를 찾을 수 없습니다: ${scenarioId}`);
    }

    // 세션 검증 및 재생성
    const devices = await deviceManager.getMergedDeviceList();
    console.log(`[ParallelExecutor] 세션 검증 중: ${deviceIds.length}개 디바이스`);

    const validationResult = await sessionManager.validateAndEnsureSessions(deviceIds, devices);

    if (validationResult.recreatedDeviceIds.length > 0) {
      console.log(`[ParallelExecutor] 세션 재생성됨: ${validationResult.recreatedDeviceIds.join(', ')}`);
    }

    if (validationResult.failedDeviceIds.length > 0) {
      console.warn(`[ParallelExecutor] 세션 생성 실패: ${validationResult.failedDeviceIds.join(', ')}`);
    }

    const validDeviceIds = [...validationResult.validatedDeviceIds, ...validationResult.recreatedDeviceIds];
    if (validDeviceIds.length === 0) {
      throw new Error('사용 가능한 세션이 있는 디바이스가 없습니다. 세션 생성에 모두 실패했습니다.');
    }

    this.isRunning = true;
    const startedAt = new Date();

    // 리포트 ID 미리 생성
    this.currentReportId = `pr-${Date.now()}`;

    // 실행 상태 초기화
    validDeviceIds.forEach(id => this.activeExecutions.set(id, false));

    this._emit('parallel:start', {
      scenarioId,
      scenarioName: scenario.name,
      deviceIds: validDeviceIds,
      startedAt: startedAt.toISOString(),
      reportId: this.currentReportId,
    });

    console.log(`[ParallelExecutor] 병렬 실행 시작: ${scenario.name} on ${validDeviceIds.length}개 디바이스`);

    try {
      // 각 디바이스에서 병렬로 시나리오 실행
      const results = await Promise.allSettled(
        validDeviceIds.map(deviceId =>
          this._executeOnDevice(deviceId, scenario, execOptions)
        )
      );

      const completedAt = new Date();
      const totalDuration = completedAt.getTime() - startedAt.getTime();

      // 결과 정리
      const deviceResults: DeviceExecutionResultInternal[] = await Promise.all(
        results.map(async (result, index) => {
          const deviceId = validDeviceIds[index];
          const deviceName = await parallelReportService.getDeviceName(deviceId);

          if (result.status === 'fulfilled') {
            return result.value;
          } else {
            return {
              deviceId,
              deviceName,
              success: false,
              duration: 0,
              error: result.reason?.message || '알 수 없는 오류',
              steps: [],
              screenshots: [],
            };
          }
        })
      );

      // ParallelExecutionResult 형식으로 변환 (기존 호환)
      const parallelResult: ParallelExecutionResult = {
        scenarioId,
        results: deviceResults.map(r => ({
          deviceId: r.deviceId,
          success: r.success,
          duration: r.duration,
          error: r.error,
          steps: r.steps,
        })),
        totalDuration,
        startedAt,
        completedAt,
      };

      this._emit('parallel:complete', {
        scenarioId,
        scenarioName: scenario.name,
        totalDuration,
        reportId: this.currentReportId,
        results: deviceResults.map(r => ({
          deviceId: r.deviceId,
          deviceName: r.deviceName,
          success: r.success,
          duration: r.duration,
          error: r.error,
          screenshotCount: r.screenshots.length,
        })),
      });

      console.log(`[ParallelExecutor] 병렬 실행 완료: ${totalDuration}ms`);

      // 통합 리포트 생성
      const integratedReport = await parallelReportService.create(
        scenarioId,
        scenario.name,
        deviceResults.map(r => ({
          deviceId: r.deviceId,
          deviceName: r.deviceName,
          success: r.success,
          duration: r.duration,
          error: r.error,
          steps: r.steps,
          screenshots: r.screenshots,
          video: r.video,
        })),
        startedAt,
        completedAt
      );

      console.log(`[ParallelExecutor] 통합 리포트 생성: ${integratedReport.id}`);

      return parallelResult;

    } finally {
      this.isRunning = false;
      this.activeExecutions.clear();
      this.currentReportId = null;
    }
  }

  /**
   * 단일 디바이스에서 시나리오 실행
   */
  private async _executeOnDevice(
    deviceId: string,
    scenario: Scenario,
    options: ExecutionOptions
  ): Promise<DeviceExecutionResultInternal> {
    const actions = sessionManager.getActions(deviceId);
    const driver = sessionManager.getDriver(deviceId);
    if (!actions || !driver) {
      throw new Error(`디바이스 세션을 찾을 수 없습니다: ${deviceId}`);
    }

    const startTime = Date.now();
    const steps: StepResult[] = [];
    const screenshots: ScreenshotInfo[] = [];
    const loopCounters: Record<string, number> = {};
    let video: VideoInfo | undefined;

    // 디바이스 이름 조회
    const deviceName = await parallelReportService.getDeviceName(deviceId);

    // 시나리오의 패키지명 로드
    let scenarioPackageName: string | null = null;
    if (scenario.packageId) {
      try {
        const pkg = await packageService.getById(scenario.packageId);
        scenarioPackageName = pkg.packageName;
        console.log(`[${deviceId}] 📦 시나리오 패키지: ${pkg.name} (${pkg.packageName})`);
      } catch (err) {
        console.warn(`[${deviceId}] ⚠️ 패키지 정보 로드 실패: ${scenario.packageId}`);
      }
    }

    actions.reset();

    // 비디오 녹화 시작
    if (options.recordVideo) {
      try {
        // 디바이스별 고유한 녹화 설정
        await driver.startRecordingScreen({
          videoSize: '720x1280',  // 해상도 (세로 모드)
          timeLimit: 300,  // 최대 5분
          bitRate: 4000000,  // 4Mbps
          forceRestart: true,  // 기존 녹화가 있으면 재시작
        });
        console.log(`🎬 [${deviceId}] 비디오 녹화 시작`);
      } catch (err) {
        console.warn(`[${deviceId}] ⚠️ 비디오 녹화 시작 실패:`, err);
      }
    }

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

      await this._executeFromNode(
        deviceId, actions, scenario, startNode.id,
        steps, loopCounters, scenarioPackageName, options, screenshots
      );

      const duration = Date.now() - startTime;

      // 완료 시 스크린샷 캡처 (비디오 녹화가 없는 경우에만)
      if (options.captureOnComplete && !options.recordVideo && this.currentReportId) {
        const screenshot = await parallelReportService.captureScreenshot(
          this.currentReportId, deviceId, 'final', 'final'
        );
        if (screenshot) {
          screenshots.push(screenshot);
        }
      }

      // 비디오 녹화 종료 및 저장
      if (options.recordVideo && this.currentReportId) {
        try {
          console.log(`🎬 [${deviceId}] 비디오 녹화 종료 요청...`);
          const videoBase64 = await driver.stopRecordingScreen();
          console.log(`🎬 [${deviceId}] 비디오 데이터 수신: ${videoBase64 ? `${videoBase64.length} bytes` : 'null'}`);
          if (videoBase64) {
            video = await parallelReportService.saveVideo(
              this.currentReportId, deviceId, videoBase64, duration
            ) ?? undefined;
          }
        } catch (err) {
          console.warn(`[${deviceId}] ⚠️ 비디오 녹화 종료 실패:`, err);
        }
      }

      this._emitToDevice(deviceId, 'device:scenario:complete', {
        scenarioId: scenario.id,
        status: 'success',
        duration,
      });

      console.log(`✅ [${deviceId}] 시나리오 완료: ${duration}ms (스텝: ${steps.length}개, 스크린샷: ${screenshots.length}장, 비디오: ${video ? 'O' : 'X'})`);

      return {
        deviceId,
        deviceName,
        success: true,
        duration,
        steps,
        screenshots,
        video,
      };

    } catch (e) {
      const error = e as Error;
      const duration = Date.now() - startTime;

      // 비디오 녹화 종료 및 저장
      if (options.recordVideo && this.currentReportId) {
        try {
          console.log(`🎬 [${deviceId}] 비디오 녹화 종료 요청 (에러 케이스)...`);
          const videoBase64 = await driver.stopRecordingScreen();
          console.log(`🎬 [${deviceId}] 비디오 데이터 수신 (에러 케이스): ${videoBase64 ? `${videoBase64.length} bytes` : 'null'}`);
          if (videoBase64) {
            video = await parallelReportService.saveVideo(
              this.currentReportId, deviceId, videoBase64, duration
            ) ?? undefined;
          }
        } catch (err) {
          console.warn(`[${deviceId}] ⚠️ 비디오 녹화 종료 실패:`, err);
        }
      }

      this._emitToDevice(deviceId, 'device:scenario:complete', {
        scenarioId: scenario.id,
        status: 'failed',
        error: error.message,
        duration,
      });

      console.log(`❌ [${deviceId}] 시나리오 실패: ${error.message} (스텝: ${steps.length}개, 스크린샷: ${screenshots.length}장, 비디오: ${video ? 'O' : 'X'})`);

      // 에러 발생 시 10초 후 앱 종료
      if (scenarioPackageName) {
        console.log(`⏰ [${deviceId}] 10초 후 앱 종료 예정: ${scenarioPackageName}`);
        this._emitToDevice(deviceId, 'device:node', {
          nodeId: 'auto-terminate',
          status: 'start',
          message: `에러 발생 - 10초 후 앱 종료 예정`,
        });

        // 10초 대기 후 앱 종료 (비동기로 실행, 결과 반환에는 영향 없음)
        setTimeout(async () => {
          try {
            await actions.terminateApp(scenarioPackageName);
            console.log(`🛑 [${deviceId}] 앱 자동 종료 완료: ${scenarioPackageName}`);
            this._emitToDevice(deviceId, 'device:node', {
              nodeId: 'auto-terminate',
              status: 'success',
              message: `앱 자동 종료 완료: ${scenarioPackageName}`,
            });
          } catch (terminateErr) {
            console.warn(`[${deviceId}] ⚠️ 앱 자동 종료 실패:`, terminateErr);
            this._emitToDevice(deviceId, 'device:node', {
              nodeId: 'auto-terminate',
              status: 'error',
              message: `앱 자동 종료 실패`,
            });
          }
        }, 10000);
      }

      return {
        deviceId,
        deviceName,
        success: false,
        duration,
        error: error.message,
        steps,
        screenshots,
        video,
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
    loopCounters: Record<string, number>,
    scenarioPackageName: string | null,
    options: ExecutionOptions,
    screenshots: ScreenshotInfo[]
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
          nodeName: node.label || 'End',
          nodeType: 'end',
          status: 'passed',
          startTime: stepStartTime,
          endTime: new Date().toISOString(),
        });
        return; // 실행 종료

      case 'action':
        try {
          result = await this._executeAction(deviceId, actions, node, scenarioPackageName, screenshots, steps, stepStartTime);
          stepStatus = (result as ActionExecutionResult).success ? 'passed' : 'failed';
          stepError = (result as ActionExecutionResult).error;

          // 실패 시 스크린샷 캡처
          if (stepStatus === 'failed' && this.currentReportId) {
            const screenshot = await parallelReportService.captureScreenshot(
              this.currentReportId, deviceId, nodeId, 'failed'
            );
            if (screenshot) {
              screenshots.push(screenshot);
            }
          }
        } catch (e) {
          const error = e as Error;
          // 타임아웃은 예상된 실패이므로 'failed', 그 외는 'error'
          const isTimeout = error.message.includes('타임아웃') || error.message.includes('timeout');
          stepStatus = isTimeout ? 'failed' : 'error';
          stepError = error.message;

          // 대기 액션 실패 시에도 waiting 마커를 먼저 기록
          const waitingActions = ['wait', 'waitUntilGone', 'waitUntilExists', 'waitUntilTextGone', 'waitUntilTextExists', 'waitUntilImage', 'waitUntilImageGone'];
          const actionType = node.params?.actionType;
          if (actionType && waitingActions.includes(actionType)) {
            steps.push({
              nodeId,
              nodeName: node.label || actionType,
              nodeType: 'action',
              status: 'waiting',
              startTime: stepStartTime,
              endTime: new Date().toISOString(),
            });
          }

          // 타임아웃 실패 시 스크린샷 캡처 (예외적 에러는 스크린샷 캡처 불가능한 경우가 많음)
          if (isTimeout && this.currentReportId) {
            const screenshot = await parallelReportService.captureScreenshot(
              this.currentReportId, deviceId, nodeId, 'failed'
            );
            if (screenshot) {
              screenshots.push(screenshot);
            }
          }

          if (!node.params?.continueOnError) {
            // 실패 마커 기록 (대기 액션은 1초 앞으로 설정하여 waiting 마커와 구분)
            const failedStartTime = actionType && waitingActions.includes(actionType)
              ? new Date(Date.now() - 1000).toISOString()
              : stepStartTime;
            steps.push({
              nodeId,
              nodeName: node.label || node.params?.actionType || 'action',
              nodeType: 'action',
              status: stepStatus,
              startTime: failedStartTime,
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
      // 대기 액션의 경우 완료 step의 startTime은 실제 완료 시점보다 1초 앞으로 설정
      // (다음 스텝 마커와 겹치지 않도록)
      const waitingActions = ['wait', 'waitUntilGone', 'waitUntilExists', 'waitUntilTextGone', 'waitUntilTextExists', 'waitUntilImage', 'waitUntilImageGone'];
      const isWaitingAction = node.type === 'action' && waitingActions.includes(node.params?.actionType || '');
      const completionStartTime = isWaitingAction ? new Date(Date.now() - 1000).toISOString() : stepStartTime;

      steps.push({
        nodeId,
        nodeName: node.label || node.params?.actionType || node.params?.conditionType || node.params?.loopType || node.type,
        nodeType: node.type,
        status: stepStatus,
        startTime: completionStartTime,
        endTime: new Date().toISOString(),
        error: stepError,
      });
    }

    // 다음 노드 찾기
    const nextNodeId = this._findNextNode(scenario, nodeId, node, result);
    if (nextNodeId) {
      await this._executeFromNode(
        deviceId, actions, scenario, nextNodeId,
        steps, loopCounters, scenarioPackageName, options, screenshots
      );
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
    node: ScenarioNode,
    scenarioPackageName: string | null,
    screenshots?: ScreenshotInfo[],
    steps?: StepResult[],
    stepStartTime?: string
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
      case 'wait': {
        // 대기 상태 emit
        this._emitToDevice(deviceId, 'device:node', {
          nodeId: node.id,
          status: 'waiting',
          message: `대기 중: ${params.duration}ms`,
        });
        // waiting step 기록
        if (steps && stepStartTime) {
          steps.push({
            nodeId: node.id,
            nodeName: node.label || 'wait',
            nodeType: 'action',
            status: 'waiting',
            startTime: stepStartTime,
            endTime: new Date().toISOString(),
          });
        }
        result = await actions.wait(params.duration as number);
        break;
      }
      case 'waitUntilGone': {
        // 대기 상태 emit
        this._emitToDevice(deviceId, 'device:node', {
          nodeId: node.id,
          status: 'waiting',
          message: `요소 사라짐 대기 중: ${params.selector}`,
        });
        // waiting step 기록
        if (steps && stepStartTime) {
          steps.push({
            nodeId: node.id,
            nodeName: node.label || 'waitUntilGone',
            nodeType: 'action',
            status: 'waiting',
            startTime: stepStartTime,
            endTime: new Date().toISOString(),
          });
        }
        result = await actions.waitUntilGone(
          params.selector as string,
          params.strategy as 'id' | 'xpath' | 'accessibility id' | 'text',
          params.timeout as number,
          params.interval as number
        );
        break;
      }
      case 'waitUntilExists': {
        // 대기 상태 emit
        this._emitToDevice(deviceId, 'device:node', {
          nodeId: node.id,
          status: 'waiting',
          message: `요소 나타남 대기 중: ${params.selector}`,
        });
        // waiting step 기록
        if (steps && stepStartTime) {
          steps.push({
            nodeId: node.id,
            nodeName: node.label || 'waitUntilExists',
            nodeType: 'action',
            status: 'waiting',
            startTime: stepStartTime,
            endTime: new Date().toISOString(),
          });
        }
        result = await actions.waitUntilExists(
          params.selector as string,
          params.strategy as 'id' | 'xpath' | 'accessibility id' | 'text',
          params.timeout as number,
          params.interval as number
        );
        break;
      }
      case 'waitUntilTextGone': {
        // 대기 상태 emit
        this._emitToDevice(deviceId, 'device:node', {
          nodeId: node.id,
          status: 'waiting',
          message: `텍스트 사라짐 대기 중: ${params.text}`,
        });
        // waiting step 기록
        if (steps && stepStartTime) {
          steps.push({
            nodeId: node.id,
            nodeName: node.label || 'waitUntilTextGone',
            nodeType: 'action',
            status: 'waiting',
            startTime: stepStartTime,
            endTime: new Date().toISOString(),
          });
        }
        result = await actions.waitUntilTextGone(
          params.text as string,
          params.timeout as number,
          params.interval as number
        );
        break;
      }
      case 'waitUntilTextExists': {
        // 대기 상태 emit
        this._emitToDevice(deviceId, 'device:node', {
          nodeId: node.id,
          status: 'waiting',
          message: `텍스트 나타남 대기 중: ${params.text}`,
        });
        // waiting step 기록
        if (steps && stepStartTime) {
          steps.push({
            nodeId: node.id,
            nodeName: node.label || 'waitUntilTextExists',
            nodeType: 'action',
            status: 'waiting',
            startTime: stepStartTime,
            endTime: new Date().toISOString(),
          });
        }
        result = await actions.waitUntilTextExists(
          params.text as string,
          params.timeout as number,
          params.interval as number
        );
        break;
      }
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
      case 'launchApp':
        if (!scenarioPackageName) {
          throw new Error('시나리오에 패키지가 지정되지 않았습니다. 패키지를 먼저 설정해주세요.');
        }
        result = await actions.launchApp(scenarioPackageName);
        break;
      case 'terminateApp':
        result = await actions.terminateApp(params.appPackage as string | undefined || scenarioPackageName || undefined);
        break;
      case 'tapImage': {
        const tapImageResult = await actions.tapImage(
          params.templateId as string,
          {
            threshold: params.threshold as number | undefined,
            retryCount: 3,
            retryDelay: 1000,
          }
        );
        result = tapImageResult;
        // 하이라이트 스크린샷 저장
        if (tapImageResult.highlightedScreenshot && this.currentReportId && screenshots) {
          const screenshot = await parallelReportService.saveHighlightScreenshot(
            this.currentReportId,
            deviceId,
            node.id,
            tapImageResult.highlightedScreenshot,
            params.templateId as string,
            tapImageResult.confidence as number
          );
          if (screenshot) {
            screenshots.push(screenshot);
          }
        }
        break;
      }
      case 'waitUntilImage': {
        // 대기 상태 emit
        this._emitToDevice(deviceId, 'device:node', {
          nodeId: node.id,
          status: 'waiting',
          message: `이미지 나타남 대기 중: ${params.templateId}`,
        });
        // waiting step 기록
        if (steps && stepStartTime) {
          steps.push({
            nodeId: node.id,
            nodeName: node.label || 'waitUntilImage',
            nodeType: 'action',
            status: 'waiting',
            startTime: stepStartTime,
            endTime: new Date().toISOString(),
          });
        }
        const waitImageResult = await actions.waitUntilImage(
          params.templateId as string,
          params.timeout as number || 30000,
          params.interval as number || 1000,
          { threshold: params.threshold as number | undefined }
        );
        result = waitImageResult;
        // 하이라이트 스크린샷 저장
        if (waitImageResult.highlightedScreenshot && this.currentReportId && screenshots) {
          const screenshot = await parallelReportService.saveHighlightScreenshot(
            this.currentReportId,
            deviceId,
            node.id,
            waitImageResult.highlightedScreenshot,
            params.templateId as string,
            waitImageResult.confidence as number
          );
          if (screenshot) {
            screenshots.push(screenshot);
          }
        }
        break;
      }
      case 'waitUntilImageGone': {
        // 대기 상태 emit
        this._emitToDevice(deviceId, 'device:node', {
          nodeId: node.id,
          status: 'waiting',
          message: `이미지 사라짐 대기 중: ${params.templateId}`,
        });
        // waiting step 기록
        if (steps && stepStartTime) {
          steps.push({
            nodeId: node.id,
            nodeName: node.label || 'waitUntilImageGone',
            nodeType: 'action',
            status: 'waiting',
            startTime: stepStartTime,
            endTime: new Date().toISOString(),
          });
        }
        result = await actions.waitUntilImageGone(
          params.templateId as string,
          params.timeout as number || 30000,
          params.interval as number || 1000,
          { threshold: params.threshold as number | undefined }
        );
        break;
      }
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
