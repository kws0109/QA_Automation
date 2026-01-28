// backend/src/events/index.ts
// Socket.IO 이벤트 모듈 진입점

export { eventEmitter } from './eventEmitter';
export {
  SOCKET_EVENTS,
  TEST_EVENTS,
  SUITE_EVENTS,
  QUEUE_EVENTS,
  DEVICE_EVENTS,
  SCHEDULE_EVENTS,
  REPORT_EVENTS,
  USER_EVENTS,
  SCREENSHOT_EVENTS,
  GENERAL_EVENTS,
} from './eventTypes';
export type {
  SocketEventName,
  TestEventName,
  SuiteEventName,
  QueueEventName,
  DeviceEventName,
  ScheduleEventName,
  ReportEventName,
  UserEventName,
  ScreenshotEventName,
  GeneralEventName,
} from './eventTypes';
