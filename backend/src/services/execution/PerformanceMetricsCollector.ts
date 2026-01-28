// backend/src/services/execution/PerformanceMetricsCollector.ts
// 실행 성능 메트릭 수집기

import type { StepResult, DeviceScenarioResult, ActionResult } from '../../types';
import type { StepPerformance, PerformanceSummary } from '../../types/reportEnhanced';

/**
 * 성능 메트릭 수집기
 * 테스트 실행 중 성능 데이터를 수집하고 요약합니다.
 */
export class PerformanceMetricsCollector {
  /**
   * 스텝 목록에서 성능 요약 계산
   */
  calculatePerformanceSummary(steps: StepResult[]): DeviceScenarioResult['performanceSummary'] {
    const validSteps = steps.filter(s => typeof s.duration === 'number' && s.duration > 0);

    if (validSteps.length === 0) {
      return undefined;
    }

    const durations = validSteps.map(s => s.duration!);
    const avgStepDuration = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
    const maxStepDuration = Math.max(...durations);
    const minStepDuration = Math.min(...durations);

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
   * 액션 결과로부터 스텝 성능 메트릭 빌드
   * testExecutor.executeSingleScenarioOnDevice에서 사용
   */
  buildStepPerformance(
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
   * ActionExecutionResult.performance로부터 스텝 성능 메트릭 빌드
   * SuiteExecutor에서 사용 (ActionExecutionResult 기반)
   */
  buildFromExecutionResult(
    stepDuration: number,
    isWaitAction: boolean,
    executionPerformance: {
      matchTime?: number;
      confidence?: number;
      templateId?: string;
      ocrTime?: number;
      searchText?: string;
      matchType?: string;
    } | undefined,
    nodeParams: Record<string, unknown>,
    success: boolean
  ): StepPerformance | undefined {
    if (stepDuration <= 0) return undefined;

    const waitTime = isWaitAction ? stepDuration : undefined;
    const actionTime = isWaitAction ? 0 : stepDuration;

    const result: StepPerformance = {
      totalTime: stepDuration,
      waitTime,
      actionTime: actionTime > 0 ? actionTime : undefined,
    };

    // 이미지 매칭 메트릭
    if (executionPerformance?.matchTime !== undefined || executionPerformance?.confidence !== undefined) {
      result.imageMatch = {
        templateId: executionPerformance?.templateId || '',
        matched: success,
        confidence: executionPerformance?.confidence || 0,
        threshold: (nodeParams?.threshold as number) || 0.8,
        matchTime: executionPerformance?.matchTime || 0,
        roiUsed: !!nodeParams?.region,
      };
    }

    // OCR 매칭 메트릭
    if (executionPerformance?.ocrTime !== undefined || executionPerformance?.searchText !== undefined) {
      result.ocrMatch = {
        searchText: executionPerformance?.searchText || '',
        matchType: (executionPerformance?.matchType as 'exact' | 'contains' | 'regex') || 'contains',
        matched: success,
        confidence: executionPerformance?.confidence || 0,
        ocrTime: executionPerformance?.ocrTime || 0,
        apiProvider: 'google',
      };
    }

    return result;
  }

  /**
   * 전체 실행 성능 요약 계산
   */
  calculateExecutionSummary(deviceResults: Array<{ steps: StepResult[]; duration: number }>): {
    totalDuration: number;
    avgDuration: number;
    totalSteps: number;
    avgStepDuration: number;
    imageMatchStats?: {
      totalCount: number;
      avgConfidence: number;
      avgMatchTime: number;
    };
  } {
    const totalDuration = deviceResults.reduce((sum, r) => sum + r.duration, 0);
    const avgDuration = deviceResults.length > 0 ? Math.round(totalDuration / deviceResults.length) : 0;

    const allSteps = deviceResults.flatMap(r => r.steps);
    const validSteps = allSteps.filter(s => typeof s.duration === 'number' && s.duration > 0);
    const totalSteps = validSteps.length;
    const avgStepDuration = totalSteps > 0
      ? Math.round(validSteps.reduce((sum, s) => sum + (s.duration || 0), 0) / totalSteps)
      : 0;

    // 이미지 매칭 통계
    let totalImageMatches = 0;
    let totalConfidence = 0;
    let totalMatchTime = 0;

    for (const step of validSteps) {
      const imgMatch = step.performance?.imageMatch;
      if (imgMatch?.matched) {
        totalImageMatches++;
        totalConfidence += imgMatch.confidence;
        totalMatchTime += imgMatch.matchTime;
      }
    }

    const imageMatchStats = totalImageMatches > 0 ? {
      totalCount: totalImageMatches,
      avgConfidence: Math.round((totalConfidence / totalImageMatches) * 100) / 100,
      avgMatchTime: Math.round(totalMatchTime / totalImageMatches),
    } : undefined;

    return {
      totalDuration,
      avgDuration,
      totalSteps,
      avgStepDuration,
      imageMatchStats,
    };
  }
}

// 싱글톤 인스턴스
export const performanceMetricsCollector = new PerformanceMetricsCollector();
