// backend/src/services/testExecutor.ts
// 다중 시나리오 테스트 실행 서비스 (Who/What/When 패러다임)
// 방식 2: 각 디바이스가 독립적으로 시나리오 세트를 순차 실행
// 다중 사용자 지원: 여러 실행이 동시에 진행될 수 있음 (디바이스가 다르면)

import { Server as SocketIOServer } from 'socket.io';
import { eventEmitter, TEST_EVENTS, REPORT_EVENTS } from '../events';
import { sessionManager } from './sessionManager';
import { deviceManager } from './deviceManager';
import scenarioService from './scenario';
import packageService from './package';
import { categoryService } from './category';
import { testReportService } from './testReportService';
import { environmentCollector } from './environmentCollector';
import { failureAnalyzer } from './failureAnalyzer';
import { metricsCollector } from './metricsCollector';
import { createLogger } from '../utils/logger';

const logger = createLogger('TestExecutor');
import {
  TestExecutionRequest,
  TestExecutionResult,
  TestExecutionStatus,
  ScenarioQueueItem,
  ScenarioExecutionSummary,
  DeviceExecutionResult,
  StepResult,
  ScenarioReportResult,
  DeviceScenarioResult,
  TestExecutionInfo,
  ScreenshotInfo,
  VideoInfo,
  ExecutionNode,
  ActionResult,
} from '../types';
import { DeviceEnvironment, AppInfo, StepPerformance } from '../types/reportEnhanced';
import { Actions } from '../appium/actions';
import { imageMatchEmitter } from './screenshotEventService';
import { screenRecorder } from './videoAnalyzer';
import { slackNotificationService } from './slackNotificationService';

// 디바이스별 실행 상태
interface DeviceProgress {
  deviceId: string;
  deviceName: string;
  currentScenarioIndex: number;
  totalScenarios: number;
  currentScenarioId: string;
  currentScenarioName: string;
  status: 'running' | 'completed' | 'failed' | 'stopped';
  completedScenarios: number;
  failedScenarios: number;
}

/**
 * 개별 실행 컨텍스트
 * 각 테스트 실행마다 독립된 상태를 유지합니다.
 */
interface ExecutionState {
  executionId: string;
  reportId: string;  // 리포트 ID (사전 생성)
  request: TestExecutionRequest;
  stopRequested: boolean;
  scenarioQueue: ScenarioQueueItem[];
  deviceProgress: Map<string, DeviceProgress>;
  deviceNames: Map<string, string>;
  startedAt: Date;
  deviceIds: string[];
  scenarioInterval: number;
  deviceScreenshots: Map<string, Map<string, ScreenshotInfo[]>>;  // deviceId -> scenarioKey -> screenshots
  deviceVideos: Map<string, Map<string, VideoInfo>>;  // deviceId -> scenarioKey -> VideoInfo (시나리오별 비디오)
  // QA 확장 필드
  deviceEnvironments: Map<string, DeviceEnvironment>;  // deviceId -> DeviceEnvironment
  deviceAppInfos: Map<string, Map<string, AppInfo>>;  // deviceId -> packageName -> AppInfo
}

/**
 * 테스트 실행 엔진 (방식 2)
 * 각 디바이스가 독립적으로 시나리오 세트를 순차 실행합니다.
 * 다중 실행 지원: 서로 다른 디바이스 세트에서 동시에 테스트 실행 가능
 */
class TestExecutor {
  private io: SocketIOServer | null = null;

  // 다중 실행 지원: 실행 ID별 상태 관리
  private activeExecutions: Map<string, ExecutionState> = new Map();

  // 하위 호환성: 단일 실행 시 사용되는 현재 실행 ID
  private currentExecutionId: string | null = null;

  /**
   * Socket.IO 인스턴스 설정
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
   * 지연 대기
   */
  private _delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 스크린샷 캡처 및 저장
   * @param executionId 실행 ID
   * @param deviceId 디바이스 ID
   * @param scenarioId 시나리오 ID
   * @param repeatIndex 반복 회차
   * @param nodeId 노드 ID
   * @param type 스크린샷 타입
   */
  private async _captureAndStoreScreenshot(
    executionId: string,
    deviceId: string,
    scenarioId: string,
    repeatIndex: number,
    nodeId: string,
    type: 'step' | 'final' | 'failed' | 'highlight'
  ): Promise<ScreenshotInfo | null> {
    const state = this.activeExecutions.get(executionId);
    if (!state) return null;

    try {
      const screenshot = await testReportService.captureScreenshot(
        state.reportId,
        deviceId,
        nodeId,
        type
      );

      if (screenshot) {
        // 스크린샷 맵 초기화
        if (!state.deviceScreenshots.has(deviceId)) {
          state.deviceScreenshots.set(deviceId, new Map());
        }
        const deviceMap = state.deviceScreenshots.get(deviceId)!;

        const scenarioKey = `${scenarioId}-${repeatIndex}`;
        if (!deviceMap.has(scenarioKey)) {
          deviceMap.set(scenarioKey, []);
        }
        deviceMap.get(scenarioKey)!.push(screenshot);

        return screenshot;
      }
    } catch (err) {
      logger.error(`[TestExecutor] 스크린샷 캡처 실패:`, err as Error);
    }

    return null;
  }

  /**
   * 디바이스 표시 이름 조회 (alias > model > deviceId)
   * @param executionId 실행 ID (생략 시 currentExecutionId 사용)
   */
  private _getDeviceName(deviceId: string, executionId?: string): string {
    const execId = executionId || this.currentExecutionId;
    if (execId) {
      const state = this.activeExecutions.get(execId);
      if (state) {
        return state.deviceNames.get(deviceId) || deviceId;
      }
    }
    return deviceId;
  }

  /**
   * 실행 중 여부 확인
   */
  isRunning(): boolean {
    return this.activeExecutions.size > 0;
  }

  /**
   * 특정 실행이 진행 중인지 확인
   */
  isExecutionRunning(executionId: string): boolean {
    return this.activeExecutions.has(executionId);
  }

  /**
   * 활성 실행 수 조회
   */
  getActiveExecutionCount(): number {
    return this.activeExecutions.size;
  }

  /**
   * 모든 활성 실행 ID 조회
   */
  getActiveExecutionIds(): string[] {
    return Array.from(this.activeExecutions.keys());
  }

  /**
   * 실행 상태 조회 (하위 호환성 유지)
   * @param executionId 특정 실행 ID (생략 시 첫 번째 활성 실행)
   */
  getStatus(executionId?: string): TestExecutionStatus {
    // 특정 실행 ID가 주어지면 해당 실행 상태 반환
    const execId = executionId || this.currentExecutionId || Array.from(this.activeExecutions.keys())[0];

    if (!execId) {
      return {
        isRunning: false,
        progress: { completed: 0, total: 0, percentage: 0 },
      };
    }

    const state = this.activeExecutions.get(execId);
    if (!state) {
      return {
        isRunning: false,
        executionId: execId,
        progress: { completed: 0, total: 0, percentage: 0 },
      };
    }

    const total = state.scenarioQueue.length * state.deviceIds.length;
    let completed = 0;

    state.deviceProgress.forEach(progress => {
      completed += progress.completedScenarios + progress.failedScenarios;
    });

    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    // 현재 실행 중인 디바이스들의 시나리오 정보
    let currentScenario: TestExecutionStatus['currentScenario'] | undefined;
    for (const progress of state.deviceProgress.values()) {
      if (progress.status === 'running') {
        currentScenario = {
          scenarioId: progress.currentScenarioId,
          scenarioName: progress.currentScenarioName,
          order: progress.currentScenarioIndex + 1,
          repeatIndex: 1,
        };
        break;
      }
    }

    return {
      isRunning: true,
      executionId: execId,
      currentScenario,
      progress: {
        completed,
        total,
        percentage,
      },
      startedAt: state.startedAt?.toISOString(),
    };
  }

  /**
   * 시나리오 큐 생성 (반복 횟수 적용)
   * @returns { queue: 시나리오 큐, skippedIds: 찾을 수 없는 시나리오 ID 목록 }
   */
  private async buildQueue(
    scenarioIds: string[],
    repeatCount: number
  ): Promise<{ queue: ScenarioQueueItem[]; skippedIds: string[] }> {
    const queue: ScenarioQueueItem[] = [];

    // 시나리오 정보 조회 (병렬)
    const scenarioResults = await Promise.allSettled(
      scenarioIds.map(id => scenarioService.getById(id))
    );

    const scenarios: Awaited<ReturnType<typeof scenarioService.getById>>[] = [];
    const skippedIds: string[] = [];

    for (let i = 0; i < scenarioResults.length; i++) {
      const result = scenarioResults[i];
      if (result.status === 'fulfilled') {
        scenarios.push(result.value);
      } else {
        skippedIds.push(scenarioIds[i]);
        logger.warn(`[TestExecutor] 시나리오를 찾을 수 없음 (건너뛰기): ${scenarioIds[i]}`);
      }
    }

    if (skippedIds.length > 0) {
      logger.warn(`[TestExecutor] ${skippedIds.length}개 시나리오를 찾을 수 없어 건너뜁니다: ${skippedIds.join(', ')}`);
    }

    if (scenarios.length === 0) {
      throw new Error('유효한 시나리오가 없습니다. 시나리오가 삭제되었을 수 있습니다.');
    }

    // 고유한 packageId, categoryId 수집
    const uniquePackageIds = new Set<string>();
    const uniqueCategoryKeys = new Set<string>(); // "packageId:categoryId" 형태

    for (const scenario of scenarios) {
      if (scenario?.packageId) uniquePackageIds.add(scenario.packageId);
      if (scenario?.packageId && scenario?.categoryId) {
        uniqueCategoryKeys.add(`${scenario.packageId}:${scenario.categoryId}`);
      }
    }

    // 패키지 정보 병렬 조회
    const packageCache = new Map<string, { id: string; name: string; packageName: string }>();
    const packagePromises = Array.from(uniquePackageIds).map(async (pkgId) => {
      try {
        const pkgData = await packageService.getById(pkgId);
        packageCache.set(pkgId, { id: pkgData.id, name: pkgData.name, packageName: pkgData.packageName });
      } catch {
        packageCache.set(pkgId, { id: pkgId, name: '알 수 없음', packageName: '' });
      }
    });

    // 카테고리 정보 병렬 조회
    const categoryCache = new Map<string, { id: string; name: string }>();
    const categoryPromises = Array.from(uniqueCategoryKeys).map(async (key) => {
      const [pkgId, catId] = key.split(':');
      try {
        const catData = await categoryService.getById(pkgId, catId);
        if (catData) {
          categoryCache.set(catId, { id: catData.id, name: catData.name });
        } else {
          categoryCache.set(catId, { id: catId, name: '알 수 없음' });
        }
      } catch {
        categoryCache.set(catId, { id: catId, name: '알 수 없음' });
      }
    });

    // 패키지/카테고리 정보 병렬 조회 대기
    await Promise.all([...packagePromises, ...categoryPromises]);

    let order = 1;

    // 반복 횟수만큼 시나리오 추가 (이미 캐시된 정보 사용)
    for (let repeatIndex = 1; repeatIndex <= repeatCount; repeatIndex++) {
      for (const scenario of scenarios) {
        if (!scenario) continue;

        const pkg = packageCache.get(scenario.packageId);
        const category = categoryCache.get(scenario.categoryId);

        queue.push({
          scenarioId: scenario.id,
          scenarioName: scenario.name,
          packageId: pkg?.id || '',
          packageName: pkg?.name || '',
          appPackage: pkg?.packageName || '',
          categoryId: category?.id || '',
          categoryName: category?.name || '',
          order: order++,
          repeatIndex,
        });
      }
    }

    return { queue, skippedIds };
  }

  /**
   * 테스트 실행 (메인 진입점)
   * 각 디바이스가 독립적으로 시나리오 세트를 실행합니다.
   *
   * @param request 테스트 실행 요청
   * @param options 실행 옵션 (다중 사용자 지원)
   *   - executionId: 외부에서 지정한 실행 ID (생략 시 자동 생성)
   */
  async execute(
    request: TestExecutionRequest,
    options?: {
      executionId?: string;
    }
  ): Promise<TestExecutionResult> {
    // 유효성 검사
    if (!request.deviceIds || request.deviceIds.length === 0) {
      throw new Error('테스트할 디바이스를 선택해주세요.');
    }

    if (!request.scenarioIds || request.scenarioIds.length === 0) {
      throw new Error('테스트할 시나리오를 선택해주세요.');
    }

    // 실행 ID 생성 또는 사용
    const executionId = options?.executionId || `test-${Date.now()}`;

    // 즉시 준비 중 이벤트 발송 (UI 빠른 피드백)
    this._emit('test:preparing', {
      executionId,
      deviceIds: request.deviceIds,
      scenarioIds: request.scenarioIds,
      message: '테스트 준비 중...',
    });

    // 디바이스 정보 조회와 시나리오 큐 생성을 병렬로 시작
    const devicesPromise = deviceManager.getMergedDeviceList();
    const queuePromise = this.buildQueue(request.scenarioIds, request.repeatCount || 1);

    // 디바이스 정보와 큐 생성 병렬 대기 (세션 검증 전에 완료)
    const [devices, queueResult] = await Promise.all([devicesPromise, queuePromise]);
    const { queue, skippedIds } = queueResult;

    // 큐가 비어있으면 세션 검증 없이 종료 (불필요한 세션 생성 방지)
    if (queue.length === 0) {
      throw new Error('실행할 시나리오가 없습니다.');
    }

    // 세션 유효성 검증 및 재생성 (큐 생성 성공 후에만 실행)
    logger.info(`[TestExecutor] [${executionId}] 세션 유효성 검증 시작...`);
    this._emit('test:session:validating', {
      executionId,
      deviceIds: request.deviceIds,
      message: '세션 유효성 검증 중...',
    });

    const validationResult = await sessionManager.validateAndEnsureSessions(request.deviceIds, devices);

    // 검증 결과 이벤트 전송
    if (validationResult.recreatedDeviceIds.length > 0) {
      this._emit('test:session:recreated', {
        executionId,
        deviceIds: validationResult.recreatedDeviceIds,
        message: `${validationResult.recreatedDeviceIds.length}개 디바이스 세션 재생성됨`,
      });
    }

    if (validationResult.failedDeviceIds.length > 0) {
      this._emit('test:session:failed', {
        executionId,
        deviceIds: validationResult.failedDeviceIds,
        message: `${validationResult.failedDeviceIds.length}개 디바이스 세션 생성 실패`,
      });
    }

    // 유효한 세션이 있는 디바이스만 테스트 진행
    const validDeviceIds = [
      ...validationResult.validatedDeviceIds,
      ...validationResult.recreatedDeviceIds,
    ];

    if (validDeviceIds.length === 0) {
      throw new Error('유효한 세션이 있는 디바이스가 없습니다. 디바이스 연결 상태를 확인해주세요.');
    }

    logger.info(`[TestExecutor] [${executionId}] 세션 검증 완료: ${validDeviceIds.length}개 유효, ${validationResult.failedDeviceIds.length}개 실패`);

    // 리포트 ID 사전 생성 (스크린샷 저장용)
    const reportId = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // 실행 상태 생성
    const state: ExecutionState = {
      executionId,
      reportId,
      request,
      stopRequested: false,
      scenarioQueue: queue,
      deviceProgress: new Map(),
      deviceNames: new Map(),
      startedAt: new Date(),
      deviceIds: validDeviceIds,
      scenarioInterval: request.scenarioInterval || 0,
      deviceScreenshots: new Map(),  // 스크린샷 저장소 초기화
      deviceVideos: new Map(),  // 비디오 저장소 초기화 (시나리오별)
      // QA 확장 데이터 저장소
      deviceEnvironments: new Map(),  // deviceId -> DeviceEnvironment
      deviceAppInfos: new Map(),  // deviceId -> packageName -> AppInfo
    };

    // 디바이스 표시 이름 초기화 (alias > model > id)
    for (const device of devices) {
      const displayName = (device as { alias?: string }).alias || device.model || device.id;
      state.deviceNames.set(device.id, displayName);
    }

    // 활성 실행에 등록
    this.activeExecutions.set(executionId, state);
    this.currentExecutionId = executionId;

    // 이미지 매칭 이벤트 컨텍스트 등록 (하이라이트 스크린샷 저장용)
    for (const deviceId of validDeviceIds) {
      imageMatchEmitter.registerContext(deviceId, reportId);
    }

    // 하이라이트 스크린샷 저장 완료 리스너
    const screenshotSavedHandler = (data: {
      deviceId: string;
      nodeId: string;
      templateId: string;
      confidence: number;
      path: string;
      timestamp: string;
      type: 'highlight';
    }) => {
      // 현재 실행 중인 시나리오 키 찾기
      const progress = state.deviceProgress.get(data.deviceId);
      if (!progress) return;

      // currentScenarioIndex를 사용하여 정확한 repeatIndex 조회 (반복 실행 시 중복 방지)
      const currentQueueItem = state.scenarioQueue[progress.currentScenarioIndex];
      const scenarioKey = `${progress.currentScenarioId}-${currentQueueItem?.repeatIndex || 0}`;

      // 스크린샷 정보 저장
      let deviceMap = state.deviceScreenshots.get(data.deviceId);
      if (!deviceMap) {
        deviceMap = new Map();
        state.deviceScreenshots.set(data.deviceId, deviceMap);
      }

      let screenshots = deviceMap.get(scenarioKey);
      if (!screenshots) {
        screenshots = [];
        deviceMap.set(scenarioKey, screenshots);
      }

      screenshots.push({
        nodeId: data.nodeId,
        timestamp: data.timestamp,
        path: data.path,
        type: data.type,
        templateId: data.templateId,
        confidence: data.confidence,
      });

      logger.info(`[TestExecutor] [${executionId}] 하이라이트 스크린샷 등록: ${data.deviceId}/${data.nodeId}`);
    };

    imageMatchEmitter.onScreenshotSaved(screenshotSavedHandler);

    // 건너뛴 시나리오가 있으면 알림 이벤트 전송
    if (skippedIds.length > 0) {
      this._emit('test:scenarios:skipped', {
        executionId,
        skippedIds,
        message: `${skippedIds.length}개 시나리오를 찾을 수 없어 건너뜁니다: ${skippedIds.join(', ')}`,
      });
    }

    logger.info(`[TestExecutor] [${executionId}] 테스트 시작: ${state.scenarioQueue.length}개 시나리오 × ${validDeviceIds.length}개 디바이스`);

    // 이전 중지 상태 리셋 (이전 테스트에서 중지된 상태가 남아있을 수 있음)
    this.resetActionsOnDevices(validDeviceIds);

    // 디바이스별 진행 상태 초기화
    for (const deviceId of validDeviceIds) {
      state.deviceProgress.set(deviceId, {
        deviceId,
        deviceName: this._getDeviceName(deviceId, executionId),
        currentScenarioIndex: 0,
        totalScenarios: state.scenarioQueue.length,
        currentScenarioId: '',
        currentScenarioName: '',
        status: 'running',
        completedScenarios: 0,
        failedScenarios: 0,
      });
    }

    // 테스트 시작 이벤트
    this._emit('test:start', {
      executionId,
      request: {
        ...request,
        deviceIds: validDeviceIds,
      },
      queue: state.scenarioQueue,
      totalScenarios: state.scenarioQueue.length,
      totalDevices: validDeviceIds.length,
    });

    try {
      // 각 디바이스가 독립적으로 시나리오 세트 실행 (병렬)
      const deviceResults = await Promise.allSettled(
        validDeviceIds.map(deviceId => this.executeDeviceScenarios(executionId, deviceId))
      );

      const completedAt = new Date();
      const totalDuration = completedAt.getTime() - state.startedAt.getTime();

      // 결과 집계
      const scenarioResultsMap = new Map<string, ScenarioExecutionSummary>();

      // deviceResults에서 각 디바이스의 결과를 시나리오별로 그룹화
      for (let i = 0; i < deviceResults.length; i++) {
        const result = deviceResults[i];
        const deviceId = validDeviceIds[i];

        if (result.status === 'fulfilled') {
          for (const scenarioResult of result.value) {
            const key = `${scenarioResult.scenarioId}-${scenarioResult.repeatIndex}`;
            let summary = scenarioResultsMap.get(key);

            if (!summary) {
              summary = {
                scenarioId: scenarioResult.scenarioId,
                scenarioName: scenarioResult.scenarioName,
                packageId: scenarioResult.packageId,
                packageName: scenarioResult.packageName,
                appPackage: scenarioResult.appPackage,
                categoryId: scenarioResult.categoryId,
                categoryName: scenarioResult.categoryName,
                repeatIndex: scenarioResult.repeatIndex,
                deviceResults: [],
                duration: 0,
                status: 'passed',
              };
              scenarioResultsMap.set(key, summary);
            }

            summary.deviceResults.push({
              deviceId,
              deviceName: this._getDeviceName(deviceId, executionId),
              success: scenarioResult.success,
              duration: scenarioResult.duration,
              error: scenarioResult.error,
              steps: scenarioResult.steps,
            });

            summary.duration = Math.max(summary.duration, scenarioResult.duration);
            if (!scenarioResult.success) {
              summary.status = 'failed';
            }
          }
        }
      }

      const scenarioResults = Array.from(scenarioResultsMap.values());

      // 요약 통계 계산
      const passedScenarios = scenarioResults.filter(r => r.status === 'passed').length;
      const failedScenarios = scenarioResults.filter(r => r.status === 'failed').length;
      const skippedScenarios = scenarioResults.filter(r => r.status === 'skipped').length;

      // 최종 결과
      const finalResult: TestExecutionResult = {
        id: executionId,
        request: {
          ...request,
          deviceIds: validDeviceIds,
        },
        scenarioResults,
        summary: {
          totalScenarios: scenarioResults.length,
          passedScenarios,
          failedScenarios,
          skippedScenarios,
          totalDevices: validDeviceIds.length,
          totalDuration,
        },
        startedAt: state.startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        status: state.stopRequested
          ? 'stopped'
          : failedScenarios > 0
            ? (passedScenarios > 0 ? 'partial' : 'failed')
            : 'completed',
      };

      // ========== 통합 리포트 생성 ==========
      try {
        // ScenarioExecutionSummary를 ScenarioReportResult로 변환
        const reportScenarioResults: ScenarioReportResult[] = scenarioResults.map((summary, index) => {
          // 디바이스 결과를 DeviceScenarioResult로 변환
          const deviceResults: DeviceScenarioResult[] = summary.deviceResults.map(dr => {
            // 스크린샷 조회 (deviceId + scenarioKey)
            const scenarioKey = `${summary.scenarioId}-${summary.repeatIndex}`;
            const deviceScreenshotMap = state.deviceScreenshots.get(dr.deviceId);
            const screenshots = deviceScreenshotMap?.get(scenarioKey) || [];

            // 비디오 조회 (시나리오별)
            const deviceVideoMap = state.deviceVideos.get(dr.deviceId);
            const video = deviceVideoMap?.get(scenarioKey);

            // ========== QA 확장: 환경/앱 정보 조회 ==========
            const environment = state.deviceEnvironments.get(dr.deviceId);
            const appInfoMap = state.deviceAppInfos.get(dr.deviceId);
            const appInfo = appInfoMap?.get(summary.appPackage);

            // ========== QA 확장: 성능 요약 계산 ==========
            const performanceSummary = this._calculatePerformanceSummary(dr.steps);

            return {
              deviceId: dr.deviceId,
              deviceName: dr.deviceName || this._getDeviceName(dr.deviceId, executionId),
              success: dr.success,
              status: dr.success ? 'completed' as const : 'failed' as const,
              duration: dr.duration,
              error: dr.error,
              steps: dr.steps,
              screenshots,
              video,
              // QA 확장 필드
              environment,
              appInfo,
              performanceSummary,
            };
          });

          // 시나리오 상태 결정
          const allPassed = deviceResults.every(d => d.success);
          const allFailed = deviceResults.every(d => !d.success);
          const scenarioStatus = allPassed
            ? 'passed' as const
            : allFailed
              ? 'failed' as const
              : 'partial' as const;

          return {
            scenarioId: summary.scenarioId,
            scenarioName: summary.scenarioName,
            packageId: summary.packageId,
            packageName: summary.packageName,
            categoryId: summary.categoryId || '',
            categoryName: summary.categoryName || '',
            order: index + 1,
            repeatIndex: summary.repeatIndex,
            deviceResults,
            duration: summary.duration,
            status: scenarioStatus,
            startedAt: state.startedAt.toISOString(),  // 시나리오별 시작 시간은 별도 추적 필요
            completedAt: completedAt.toISOString(),
          };
        });

        // 실행 정보 구성
        const executionInfo: TestExecutionInfo = {
          testName: request.testName,
          requesterName: request.requesterName,
          requesterSocketId: request.requesterSocketId,
          splitExecution: false,  // TODO: 분할 실행 지원 시 설정
          forceCompleted: false,
          queueId: request.queueId,
        };

        // 리포트 생성
        const report = await testReportService.create(
          executionId,
          executionInfo,
          request.deviceIds,
          request.scenarioIds,
          request.repeatCount || 1,
          reportScenarioResults,
          state.startedAt,
          completedAt
        );

        logger.info(`[TestExecutor] [${executionId}] 리포트 생성 완료: ${report.id}`);

        // 메트릭 수집 (비동기로 처리, 실패해도 테스트 결과에 영향 없음)
        metricsCollector.collect(report).catch((err) => {
          logger.error(`[TestExecutor] [${executionId}] 메트릭 수집 실패:`, err as Error);
        });

        // 리포트 생성 이벤트 (프론트엔드 자동 새로고침용)
        this._emit('report:created', {
          reportId: report.id,
          executionId,
          scenarioCount: request.scenarioIds.length,
          deviceCount: request.deviceIds.length,
        });

        // 리포트 ID를 결과에 추가
        (finalResult as TestExecutionResult & { reportId?: string }).reportId = report.id;

        // Slack 알림 전송 (비동기, 실패해도 테스트 결과에 영향 없음)
        slackNotificationService.notifyTestComplete(report, {
          reportUrl: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reports/${report.id}`,
          requesterSlackId: request.requesterSlackId,
        }).catch((err) => {
          logger.error(`[TestExecutor] [${executionId}] Slack 알림 전송 실패:`, err as Error);
        });

      } catch (reportErr) {
        logger.error(`[TestExecutor] [${executionId}] 리포트 생성 실패:`, reportErr as Error);
        // 리포트 생성 실패는 테스트 결과에 영향을 주지 않음
      }

      // 테스트 완료 이벤트
      this._emit('test:complete', {
        executionId,
        result: finalResult,
      });

      logger.info(`[TestExecutor] [${executionId}] 테스트 완료: ${passedScenarios}/${scenarioResults.length} 성공, ${totalDuration}ms`);

      return finalResult;

    } finally {
      // 이미지 매칭 이벤트 컨텍스트 해제 및 리스너 제거
      for (const deviceId of validDeviceIds) {
        imageMatchEmitter.unregisterContext(deviceId);
      }
      imageMatchEmitter.offScreenshotSaved(screenshotSavedHandler);

      // 활성 실행에서 제거
      this.activeExecutions.delete(executionId);

      // 현재 실행 ID 정리 (이 실행이 currentExecutionId였다면)
      if (this.currentExecutionId === executionId) {
        // 다른 활성 실행이 있으면 그것으로, 없으면 null
        const remainingIds = Array.from(this.activeExecutions.keys());
        this.currentExecutionId = remainingIds.length > 0 ? remainingIds[0] : null;
      }
    }
  }

  /**
   * 단일 디바이스의 시나리오 세트 실행
   * 해당 디바이스에서 모든 시나리오를 순차적으로 실행합니다.
   *
   * @param executionId 실행 ID
   * @param deviceId 디바이스 ID
   */
  private async executeDeviceScenarios(executionId: string, deviceId: string): Promise<Array<{
    scenarioId: string;
    scenarioName: string;
    packageId: string;
    packageName: string;
    appPackage: string;
    categoryId: string;
    categoryName: string;
    repeatIndex: number;
    success: boolean;
    duration: number;
    error?: string;
    steps: StepResult[];
  }>> {
    const results: Array<{
      scenarioId: string;
      scenarioName: string;
      packageId: string;
      packageName: string;
      appPackage: string;
      categoryId: string;
      categoryName: string;
      repeatIndex: number;
      success: boolean;
      duration: number;
      error?: string;
      steps: StepResult[];
    }> = [];

    // 실행 상태 조회
    const state = this.activeExecutions.get(executionId);
    if (!state) return results;

    const progress = state.deviceProgress.get(deviceId);
    if (!progress) return results;

    // 디바이스 시작 이벤트
    this._emit('test:device:start', {
      executionId,
      deviceId,
      deviceName: this._getDeviceName(deviceId, executionId),
      totalScenarios: state.scenarioQueue.length,
    });

    // ========== QA 확장: 환경 정보 수집 ==========
    const deviceEnv = await this.collectDeviceEnvironment(deviceId);
    if (deviceEnv) {
      state.deviceEnvironments.set(deviceId, deviceEnv);
    }

    // 이 디바이스에서 수집한 앱 정보 캐시 (중복 수집 방지)
    const collectedApps = new Set<string>();

    for (let i = 0; i < state.scenarioQueue.length; i++) {
      // 중지 요청 확인
      if (state.stopRequested) {
        progress.status = 'stopped';
        logger.info(`[TestExecutor] [${executionId}] 디바이스 ${deviceId}: 중지됨 (${i}/${state.scenarioQueue.length})`);
        break;
      }

      const queueItem = state.scenarioQueue[i];
      const scenarioKey = `${queueItem.scenarioId}-${queueItem.repeatIndex}`;

      // 진행 상태 업데이트
      progress.currentScenarioIndex = i;
      progress.currentScenarioId = queueItem.scenarioId;
      progress.currentScenarioName = queueItem.scenarioName;

      // ========== QA 확장: 앱 정보 수집 (새 패키지일 때만) ==========
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

      // ========== 시나리오별 비디오 녹화 설정 (launchApp 후 시작) ==========
      const ENABLE_RECORDING = true;
      let recordingStartTime = 0;
      let isRecording = false;
      let recordingMethod: 'adb' | 'deviceApp' | null = null;

      // launchApp 실행 후 호출될 녹화 시작 콜백
      const startRecordingCallback = async (): Promise<void> => {
        // 이미 녹화 중이면 무시 (첫 번째 launchApp에서만 시작)
        if (isRecording || !ENABLE_RECORDING) return;

        try {
          // 녹화 방식 우선순위: Device App > ADB
          // Device App: 시간 제한 없음, Appium 세션 독립적, 가로/세로 자동 감지
          // ADB screenrecord: 3분 제한
          const deviceAppAvailable = await screenRecorder.isDeviceAppAvailable(deviceId);
          const deviceAppServiceRunning = deviceAppAvailable
            ? await screenRecorder.isDeviceAppServiceRunning(deviceId)
            : false;

          let result;
          if (deviceAppServiceRunning) {
            // Device App 사용 (가로/세로 자동 감지)
            result = await screenRecorder.startRecording(deviceId, {
              useDeviceApp: true,
              bitrate: 2,  // 2Mbps
            });
          } else {
            // ADB screenrecord 사용 (3분 제한, 가로/세로 자동 감지)
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
            logger.info(`[TestExecutor] [${executionId}] 디바이스 ${deviceId}: 시나리오 ${queueItem.scenarioName} 비디오 녹화 시작 (${recordingMethod}, launchApp 후)`);
          } else {
            logger.warn(`[TestExecutor] [${executionId}] 디바이스 ${deviceId}: 비디오 녹화 시작 실패: ${result.error}`);
          }
        } catch (recordErr) {
          logger.warn(`[TestExecutor] [${executionId}] 디바이스 ${deviceId}: 비디오 녹화 시작 실패: ${(recordErr as Error).message}`);
        }
      };

      if (!ENABLE_RECORDING) {
        logger.info(`[TestExecutor] [${executionId}] 디바이스 ${deviceId}: 녹화 비활성화됨`);
      }

      // 시나리오 시작 이벤트 (디바이스별)
      this._emit('test:device:scenario:start', {
        executionId,
        deviceId,
        deviceName: this._getDeviceName(deviceId, executionId),
        scenarioId: queueItem.scenarioId,
        scenarioName: queueItem.scenarioName,
        packageName: queueItem.packageName,
        appPackage: queueItem.appPackage,
        categoryName: queueItem.categoryName,
        repeatIndex: queueItem.repeatIndex,
        order: i + 1,
        total: state.scenarioQueue.length,
      });

      logger.info(`[TestExecutor] [${executionId}] 디바이스 ${deviceId}: 시나리오 [${i + 1}/${state.scenarioQueue.length}] ${queueItem.scenarioName}`);

      // 단일 시나리오 실행 (launchApp 후 녹화 시작 콜백 전달)
      const result = await this.executeSingleScenarioOnDevice(executionId, deviceId, queueItem, startRecordingCallback);
      results.push(result);

      if (result.success) {
        progress.completedScenarios++;
      } else {
        progress.failedScenarios++;
      }

      // ========== 시나리오별 비디오 녹화 종료 및 저장 ==========
      if (isRecording) {
        try {
          const recordingDuration = Date.now() - recordingStartTime;  // ms 단위

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
              // 시나리오별 비디오 저장 (deviceId -> scenarioKey -> VideoInfo)
              if (!state.deviceVideos.has(deviceId)) {
                state.deviceVideos.set(deviceId, new Map());
              }
              state.deviceVideos.get(deviceId)!.set(scenarioKey, videoInfo);
              logger.info(`[TestExecutor] [${executionId}] 디바이스 ${deviceId}: 시나리오 ${queueItem.scenarioName} 비디오 저장 완료 (${recordingMethod}, ${Math.round(recordingDuration / 1000)}초)`);
            }
          } else {
            logger.warn(`[TestExecutor] [${executionId}] 디바이스 ${deviceId}: 비디오 녹화 중지 실패: ${stopResult.error}`);
          }
        } catch (stopErr) {
          logger.warn(`[TestExecutor] [${executionId}] 디바이스 ${deviceId}: 비디오 녹화 종료 실패: ${(stopErr as Error).message}`);
        }
      }

      // 시나리오 완료 이벤트 (디바이스별)
      this._emit('test:device:scenario:complete', {
        executionId,
        deviceId,
        deviceName: this._getDeviceName(deviceId, executionId),
        scenarioId: queueItem.scenarioId,
        scenarioName: queueItem.scenarioName,
        repeatIndex: queueItem.repeatIndex,
        order: i + 1,
        status: result.success ? 'passed' : 'failed',
        duration: result.duration,
        error: result.error,
      });

      // 전체 진행률 업데이트
      this._emitOverallProgress(executionId);

      // 실패 시 해당 디바이스 중단 (옵션으로 변경 가능)
      if (!result.success) {
        progress.status = 'failed';
        logger.info(`[TestExecutor] [${executionId}] 디바이스 ${deviceId}: 시나리오 실패로 중단 - ${queueItem.scenarioName}`);
        break;
      }

      // 시나리오 간 인터벌 (마지막 시나리오가 아닐 경우)
      if (state.scenarioInterval > 0 && i < state.scenarioQueue.length - 1 && !state.stopRequested) {
        logger.info(`[TestExecutor] [${executionId}] 디바이스 ${deviceId}: ${state.scenarioInterval}ms 대기 후 다음 시나리오 시작`);
        await this._delay(state.scenarioInterval);
      }
    }

    // 디바이스 완료 처리
    if (progress.status === 'running') {
      progress.status = 'completed';
    }

    // 디바이스 완료 이벤트
    this._emit('test:device:complete', {
      executionId,
      deviceId,
      deviceName: this._getDeviceName(deviceId, executionId),
      status: progress.status,
      completedScenarios: progress.completedScenarios,
      failedScenarios: progress.failedScenarios,
      totalScenarios: state.scenarioQueue.length,
    });

    // 디바이스 완료 후 전체 진행률 업데이트 (status가 completed로 바뀐 후)
    this._emitOverallProgress(executionId);

    return results;
  }

  /**
   * 전체 진행률 이벤트 emit
   * @param executionId 실행 ID
   */
  private _emitOverallProgress(executionId: string): void {
    const state = this.activeExecutions.get(executionId);
    if (!state) return;

    const total = state.scenarioQueue.length * state.deviceIds.length;
    let completed = 0;

    state.deviceProgress.forEach(progress => {
      completed += progress.completedScenarios + progress.failedScenarios;
    });

    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    logger.info(`[TestExecutor] [${executionId}] 진행률: ${completed}/${total} (${percentage}%) - scenarioQueue: ${state.scenarioQueue.length}, devices: ${state.deviceIds.length}`);

    this._emit('test:progress', {
      executionId,
      completed,
      total,
      percentage,
      deviceProgress: Array.from(state.deviceProgress.values()),
    });
  }

  /**
   * 스텝 성능 메트릭 빌드
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

    // 이미지 매칭 정보
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
   * 다음 실행할 노드 찾기
   */
  private _findNextNode(
    currentNode: ExecutionNode,
    connections: Array<{ from: string; to: string; label?: string; branch?: string }>
  ): string | null {
    if (currentNode.type === 'condition') {
      // 조건 노드: 평가 결과에 따라 분기 선택
      const conditionResult = (currentNode as ExecutionNode & { _conditionResult?: boolean })._conditionResult;
      const branchLabel = conditionResult ? 'yes' : 'no';

      // label 또는 branch 속성 지원
      let nextConnection = connections.find(
        c => c.from === currentNode.id && (c.label === branchLabel || c.branch === branchLabel)
      );

      // 분기 연결이 없으면 기본 연결 시도
      if (!nextConnection) {
        nextConnection = connections.find(c => c.from === currentNode.id);
      }

      return nextConnection?.to || null;
    }

    // 일반 노드: 첫 번째 연결
    const nextConnection = connections.find(c => c.from === currentNode.id);
    return nextConnection?.to || null;
  }

  /**
   * 단일 디바이스에서 단일 시나리오 실행
   *
   * @param executionId 실행 ID
   * @param deviceId 디바이스 ID
   * @param queueItem 시나리오 큐 항목
   */
  private async executeSingleScenarioOnDevice(
    executionId: string,
    deviceId: string,
    queueItem: ScenarioQueueItem,
    onLaunchApp?: () => Promise<void>
  ): Promise<{
    scenarioId: string;
    scenarioName: string;
    packageId: string;
    packageName: string;
    appPackage: string;
    categoryId: string;
    categoryName: string;
    repeatIndex: number;
    success: boolean;
    duration: number;
    error?: string;
    steps: StepResult[];
  }> {
    const startTime = Date.now();
    const steps: StepResult[] = [];

    // 실행 상태 조회 (중지 요청 확인용)
    const state = this.activeExecutions.get(executionId);

    try {
      // 시나리오 로드
      const scenario = await scenarioService.getById(queueItem.scenarioId);
      if (!scenario) {
        throw new Error(`시나리오를 찾을 수 없습니다: ${queueItem.scenarioId}`);
      }

      // Actions 인스턴스 가져오기
      const actions = sessionManager.getActions(deviceId);
      if (!actions) {
        throw new Error(`디바이스 세션이 없습니다: ${deviceId}`);
      }

      // 시나리오의 노드들을 실행
      const nodes = scenario.nodes || [];
      const connections = scenario.connections || [];

      // Start 노드 찾기
      const startNode = nodes.find(n => n.type === 'start');
      if (!startNode) {
        throw new Error('Start 노드가 없습니다.');
      }

      // 노드 실행 (간단한 순차 실행)
      let currentNodeId: string | null = startNode.id;
      const visited = new Set<string>();

      while (currentNodeId && !state?.stopRequested) {
        if (visited.has(currentNodeId)) {
          logger.warn(`[TestExecutor] [${executionId}] 순환 감지: ${currentNodeId}`);
          break;
        }
        visited.add(currentNodeId);

        const currentNode = nodes.find(n => n.id === currentNodeId);
        if (!currentNode) break;

        const stepStartTime = Date.now();
        let stepStatus: 'passed' | 'failed' | 'error' = 'passed';
        let stepError: string | undefined;
        let stepFailureAnalysis: StepResult['failureAnalysis'];
        let stepPerformance: StepResult['performance'];

        // 대기 액션인지 확인
        const waitActions = [
          'waitUntilExists', 'waitUntilGone',
          'waitUntilTextExists', 'waitUntilTextGone',
          'waitUntilImage', 'waitUntilImageGone'
        ];
        const actionType = currentNode.params?.actionType as string | undefined;
        const isWaitAction: boolean = currentNode.type === 'action' &&
          !!actionType &&
          waitActions.includes(actionType);

        // 노드 실행 시작 이벤트
        this._emit('test:device:node', {
          executionId,
          deviceId,
          deviceName: this._getDeviceName(deviceId, executionId),
          scenarioId: queueItem.scenarioId,
          nodeId: currentNode.id,
          nodeName: currentNode.label || currentNode.type,
          status: 'running',
        });

        // 대기 액션인 경우: waiting 상태 먼저 기록
        if (isWaitAction) {
          const waitingTime = new Date().toISOString();
          steps.push({
            nodeId: currentNode.id,
            nodeName: currentNode.label || currentNode.type,
            nodeType: currentNode.type,
            status: 'waiting',
            startTime: waitingTime,
          });

          this._emit('test:device:node', {
            executionId,
            deviceId,
            deviceName: this._getDeviceName(deviceId, executionId),
            scenarioId: queueItem.scenarioId,
            nodeId: currentNode.id,
            nodeName: currentNode.label || currentNode.type,
            status: 'waiting',
          });
        }

        // 액션 결과 (이미지 매칭 메트릭 포함)
        let actionResult: ActionResult | null = null;

        try {
          // 노드 타입별 실행
          if (currentNode.type === 'action') {
            // 이미지 매칭 하이라이트 스크린샷은 이벤트 기반으로 저장됨 (screenshotEventService)
            actionResult = await this.executeActionNode(actions, currentNode, queueItem.appPackage);

            // launchApp 실행 후 콜백 호출 (녹화 시작용)
            if (actionType === 'launchApp' && onLaunchApp) {
              // 앱이 완전히 실행되고 화면 방향이 안정화될 때까지 대기
              await this._delay(1000);
              await onLaunchApp();
            }
          } else if (currentNode.type === 'condition') {
            // 조건 노드 평가
            const conditionResult = await this.evaluateCondition(actions, currentNode);
            // 결과를 노드에 임시 저장 (분기 결정용)
            (currentNode as ExecutionNode & { _conditionResult?: boolean })._conditionResult = conditionResult;
            logger.info(`[TestExecutor] [${executionId}] 조건 평가 결과: ${conditionResult ? 'yes' : 'no'}`);
          }
          // start, end 노드는 실행할 게 없음
        } catch (err) {
          const error = err as Error;
          stepStatus = 'failed';
          stepError = error.message;
          logger.error(`[TestExecutor] [${executionId}] 디바이스 ${deviceId}, 노드 ${currentNode.id} 실패: ${error.message}`);

          // ========== QA 확장: 실패 분석 ==========
          try {
            const prevStep = steps.length > 0 ? steps[steps.length - 1] : undefined;
            stepFailureAnalysis = this.analyzeFailure(
              error,
              actionType || currentNode.type,
              currentNode.params as Record<string, unknown>,
              prevStep?.nodeName
            );
          } catch (analyzeErr) {
            logger.warn(`[TestExecutor] [${executionId}] 실패 분석 오류: ${(analyzeErr as Error).message}`);
          }

          // 실패 시 스크린샷 캡처
          await this._captureAndStoreScreenshot(
            executionId,
            deviceId,
            queueItem.scenarioId,
            queueItem.repeatIndex,
            currentNode.id,
            'failed'
          );
        }

        const stepEndTime = Date.now();
        const stepDuration = stepEndTime - stepStartTime;

        // 성능 메트릭 계산 (액션 노드만)
        if (currentNode.type === 'action') {
          stepPerformance = this._buildStepPerformance(
            stepDuration,
            isWaitAction,
            actionResult,
            currentNode.params as Record<string, unknown> || {}
          );
        }

        // 스텝 결과 기록
        // 대기 액션의 경우: 완료 스텝의 startTime은 완료 시점으로 기록 (타임라인 마커 위치용)
        steps.push({
          nodeId: currentNode.id,
          nodeName: currentNode.label || currentNode.type,
          nodeType: currentNode.type,
          status: stepStatus,
          startTime: isWaitAction
            ? new Date(stepEndTime).toISOString()  // 대기 완료 시점
            : new Date(stepStartTime).toISOString(),
          endTime: new Date(stepEndTime).toISOString(),
          duration: stepDuration,
          error: stepError,
          // QA 확장 필드
          failureAnalysis: stepFailureAnalysis,
          performance: stepPerformance,
        });

        // 노드 완료 이벤트
        this._emit('test:device:node', {
          executionId,
          deviceId,
          deviceName: this._getDeviceName(deviceId, executionId),
          scenarioId: queueItem.scenarioId,
          nodeId: currentNode.id,
          nodeName: currentNode.label || currentNode.type,
          status: stepStatus,
          duration: stepEndTime - stepStartTime,
          error: stepError,
        });

        // 실패 시 중단
        if (stepStatus === 'failed') {
          throw new Error(stepError || '노드 실행 실패');
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
   * 액션 노드 실행
   */
  private async executeActionNode(actions: Actions, node: ExecutionNode, appPackage: string): Promise<ActionResult | null> {
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
        // typeText: 현재 포커스된 요소에 텍스트 입력
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
        // 이미지 매칭 결과 저장 (하이라이트 스크린샷 포함)
        result = await actions.tapImage(params.templateId as string, {
          threshold: (params.threshold as number) || 0.8,
          region: params.region as { x: number; y: number; width: number; height: number } | undefined,
          nodeId: node.id, // 하이라이트 스크린샷 저장용
        });
        break;
      case 'waitUntilImage':
        // 이미지 매칭 결과 저장 (하이라이트 스크린샷 포함)
        // tapAfterWait 옵션 지원
        result = await actions.waitUntilImage(
          params.templateId as string,
          (params.timeout as number) || 30000,
          1000,
          {
            threshold: (params.threshold as number) || 0.8,
            region: params.region as { x: number; y: number; width: number; height: number } | undefined,
            tapAfterWait: params.tapAfterWait as boolean || false,
            nodeId: node.id, // 하이라이트 스크린샷 저장용
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
      // ========== OCR 기반 텍스트 액션 ==========
      case 'tapTextOcr':
        result = await actions.tapTextOcr(params.text as string, {
          matchType: (params.matchType as 'exact' | 'contains' | 'regex') || 'contains',
          caseSensitive: params.caseSensitive as boolean || false,
          region: params.region as { x: number; y: number; width: number; height: number } | undefined,
          index: (params.index as number) || 0,
          offset: params.offset as { x: number; y: number } | undefined,
          retryCount: (params.retryCount as number) || 3,
          retryDelay: (params.retryDelay as number) || 1000,
          nodeId: node.id, // 하이라이트 스크린샷 저장용
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
            nodeId: node.id, // 하이라이트 스크린샷 저장용
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
        logger.warn(`[TestExecutor] 알 수 없는 액션 타입: ${actionType}`);
    }

    return result;
  }

  /**
   * 조건 노드 평가
   * @returns true면 'yes' 분기, false면 'no' 분기
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
          logger.warn(`[TestExecutor] 알 수 없는 조건 타입: ${conditionType}, 기본값 true`);
          return true;
      }
    } catch (error) {
      logger.error(`[TestExecutor] 조건 평가 실패: ${(error as Error).message}`);
      // 조건 평가 실패 시 false 반환 (no 분기)
      return false;
    }
  }

  /**
   * 특정 실행 중지
   * @param executionId 중지할 실행 ID
   */
  stopExecution(executionId: string): boolean {
    const state = this.activeExecutions.get(executionId);
    if (!state) {
      logger.warn(`[TestExecutor] 실행을 찾을 수 없음: ${executionId}`);
      return false;
    }

    state.stopRequested = true;
    logger.info(`[TestExecutor] [${executionId}] 테스트 중지 요청`);

    // 해당 실행의 모든 디바이스 Actions에 중지 신호 전송
    this.stopActionsOnDevices(state.deviceIds);

    this._emit('test:stopping', {
      executionId,
    });

    return true;
  }

  /**
   * 디바이스들의 Actions 인스턴스에 중지 신호 전송
   * 진행 중인 대기 루프(waitUntilImage 등)를 즉시 중단시킴
   *
   * @param deviceIds 중지할 디바이스 ID 목록
   */
  stopActionsOnDevices(deviceIds: string[]): void {
    for (const deviceId of deviceIds) {
      const actions = sessionManager.getActions(deviceId);
      if (actions) {
        actions.stop();
        logger.info(`[TestExecutor] Actions 중지 신호 전송: ${deviceId}`);
      }
    }
  }

  /**
   * 디바이스들의 Actions 중지 상태 리셋
   * 다음 테스트 실행을 위해 중지 상태를 해제
   *
   * @param deviceIds 리셋할 디바이스 ID 목록
   */
  resetActionsOnDevices(deviceIds: string[]): void {
    for (const deviceId of deviceIds) {
      const actions = sessionManager.getActions(deviceId);
      if (actions) {
        actions.reset();
      }
    }
  }

  /**
   * 디바이스들의 앱 강제 종료
   * 테스트 취소 시 앱을 깨끗하게 정리하기 위해 사용
   *
   * @param executionId 실행 ID (실행 상태에서 appPackage 추출)
   * @param deviceIds 앱을 종료할 디바이스 ID 목록
   */
  async terminateAppsOnDevices(executionId: string, deviceIds: string[]): Promise<void> {
    const state = this.activeExecutions.get(executionId);

    // 종료할 앱 패키지 수집 (중복 제거)
    const appPackages = new Set<string>();

    if (state) {
      // 실행 상태가 있으면 시나리오 큐에서 appPackage 추출
      for (const item of state.scenarioQueue) {
        if (item.appPackage) {
          appPackages.add(item.appPackage);
        }
      }
    }

    if (appPackages.size === 0) {
      logger.info(`[TestExecutor] [${executionId}] 종료할 앱 패키지 없음`);
      return;
    }

    logger.info(`[TestExecutor] [${executionId}] ${deviceIds.length}개 디바이스에서 앱 종료: ${Array.from(appPackages).join(', ')}`);

    // 각 디바이스에서 앱 종료 (병렬)
    const terminatePromises = deviceIds.map(async (deviceId) => {
      try {
        const actions = sessionManager.getActions(deviceId);
        if (!actions) {
          logger.warn(`[TestExecutor] [${executionId}] 디바이스 ${deviceId}: 세션 없음, 앱 종료 건너뜀`);
          return;
        }

        // 각 앱 패키지 종료
        for (const appPackage of appPackages) {
          try {
            await actions.terminateApp(appPackage);
            logger.info(`[TestExecutor] [${executionId}] 디바이스 ${deviceId}: 앱 종료 완료 - ${appPackage}`);
          } catch (err) {
            // 앱이 이미 종료되었거나 없는 경우 무시
            logger.warn(`[TestExecutor] [${executionId}] 디바이스 ${deviceId}: 앱 종료 실패 - ${appPackage}: ${(err as Error).message}`);
          }
        }
      } catch (err) {
        logger.error(`[TestExecutor] [${executionId}] 디바이스 ${deviceId}: 앱 종료 중 오류: ${(err as Error).message}`);
      }
    });

    await Promise.allSettled(terminatePromises);
    logger.info(`[TestExecutor] [${executionId}] 모든 디바이스 앱 종료 완료`);
  }

  /**
   * 모든 실행 중지 (하위 호환성 유지)
   */
  stop(): void {
    if (this.activeExecutions.size === 0) {
      return;
    }

    logger.info(`[TestExecutor] 모든 테스트 중지 요청 (${this.activeExecutions.size}개 실행)`);

    for (const [executionId, state] of this.activeExecutions.entries()) {
      state.stopRequested = true;
      this._emit('test:stopping', {
        executionId,
      });
    }
  }

  /**
   * 전체 초기화 (서버 재시작 등)
   */
  reset(): void {
    // 모든 실행 중지 요청
    for (const state of this.activeExecutions.values()) {
      state.stopRequested = true;
    }

    // Map 정리
    this.activeExecutions.clear();
    this.currentExecutionId = null;

    logger.info('[TestExecutor] 전체 초기화 완료');
  }

  // ========== QA 확장: 환경 정보 및 실패 분석 헬퍼 ==========

  /**
   * 디바이스 환경 정보 수집
   * 테스트 시작 전에 호출하여 환경 정보 캡처
   */
  async collectDeviceEnvironment(deviceId: string): Promise<DeviceEnvironment | undefined> {
    try {
      const env = await environmentCollector.collectDeviceEnvironment(deviceId);
      logger.info(`[TestExecutor] 환경 정보 수집 완료: ${deviceId}`);
      return env;
    } catch (error) {
      logger.warn(`[TestExecutor] 환경 정보 수집 실패 (${deviceId}): ${(error as Error).message}`);
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
      logger.info(`[TestExecutor] 앱 정보 수집 완료: ${packageName}@${deviceId}`);
      return appInfo;
    } catch (error) {
      logger.warn(`[TestExecutor] 앱 정보 수집 실패 (${packageName}@${deviceId}): ${(error as Error).message}`);
      return undefined;
    }
  }

  /**
   * 실패 분석 수행
   */
  analyzeFailure(
    error: Error | string,
    actionType: string,
    actionParams?: Record<string, unknown>,
    previousAction?: string
  ) {
    return failureAnalyzer.analyzeFailure(error, {
      attemptedAction: actionType,
      actionParams,
      previousAction,
      expectedState: failureAnalyzer.inferExpectedState(actionType, actionParams),
    });
  }

  /**
   * 스텝 성능 메트릭 생성
   */
  createStepPerformance(
    startTime: number,
    endTime: number,
    waitTime?: number,
    imageMatchResult?: { matchTime: number; confidence: number }
  ): StepPerformance {
    const totalTime = endTime - startTime;
    const actionTime = waitTime ? totalTime - waitTime : totalTime;

    return {
      totalTime,
      waitTime,
      actionTime: actionTime > 0 ? actionTime : undefined,
      imageMatch: imageMatchResult ? {
        templateId: '',
        matched: true,
        confidence: imageMatchResult.confidence,
        threshold: 0,
        matchTime: imageMatchResult.matchTime,
        roiUsed: false,
      } : undefined,
    };
  }

  /**
   * 스텝 목록에서 성능 요약 계산
   */
  private _calculatePerformanceSummary(steps: StepResult[]): DeviceScenarioResult['performanceSummary'] {
    // 유효한 스텝만 필터링 (duration이 있는 스텝)
    const validSteps = steps.filter(s => typeof s.duration === 'number' && s.duration > 0);

    if (validSteps.length === 0) {
      return undefined;
    }

    const durations = validSteps.map(s => s.duration!);
    const avgStepDuration = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
    const maxStepDuration = Math.max(...durations);
    const minStepDuration = Math.min(...durations);

    // 대기 시간 및 액션 시간 계산
    let totalWaitTime = 0;
    let totalActionTime = 0;
    let imageMatchTotalTime = 0;
    let imageMatchCount = 0;

    for (const step of validSteps) {
      const perf = step.performance;
      if (perf) {
        totalWaitTime += perf.waitTime || 0;
        totalActionTime += perf.actionTime || 0;

        if (perf.imageMatch?.matchTime) {
          imageMatchTotalTime += perf.imageMatch.matchTime;
          imageMatchCount++;
        }
      } else {
        // performance가 없으면 duration을 actionTime으로 간주
        totalActionTime += step.duration || 0;
      }
    }

    return {
      avgStepDuration,
      maxStepDuration,
      minStepDuration,
      totalWaitTime,
      totalActionTime,
      imageMatchAvgTime: imageMatchCount > 0 ? Math.round(imageMatchTotalTime / imageMatchCount) : undefined,
      imageMatchCount: imageMatchCount > 0 ? imageMatchCount : undefined,
    };
  }

  /**
   * 에디터 테스트용: 단일 노드 실행
   * @param deviceId 실행할 디바이스 ID
   * @param node 실행할 노드
   * @param appPackage 앱 패키지명 (launchApp/terminateApp용)
   */
  async executeSingleNode(
    deviceId: string,
    node: ExecutionNode,
    appPackage: string = 'com.example.app'
  ): Promise<{ success: boolean; error?: string; result?: ActionResult | null }> {
    // 세션 확인
    const actions = sessionManager.getActions(deviceId);
    if (!actions) {
      return { success: false, error: '세션이 없습니다. 먼저 세션을 생성하세요.' };
    }

    // 이전 중지 플래그 리셋
    actions.reset();

    try {
      // start/end 노드는 스킵
      if (node.type === 'start' || node.type === 'end') {
        return { success: true, result: null };
      }

      // 액션 노드 실행
      if (node.type === 'action') {
        const result = await this.executeActionNode(actions, node, appPackage);
        return { success: true, result };
      }

      // 조건/루프 노드는 에디터 테스트에서 지원하지 않음 (복잡한 분기 필요)
      if (node.type === 'condition' || node.type === 'loop') {
        return {
          success: false,
          error: '조건/루프 노드는 스텝 실행에서 지원하지 않습니다. 전체 실행을 사용하세요.'
        };
      }

      return { success: true, result: null };
    } catch (err) {
      const error = err as Error;
      logger.error(`[TestExecutor] 단일 노드 실행 실패:`, error);
      return { success: false, error: error.message };
    }
  }
}

// 싱글톤 인스턴스 export
export const testExecutor = new TestExecutor();
