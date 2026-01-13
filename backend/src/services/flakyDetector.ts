// backend/src/services/flakyDetector.ts
// Flaky 테스트 탐지 서비스

import { FlakyAnalysis, FailureType } from '../types/reportEnhanced';
import { testReportService } from './testReportService';

/**
 * Flaky 테스트 탐지 기준
 */
interface FlakyDetectionConfig {
  minRunsRequired: number;        // 분석에 필요한 최소 실행 횟수 (기본: 3)
  lookbackCount: number;          // 분석할 최근 실행 횟수 (기본: 10)
  flakyThreshold: number;         // Flaky 판정 임계값 (성공률 20-80% 범위)
  lowSuccessThreshold: number;    // 낮은 성공률 임계값 (기본: 20%)
  highSuccessThreshold: number;   // 높은 성공률 임계값 (기본: 80%)
}

const DEFAULT_CONFIG: FlakyDetectionConfig = {
  minRunsRequired: 3,
  lookbackCount: 10,
  flakyThreshold: 0.5,      // 50% 성공률 근처면 flaky
  lowSuccessThreshold: 0.2,  // 20% 이하면 대부분 실패
  highSuccessThreshold: 0.8, // 80% 이상이면 대부분 성공
};

/**
 * 실행 이력 요약
 */
interface RunHistory {
  reportId: string;
  success: boolean;
  executedAt: string;
  duration: number;
  failureType?: FailureType;
}

/**
 * Flaky 테스트 탐지 서비스
 */
class FlakyDetectorService {
  private config: FlakyDetectionConfig;

  constructor(config: Partial<FlakyDetectionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 특정 시나리오-디바이스 조합의 Flaky 분석
   */
  async analyzeFlakiness(
    scenarioId: string,
    deviceId: string
  ): Promise<FlakyAnalysis | null> {
    // 최근 리포트 조회
    const recentRuns = await this._getRecentRuns(scenarioId, deviceId);

    if (recentRuns.length < this.config.minRunsRequired) {
      // 분석에 필요한 최소 실행 횟수 미달
      return null;
    }

    // 성공/실패 통계
    const totalRuns = recentRuns.length;
    const successCount = recentRuns.filter((r) => r.success).length;
    const failureCount = totalRuns - successCount;
    const successRate = (successCount / totalRuns) * 100;

    // Flaky 판정
    const { isFlaky, flakyScore, flakyReason } = this._determineFlakiness(
      successRate,
      recentRuns
    );

    // 실패 패턴 분석
    const failurePatterns = this._analyzeFailurePatterns(recentRuns);

    // 환경 상관관계 분석 (추후 구현 가능)
    // const environmentCorrelation = await this._analyzeEnvironmentCorrelation(recentRuns);

    return {
      scenarioId,
      deviceId,
      recentRuns: recentRuns.map((r) => ({
        reportId: r.reportId,
        success: r.success,
        executedAt: r.executedAt,
        duration: r.duration,
      })),
      totalRuns,
      successCount,
      failureCount,
      successRate: Math.round(successRate * 10) / 10,
      isFlaky,
      flakyScore,
      flakyReason,
      failurePatterns: failurePatterns.length > 0 ? failurePatterns : undefined,
    };
  }

  /**
   * 리포트 내 모든 디바이스-시나리오 조합 분석
   */
  async analyzeReportFlakiness(reportId: string): Promise<FlakyAnalysis[]> {
    const report = await testReportService.getById(reportId);
    const analyses: FlakyAnalysis[] = [];

    for (const scenarioResult of report.scenarioResults) {
      for (const deviceResult of scenarioResult.deviceResults) {
        const analysis = await this.analyzeFlakiness(
          scenarioResult.scenarioId,
          deviceResult.deviceId
        );
        if (analysis) {
          analyses.push(analysis);
        }
      }
    }

    return analyses;
  }

  /**
   * 최근 실행 이력 조회
   */
  private async _getRecentRuns(
    scenarioId: string,
    deviceId: string
  ): Promise<RunHistory[]> {
    const reportList = await testReportService.getAll();
    const runs: RunHistory[] = [];

    // 최신 순으로 정렬
    const sortedReports = [...reportList].sort(
      (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
    );

    for (const reportItem of sortedReports) {
      if (runs.length >= this.config.lookbackCount) break;

      // 전체 리포트 가져오기
      let fullReport;
      try {
        fullReport = await testReportService.getById(reportItem.id);
      } catch {
        continue; // 리포트 조회 실패 시 건너뛰기
      }

      // 해당 시나리오-디바이스 조합 찾기
      for (const scenarioResult of fullReport.scenarioResults) {
        if (scenarioResult.scenarioId !== scenarioId) continue;

        for (const deviceResult of scenarioResult.deviceResults) {
          if (deviceResult.deviceId !== deviceId) continue;

          // 실패 유형 추출 (실패한 경우)
          let failureType: FailureType | undefined;
          if (!deviceResult.success && deviceResult.steps.length > 0) {
            const failedStep = deviceResult.steps.find(
              (step) => step.status === 'failed' || step.status === 'error'
            );
            if (failedStep?.failureAnalysis) {
              failureType = failedStep.failureAnalysis.failureType;
            }
          }

          runs.push({
            reportId: fullReport.id,
            success: deviceResult.success,
            executedAt: fullReport.completedAt,
            duration: deviceResult.duration,
            failureType,
          });
        }
      }
    }

    return runs;
  }

  /**
   * Flaky 판정 로직
   */
  private _determineFlakiness(
    successRate: number,
    runs: RunHistory[]
  ): { isFlaky: boolean; flakyScore: number; flakyReason?: string } {
    const normalizedRate = successRate / 100;

    // 항상 성공하거나 항상 실패하면 flaky 아님
    if (normalizedRate >= this.config.highSuccessThreshold) {
      return {
        isFlaky: false,
        flakyScore: 0,
        flakyReason: undefined,
      };
    }

    if (normalizedRate <= this.config.lowSuccessThreshold) {
      return {
        isFlaky: false,
        flakyScore: 0,
        flakyReason: undefined,
      };
    }

    // 20% ~ 80% 사이면 flaky 가능성
    // 50%에 가까울수록 flakyScore 높음
    const distanceFromHalf = Math.abs(normalizedRate - 0.5);
    const flakyScore = Math.round((1 - distanceFromHalf * 2) * 100);

    // 연속 성공/실패 패턴 확인
    const { consecutiveChanges, maxConsecutive } = this._analyzeConsecutivePattern(runs);

    let flakyReason: string | undefined;

    if (flakyScore >= 50) {
      flakyReason = `성공률 ${successRate.toFixed(1)}%로 불안정`;
      if (consecutiveChanges > runs.length * 0.5) {
        flakyReason += ` (결과가 자주 변동됨: ${consecutiveChanges}회)`;
      }
    }

    return {
      isFlaky: flakyScore >= 30, // 30점 이상이면 flaky로 판정
      flakyScore,
      flakyReason,
    };
  }

  /**
   * 연속 패턴 분석
   */
  private _analyzeConsecutivePattern(runs: RunHistory[]): {
    consecutiveChanges: number;
    maxConsecutive: number;
  } {
    if (runs.length < 2) {
      return { consecutiveChanges: 0, maxConsecutive: runs.length };
    }

    let consecutiveChanges = 0;
    let currentStreak = 1;
    let maxConsecutive = 1;

    for (let i = 1; i < runs.length; i++) {
      if (runs[i].success !== runs[i - 1].success) {
        consecutiveChanges++;
        currentStreak = 1;
      } else {
        currentStreak++;
        maxConsecutive = Math.max(maxConsecutive, currentStreak);
      }
    }

    return { consecutiveChanges, maxConsecutive };
  }

  /**
   * 실패 패턴 분석
   */
  private _analyzeFailurePatterns(
    runs: RunHistory[]
  ): { type: FailureType; count: number; percentage: number }[] {
    const failedRuns = runs.filter((r) => !r.success && r.failureType);
    if (failedRuns.length === 0) return [];

    const typeCount = new Map<FailureType, number>();

    for (const run of failedRuns) {
      if (run.failureType) {
        const current = typeCount.get(run.failureType) || 0;
        typeCount.set(run.failureType, current + 1);
      }
    }

    const total = failedRuns.length;
    const patterns: { type: FailureType; count: number; percentage: number }[] = [];

    for (const [type, count] of typeCount.entries()) {
      patterns.push({
        type,
        count,
        percentage: Math.round((count / total) * 100 * 10) / 10,
      });
    }

    // 빈도순 정렬
    patterns.sort((a, b) => b.count - a.count);

    return patterns;
  }

  /**
   * Flaky 테스트 요약 생성
   */
  generateFlakySummary(analyses: FlakyAnalysis[]): {
    totalAnalyzed: number;
    flakyCount: number;
    flakyPercentage: number;
    highRiskTests: { scenarioId: string; deviceId: string; flakyScore: number }[];
  } {
    const flakyTests = analyses.filter((a) => a.isFlaky);
    const highRiskTests = flakyTests
      .sort((a, b) => b.flakyScore - a.flakyScore)
      .slice(0, 5)
      .map((a) => ({
        scenarioId: a.scenarioId,
        deviceId: a.deviceId,
        flakyScore: a.flakyScore,
      }));

    return {
      totalAnalyzed: analyses.length,
      flakyCount: flakyTests.length,
      flakyPercentage:
        analyses.length > 0
          ? Math.round((flakyTests.length / analyses.length) * 100 * 10) / 10
          : 0,
      highRiskTests,
    };
  }

  /**
   * 설정 업데이트
   */
  updateConfig(config: Partial<FlakyDetectionConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

export const flakyDetector = new FlakyDetectorService();
