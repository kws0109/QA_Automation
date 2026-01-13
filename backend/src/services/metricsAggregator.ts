// backend/src/services/metricsAggregator.ts
// 메트릭 집계 및 분석 서비스

import { metricsDatabase } from './metricsDatabase';

/**
 * 성공률 추이 데이터
 */
export interface SuccessRateTrend {
  date: string;
  totalExecutions: number;
  totalScenarios: number;
  passedScenarios: number;
  failedScenarios: number;
  successRate: number;
}

/**
 * 시나리오 히스토리 요약
 */
export interface ScenarioHistory {
  scenarioId: string;
  scenarioName: string;
  packageName?: string;
  categoryName?: string;
  totalExecutions: number;
  passedCount: number;
  failedCount: number;
  successRate: number;
  avgDuration: number;
  lastExecutedAt?: string;
  lastStatus?: string;
}

/**
 * 실패 패턴 분석
 */
export interface FailurePattern {
  failureType: string;
  failureCategory: string;
  count: number;
  percentage: number;
  affectedScenarios: string[];
  affectedDevices: string[];
  recentOccurrences: {
    executionId: string;
    scenarioName: string;
    deviceName: string;
    occurredAt: string;
  }[];
}

/**
 * 디바이스 성능 요약
 */
export interface DevicePerformance {
  deviceId: string;
  deviceName?: string;
  brand?: string;
  model?: string;
  totalTests: number;
  successRate: number;
  avgDuration: number;
  avgStepDuration: number;
}

/**
 * 스텝 유형별 성능
 */
export interface StepTypePerformance {
  actionType: string;
  totalCount: number;
  successRate: number;
  avgDuration: number;
  avgImageMatchTime?: number;
  avgImageMatchConfidence?: number;
}

/**
 * 대시보드 개요
 */
export interface DashboardOverview {
  totalExecutions: number;
  totalScenarios: number;
  overallSuccessRate: number;
  avgExecutionTime: number;
  uniqueDevices: number;
  uniqueScenarios: number;
  recentFailures: number;
  todayExecutions: number;
}

/**
 * 메트릭 집계 서비스
 */
class MetricsAggregator {
  /**
   * 성공률 추이 조회 (일별)
   */
  getSuccessRateTrend(days: number = 30): SuccessRateTrend[] {
    const db = metricsDatabase.getDb();

    const stmt = db.prepare(`
      SELECT
        date,
        total_executions as totalExecutions,
        total_scenarios as totalScenarios,
        passed_scenarios as passedScenarios,
        failed_scenarios as failedScenarios,
        success_rate as successRate
      FROM daily_aggregates
      WHERE date >= date('now', '-' || ? || ' days')
      ORDER BY date ASC
    `);

    return stmt.all(days) as SuccessRateTrend[];
  }

  /**
   * 시나리오별 히스토리 조회
   */
  getScenarioHistory(limit: number = 50): ScenarioHistory[] {
    const db = metricsDatabase.getDb();

    const stmt = db.prepare(`
      SELECT
        sr.scenario_id as scenarioId,
        sr.scenario_name as scenarioName,
        MAX(sr.package_name) as packageName,
        MAX(sr.category_name) as categoryName,
        COUNT(*) as totalExecutions,
        SUM(CASE WHEN sr.status = 'passed' THEN 1 ELSE 0 END) as passedCount,
        SUM(CASE WHEN sr.status = 'failed' THEN 1 ELSE 0 END) as failedCount,
        ROUND(
          CAST(SUM(CASE WHEN sr.status = 'passed' THEN 1 ELSE 0 END) AS REAL) / COUNT(*) * 100,
          2
        ) as successRate,
        ROUND(AVG(sr.duration)) as avgDuration,
        MAX(te.completed_at) as lastExecutedAt,
        (SELECT status FROM scenario_results
         WHERE scenario_id = sr.scenario_id
         ORDER BY id DESC LIMIT 1) as lastStatus
      FROM scenario_results sr
      JOIN test_executions te ON sr.execution_id = te.execution_id
      GROUP BY sr.scenario_id
      ORDER BY totalExecutions DESC
      LIMIT ?
    `);

    return stmt.all(limit) as ScenarioHistory[];
  }

  /**
   * 특정 시나리오의 실행 히스토리
   */
  getScenarioExecutionHistory(scenarioId: string, limit: number = 20): {
    executionId: string;
    status: string;
    duration: number;
    deviceCount: number;
    executedAt: string;
    repeatIndex: number;
  }[] {
    const db = metricsDatabase.getDb();

    const stmt = db.prepare(`
      SELECT
        sr.execution_id as executionId,
        sr.status,
        sr.duration,
        (SELECT COUNT(DISTINCT device_id) FROM device_results
         WHERE scenario_result_id = sr.id) as deviceCount,
        te.completed_at as executedAt,
        sr.repeat_index as repeatIndex
      FROM scenario_results sr
      JOIN test_executions te ON sr.execution_id = te.execution_id
      WHERE sr.scenario_id = ?
      ORDER BY te.completed_at DESC
      LIMIT ?
    `);

    return stmt.all(scenarioId, limit) as {
      executionId: string;
      status: string;
      duration: number;
      deviceCount: number;
      executedAt: string;
      repeatIndex: number;
    }[];
  }

  /**
   * 실패 패턴 분석
   */
  getFailurePatterns(days: number = 30): FailurePattern[] {
    const db = metricsDatabase.getDb();

    // 1. 실패 유형별 집계
    const patternStmt = db.prepare(`
      SELECT
        COALESCE(sm.failure_type, 'unknown') as failureType,
        COALESCE(sm.failure_category, 'unknown') as failureCategory,
        COUNT(*) as count
      FROM step_metrics sm
      JOIN device_results dr ON sm.device_result_id = dr.id
      JOIN test_executions te ON dr.execution_id = te.execution_id
      WHERE sm.status IN ('failed', 'error')
        AND te.completed_at >= datetime('now', '-' || ? || ' days')
      GROUP BY sm.failure_type, sm.failure_category
      ORDER BY count DESC
      LIMIT 10
    `);

    const patterns = patternStmt.all(days) as {
      failureType: string;
      failureCategory: string;
      count: number;
    }[];

    // 2. 총 실패 수 계산
    const totalFailures = patterns.reduce((sum, p) => sum + p.count, 0);

    // 3. 각 패턴에 대한 상세 정보 수집
    return patterns.map(pattern => {
      // 영향받은 시나리오
      const scenariosStmt = db.prepare(`
        SELECT DISTINCT sr.scenario_name
        FROM step_metrics sm
        JOIN device_results dr ON sm.device_result_id = dr.id
        JOIN scenario_results sr ON dr.scenario_result_id = sr.id
        WHERE sm.failure_type = ? AND sm.failure_category = ?
        LIMIT 5
      `);
      const scenarios = scenariosStmt.all(pattern.failureType, pattern.failureCategory) as { scenario_name: string }[];

      // 영향받은 디바이스
      const devicesStmt = db.prepare(`
        SELECT DISTINCT dr.device_id
        FROM step_metrics sm
        JOIN device_results dr ON sm.device_result_id = dr.id
        WHERE sm.failure_type = ? AND sm.failure_category = ?
        LIMIT 5
      `);
      const devices = devicesStmt.all(pattern.failureType, pattern.failureCategory) as { device_id: string }[];

      // 최근 발생
      const recentStmt = db.prepare(`
        SELECT
          dr.execution_id as executionId,
          sr.scenario_name as scenarioName,
          COALESCE(dr.device_name, dr.device_id) as deviceName,
          te.completed_at as occurredAt
        FROM step_metrics sm
        JOIN device_results dr ON sm.device_result_id = dr.id
        JOIN scenario_results sr ON dr.scenario_result_id = sr.id
        JOIN test_executions te ON dr.execution_id = te.execution_id
        WHERE sm.failure_type = ? AND sm.failure_category = ?
        ORDER BY te.completed_at DESC
        LIMIT 3
      `);
      const recent = recentStmt.all(pattern.failureType, pattern.failureCategory) as {
        executionId: string;
        scenarioName: string;
        deviceName: string;
        occurredAt: string;
      }[];

      return {
        failureType: pattern.failureType,
        failureCategory: pattern.failureCategory,
        count: pattern.count,
        percentage: totalFailures > 0 ? Math.round((pattern.count / totalFailures) * 100 * 10) / 10 : 0,
        affectedScenarios: scenarios.map(s => s.scenario_name),
        affectedDevices: devices.map(d => d.device_id),
        recentOccurrences: recent,
      };
    });
  }

  /**
   * 디바이스별 성능 요약
   */
  getDevicePerformance(limit: number = 20): DevicePerformance[] {
    const db = metricsDatabase.getDb();

    const stmt = db.prepare(`
      SELECT
        dr.device_id as deviceId,
        MAX(dr.device_name) as deviceName,
        MAX(de.brand) as brand,
        MAX(de.model) as model,
        COUNT(*) as totalTests,
        ROUND(
          CAST(SUM(CASE WHEN dr.success = 1 THEN 1 ELSE 0 END) AS REAL) / COUNT(*) * 100,
          2
        ) as successRate,
        ROUND(AVG(dr.duration)) as avgDuration,
        ROUND(AVG(
          (SELECT AVG(sm.duration) FROM step_metrics sm WHERE sm.device_result_id = dr.id)
        )) as avgStepDuration
      FROM device_results dr
      LEFT JOIN device_environments de ON dr.id = de.device_result_id
      GROUP BY dr.device_id
      ORDER BY totalTests DESC
      LIMIT ?
    `);

    return stmt.all(limit) as DevicePerformance[];
  }

  /**
   * 스텝 유형별 성능
   */
  getStepTypePerformance(): StepTypePerformance[] {
    const db = metricsDatabase.getDb();

    const stmt = db.prepare(`
      SELECT
        COALESCE(action_type, node_type, 'unknown') as actionType,
        COUNT(*) as totalCount,
        ROUND(
          CAST(SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END) AS REAL) / COUNT(*) * 100,
          2
        ) as successRate,
        ROUND(AVG(duration)) as avgDuration,
        ROUND(AVG(image_match_time)) as avgImageMatchTime,
        ROUND(AVG(image_match_confidence), 4) as avgImageMatchConfidence
      FROM step_metrics
      WHERE action_type IS NOT NULL OR node_type IS NOT NULL
      GROUP BY COALESCE(action_type, node_type)
      ORDER BY totalCount DESC
    `);

    return stmt.all() as StepTypePerformance[];
  }

  /**
   * 대시보드 개요
   */
  getDashboardOverview(): DashboardOverview {
    const db = metricsDatabase.getDb();

    // 총 통계
    const totalStats = db.prepare(`
      SELECT
        COUNT(*) as totalExecutions,
        SUM(scenario_count) as totalScenarios,
        AVG(total_duration) as avgDuration,
        COUNT(DISTINCT execution_id) as uniqueExecutions
      FROM test_executions
    `).get() as {
      totalExecutions: number;
      totalScenarios: number;
      avgDuration: number;
      uniqueExecutions: number;
    };

    // 성공률
    const successStats = db.prepare(`
      SELECT
        ROUND(
          CAST(SUM(passed_scenarios) AS REAL) /
          NULLIF(SUM(total_scenarios), 0) * 100,
          2
        ) as overallSuccessRate
      FROM daily_aggregates
    `).get() as { overallSuccessRate: number };

    // 고유 디바이스/시나리오
    const uniqueCounts = db.prepare(`
      SELECT
        (SELECT COUNT(DISTINCT device_id) FROM device_results) as uniqueDevices,
        (SELECT COUNT(DISTINCT scenario_id) FROM scenario_results) as uniqueScenarios
    `).get() as { uniqueDevices: number; uniqueScenarios: number };

    // 최근 실패 수 (7일)
    const recentFailures = db.prepare(`
      SELECT COUNT(*) as count
      FROM scenario_results sr
      JOIN test_executions te ON sr.execution_id = te.execution_id
      WHERE sr.status = 'failed'
        AND te.completed_at >= datetime('now', '-7 days')
    `).get() as { count: number };

    // 오늘 실행 수
    const todayExec = db.prepare(`
      SELECT COUNT(*) as count
      FROM test_executions
      WHERE date(completed_at) = date('now')
    `).get() as { count: number };

    return {
      totalExecutions: totalStats?.totalExecutions || 0,
      totalScenarios: totalStats?.totalScenarios || 0,
      overallSuccessRate: successStats?.overallSuccessRate || 0,
      avgExecutionTime: Math.round(totalStats?.avgDuration || 0),
      uniqueDevices: uniqueCounts?.uniqueDevices || 0,
      uniqueScenarios: uniqueCounts?.uniqueScenarios || 0,
      recentFailures: recentFailures?.count || 0,
      todayExecutions: todayExec?.count || 0,
    };
  }

  /**
   * 최근 실행 목록
   */
  getRecentExecutions(limit: number = 20): {
    executionId: string;
    testName?: string;
    requesterName?: string;
    status: string;
    deviceCount: number;
    scenarioCount: number;
    duration: number;
    startedAt: string;
    completedAt: string;
    passedScenarios: number;
    failedScenarios: number;
  }[] {
    const db = metricsDatabase.getDb();

    const stmt = db.prepare(`
      SELECT
        execution_id as executionId,
        test_name as testName,
        requester_name as requesterName,
        status,
        device_count as deviceCount,
        scenario_count as scenarioCount,
        total_duration as duration,
        started_at as startedAt,
        completed_at as completedAt,
        passed_scenarios as passedScenarios,
        failed_scenarios as failedScenarios
      FROM test_executions
      ORDER BY completed_at DESC
      LIMIT ?
    `);

    return stmt.all(limit) as {
      executionId: string;
      testName?: string;
      requesterName?: string;
      status: string;
      deviceCount: number;
      scenarioCount: number;
      duration: number;
      startedAt: string;
      completedAt: string;
      passedScenarios: number;
      failedScenarios: number;
    }[];
  }

  /**
   * 이미지 매칭 성능 분석
   */
  getImageMatchPerformance(): {
    totalMatches: number;
    avgMatchTime: number;
    avgConfidence: number;
    successRate: number;
    byTemplate: {
      templateId: string;
      count: number;
      avgConfidence: number;
      avgMatchTime: number;
    }[];
  } {
    const db = metricsDatabase.getDb();

    // 전체 이미지 매칭 통계
    const overall = db.prepare(`
      SELECT
        COUNT(*) as totalMatches,
        AVG(image_match_time) as avgMatchTime,
        AVG(image_match_confidence) as avgConfidence,
        ROUND(
          CAST(SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END) AS REAL) /
          NULLIF(COUNT(*), 0) * 100,
          2
        ) as successRate
      FROM step_metrics
      WHERE image_match_time IS NOT NULL
    `).get() as {
      totalMatches: number;
      avgMatchTime: number;
      avgConfidence: number;
      successRate: number;
    };

    // 템플릿별 통계
    const byTemplate = db.prepare(`
      SELECT
        image_match_template_id as templateId,
        COUNT(*) as count,
        AVG(image_match_confidence) as avgConfidence,
        AVG(image_match_time) as avgMatchTime
      FROM step_metrics
      WHERE image_match_template_id IS NOT NULL
      GROUP BY image_match_template_id
      ORDER BY count DESC
      LIMIT 20
    `).all() as {
      templateId: string;
      count: number;
      avgConfidence: number;
      avgMatchTime: number;
    }[];

    return {
      totalMatches: overall?.totalMatches || 0,
      avgMatchTime: Math.round(overall?.avgMatchTime || 0),
      avgConfidence: Math.round((overall?.avgConfidence || 0) * 10000) / 10000,
      successRate: overall?.successRate || 0,
      byTemplate: byTemplate.map(t => ({
        ...t,
        avgConfidence: Math.round((t.avgConfidence || 0) * 10000) / 10000,
        avgMatchTime: Math.round(t.avgMatchTime || 0),
      })),
    };
  }
}

export const metricsAggregator = new MetricsAggregator();
