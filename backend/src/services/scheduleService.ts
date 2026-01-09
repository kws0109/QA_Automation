// backend/src/services/scheduleService.ts

import fs from 'fs/promises';
import path from 'path';
import {
  Schedule,
  ScheduleHistory,
  ScheduleListItem,
  CreateScheduleRequest,
  UpdateScheduleRequest,
} from '../types';
import scenarioService from './scenario';

// 스케줄 저장 경로
const SCHEDULES_DIR = path.join(__dirname, '../../schedules');
const HISTORY_FILE = path.join(SCHEDULES_DIR, '_history.json');

class ScheduleService {
  /**
   * 저장 폴더 확인 및 생성
   */
  private async _ensureDir(): Promise<void> {
    try {
      await fs.access(SCHEDULES_DIR);
    } catch {
      await fs.mkdir(SCHEDULES_DIR, { recursive: true });
    }
  }

  /**
   * 스케줄 파일 경로 생성
   */
  private _getFilePath(id: string): string {
    return path.join(SCHEDULES_DIR, `${id}.json`);
  }

  /**
   * 고유 ID 생성
   */
  private _generateId(): string {
    return `sch_${Date.now()}`;
  }

  /**
   * 모든 스케줄 목록 조회
   */
  async getAll(): Promise<ScheduleListItem[]> {
    await this._ensureDir();

    const files = await fs.readdir(SCHEDULES_DIR);
    const jsonFiles = files.filter(f => f.endsWith('.json') && !f.startsWith('_'));

    const schedules = await Promise.all(
      jsonFiles.map(async (file) => {
        const filePath = path.join(SCHEDULES_DIR, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const schedule = JSON.parse(content) as Schedule;

        // 시나리오 이름 조회
        let scenarioName = '';
        try {
          const scenario = await scenarioService.getById(schedule.scenarioId);
          scenarioName = scenario.name;
        } catch {
          scenarioName = '(삭제된 시나리오)';
        }

        return {
          id: schedule.id,
          name: schedule.name,
          scenarioId: schedule.scenarioId,
          scenarioName,
          deviceIds: schedule.deviceIds,
          cronExpression: schedule.cronExpression,
          enabled: schedule.enabled,
          lastRunAt: schedule.lastRunAt,
          nextRunAt: schedule.nextRunAt,
        } as ScheduleListItem;
      })
    );

    // 생성일순 정렬 (최신순)
    schedules.sort((a, b) => b.id.localeCompare(a.id));

    return schedules;
  }

  /**
   * 특정 스케줄 조회
   */
  async getById(id: string): Promise<Schedule> {
    const filePath = this._getFilePath(id);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as Schedule;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        throw new Error(`스케줄을 찾을 수 없습니다: ${id}`);
      }
      throw error;
    }
  }

  /**
   * 활성화된 스케줄 목록 조회
   */
  async getEnabledSchedules(): Promise<Schedule[]> {
    await this._ensureDir();

    const files = await fs.readdir(SCHEDULES_DIR);
    const jsonFiles = files.filter(f => f.endsWith('.json') && !f.startsWith('_'));

    const schedules: Schedule[] = [];

    for (const file of jsonFiles) {
      const filePath = path.join(SCHEDULES_DIR, file);
      const content = await fs.readFile(filePath, 'utf-8');
      const schedule = JSON.parse(content) as Schedule;

      if (schedule.enabled) {
        schedules.push(schedule);
      }
    }

    return schedules;
  }

  /**
   * 새 스케줄 생성
   */
  async create(data: CreateScheduleRequest): Promise<Schedule> {
    await this._ensureDir();

    // 시나리오 존재 확인
    try {
      await scenarioService.getById(data.scenarioId);
    } catch {
      throw new Error(`존재하지 않는 시나리오입니다: ${data.scenarioId}`);
    }

    // Cron 표현식 검증
    if (!this._isValidCronExpression(data.cronExpression)) {
      throw new Error(`유효하지 않은 Cron 표현식입니다: ${data.cronExpression}`);
    }

    const id = this._generateId();
    const now = new Date().toISOString();

    const schedule: Schedule = {
      id,
      name: data.name,
      scenarioId: data.scenarioId,
      deviceIds: data.deviceIds,
      cronExpression: data.cronExpression,
      enabled: false,  // 기본값: 비활성화
      description: data.description || '',
      createdAt: now,
      updatedAt: now,
    };

    const filePath = this._getFilePath(id);
    await fs.writeFile(filePath, JSON.stringify(schedule, null, 2), 'utf-8');

    console.log(`📅 스케줄 생성: ${schedule.name} (ID: ${id})`);

    return schedule;
  }

  /**
   * 스케줄 수정
   */
  async update(id: string, data: UpdateScheduleRequest): Promise<Schedule> {
    const existing = await this.getById(id);

    // Cron 표현식 변경 시 검증
    if (data.cronExpression && !this._isValidCronExpression(data.cronExpression)) {
      throw new Error(`유효하지 않은 Cron 표현식입니다: ${data.cronExpression}`);
    }

    // 시나리오 변경 시 존재 확인
    if (data.scenarioId) {
      try {
        await scenarioService.getById(data.scenarioId);
      } catch {
        throw new Error(`존재하지 않는 시나리오입니다: ${data.scenarioId}`);
      }
    }

    const updated: Schedule = {
      ...existing,
      name: data.name ?? existing.name,
      scenarioId: data.scenarioId ?? existing.scenarioId,
      deviceIds: data.deviceIds ?? existing.deviceIds,
      cronExpression: data.cronExpression ?? existing.cronExpression,
      description: data.description ?? existing.description,
      enabled: data.enabled ?? existing.enabled,
      updatedAt: new Date().toISOString(),
    };

    const filePath = this._getFilePath(id);
    await fs.writeFile(filePath, JSON.stringify(updated, null, 2), 'utf-8');

    console.log(`✏️ 스케줄 수정: ${updated.name} (ID: ${id})`);

    return updated;
  }

  /**
   * 스케줄 삭제
   */
  async delete(id: string): Promise<{ success: boolean; id: string; message: string }> {
    const filePath = this._getFilePath(id);

    try {
      await fs.access(filePath);
      await fs.unlink(filePath);

      console.log(`🗑️ 스케줄 삭제: ID ${id}`);

      return { success: true, id, message: '스케줄이 삭제되었습니다.' };
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        throw new Error(`스케줄을 찾을 수 없습니다: ${id}`);
      }
      throw error;
    }
  }

  /**
   * 스케줄 활성화
   */
  async enable(id: string): Promise<Schedule> {
    return this.update(id, { enabled: true });
  }

  /**
   * 스케줄 비활성화
   */
  async disable(id: string): Promise<Schedule> {
    return this.update(id, { enabled: false });
  }

  /**
   * 마지막 실행 시간 업데이트
   */
  async updateLastRunAt(id: string, lastRunAt: string): Promise<void> {
    const schedule = await this.getById(id);
    schedule.lastRunAt = lastRunAt;
    schedule.updatedAt = new Date().toISOString();

    const filePath = this._getFilePath(id);
    await fs.writeFile(filePath, JSON.stringify(schedule, null, 2), 'utf-8');
  }

  /**
   * 다음 실행 시간 업데이트
   */
  async updateNextRunAt(id: string, nextRunAt: string): Promise<void> {
    const schedule = await this.getById(id);
    schedule.nextRunAt = nextRunAt;
    schedule.updatedAt = new Date().toISOString();

    const filePath = this._getFilePath(id);
    await fs.writeFile(filePath, JSON.stringify(schedule, null, 2), 'utf-8');
  }

  // ========== 실행 이력 관리 ==========

  /**
   * 실행 이력 로드
   */
  private async _loadHistory(): Promise<ScheduleHistory[]> {
    await this._ensureDir();

    try {
      const content = await fs.readFile(HISTORY_FILE, 'utf-8');
      return JSON.parse(content) as ScheduleHistory[];
    } catch {
      return [];
    }
  }

  /**
   * 실행 이력 저장
   */
  private async _saveHistory(history: ScheduleHistory[]): Promise<void> {
    await this._ensureDir();
    await fs.writeFile(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf-8');
  }

  /**
   * 실행 이력 추가
   */
  async addHistory(historyEntry: Omit<ScheduleHistory, 'id'>): Promise<ScheduleHistory> {
    const history = await this._loadHistory();

    const entry: ScheduleHistory = {
      id: `hist_${Date.now()}`,
      ...historyEntry,
    };

    history.unshift(entry);  // 최신순으로 앞에 추가

    // 최대 100개 유지
    if (history.length > 100) {
      history.splice(100);
    }

    await this._saveHistory(history);

    return entry;
  }

  /**
   * 전체 실행 이력 조회
   */
  async getAllHistory(limit: number = 50): Promise<ScheduleHistory[]> {
    const history = await this._loadHistory();
    return history.slice(0, limit);
  }

  /**
   * 특정 스케줄의 실행 이력 조회
   */
  async getHistoryByScheduleId(scheduleId: string, limit: number = 20): Promise<ScheduleHistory[]> {
    const history = await this._loadHistory();
    return history.filter(h => h.scheduleId === scheduleId).slice(0, limit);
  }

  // ========== 유틸리티 ==========

  /**
   * Cron 표현식 검증 (기본적인 형식 체크)
   */
  private _isValidCronExpression(expr: string): boolean {
    // Cron 표현식: 분 시 일 월 요일 (5개 필드)
    const parts = expr.trim().split(/\s+/);
    if (parts.length !== 5) {
      return false;
    }

    // 각 필드의 유효성 검사 (간단한 패턴 매칭)
    const patterns = [
      /^(\*|[0-9]|[1-5][0-9])(\/[0-9]+)?$|^\*\/[0-9]+$|^([0-9]|[1-5][0-9])(,([0-9]|[1-5][0-9]))*$/,  // 분 (0-59)
      /^(\*|[0-9]|1[0-9]|2[0-3])(\/[0-9]+)?$|^\*\/[0-9]+$|^([0-9]|1[0-9]|2[0-3])(,([0-9]|1[0-9]|2[0-3]))*$/,  // 시 (0-23)
      /^(\*|[1-9]|[12][0-9]|3[01])(\/[0-9]+)?$|^\*\/[0-9]+$|^([1-9]|[12][0-9]|3[01])(,([1-9]|[12][0-9]|3[01]))*$/,  // 일 (1-31)
      /^(\*|[1-9]|1[0-2])(\/[0-9]+)?$|^\*\/[0-9]+$|^([1-9]|1[0-2])(,([1-9]|1[0-2]))*$/,  // 월 (1-12)
      /^(\*|[0-6])(\/[0-9]+)?$|^\*\/[0-9]+$|^[0-6](,[0-6])*$|^[0-6]-[0-6]$/,  // 요일 (0-6)
    ];

    for (let i = 0; i < 5; i++) {
      if (!patterns[i].test(parts[i])) {
        // 더 유연한 검증 (범위 등)
        if (!/^[\d\*\/,\-]+$/.test(parts[i])) {
          return false;
        }
      }
    }

    return true;
  }
}

// 싱글톤 인스턴스 export
const scheduleService = new ScheduleService();
export default scheduleService;
