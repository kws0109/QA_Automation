// backend/src/services/metricsDatabase.ts
// 메트릭 집계용 SQLite 데이터베이스 서비스

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(__dirname, '../../data/metrics.db');

/**
 * SQLite 데이터베이스 연결 및 스키마 관리
 */
class MetricsDatabase {
  private db: Database.Database | null = null;

  /**
   * 데이터베이스 연결 (싱글톤)
   */
  getDb(): Database.Database {
    if (!this.db) {
      // data 디렉토리 확인
      const dataDir = path.dirname(DB_PATH);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      this.db = new Database(DB_PATH);
      this.db.pragma('journal_mode = WAL');  // 성능 최적화
      this.db.pragma('foreign_keys = ON');   // FK 제약조건 활성화

      this.initSchema();
      console.log('[MetricsDatabase] 데이터베이스 연결됨:', DB_PATH);
    }
    return this.db;
  }

  /**
   * 스키마 초기화
   */
  private initSchema(): void {
    const db = this.db!;

    // 1. test_executions - 테스트 실행 메타데이터
    db.exec(`
      CREATE TABLE IF NOT EXISTS test_executions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        execution_id TEXT UNIQUE NOT NULL,
        report_id TEXT,
        test_name TEXT,
        requester_name TEXT,
        started_at TEXT NOT NULL,
        completed_at TEXT NOT NULL,
        total_duration INTEGER NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('completed', 'failed', 'stopped', 'partial')),
        device_count INTEGER NOT NULL,
        scenario_count INTEGER NOT NULL,
        passed_scenarios INTEGER NOT NULL DEFAULT 0,
        failed_scenarios INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);

    // 2. scenario_results - 시나리오별 결과
    db.exec(`
      CREATE TABLE IF NOT EXISTS scenario_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        execution_id TEXT NOT NULL,
        scenario_id TEXT NOT NULL,
        scenario_name TEXT NOT NULL,
        package_id TEXT,
        package_name TEXT,
        category_id TEXT,
        category_name TEXT,
        repeat_index INTEGER DEFAULT 0,
        status TEXT NOT NULL CHECK(status IN ('passed', 'failed', 'partial', 'skipped')),
        duration INTEGER NOT NULL,
        FOREIGN KEY (execution_id) REFERENCES test_executions(execution_id) ON DELETE CASCADE
      )
    `);

    // 3. device_results - 디바이스별 결과
    db.exec(`
      CREATE TABLE IF NOT EXISTS device_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scenario_result_id INTEGER NOT NULL,
        execution_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        device_name TEXT,
        success INTEGER NOT NULL,
        duration INTEGER NOT NULL,
        error_message TEXT,
        step_count INTEGER DEFAULT 0,
        passed_steps INTEGER DEFAULT 0,
        failed_steps INTEGER DEFAULT 0,
        FOREIGN KEY (scenario_result_id) REFERENCES scenario_results(id) ON DELETE CASCADE
      )
    `);

    // 4. step_metrics - 스텝별 성능 메트릭
    db.exec(`
      CREATE TABLE IF NOT EXISTS step_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_result_id INTEGER NOT NULL,
        node_id TEXT NOT NULL,
        node_name TEXT,
        node_type TEXT,
        action_type TEXT,
        status TEXT NOT NULL,
        duration INTEGER,
        wait_time INTEGER,
        action_time INTEGER,
        image_match_time INTEGER,
        image_match_confidence REAL,
        image_match_template_id TEXT,
        failure_type TEXT,
        failure_category TEXT,
        FOREIGN KEY (device_result_id) REFERENCES device_results(id) ON DELETE CASCADE
      )
    `);

    // 5. device_environments - 디바이스 환경 스냅샷
    db.exec(`
      CREATE TABLE IF NOT EXISTS device_environments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_result_id INTEGER NOT NULL,
        device_id TEXT NOT NULL,
        brand TEXT,
        model TEXT,
        android_version TEXT,
        sdk_version INTEGER,
        screen_resolution TEXT,
        total_memory INTEGER,
        available_memory INTEGER,
        battery_level INTEGER,
        battery_status TEXT,
        network_type TEXT,
        captured_at TEXT,
        FOREIGN KEY (device_result_id) REFERENCES device_results(id) ON DELETE CASCADE
      )
    `);

    // 6. daily_aggregates - 일별 집계 캐시
    db.exec(`
      CREATE TABLE IF NOT EXISTS daily_aggregates (
        date TEXT PRIMARY KEY,
        total_executions INTEGER NOT NULL DEFAULT 0,
        total_scenarios INTEGER NOT NULL DEFAULT 0,
        passed_scenarios INTEGER NOT NULL DEFAULT 0,
        failed_scenarios INTEGER NOT NULL DEFAULT 0,
        total_duration INTEGER NOT NULL DEFAULT 0,
        avg_duration INTEGER NOT NULL DEFAULT 0,
        unique_devices INTEGER NOT NULL DEFAULT 0,
        unique_scenarios INTEGER NOT NULL DEFAULT 0,
        success_rate REAL NOT NULL DEFAULT 0,
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);

    // 인덱스 생성 (쿼리 성능 최적화)
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_executions_started_at ON test_executions(started_at);
      CREATE INDEX IF NOT EXISTS idx_executions_status ON test_executions(status);
      CREATE INDEX IF NOT EXISTS idx_scenario_results_execution ON scenario_results(execution_id);
      CREATE INDEX IF NOT EXISTS idx_scenario_results_scenario ON scenario_results(scenario_id);
      CREATE INDEX IF NOT EXISTS idx_device_results_execution ON device_results(execution_id);
      CREATE INDEX IF NOT EXISTS idx_device_results_device ON device_results(device_id);
      CREATE INDEX IF NOT EXISTS idx_step_metrics_device_result ON step_metrics(device_result_id);
      CREATE INDEX IF NOT EXISTS idx_step_metrics_action_type ON step_metrics(action_type);
      CREATE INDEX IF NOT EXISTS idx_step_metrics_failure_type ON step_metrics(failure_type);
    `);

    console.log('[MetricsDatabase] 스키마 초기화 완료');
  }

  /**
   * 데이터베이스 연결 종료
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      console.log('[MetricsDatabase] 데이터베이스 연결 종료');
    }
  }

  /**
   * 데이터베이스 경로 반환
   */
  getDbPath(): string {
    return DB_PATH;
  }
}

export const metricsDatabase = new MetricsDatabase();
