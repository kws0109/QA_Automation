// frontend/src/types/schedule.ts
// 스케줄링 관련 타입

// ========== 스케줄링 (Suite 기반) ==========

// 스케줄 정보
export interface Schedule {
  id: string;
  name: string;
  suiteId: string;              // Suite 기반으로 변경
  cronExpression: string;       // '0 10 * * *' 형식
  enabled: boolean;
  description?: string;
  repeatCount?: number;         // 반복 횟수 (기본: 1)
  scenarioInterval?: number;    // 시나리오 간격 ms (기본: 0)
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  nextRunAt?: string;
}

// 스케줄 생성 요청
export interface CreateScheduleRequest {
  name: string;
  suiteId: string;
  cronExpression: string;
  description?: string;
  repeatCount?: number;
  scenarioInterval?: number;
}

// 스케줄 수정 요청
export interface UpdateScheduleRequest {
  name?: string;
  suiteId?: string;
  cronExpression?: string;
  description?: string;
  enabled?: boolean;
  repeatCount?: number;
  scenarioInterval?: number;
}

// 스케줄 실행 이력
export interface ScheduleHistory {
  id: string;
  scheduleId: string;
  scheduleName: string;
  suiteId: string;
  suiteName: string;
  startedAt: string;
  completedAt: string;
  success: boolean;
  reportId?: string;  // SuiteReport ID 연결
  error?: string;
}

// 스케줄 목록 아이템
export interface ScheduleListItem {
  id: string;
  name: string;
  suiteId: string;
  suiteName: string;
  cronExpression: string;
  enabled: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
}

// Cron 표현식 프리셋
export interface CronPreset {
  label: string;
  expression: string;
  description: string;
}

// 스케줄 Socket 이벤트
export interface ScheduleSocketEvents {
  'schedule:start': {
    scheduleId: string;
    scheduleName: string;
    suiteId: string;
    startedAt: string;
  };
  'schedule:complete': {
    scheduleId: string;
    scheduleName: string;
    success: boolean;
    error?: string;
    reportId?: string;
    startedAt: string;
    completedAt: string;
    duration: number;
  };
  'schedule:enabled': {
    scheduleId: string;
    scheduleName: string;
  };
  'schedule:disabled': {
    scheduleId: string;
  };
}
