// backend/src/services/scheduleManager.ts

import cron, { ScheduledTask } from 'node-cron';
import { Server as SocketIOServer } from 'socket.io';
import { Schedule } from '../types';
import scheduleService from './scheduleService';
import scenarioService from './scenario';
import { parallelExecutor } from './parallelExecutor';
import { sessionManager } from './sessionManager';

/**
 * 스케줄 관리자
 * node-cron을 사용하여 스케줄된 시나리오를 자동 실행합니다.
 */
class ScheduleManager {
  private io: SocketIOServer | null = null;
  private cronJobs: Map<string, ScheduledTask> = new Map();  // scheduleId -> cron task
  private isInitialized: boolean = false;

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
   * 초기화 - 서버 시작 시 활성화된 스케줄 로드
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('[ScheduleManager] 이미 초기화됨');
      return;
    }

    console.log('[ScheduleManager] 초기화 시작...');

    try {
      const enabledSchedules = await scheduleService.getEnabledSchedules();

      for (const schedule of enabledSchedules) {
        await this._startCronJob(schedule);
      }

      this.isInitialized = true;
      console.log(`[ScheduleManager] 초기화 완료: ${enabledSchedules.length}개 스케줄 활성화됨`);
    } catch (error) {
      console.error('[ScheduleManager] 초기화 실패:', error);
    }
  }

  /**
   * Cron 작업 시작
   */
  private async _startCronJob(schedule: Schedule): Promise<void> {
    // 이미 실행 중인 작업이 있으면 중지
    if (this.cronJobs.has(schedule.id)) {
      this._stopCronJob(schedule.id);
    }

    // Cron 표현식 유효성 검사
    if (!cron.validate(schedule.cronExpression)) {
      console.error(`[ScheduleManager] 유효하지 않은 Cron 표현식: ${schedule.cronExpression} (스케줄: ${schedule.name})`);
      return;
    }

    const task = cron.schedule(schedule.cronExpression, async () => {
      await this._executeSchedule(schedule);
    });

    this.cronJobs.set(schedule.id, task);

    // 다음 실행 시간 계산 및 저장
    const nextRun = this._getNextRunTime(schedule.cronExpression);
    if (nextRun) {
      await scheduleService.updateNextRunAt(schedule.id, nextRun.toISOString());
    }

    console.log(`[ScheduleManager] Cron 작업 시작: ${schedule.name} (${schedule.cronExpression})`);
  }

  /**
   * Cron 작업 중지
   */
  private _stopCronJob(scheduleId: string): void {
    const task = this.cronJobs.get(scheduleId);
    if (task) {
      task.stop();
      this.cronJobs.delete(scheduleId);
      console.log(`[ScheduleManager] Cron 작업 중지: ${scheduleId}`);
    }
  }

  /**
   * 스케줄 실행
   */
  private async _executeSchedule(schedule: Schedule): Promise<void> {
    const startedAt = new Date();
    console.log(`[ScheduleManager] 스케줄 실행 시작: ${schedule.name}`);

    this._emit('schedule:start', {
      scheduleId: schedule.id,
      scheduleName: schedule.name,
      scenarioId: schedule.scenarioId,
      deviceIds: schedule.deviceIds,
      startedAt: startedAt.toISOString(),
    });

    let success = false;
    let error: string | undefined;
    let reportId: string | undefined;
    let scenarioName = '';

    try {
      // 시나리오 정보 조회
      const scenario = await scenarioService.getById(schedule.scenarioId);
      scenarioName = scenario.name;

      // 활성 세션 확인
      const activeDeviceIds = schedule.deviceIds.filter(id => sessionManager.hasSession(id));

      if (activeDeviceIds.length === 0) {
        throw new Error('활성 세션이 있는 디바이스가 없습니다. 세션을 먼저 시작해주세요.');
      }

      // 병렬 실행기가 이미 실행 중인지 확인
      const status = parallelExecutor.getStatus();
      if (status.isRunning) {
        throw new Error('이미 다른 시나리오가 실행 중입니다.');
      }

      // 병렬 실행
      const result = await parallelExecutor.executeParallel(
        schedule.scenarioId,
        activeDeviceIds,
        {
          captureOnComplete: true,
          recordVideo: true,
        }
      );

      success = result.results.every(r => r.success);
      // reportId는 parallelExecutor에서 생성됨, 이력에서 조회 가능

    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      console.error(`[ScheduleManager] 스케줄 실행 실패: ${schedule.name}`, error);
    }

    const completedAt = new Date();

    // 실행 이력 저장
    await scheduleService.addHistory({
      scheduleId: schedule.id,
      scheduleName: schedule.name,
      scenarioId: schedule.scenarioId,
      scenarioName,
      deviceIds: schedule.deviceIds,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      success,
      reportId,
      error,
    });

    // 마지막 실행 시간 업데이트
    await scheduleService.updateLastRunAt(schedule.id, completedAt.toISOString());

    // 다음 실행 시간 업데이트
    const nextRun = this._getNextRunTime(schedule.cronExpression);
    if (nextRun) {
      await scheduleService.updateNextRunAt(schedule.id, nextRun.toISOString());
    }

    this._emit('schedule:complete', {
      scheduleId: schedule.id,
      scheduleName: schedule.name,
      success,
      error,
      reportId,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      duration: completedAt.getTime() - startedAt.getTime(),
    });

    console.log(`[ScheduleManager] 스케줄 실행 완료: ${schedule.name} (${success ? '성공' : '실패'})`);
  }

  /**
   * 다음 실행 시간 계산
   */
  private _getNextRunTime(cronExpression: string): Date | null {
    try {
      // node-cron은 다음 실행 시간 계산 기능이 없으므로 직접 계산
      // 간단히 cron 표현식을 파싱하여 다음 실행 시간 추정
      const parts = cronExpression.split(' ');
      const now = new Date();

      // 매시간 정각인 경우
      if (parts[0] === '0' && parts[1] === '*') {
        const next = new Date(now);
        next.setHours(now.getHours() + 1, 0, 0, 0);
        return next;
      }

      // 특정 시간인 경우 (예: 0 10 * * * = 매일 10시)
      if (parts[0] !== '*' && parts[1] !== '*') {
        const minute = parseInt(parts[0], 10);
        const hour = parseInt(parts[1], 10);
        const next = new Date(now);
        next.setHours(hour, minute, 0, 0);

        // 오늘 시간이 지났으면 내일
        if (next <= now) {
          next.setDate(next.getDate() + 1);
        }
        return next;
      }

      // n분마다 실행인 경우 (예: */30 * * * *)
      if (parts[0].startsWith('*/')) {
        const interval = parseInt(parts[0].slice(2), 10);
        const next = new Date(now);
        const currentMinute = now.getMinutes();
        const nextMinute = Math.ceil((currentMinute + 1) / interval) * interval;

        if (nextMinute >= 60) {
          next.setHours(now.getHours() + 1, nextMinute - 60, 0, 0);
        } else {
          next.setMinutes(nextMinute, 0, 0);
        }
        return next;
      }

      // 기본: 1시간 후
      const fallback = new Date(now);
      fallback.setHours(now.getHours() + 1);
      return fallback;
    } catch {
      return null;
    }
  }

  // ========== Public API ==========

  /**
   * 스케줄 활성화
   */
  async enableSchedule(scheduleId: string): Promise<void> {
    const schedule = await scheduleService.enable(scheduleId);
    await this._startCronJob(schedule);

    this._emit('schedule:enabled', {
      scheduleId: schedule.id,
      scheduleName: schedule.name,
    });
  }

  /**
   * 스케줄 비활성화
   */
  async disableSchedule(scheduleId: string): Promise<void> {
    await scheduleService.disable(scheduleId);
    this._stopCronJob(scheduleId);

    this._emit('schedule:disabled', {
      scheduleId,
    });
  }

  /**
   * 스케줄 업데이트 후 Cron 작업 갱신
   */
  async refreshSchedule(scheduleId: string): Promise<void> {
    const schedule = await scheduleService.getById(scheduleId);

    if (schedule.enabled) {
      await this._startCronJob(schedule);
    } else {
      this._stopCronJob(scheduleId);
    }
  }

  /**
   * 스케줄 삭제 시 Cron 작업도 중지
   */
  async removeSchedule(scheduleId: string): Promise<void> {
    this._stopCronJob(scheduleId);
  }

  /**
   * 스케줄 즉시 실행 (테스트용)
   */
  async runNow(scheduleId: string): Promise<void> {
    const schedule = await scheduleService.getById(scheduleId);
    await this._executeSchedule(schedule);
  }

  /**
   * 활성 스케줄 목록 조회
   */
  getActiveSchedules(): string[] {
    return Array.from(this.cronJobs.keys());
  }

  /**
   * 모든 Cron 작업 중지 (서버 종료 시)
   */
  stopAll(): void {
    for (const [scheduleId, task] of this.cronJobs) {
      task.stop();
      console.log(`[ScheduleManager] Cron 작업 중지: ${scheduleId}`);
    }
    this.cronJobs.clear();
    console.log('[ScheduleManager] 모든 Cron 작업 중지됨');
  }
}

// 싱글톤 인스턴스 export
export const scheduleManager = new ScheduleManager();
export default scheduleManager;
