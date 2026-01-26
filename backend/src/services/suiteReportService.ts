// backend/src/services/suiteReportService.ts
// Suite 실행 리포트 저장/조회 서비스

import fs from 'fs/promises';
import path from 'path';
import { SuiteExecutionResult } from '../types';

const REPORTS_DIR = path.join(__dirname, '../../reports/suites');

/**
 * 리포트 디렉토리 초기화
 */
async function ensureReportsDir(): Promise<void> {
  try {
    await fs.access(REPORTS_DIR);
  } catch {
    await fs.mkdir(REPORTS_DIR, { recursive: true });
  }
}

/**
 * 리포트 파일 경로
 */
function getReportFilePath(reportId: string): string {
  return path.join(REPORTS_DIR, `${reportId}.json`);
}

/**
 * Suite 실행 리포트 저장
 */
async function saveReport(result: SuiteExecutionResult): Promise<void> {
  await ensureReportsDir();

  const filePath = getReportFilePath(result.id);
  await fs.writeFile(filePath, JSON.stringify(result, null, 2), 'utf-8');

  console.log(`[SuiteReportService] Report saved: ${result.id}`);
}

/**
 * 모든 Suite 리포트 목록 조회
 */
async function getAllReports(): Promise<SuiteExecutionResult[]> {
  await ensureReportsDir();

  try {
    const files = await fs.readdir(REPORTS_DIR);
    const reportFiles = files.filter(f => f.endsWith('.json'));

    const reports: SuiteExecutionResult[] = [];
    for (const file of reportFiles) {
      try {
        const content = await fs.readFile(path.join(REPORTS_DIR, file), 'utf-8');
        reports.push(JSON.parse(content));
      } catch (err) {
        console.error(`[SuiteReportService] Failed to read report: ${file}`, err);
      }
    }

    // completedAt 기준 내림차순 정렬
    return reports.sort((a, b) =>
      new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
    );
  } catch (err) {
    console.error('[SuiteReportService] Failed to list reports:', err);
    return [];
  }
}

/**
 * 리포트 ID로 조회
 */
async function getReportById(reportId: string): Promise<SuiteExecutionResult | null> {
  const filePath = getReportFilePath(reportId);

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    console.error(`[SuiteReportService] Report not found: ${reportId}`);
    return null;
  }
}

/**
 * Suite ID로 관련 리포트 조회
 */
async function getReportsBySuiteId(suiteId: string): Promise<SuiteExecutionResult[]> {
  const allReports = await getAllReports();
  return allReports.filter(r => r.suiteId === suiteId);
}

/**
 * 리포트 삭제
 */
async function deleteReport(reportId: string): Promise<boolean> {
  const filePath = getReportFilePath(reportId);

  try {
    await fs.unlink(filePath);
    console.log(`[SuiteReportService] Report deleted: ${reportId}`);
    return true;
  } catch {
    console.error(`[SuiteReportService] Failed to delete report: ${reportId}`);
    return false;
  }
}

/**
 * Suite ID로 관련 리포트 모두 삭제
 */
async function deleteReportsBySuiteId(suiteId: string): Promise<number> {
  const reports = await getReportsBySuiteId(suiteId);
  let deleted = 0;

  for (const report of reports) {
    if (await deleteReport(report.id)) {
      deleted++;
    }
  }

  return deleted;
}

/**
 * 오래된 리포트 정리 (일정 기간 이상)
 */
async function cleanupOldReports(olderThanDays: number = 30): Promise<number> {
  const allReports = await getAllReports();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

  let deleted = 0;
  for (const report of allReports) {
    if (new Date(report.completedAt) < cutoffDate) {
      if (await deleteReport(report.id)) {
        deleted++;
      }
    }
  }

  if (deleted > 0) {
    console.log(`[SuiteReportService] Cleaned up ${deleted} old reports`);
  }

  return deleted;
}

/**
 * 리포트 통계 조회
 */
async function getReportStats(): Promise<{
  totalReports: number;
  totalExecutions: number;
  passRate: number;
  recentReports: SuiteExecutionResult[];
}> {
  const allReports = await getAllReports();

  let totalExecutions = 0;
  let totalPassed = 0;

  for (const report of allReports) {
    totalExecutions += report.stats.totalExecutions;
    totalPassed += report.stats.passed;
  }

  return {
    totalReports: allReports.length,
    totalExecutions,
    passRate: totalExecutions > 0 ? Math.round((totalPassed / totalExecutions) * 100) : 0,
    recentReports: allReports.slice(0, 10),
  };
}

export default {
  saveReport,
  getAllReports,
  getReportById,
  getReportsBySuiteId,
  deleteReport,
  deleteReportsBySuiteId,
  cleanupOldReports,
  getReportStats,
};
