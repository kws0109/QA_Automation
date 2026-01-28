// backend/src/events/eventTypes.ts
// Socket.IO 이벤트 이름 상수 정의
// 모든 이벤트 이름을 중앙에서 관리하여 오타 방지 및 일관성 유지

/**
 * 테스트 실행 관련 이벤트
 */
export const TEST_EVENTS = {
  // 테스트 준비 및 시작
  PREPARING: 'test:preparing',
  SESSION_VALIDATING: 'test:session:validating',
  SESSION_RECREATED: 'test:session:recreated',
  SESSION_FAILED: 'test:session:failed',
  SCENARIOS_SKIPPED: 'test:scenarios:skipped',
  START: 'test:start',

  // 테스트 진행
  PROGRESS: 'test:progress',
  STOPPING: 'test:stopping',
  COMPLETE: 'test:complete',

  // 디바이스별 이벤트
  DEVICE_START: 'test:device:start',
  DEVICE_COMPLETE: 'test:device:complete',
  DEVICE_SCENARIO_START: 'test:device:scenario:start',
  DEVICE_SCENARIO_COMPLETE: 'test:device:scenario:complete',
  DEVICE_NODE: 'test:device:node',
} as const;

/**
 * Suite 실행 관련 이벤트
 */
export const SUITE_EVENTS = {
  START: 'suite:start',
  COMPLETE: 'suite:complete',
  STOPPED: 'suite:stopped',
  PROGRESS: 'suite:progress',

  // 디바이스별 이벤트
  DEVICE_START: 'suite:device:start',
  DEVICE_COMPLETE: 'suite:device:complete',

  // 시나리오별 이벤트
  SCENARIO_START: 'suite:scenario:start',
  SCENARIO_COMPLETE: 'suite:scenario:complete',

  // 스텝별 이벤트
  STEP_START: 'suite:step:start',
  STEP_WAITING: 'suite:step:waiting',
  STEP_COMPLETE: 'suite:step:complete',
} as const;

/**
 * 대기열 관련 이벤트
 */
export const QUEUE_EVENTS = {
  UPDATED: 'queue:updated',
  POSITION: 'queue:position',
  SUBMITTED: 'queue:submitted',
  CANCELLED: 'queue:cancelled',
  AUTO_START: 'queue:auto_start',
  DEVICES_STARTED: 'queue:devices_started',
  STATUS_RESPONSE: 'queue:status:response',
  CANCEL_RESPONSE: 'queue:cancel:response',
  FORCE_COMPLETE_RESPONSE: 'queue:force_complete:response',
} as const;

/**
 * 디바이스 관련 이벤트
 */
export const DEVICE_EVENTS = {
  LOCKS_UPDATED: 'device:locks_updated',
} as const;

/**
 * 스케줄 관련 이벤트
 */
export const SCHEDULE_EVENTS = {
  START: 'schedule:start',
  COMPLETE: 'schedule:complete',
  ENABLED: 'schedule:enabled',
  DISABLED: 'schedule:disabled',
} as const;

/**
 * 리포트 관련 이벤트
 */
export const REPORT_EVENTS = {
  CREATED: 'report:created',
} as const;

/**
 * 사용자 관련 이벤트
 */
export const USER_EVENTS = {
  IDENTIFIED: 'user:identified',
} as const;

/**
 * 스크린샷 관련 이벤트
 */
export const SCREENSHOT_EVENTS = {
  UPDATE: 'screenshot:update',
  ERROR: 'screenshot:error',
  SAVED: 'screenshot:saved',
} as const;

/**
 * 일반 이벤트
 */
export const GENERAL_EVENTS = {
  PONG: 'pong',
  ERROR: 'error',
} as const;

/**
 * 모든 이벤트를 하나로 묶은 객체
 */
export const SOCKET_EVENTS = {
  TEST: TEST_EVENTS,
  SUITE: SUITE_EVENTS,
  QUEUE: QUEUE_EVENTS,
  DEVICE: DEVICE_EVENTS,
  SCHEDULE: SCHEDULE_EVENTS,
  REPORT: REPORT_EVENTS,
  USER: USER_EVENTS,
  SCREENSHOT: SCREENSHOT_EVENTS,
  GENERAL: GENERAL_EVENTS,
} as const;

// 타입 추출
export type TestEventName = typeof TEST_EVENTS[keyof typeof TEST_EVENTS];
export type SuiteEventName = typeof SUITE_EVENTS[keyof typeof SUITE_EVENTS];
export type QueueEventName = typeof QUEUE_EVENTS[keyof typeof QUEUE_EVENTS];
export type DeviceEventName = typeof DEVICE_EVENTS[keyof typeof DEVICE_EVENTS];
export type ScheduleEventName = typeof SCHEDULE_EVENTS[keyof typeof SCHEDULE_EVENTS];
export type ReportEventName = typeof REPORT_EVENTS[keyof typeof REPORT_EVENTS];
export type UserEventName = typeof USER_EVENTS[keyof typeof USER_EVENTS];
export type ScreenshotEventName = typeof SCREENSHOT_EVENTS[keyof typeof SCREENSHOT_EVENTS];
export type GeneralEventName = typeof GENERAL_EVENTS[keyof typeof GENERAL_EVENTS];

export type SocketEventName =
  | TestEventName
  | SuiteEventName
  | QueueEventName
  | DeviceEventName
  | ScheduleEventName
  | ReportEventName
  | UserEventName
  | ScreenshotEventName
  | GeneralEventName;
