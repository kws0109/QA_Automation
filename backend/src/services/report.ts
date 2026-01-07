// backend/src/services/report.ts

import fs from 'fs/promises';
import path from 'path';

const REPORTS_DIR = path.join(__dirname, '../../reports');

// 로그 엔트리 인터페이스
interface LogEntry {
  timestamp: string;
  nodeId: string;
  status: 'start' | 'success' | 'error' | 'skip' | 'warn';
  message: string;
  [key: string]: unknown;
}

// 리포트 통계 인터페이스
interface ReportStats {
  totalNodes: number;
  executedCount: number;
  successCount: number;
  errorCount: number;
  duration: number;
}

// 리포트 인터페이스
interface Report {
  id: string;
  scenarioId: string;
  scenarioName: string;
  success: boolean;
  error: string | null;
  logs: LogEntry[];
  stats: ReportStats;
  startedAt: string;
  completedAt: string;
  createdAt: string;
}

// 리포트 목록 아이템 인터페이스
interface ReportListItem {
  id: string;
  scenarioId: string;
  scenarioName: string;
  success: boolean;
  stats: ReportStats;
  createdAt: string;
}

// 리포트 생성 데이터 인터페이스
interface ReportData {
  scenarioId: string;
  scenarioName: string;
  success?: boolean;
  status?: string;
  error?: string;
  logs?: LogEntry[];
  log?: LogEntry[];
  nodeCount?: number;
  executedCount?: number;
  successCount?: number;
  failCount?: number;
  duration?: number;
  startedAt?: string;
  completedAt?: string;
}

// 삭제 결과 인터페이스
interface DeleteResult {
  success: boolean;
  id?: string;
  deletedCount?: number;
  message?: string;
}

class ReportService {
  /**
   * 리포트 저장 폴더 확인 및 생성
   */
  private async _ensureDir(): Promise<void> {
    try {
      await fs.access(REPORTS_DIR);
    } catch {
      await fs.mkdir(REPORTS_DIR, { recursive: true });
    }
  }

  /**
   * 리포트 파일 경로 생성
   */
  private _getFilePath(id: string): string {
    return path.join(REPORTS_DIR, `${id}.json`);
  }

  /**
   * 다음 ID 생성
   */
  private async _generateId(): Promise<string> {
    await this._ensureDir();

    const files = await fs.readdir(REPORTS_DIR);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    if (jsonFiles.length === 0) {
      return '1';
    }

    const ids = jsonFiles.map(f => {
      const id = f.replace('.json', '');
      const num = parseInt(id, 10);
      return isNaN(num) ? 0 : num;
    });

    const maxId = Math.max(...ids);
    return String(maxId + 1);
  }

  /**
   * 실행 시간 계산
   */
  private _calculateDuration(logs: LogEntry[]): number {
    if (logs.length < 2) return 0;

    const firstTime = new Date(logs[0].timestamp).getTime();
    const lastTime = new Date(logs[logs.length - 1].timestamp).getTime();

    return lastTime - firstTime;
  }

  /**
   * 리포트 생성
   */
  async create(data: ReportData): Promise<Report> {
    await this._ensureDir();

    const id = await this._generateId();
    const now = new Date().toISOString();

    // logs 또는 log 둘 다 지원
    const logs = data.logs || data.log || [];

    // success 또는 status 둘 다 지원
    const success = data.success !== undefined
      ? data.success
      : (data.status === 'success');

    // 통계 계산
    const successCount = logs.filter(l => l.status === 'success').length;
    const errorCount = logs.filter(l => l.status === 'error').length;
    const totalDuration = data.duration || this._calculateDuration(logs);

    const report: Report = {
      id,
      scenarioId: data.scenarioId,
      scenarioName: data.scenarioName,
      success,
      error: data.error || null,
      logs,
      stats: {
        totalNodes: data.nodeCount || logs.length,
        executedCount: data.executedCount || logs.length,
        successCount: data.successCount || successCount,
        errorCount: data.failCount || errorCount,
        duration: totalDuration,
      },
      startedAt: data.startedAt || now,
      completedAt: data.completedAt || now,
      createdAt: now,
    };

    const filePath = this._getFilePath(id);
    await fs.writeFile(filePath, JSON.stringify(report, null, 2), 'utf-8');

    console.log(`📊 리포트 생성: ${report.scenarioName} (ID: ${id}, 성공: ${success})`);

    return report;
  }

  /**
   * 모든 리포트 목록 조회
   */
  async getAll(): Promise<ReportListItem[]> {
    await this._ensureDir();

    const files = await fs.readdir(REPORTS_DIR);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    const reports = await Promise.all(
      jsonFiles.map(async (file) => {
        const filePath = path.join(REPORTS_DIR, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const report = JSON.parse(content) as Report;

        // 목록에서는 요약 정보만 반환
        return {
          id: report.id,
          scenarioId: report.scenarioId,
          scenarioName: report.scenarioName,
          success: report.success,
          stats: report.stats,
          createdAt: report.createdAt,
        };
      })
    );

    // 최신순 정렬
    reports.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return reports;
  }

  /**
   * 특정 리포트 조회
   */
  async getById(id: string): Promise<Report> {
    const filePath = this._getFilePath(id);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as Report;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        throw new Error(`리포트를 찾을 수 없습니다: ${id}`);
      }
      throw error;
    }
  }

  /**
   * 리포트 삭제
   */
  async delete(id: string): Promise<DeleteResult> {
    const filePath = this._getFilePath(id);

    try {
      await fs.access(filePath);
      await fs.unlink(filePath);

      console.log(`🗑️ 리포트 삭제: ID ${id}`);

      return { success: true, id, message: '리포트가 삭제되었습니다.' };
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        throw new Error(`리포트를 찾을 수 없습니다: ${id}`);
      }
      throw error;
    }
  }

  /**
   * 모든 리포트 삭제
   */
  async deleteAll(): Promise<DeleteResult> {
    await this._ensureDir();

    const files = await fs.readdir(REPORTS_DIR);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    await Promise.all(
      jsonFiles.map(file => fs.unlink(path.join(REPORTS_DIR, file)))
    );

    console.log(`🗑️ 모든 리포트 삭제: ${jsonFiles.length}개`);

    return { success: true, deletedCount: jsonFiles.length };
  }
}

// 싱글톤 인스턴스 export
const reportService = new ReportService();
export default reportService;