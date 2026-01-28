// backend/src/services/execution/ExecutionStateManager.ts
// 다중 실행 상태 관리자

import type {
  TestExecutionRequest,
  TestExecutionStatus,
  ScenarioQueueItem,
  ScreenshotInfo,
} from '../../types';
import type { ExecutionState, DeviceProgress, QueueBuildResult } from './types';
import scenarioService from '../scenario';
import packageService from '../package';
import { categoryService } from '../category';
import { createLogger } from '../../utils/logger';

const logger = createLogger('ExecutionStateManager');

/**
 * 실행 상태 관리자
 * 다중 테스트 실행의 상태를 관리합니다.
 */
export class ExecutionStateManager {
  // 다중 실행 지원: 실행 ID별 상태 관리
  private activeExecutions: Map<string, ExecutionState> = new Map();

  // 하위 호환성: 단일 실행 시 사용되는 현재 실행 ID
  private currentExecutionId: string | null = null;

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
   * 현재 실행 ID 조회/설정
   */
  getCurrentExecutionId(): string | null {
    return this.currentExecutionId;
  }

  setCurrentExecutionId(id: string | null): void {
    this.currentExecutionId = id;
  }

  /**
   * 실행 상태 조회
   */
  getExecutionState(executionId: string): ExecutionState | undefined {
    return this.activeExecutions.get(executionId);
  }

  /**
   * 실행 상태 등록
   */
  registerExecution(executionId: string, state: ExecutionState): void {
    this.activeExecutions.set(executionId, state);
    this.currentExecutionId = executionId;
  }

  /**
   * 실행 상태 제거
   */
  removeExecution(executionId: string): boolean {
    const removed = this.activeExecutions.delete(executionId);
    if (this.currentExecutionId === executionId) {
      this.currentExecutionId = null;
    }
    return removed;
  }

  /**
   * 실행 상태 초기화
   */
  createExecutionState(
    executionId: string,
    reportId: string,
    request: TestExecutionRequest,
    queue: ScenarioQueueItem[],
    validDeviceIds: string[],
    deviceNames: Map<string, string>,
  ): ExecutionState {
    return {
      executionId,
      reportId,
      request,
      stopRequested: false,
      scenarioQueue: queue,
      deviceProgress: new Map(),
      deviceNames,
      startedAt: new Date(),
      deviceIds: validDeviceIds,
      scenarioInterval: request.scenarioInterval || 0,
      deviceScreenshots: new Map(),
      deviceVideos: new Map(),
      deviceEnvironments: new Map(),
      deviceAppInfos: new Map(),
    };
  }

  /**
   * 디바이스 진행 상태 초기화
   */
  initDeviceProgress(
    state: ExecutionState,
    deviceId: string,
    deviceName: string,
    totalScenarios: number,
  ): DeviceProgress {
    const progress: DeviceProgress = {
      deviceId,
      deviceName,
      currentScenarioIndex: 0,
      totalScenarios,
      currentScenarioId: '',
      currentScenarioName: '',
      status: 'running',
      completedScenarios: 0,
      failedScenarios: 0,
    };
    state.deviceProgress.set(deviceId, progress);
    return progress;
  }

  /**
   * 디바이스 표시 이름 조회 (alias > model > deviceId)
   */
  getDeviceName(deviceId: string, executionId?: string): string {
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
   * 중지 요청 설정
   */
  requestStop(executionId: string): boolean {
    const state = this.activeExecutions.get(executionId);
    if (state) {
      state.stopRequested = true;
      return true;
    }
    return false;
  }

  /**
   * 중지 요청 여부 확인
   */
  isStopRequested(executionId: string): boolean {
    const state = this.activeExecutions.get(executionId);
    return state?.stopRequested ?? false;
  }

  /**
   * 실행 상태 조회 (하위 호환성 유지)
   */
  getStatus(executionId?: string): TestExecutionStatus {
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
   */
  async buildQueue(
    scenarioIds: string[],
    repeatCount: number
  ): Promise<QueueBuildResult> {
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
        logger.warn(`[ExecutionStateManager] 시나리오를 찾을 수 없음 (건너뛰기): ${scenarioIds[i]}`);
      }
    }

    if (skippedIds.length > 0) {
      logger.warn(`[ExecutionStateManager] ${skippedIds.length}개 시나리오를 찾을 수 없어 건너뜁니다: ${skippedIds.join(', ')}`);
    }

    if (scenarios.length === 0) {
      throw new Error('유효한 시나리오가 없습니다. 시나리오가 삭제되었을 수 있습니다.');
    }

    // 고유한 packageId, categoryId 수집
    const uniquePackageIds = new Set<string>();
    const uniqueCategoryKeys = new Set<string>();

    for (const scenario of scenarios) {
      if (scenario?.packageId) uniquePackageIds.add(scenario.packageId);
      if (scenario?.packageId && scenario?.categoryId) {
        uniqueCategoryKeys.add(`${scenario.packageId}:${scenario.categoryId}`);
      }
    }

    // 패키지/카테고리 정보 병렬 조회
    const packageCache = new Map<string, { id: string; name: string; packageName: string }>();
    const categoryCache = new Map<string, { id: string; name: string }>();

    const packagePromises = Array.from(uniquePackageIds).map(async (pkgId) => {
      try {
        const pkgData = await packageService.getById(pkgId);
        packageCache.set(pkgId, { id: pkgData.id, name: pkgData.name, packageName: pkgData.packageName });
      } catch {
        packageCache.set(pkgId, { id: pkgId, name: '알 수 없음', packageName: '' });
      }
    });

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

    await Promise.all([...packagePromises, ...categoryPromises]);

    let order = 1;

    // 반복 횟수만큼 시나리오 추가
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
   * 스크린샷 저장
   */
  storeScreenshot(
    executionId: string,
    deviceId: string,
    scenarioId: string,
    repeatIndex: number,
    screenshot: ScreenshotInfo,
  ): void {
    const state = this.activeExecutions.get(executionId);
    if (!state) return;

    if (!state.deviceScreenshots.has(deviceId)) {
      state.deviceScreenshots.set(deviceId, new Map());
    }
    const deviceMap = state.deviceScreenshots.get(deviceId)!;

    const scenarioKey = `${scenarioId}-${repeatIndex}`;
    if (!deviceMap.has(scenarioKey)) {
      deviceMap.set(scenarioKey, []);
    }
    deviceMap.get(scenarioKey)!.push(screenshot);
  }

  /**
   * 모든 활성 실행 상태 반환
   */
  getAllExecutions(): Map<string, ExecutionState> {
    return this.activeExecutions;
  }

  /**
   * 상태 초기화 (모든 실행 제거)
   */
  reset(): void {
    this.activeExecutions.clear();
    this.currentExecutionId = null;
  }
}

// 싱글톤 인스턴스
export const executionStateManager = new ExecutionStateManager();
