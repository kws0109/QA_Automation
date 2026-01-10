// backend/src/services/testExecutor.ts
// 다중 시나리오 테스트 실행 서비스 (Who/What/When 패러다임)
// 방식 2: 각 디바이스가 독립적으로 시나리오 세트를 순차 실행

import { Server as SocketIOServer } from 'socket.io';
import { sessionManager } from './sessionManager';
import scenarioService from './scenario';
import packageService from './package';
import { categoryService } from './category';
import { parallelReportService } from './parallelReport';
import {
  TestExecutionRequest,
  TestExecutionResult,
  TestExecutionStatus,
  ScenarioQueueItem,
  ScenarioExecutionSummary,
  DeviceExecutionResult,
  StepResult,
} from '../types';

// 디바이스별 실행 상태
interface DeviceProgress {
  deviceId: string;
  currentScenarioIndex: number;
  totalScenarios: number;
  currentScenarioId: string;
  currentScenarioName: string;
  status: 'running' | 'completed' | 'failed' | 'stopped';
  completedScenarios: number;
  failedScenarios: number;
}

/**
 * 테스트 실행 엔진 (방식 2)
 * 각 디바이스가 독립적으로 시나리오 세트를 순차 실행합니다.
 */
class TestExecutor {
  private io: SocketIOServer | null = null;
  private isRunning = false;
  private stopRequested = false;
  private currentExecutionId: string | null = null;
  private scenarioQueue: ScenarioQueueItem[] = [];  // 시나리오 목록 (반복 포함)
  private deviceProgress: Map<string, DeviceProgress> = new Map();
  private startedAt: Date | null = null;
  private deviceIds: string[] = [];

  /**
   * Socket.IO 인스턴스 설정
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
   * 실행 상태 조회
   */
  getStatus(): TestExecutionStatus {
    const total = this.scenarioQueue.length * this.deviceIds.length;
    let completed = 0;

    this.deviceProgress.forEach(progress => {
      completed += progress.completedScenarios + progress.failedScenarios;
    });

    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    // 현재 실행 중인 디바이스들의 시나리오 정보
    let currentScenario: TestExecutionStatus['currentScenario'] | undefined;
    for (const progress of this.deviceProgress.values()) {
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
      isRunning: this.isRunning,
      executionId: this.currentExecutionId || undefined,
      currentScenario,
      progress: {
        completed,
        total,
        percentage,
      },
      startedAt: this.startedAt?.toISOString(),
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

    // 시나리오 정보 조회 (존재하지 않는 시나리오는 건너뛰기)
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
        console.warn(`[TestExecutor] 시나리오를 찾을 수 없음 (건너뛰기): ${scenarioIds[i]}`);
      }
    }

    if (skippedIds.length > 0) {
      console.warn(`[TestExecutor] ${skippedIds.length}개 시나리오를 찾을 수 없어 건너뜁니다: ${skippedIds.join(', ')}`);
    }

    if (scenarios.length === 0) {
      throw new Error('유효한 시나리오가 없습니다. 시나리오가 삭제되었을 수 있습니다.');
    }

    // 패키지/카테고리 정보 조회를 위한 캐시
    const packageCache = new Map<string, { id: string; name: string; packageName: string }>();
    const categoryCache = new Map<string, { id: string; name: string }>();

    let order = 1;

    // 반복 횟수만큼 시나리오 추가
    for (let repeatIndex = 1; repeatIndex <= repeatCount; repeatIndex++) {
      for (const scenario of scenarios) {
        if (!scenario) continue;

        // 패키지 정보 조회 (캐시)
        let pkg = packageCache.get(scenario.packageId);
        if (!pkg && scenario.packageId) {
          try {
            const pkgData = await packageService.getById(scenario.packageId);
            pkg = { id: pkgData.id, name: pkgData.name, packageName: pkgData.packageName };
            packageCache.set(scenario.packageId, pkg);
          } catch {
            pkg = { id: scenario.packageId, name: '알 수 없음', packageName: '' };
          }
        }

        // 카테고리 정보 조회 (캐시)
        let category = categoryCache.get(scenario.categoryId);
        if (!category && scenario.categoryId && scenario.packageId) {
          try {
            const catData = await categoryService.getById(scenario.packageId, scenario.categoryId);
            if (catData) {
              category = { id: catData.id, name: catData.name };
              categoryCache.set(scenario.categoryId, category);
            } else {
              category = { id: scenario.categoryId, name: '알 수 없음' };
            }
          } catch {
            category = { id: scenario.categoryId, name: '알 수 없음' };
          }
        }

        queue.push({
          scenarioId: scenario.id,
          scenarioName: scenario.name,
          packageId: pkg?.id || '',
          packageName: pkg?.name || '',
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
   */
  async execute(request: TestExecutionRequest): Promise<TestExecutionResult> {
    if (this.isRunning) {
      throw new Error('이미 테스트가 실행 중입니다.');
    }

    // 유효성 검사
    if (!request.deviceIds || request.deviceIds.length === 0) {
      throw new Error('테스트할 디바이스를 선택해주세요.');
    }

    if (!request.scenarioIds || request.scenarioIds.length === 0) {
      throw new Error('테스트할 시나리오를 선택해주세요.');
    }

    // 활성 세션 확인
    const validDeviceIds = request.deviceIds.filter(id => sessionManager.hasSession(id));
    if (validDeviceIds.length === 0) {
      throw new Error('활성 세션이 있는 디바이스가 없습니다.');
    }

    // 초기화
    this.isRunning = true;
    this.stopRequested = false;
    this.currentExecutionId = `test-${Date.now()}`;
    this.startedAt = new Date();
    this.deviceIds = validDeviceIds;
    this.deviceProgress.clear();

    // 시나리오 큐 생성
    const { queue, skippedIds } = await this.buildQueue(
      request.scenarioIds,
      request.repeatCount || 1
    );
    this.scenarioQueue = queue;

    // 건너뛴 시나리오가 있으면 알림 이벤트 전송
    if (skippedIds.length > 0) {
      this._emit('test:scenarios:skipped', {
        executionId: this.currentExecutionId,
        skippedIds,
        message: `${skippedIds.length}개 시나리오를 찾을 수 없어 건너뜁니다: ${skippedIds.join(', ')}`,
      });
    }

    console.log(`[TestExecutor] 테스트 시작: ${this.scenarioQueue.length}개 시나리오 × ${validDeviceIds.length}개 디바이스`);

    // 디바이스별 진행 상태 초기화
    for (const deviceId of validDeviceIds) {
      this.deviceProgress.set(deviceId, {
        deviceId,
        currentScenarioIndex: 0,
        totalScenarios: this.scenarioQueue.length,
        currentScenarioId: '',
        currentScenarioName: '',
        status: 'running',
        completedScenarios: 0,
        failedScenarios: 0,
      });
    }

    // 테스트 시작 이벤트
    this._emit('test:start', {
      executionId: this.currentExecutionId,
      request: {
        ...request,
        deviceIds: validDeviceIds,
      },
      queue: this.scenarioQueue,
      totalScenarios: this.scenarioQueue.length,
      totalDevices: validDeviceIds.length,
    });

    try {
      // 각 디바이스가 독립적으로 시나리오 세트 실행 (병렬)
      const deviceResults = await Promise.allSettled(
        validDeviceIds.map(deviceId => this.executeDeviceScenarios(deviceId))
      );

      const completedAt = new Date();
      const totalDuration = completedAt.getTime() - this.startedAt.getTime();

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
              deviceName: deviceId,
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
      const result: TestExecutionResult = {
        id: this.currentExecutionId,
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
        startedAt: this.startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        status: this.stopRequested
          ? 'stopped'
          : failedScenarios > 0
            ? (passedScenarios > 0 ? 'partial' : 'failed')
            : 'completed',
      };

      // 테스트 완료 이벤트
      this._emit('test:complete', {
        executionId: this.currentExecutionId,
        result,
      });

      console.log(`[TestExecutor] 테스트 완료: ${passedScenarios}/${scenarioResults.length} 성공, ${totalDuration}ms`);

      return result;

    } finally {
      this.isRunning = false;
      this.stopRequested = false;
      this.currentExecutionId = null;
      this.scenarioQueue = [];
      this.deviceProgress.clear();
      this.startedAt = null;
      this.deviceIds = [];
    }
  }

  /**
   * 단일 디바이스의 시나리오 세트 실행
   * 해당 디바이스에서 모든 시나리오를 순차적으로 실행합니다.
   */
  private async executeDeviceScenarios(deviceId: string): Promise<Array<{
    scenarioId: string;
    scenarioName: string;
    packageId: string;
    packageName: string;
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
      categoryId: string;
      categoryName: string;
      repeatIndex: number;
      success: boolean;
      duration: number;
      error?: string;
      steps: StepResult[];
    }> = [];

    const progress = this.deviceProgress.get(deviceId);
    if (!progress) return results;

    // 디바이스 시작 이벤트
    this._emit('test:device:start', {
      executionId: this.currentExecutionId,
      deviceId,
      totalScenarios: this.scenarioQueue.length,
    });

    for (let i = 0; i < this.scenarioQueue.length; i++) {
      // 중지 요청 확인
      if (this.stopRequested) {
        progress.status = 'stopped';
        console.log(`[TestExecutor] 디바이스 ${deviceId}: 중지됨 (${i}/${this.scenarioQueue.length})`);
        break;
      }

      const queueItem = this.scenarioQueue[i];

      // 진행 상태 업데이트
      progress.currentScenarioIndex = i;
      progress.currentScenarioId = queueItem.scenarioId;
      progress.currentScenarioName = queueItem.scenarioName;

      // 시나리오 시작 이벤트 (디바이스별)
      this._emit('test:device:scenario:start', {
        executionId: this.currentExecutionId,
        deviceId,
        scenarioId: queueItem.scenarioId,
        scenarioName: queueItem.scenarioName,
        packageName: queueItem.packageName,
        categoryName: queueItem.categoryName,
        repeatIndex: queueItem.repeatIndex,
        order: i + 1,
        total: this.scenarioQueue.length,
      });

      console.log(`[TestExecutor] 디바이스 ${deviceId}: 시나리오 [${i + 1}/${this.scenarioQueue.length}] ${queueItem.scenarioName}`);

      // 단일 시나리오 실행
      const result = await this.executeSingleScenarioOnDevice(deviceId, queueItem);
      results.push(result);

      if (result.success) {
        progress.completedScenarios++;
      } else {
        progress.failedScenarios++;
      }

      // 시나리오 완료 이벤트 (디바이스별)
      this._emit('test:device:scenario:complete', {
        executionId: this.currentExecutionId,
        deviceId,
        scenarioId: queueItem.scenarioId,
        scenarioName: queueItem.scenarioName,
        repeatIndex: queueItem.repeatIndex,
        order: i + 1,
        status: result.success ? 'passed' : 'failed',
        duration: result.duration,
        error: result.error,
      });

      // 전체 진행률 업데이트
      this._emitOverallProgress();

      // 실패 시 해당 디바이스 중단 (옵션으로 변경 가능)
      if (!result.success) {
        progress.status = 'failed';
        console.log(`[TestExecutor] 디바이스 ${deviceId}: 시나리오 실패로 중단 - ${queueItem.scenarioName}`);
        break;
      }
    }

    // 디바이스 완료 처리
    if (progress.status === 'running') {
      progress.status = 'completed';
    }

    // 디바이스 완료 이벤트
    this._emit('test:device:complete', {
      executionId: this.currentExecutionId,
      deviceId,
      status: progress.status,
      completedScenarios: progress.completedScenarios,
      failedScenarios: progress.failedScenarios,
      totalScenarios: this.scenarioQueue.length,
    });

    return results;
  }

  /**
   * 전체 진행률 이벤트 emit
   */
  private _emitOverallProgress(): void {
    const total = this.scenarioQueue.length * this.deviceIds.length;
    let completed = 0;

    this.deviceProgress.forEach(progress => {
      completed += progress.completedScenarios + progress.failedScenarios;
    });

    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    this._emit('test:progress', {
      executionId: this.currentExecutionId,
      completed,
      total,
      percentage,
      deviceProgress: Array.from(this.deviceProgress.values()),
    });
  }

  /**
   * 단일 디바이스에서 단일 시나리오 실행
   */
  private async executeSingleScenarioOnDevice(
    deviceId: string,
    queueItem: ScenarioQueueItem
  ): Promise<{
    scenarioId: string;
    scenarioName: string;
    packageId: string;
    packageName: string;
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

      while (currentNodeId && !this.stopRequested) {
        if (visited.has(currentNodeId)) {
          console.warn(`[TestExecutor] 순환 감지: ${currentNodeId}`);
          break;
        }
        visited.add(currentNodeId);

        const currentNode = nodes.find(n => n.id === currentNodeId);
        if (!currentNode) break;

        const stepStartTime = Date.now();
        let stepStatus: 'passed' | 'failed' | 'error' = 'passed';
        let stepError: string | undefined;

        // 노드 실행 시작 이벤트
        this._emit('test:device:node', {
          executionId: this.currentExecutionId,
          deviceId,
          scenarioId: queueItem.scenarioId,
          nodeId: currentNode.id,
          nodeName: currentNode.label || currentNode.type,
          status: 'running',
        });

        try {
          // 노드 타입별 실행
          if (currentNode.type === 'action') {
            await this.executeActionNode(actions, currentNode);
          } else if (currentNode.type === 'condition') {
            // 조건 노드는 분기 처리 필요 (간단히 true 분기로)
            // TODO: 조건 평가 구현
          }
          // start, end 노드는 실행할 게 없음
        } catch (err) {
          const error = err as Error;
          stepStatus = 'failed';
          stepError = error.message;
          console.error(`[TestExecutor] 디바이스 ${deviceId}, 노드 ${currentNode.id} 실패:`, error.message);
        }

        const stepEndTime = Date.now();

        // 스텝 결과 기록
        steps.push({
          nodeId: currentNode.id,
          nodeName: currentNode.label || currentNode.type,
          nodeType: currentNode.type,
          status: stepStatus,
          startTime: new Date(stepStartTime).toISOString(),
          endTime: new Date(stepEndTime).toISOString(),
          duration: stepEndTime - stepStartTime,
          error: stepError,
        });

        // 노드 완료 이벤트
        this._emit('test:device:node', {
          executionId: this.currentExecutionId,
          deviceId,
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

        // 다음 노드 찾기
        const nextConnection = connections.find(c => c.from === currentNodeId);
        currentNodeId = nextConnection?.to || null;

        // End 노드면 종료
        if (currentNode.type === 'end') {
          break;
        }
      }

      const duration = Date.now() - startTime;
      return {
        scenarioId: queueItem.scenarioId,
        scenarioName: queueItem.scenarioName,
        packageId: queueItem.packageId,
        packageName: queueItem.packageName,
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
  private async executeActionNode(actions: any, node: any): Promise<void> {
    const params = node.params || {};
    const actionType = params.actionType;

    switch (actionType) {
      case 'tap':
        await actions.tap(params.x, params.y);
        break;
      case 'doubleTap':
        await actions.doubleTap(params.x, params.y);
        break;
      case 'longPress':
        await actions.longPress(params.x, params.y, params.duration || 1000);
        break;
      case 'swipe':
        await actions.swipe(params.startX, params.startY, params.endX, params.endY, params.duration || 500);
        break;
      case 'inputText':
        await actions.inputText(params.text);
        break;
      case 'clearText':
        await actions.clearText();
        break;
      case 'pressKey':
        await actions.pressKey(params.keycode);
        break;
      case 'wait':
        await actions.wait(params.duration || 1000);
        break;
      case 'waitUntilExists':
        await actions.waitUntilExists(params.selectorType, params.selector, params.timeout || 10000);
        break;
      case 'waitUntilGone':
        await actions.waitUntilGone(params.selectorType, params.selector, params.timeout || 10000);
        break;
      case 'waitUntilTextExists':
        await actions.waitUntilTextExists(params.text, params.timeout || 10000);
        break;
      case 'waitUntilTextGone':
        await actions.waitUntilTextGone(params.text, params.timeout || 10000);
        break;
      case 'tapElement':
        await actions.tapElement(params.selectorType, params.selector);
        break;
      case 'tapText':
        await actions.tapText(params.text);
        break;
      case 'tapImage':
        await actions.tapImage(params.templateId, params.threshold || 0.8);
        break;
      case 'waitUntilImage':
        await actions.waitUntilImage(params.templateId, params.threshold || 0.8, params.timeout || 10000);
        break;
      case 'waitUntilImageGone':
        await actions.waitUntilImageGone(params.templateId, params.threshold || 0.8, params.timeout || 10000);
        break;
      case 'launchApp':
        await actions.launchApp(params.packageName);
        break;
      case 'terminateApp':
        await actions.terminateApp(params.packageName);
        break;
      case 'screenshot':
        await actions.takeScreenshot();
        break;
      default:
        console.warn(`[TestExecutor] 알 수 없는 액션 타입: ${actionType}`);
    }
  }

  /**
   * 테스트 중지
   */
  stop(): void {
    if (this.isRunning) {
      this.stopRequested = true;
      console.log('[TestExecutor] 테스트 중지 요청');

      this._emit('test:stopping', {
        executionId: this.currentExecutionId,
      });
    }
  }
}

// 싱글톤 인스턴스 export
export const testExecutor = new TestExecutor();
