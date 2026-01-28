// backend/src/appium/actions.ts
// 하위 호환성을 위한 re-export 파일

export { Actions } from './actions/index';
export type {
  ActionResult,
  RetryOptions,
  ElementExistsResult,
  TextContainsResult,
  ElementStateResult,
  WaitResult,
  SelectorStrategy,
  DriverProvider,
} from './actions/index';
