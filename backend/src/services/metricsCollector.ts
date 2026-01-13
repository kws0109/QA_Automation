// backend/src/services/metricsCollector.ts
// 테스트 결과 메트릭 수집 서비스

import { metricsDatabase } from './metricsDatabase';
import {
  TestReport,
  ScenarioReportResult,
  DeviceScenarioResult,
  StepResult,
} from '../types';

/**
 * 테스트 리포트에서 메트릭을 추출하여 SQLite에 저장
 */
class MetricsCollector {
  /**
   * 리포트에서 메트릭 수집 및 저장
   */
  async collect(report: TestReport): Promise<void> {
    const db = metricsDatabase.getDb();

    try {
      // 트랜잭션으로 일괄 저장
      const transaction = db.transaction(() => {
        // 1. test_executions 저장
        const executionId = this.saveExecution(report);

        // 2. 시나리오/디바이스/스텝 결과 저장
        for (const scenarioResult of report.scenarioResults) {
          const scenarioResultId = this.saveScenarioResult(executionId, scenarioResult);

          for (const deviceResult of scenarioResult.deviceResults) {
            const deviceResultId = this.saveDeviceResult(
              scenarioResultId,
              executionId,
              deviceResult
            );

            // 환경 정보 저장
            if (deviceResult.environment) {
              this.saveDeviceEnvironment(deviceResultId, deviceResult);
            }

            // 스텝 메트릭 저장
            for (const step of deviceResult.steps) {
              this.saveStepMetric(deviceResultId, step);
            }
          }
        }

        // 3. 일별 집계 업데이트
        this.updateDailyAggregate(report);
      });

      transaction();
      console.log(`[MetricsCollector] 메트릭 수집 완료: ${report.id}`);
    } catch (error) {
      console.error(`[MetricsCollector] 메트릭 수집 실패:`, error);
      throw error;
    }
  }

  /**
   * 테스트 실행 메타데이터 저장
   */
  private saveExecution(report: TestReport): string {
    const db = metricsDatabase.getDb();

    const passedScenarios = report.scenarioResults.filter(s => s.status === 'passed').length;
    const failedScenarios = report.scenarioResults.filter(s => s.status === 'failed').length;

    // 상태 결정 (report.status 사용)
    const status = report.status;

    const stmt = db.prepare(`
      INSERT OR REPLACE INTO test_executions (
        execution_id, report_id, test_name, requester_name,
        started_at, completed_at, total_duration, status,
        device_count, scenario_count, passed_scenarios, failed_scenarios
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      report.executionId || report.id,
      report.id,
      report.executionInfo?.testName || null,
      report.executionInfo?.requesterName || null,
      report.startedAt,
      report.completedAt,
      report.stats.totalDuration,
      status,
      report.stats.totalDevices,
      report.stats.totalScenarios,
      passedScenarios,
      failedScenarios
    );

    return report.executionId || report.id;
  }

  /**
   * 시나리오 결과 저장
   */
  private saveScenarioResult(executionId: string, scenario: ScenarioReportResult): number {
    const db = metricsDatabase.getDb();

    const stmt = db.prepare(`
      INSERT INTO scenario_results (
        execution_id, scenario_id, scenario_name,
        package_id, package_name, category_id, category_name,
        repeat_index, status, duration
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      executionId,
      scenario.scenarioId,
      scenario.scenarioName,
      scenario.packageId || null,
      scenario.packageName || null,
      scenario.categoryId || null,
      scenario.categoryName || null,
      scenario.repeatIndex || 0,
      scenario.status,
      scenario.duration
    );

    return result.lastInsertRowid as number;
  }

  /**
   * 디바이스 결과 저장
   */
  private saveDeviceResult(
    scenarioResultId: number,
    executionId: string,
    device: DeviceScenarioResult
  ): number {
    const db = metricsDatabase.getDb();

    const passedSteps = device.steps.filter(s => s.status === 'passed').length;
    const failedSteps = device.steps.filter(s => s.status === 'failed' || s.status === 'error').length;

    const stmt = db.prepare(`
      INSERT INTO device_results (
        scenario_result_id, execution_id, device_id, device_name,
        success, duration, error_message,
        step_count, passed_steps, failed_steps
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      scenarioResultId,
      executionId,
      device.deviceId,
      device.deviceName || null,
      device.success ? 1 : 0,
      device.duration,
      device.error || null,
      device.steps.length,
      passedSteps,
      failedSteps
    );

    return result.lastInsertRowid as number;
  }

  /**
   * 디바이스 환경 정보 저장
   */
  private saveDeviceEnvironment(deviceResultId: number, device: DeviceScenarioResult): void {
    const db = metricsDatabase.getDb();
    const env = device.environment!;

    const stmt = db.prepare(`
      INSERT INTO device_environments (
        device_result_id, device_id, brand, model,
        android_version, sdk_version, screen_resolution,
        total_memory, available_memory,
        battery_level, battery_status, network_type, captured_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      deviceResultId,
      device.deviceId,
      env.brand || null,
      env.model || null,
      env.androidVersion || null,
      env.sdkVersion || null,
      env.screenResolution || null,
      env.totalMemory || null,
      env.availableMemory || null,
      env.batteryLevel || null,
      env.batteryStatus || null,
      env.networkType || null,
      new Date().toISOString()
    );
  }

  /**
   * 스텝 메트릭 저장
   */
  private saveStepMetric(deviceResultId: number, step: StepResult): void {
    const db = metricsDatabase.getDb();

    // 실패 분석 정보 추출
    const failureType = step.failureAnalysis?.failureType || null;
    // 실패 유형에서 카테고리 유추 (timeout/element/image/app/system)
    const failureCategory = failureType ? this.categorizeFailure(failureType) : null;

    // 성능 메트릭 추출
    const perf = step.performance;
    const imageMatch = perf?.imageMatch;

    const stmt = db.prepare(`
      INSERT INTO step_metrics (
        device_result_id, node_id, node_name, node_type,
        action_type, status, duration, wait_time, action_time,
        image_match_time, image_match_confidence, image_match_template_id,
        failure_type, failure_category
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      deviceResultId,
      step.nodeId,
      step.nodeName || null,
      step.nodeType || null,
      step.nodeType === 'action' ? step.nodeName : null,  // 액션 타입 (간략화)
      step.status,
      step.duration || null,
      perf?.waitTime || null,
      perf?.actionTime || null,
      imageMatch?.matchTime || null,
      imageMatch?.confidence || null,
      imageMatch?.templateId || null,
      failureType,
      failureCategory
    );
  }

  /**
   * 일별 집계 업데이트
   */
  private updateDailyAggregate(report: TestReport): void {
    const db = metricsDatabase.getDb();

    // 리포트 날짜 추출 (YYYY-MM-DD)
    const date = report.completedAt.split('T')[0];

    const passedScenarios = report.scenarioResults.filter(s => s.status === 'passed').length;
    const failedScenarios = report.scenarioResults.filter(s => s.status === 'failed').length;

    // 기존 데이터 조회
    const existing = db.prepare(`
      SELECT * FROM daily_aggregates WHERE date = ?
    `).get(date) as {
      total_executions: number;
      total_scenarios: number;
      passed_scenarios: number;
      failed_scenarios: number;
      total_duration: number;
    } | undefined;

    if (existing) {
      // 업데이트
      const totalScenarios = existing.total_scenarios + report.scenarioResults.length;
      const totalPassed = existing.passed_scenarios + passedScenarios;
      const totalFailed = existing.failed_scenarios + failedScenarios;
      const totalDuration = existing.total_duration + report.stats.totalDuration;
      const avgDuration = Math.round(totalDuration / (existing.total_executions + 1));
      const successRate = totalScenarios > 0 ? (totalPassed / totalScenarios) * 100 : 0;

      db.prepare(`
        UPDATE daily_aggregates SET
          total_executions = total_executions + 1,
          total_scenarios = ?,
          passed_scenarios = ?,
          failed_scenarios = ?,
          total_duration = ?,
          avg_duration = ?,
          success_rate = ?,
          updated_at = datetime('now')
        WHERE date = ?
      `).run(
        totalScenarios,
        totalPassed,
        totalFailed,
        totalDuration,
        avgDuration,
        successRate,
        date
      );
    } else {
      // 새로 추가
      const successRate = report.scenarioResults.length > 0
        ? (passedScenarios / report.scenarioResults.length) * 100
        : 0;

      // 고유 디바이스/시나리오 수 계산
      const uniqueDevices = new Set<string>();
      const uniqueScenarios = new Set<string>();
      for (const scenario of report.scenarioResults) {
        uniqueScenarios.add(scenario.scenarioId);
        for (const device of scenario.deviceResults) {
          uniqueDevices.add(device.deviceId);
        }
      }

      db.prepare(`
        INSERT INTO daily_aggregates (
          date, total_executions, total_scenarios,
          passed_scenarios, failed_scenarios,
          total_duration, avg_duration,
          unique_devices, unique_scenarios, success_rate
        ) VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        date,
        report.scenarioResults.length,
        passedScenarios,
        failedScenarios,
        report.stats.totalDuration,
        report.stats.totalDuration,
        uniqueDevices.size,
        uniqueScenarios.size,
        successRate
      );
    }
  }

  /**
   * 실패 유형에서 카테고리 유추
   */
  private categorizeFailure(failureType: string): string {
    const categories: Record<string, string[]> = {
      timeout: ['timeout'],
      element: ['element_not_found', 'text_not_found'],
      image: ['image_not_matched'],
      app: ['app_crash', 'app_not_running', 'assertion_failed'],
      system: ['session_error', 'connection_error', 'network_error', 'permission_denied', 'resource_exhausted'],
    };

    for (const [category, types] of Object.entries(categories)) {
      if (types.includes(failureType)) {
        return category;
      }
    }
    return 'unknown';
  }

  /**
   * 특정 실행 ID의 메트릭 삭제
   */
  deleteByExecutionId(executionId: string): void {
    const db = metricsDatabase.getDb();

    db.prepare(`
      DELETE FROM test_executions WHERE execution_id = ?
    `).run(executionId);

    console.log(`[MetricsCollector] 메트릭 삭제 완료: ${executionId}`);
  }
}

export const metricsCollector = new MetricsCollector();
