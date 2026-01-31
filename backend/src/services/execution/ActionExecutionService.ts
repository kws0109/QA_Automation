// backend/src/services/execution/ActionExecutionService.ts
// 액션 실행 통합 서비스 - testExecutor와 suiteExecutor의 중복 로직 통합

import { Actions, ActionResult } from '../../appium/actions';
import { createLogger } from '../../utils/logger';

const logger = createLogger('ActionExecutionService');

/**
 * 세션 크래시 에러 패턴
 * UiAutomator2 서버가 크래시되었을 때 발생하는 에러 메시지 패턴
 */
const SESSION_CRASH_PATTERNS = [
  'instrumentation process is not running',
  'cannot be proxied to UiAutomator2 server',
  'session has been terminated',
  'session is either terminated or not started',
  'A session is either terminated or not started',
  'invalid session id',
  'Session timed out',
  'ECONNREFUSED',
  'ECONNRESET',
  '세션이 종료됨',
];

/**
 * 세션 크래시 에러 클래스
 * 세션이 크래시되어 복구가 필요한 상황을 나타냅니다.
 */
export class SessionCrashError extends Error {
  public readonly isSessionCrash = true;
  public readonly originalError: Error;

  constructor(message: string, originalError: Error) {
    super(message);
    this.name = 'SessionCrashError';
    this.originalError = originalError;
  }
}

/**
 * 에러가 세션 크래시인지 확인
 */
export function isSessionCrashError(error: unknown): boolean {
  if (error instanceof SessionCrashError) {
    return true;
  }

  const errorMessage = error instanceof Error ? error.message : String(error);
  return SESSION_CRASH_PATTERNS.some(pattern =>
    errorMessage.toLowerCase().includes(pattern.toLowerCase())
  );
}

/**
 * 액션 실행 결과
 */
export interface ActionExecutionResult {
  success: boolean;
  message?: string;
  result?: ActionResult | null;
  performance?: {
    matchTime?: number;
    confidence?: number;
    templateId?: string;
    ocrTime?: number;
    searchText?: string;
    matchType?: string;
  };
}

/**
 * 조건 평가 결과
 */
export interface ConditionEvaluationResult {
  passed: boolean;
  error?: string;
}

/**
 * 노드 파라미터 인터페이스
 */
export interface NodeParams {
  actionType?: string;
  conditionType?: string;
  // 절대 좌표 (deprecated, 하위 호환성용)
  x?: number;
  y?: number;
  startX?: number;
  startY?: number;
  endX?: number;
  endY?: number;
  // 퍼센트 좌표 (0-1 범위, 해상도 독립적) - 우선 사용
  xPercent?: number;
  yPercent?: number;
  startXPercent?: number;
  startYPercent?: number;
  endXPercent?: number;
  endYPercent?: number;
  duration?: number;
  text?: string;
  selector?: string;
  selectorType?: 'id' | 'xpath' | 'accessibility id' | 'text';
  timeout?: number;
  templateId?: string;
  threshold?: number;
  region?: { x: number; y: number; width: number; height: number };
  tapAfterWait?: boolean;
  keycode?: number;
  packageName?: string;
  matchType?: 'exact' | 'contains' | 'regex';
  caseSensitive?: boolean;
  index?: number;
  offset?: { x: number; y: number };
  retryCount?: number;
  retryDelay?: number;
  shouldExist?: boolean;
}

/**
 * 실행할 노드 인터페이스
 */
export interface ExecutableNode {
  id: string;
  type?: string;
  params?: NodeParams;
  data?: NodeParams; // 하위 호환성
}

/**
 * 디바이스 화면 크기 정보
 */
interface DeviceScreenSize {
  width: number;
  height: number;
}

/**
 * ActionExecutionService
 * testExecutor와 suiteExecutor에서 공유하는 액션 실행 로직 통합
 */
export class ActionExecutionService {
  /**
   * 퍼센트 좌표를 절대 좌표로 변환
   * @param percent 퍼센트 값 (0-1)
   * @param total 전체 크기 (픽셀)
   */
  private percentToAbsolute(percent: number, total: number): number {
    return Math.round(percent * total);
  }

  /**
   * 디바이스 화면 크기 조회
   */
  private async getDeviceScreenSize(actions: Actions): Promise<DeviceScreenSize> {
    try {
      const driver = await actions.getDriver();
      const windowSize = await driver.getWindowRect();
      return { width: windowSize.width, height: windowSize.height };
    } catch (error) {
      // 기본값 반환 (조회 실패 시)
      logger.warn(`화면 크기 조회 실패, 기본값 사용: ${error}`);
      return { width: 1080, height: 1920 };
    }
  }

  /**
   * 좌표 변환 (퍼센트 → 절대, 또는 절대 좌표 그대로 사용)
   */
  private async resolveCoordinates(
    actions: Actions,
    params: NodeParams,
    type: 'tap' | 'swipe'
  ): Promise<{ x: number; y: number; startX?: number; startY?: number; endX?: number; endY?: number }> {
    const deviceId = actions.getDeviceId();

    logger.info(`[${deviceId}] resolveCoordinates 호출: type=${type}`);
    logger.info(`[${deviceId}] params.xPercent=${params.xPercent}, params.yPercent=${params.yPercent}, params.x=${params.x}, params.y=${params.y}`);

    // 퍼센트 좌표가 있으면 변환
    const hasPercentCoords = type === 'tap'
      ? (params.xPercent !== undefined && params.yPercent !== undefined)
      : (params.startXPercent !== undefined && params.startYPercent !== undefined &&
         params.endXPercent !== undefined && params.endYPercent !== undefined);

    logger.info(`[${deviceId}] hasPercentCoords=${hasPercentCoords}`);

    if (hasPercentCoords) {
      const screenSize = await this.getDeviceScreenSize(actions);
      logger.info(`[${deviceId}] 퍼센트 좌표 변환: 화면 크기 ${screenSize.width}x${screenSize.height}`);

      if (type === 'tap') {
        const x = this.percentToAbsolute(params.xPercent!, screenSize.width);
        const y = this.percentToAbsolute(params.yPercent!, screenSize.height);
        logger.info(`[${deviceId}] 탭 좌표: (${params.xPercent! * 100}%, ${params.yPercent! * 100}%) → (${x}, ${y})`);
        return { x, y };
      } else {
        const startX = this.percentToAbsolute(params.startXPercent!, screenSize.width);
        const startY = this.percentToAbsolute(params.startYPercent!, screenSize.height);
        const endX = this.percentToAbsolute(params.endXPercent!, screenSize.width);
        const endY = this.percentToAbsolute(params.endYPercent!, screenSize.height);
        logger.info(`[${deviceId}] 스와이프 좌표: (${startX}, ${startY}) → (${endX}, ${endY})`);
        return { x: 0, y: 0, startX, startY, endX, endY };
      }
    }

    // 절대 좌표 사용 (하위 호환성)
    if (type === 'tap') {
      const x = params.x;
      const y = params.y;

      // 좌표 유효성 검증
      if (x === undefined || y === undefined || x === null || y === null) {
        throw new Error(`탭 좌표가 설정되지 않았습니다. 디바이스 프리뷰에서 좌표를 선택해주세요.`);
      }
      if (typeof x !== 'number' || typeof y !== 'number' || isNaN(x) || isNaN(y)) {
        throw new Error(`잘못된 탭 좌표입니다: x=${x}, y=${y}`);
      }

      logger.info(`[${deviceId}] 절대 좌표 사용: (${x}, ${y})`);
      return { x, y };
    } else {
      const { startX, startY, endX, endY } = params;

      // 좌표 유효성 검증
      if (startX === undefined || startY === undefined || endX === undefined || endY === undefined) {
        throw new Error(`스와이프 좌표가 설정되지 않았습니다. 디바이스 프리뷰에서 좌표를 선택해주세요.`);
      }

      logger.info(`[${deviceId}] 절대 좌표 사용 (스와이프): (${startX}, ${startY}) → (${endX}, ${endY})`);
      return {
        x: 0,
        y: 0,
        startX: startX as number,
        startY: startY as number,
        endX: endX as number,
        endY: endY as number,
      };
    }
  }

  /**
   * 액션 노드 실행
   * @param actions Actions 인스턴스
   * @param node 실행할 노드
   * @param appPackage 앱 패키지명 (launchApp 등에서 사용)
   */
  async executeAction(
    actions: Actions,
    node: ExecutableNode,
    appPackage: string
  ): Promise<ActionExecutionResult> {
    // 노드 데이터는 node.params에 저장됨 (node.data는 하위 호환성)
    const params = node.params || node.data || {};
    const actionType = params.actionType || node.type;
    const deviceId = actions.getDeviceId();

    // 디버깅: 전체 params 출력
    logger.info(`[${deviceId}] executeAction 시작: actionType=${actionType}`);
    logger.info(`[${deviceId}] params 전체: ${JSON.stringify(params, null, 2)}`);

    // 패키지명은 params에 명시적으로 있으면 사용, 없으면 appPackage 사용
    const packageName = params.packageName || appPackage;

    try {
      let result: ActionResult | null = null;

      switch (actionType) {
        // ========== 기본 터치 액션 ==========
        case 'tap': {
          logger.info(`[${deviceId}] 탭 params 원본: x=${params.x}, y=${params.y}, xPercent=${params.xPercent}, yPercent=${params.yPercent}`);
          const coords = await this.resolveCoordinates(actions, params, 'tap');
          logger.info(`[${deviceId}] 탭 변환 결과: (${coords.x}, ${coords.y})`);
          await actions.tap(coords.x, coords.y);
          break;
        }

        case 'doubleTap': {
          const coords = await this.resolveCoordinates(actions, params, 'tap');
          await actions.doubleTap(coords.x, coords.y);
          break;
        }

        case 'longPress': {
          const coords = await this.resolveCoordinates(actions, params, 'tap');
          await actions.longPress(coords.x, coords.y, params.duration || 1000);
          break;
        }

        case 'swipe': {
          const coords = await this.resolveCoordinates(actions, params, 'swipe');
          await actions.swipe(
            coords.startX!,
            coords.startY!,
            coords.endX!,
            coords.endY!,
            params.duration || 500
          );
          break;
        }

        // ========== 텍스트 입력 액션 ==========
        case 'inputText':
          await actions.typeText(
            params.text as string,
            params.clearFirst as boolean ?? false,
            params.useAdb as boolean ?? false
          );
          break;

        case 'clearText':
          await actions.clearText();
          break;

        case 'typeRandomText':
          result = await actions.typeRandomText({
            prefix: params.prefix as string | undefined,
            suffix: params.suffix as string | undefined,
            length: params.randomLength as number | undefined,
            charset: params.charset as 'alphanumeric' | 'alpha' | 'numeric' | undefined,
            clearFirst: params.clearFirst as boolean | undefined,
            useAdb: params.useAdb as boolean | undefined,
          });
          break;

        // ========== 키 입력 액션 ==========
        case 'pressKey':
          await actions.pressKey(params.keycode as number);
          break;

        // ========== 대기 액션 ==========
        case 'wait':
          await actions.wait(params.duration || 1000);
          break;

        // ========== 요소 대기 액션 ==========
        case 'waitUntilExists':
          result = await actions.waitUntilExists(
            params.selector as string,
            params.selectorType || 'id',
            params.timeout || 10000,
            500,
            { tapAfterWait: params.tapAfterWait || false }
          );
          break;

        case 'waitUntilGone':
          await actions.waitUntilGone(
            params.selector as string,
            params.selectorType || 'id',
            params.timeout || 10000
          );
          break;

        // ========== 텍스트 대기 액션 (XPath 기반) ==========
        case 'waitUntilTextExists':
          result = await actions.waitUntilTextExists(
            params.text as string,
            params.timeout || 10000,
            500,
            { tapAfterWait: params.tapAfterWait || false }
          );
          break;

        case 'waitUntilTextGone':
          await actions.waitUntilTextGone(
            params.text as string,
            params.timeout || 10000
          );
          break;

        // ========== 요소 탭 액션 ==========
        case 'tapElement':
          await actions.tapElement(
            params.selector as string,
            params.selectorType || 'id'
          );
          break;

        case 'tapText':
          await actions.tapText(params.text as string);
          break;

        // ========== 이미지 매칭 액션 ==========
        case 'tapImage':
          result = await actions.tapImage(params.templateId as string, {
            threshold: params.threshold || 0.8,
            region: params.region,
            nodeId: node.id,
          });
          break;

        case 'waitUntilImage':
          result = await actions.waitUntilImage(
            params.templateId as string,
            params.timeout || 30000,
            1000,
            {
              threshold: params.threshold || 0.8,
              region: params.region,
              tapAfterWait: params.tapAfterWait || false,
              nodeId: node.id,
            }
          );
          break;

        case 'waitUntilImageGone':
          await actions.waitUntilImageGone(
            params.templateId as string,
            params.timeout || 30000,
            1000,
            {
              threshold: params.threshold || 0.8,
              region: params.region,
            }
          );
          break;

        // ========== OCR 기반 텍스트 액션 ==========
        case 'tapTextOcr':
          result = await actions.tapTextOcr(params.text as string, {
            matchType: params.matchType || 'contains',
            caseSensitive: params.caseSensitive || false,
            region: params.region,
            index: params.index || 0,
            offset: params.offset,
            retryCount: params.retryCount || 3,
            retryDelay: params.retryDelay || 1000,
            nodeId: node.id,
          });
          break;

        case 'waitUntilTextOcr':
          result = await actions.waitUntilTextOcr(
            params.text as string,
            params.timeout || 30000,
            1000,
            {
              matchType: params.matchType || 'contains',
              caseSensitive: params.caseSensitive || false,
              region: params.region,
              tapAfterWait: params.tapAfterWait || false,
              nodeId: node.id,
            }
          );
          break;

        case 'waitUntilTextGoneOcr':
          result = await actions.waitUntilTextGoneOcr(
            params.text as string,
            params.timeout || 30000,
            1000,
            {
              matchType: params.matchType || 'contains',
              caseSensitive: params.caseSensitive || false,
              region: params.region,
            }
          );
          break;

        case 'assertTextOcr':
          result = await actions.assertTextOcr(params.text as string, {
            matchType: params.matchType || 'contains',
            caseSensitive: params.caseSensitive || false,
            region: params.region,
            shouldExist: params.shouldExist ?? true,
          });
          break;

        // ========== 앱 관리 액션 ==========
        case 'launchApp':
          await actions.launchApp(packageName);
          break;

        case 'terminateApp':
          await actions.terminateApp(packageName);
          break;

        case 'clearData':
        case 'clearAppData': // alias
          await actions.clearData(packageName);
          break;

        case 'clearCache':
        case 'clearAppCache': // alias
          await actions.clearCache(packageName);
          break;

        // ========== 스크린샷 ==========
        case 'screenshot':
          await actions.takeScreenshot();
          break;

        default:
          logger.warn(`[${deviceId}] 알 수 없는 액션 타입: ${actionType}`);
          return {
            success: false,
            message: `Unknown action type: ${actionType}`,
          };
      }

      // 성능 메트릭 추출
      const performance = this.extractPerformanceMetrics(result, params);

      return {
        success: result?.success ?? true,
        message: result?.message,
        result,
        performance: Object.keys(performance).length > 0 ? performance : undefined,
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const errorMessage = error.message;
      logger.error(`[${deviceId}] 액션 실행 실패 (${actionType}): ${errorMessage}`);

      // 세션 크래시 감지 - 상위로 전파하여 시나리오 실행 중단
      if (isSessionCrashError(error)) {
        logger.error(`[${deviceId}] 세션 크래시 감지됨 - 실행 중단 필요`);
        throw new SessionCrashError(
          `세션 크래시: ${errorMessage}`,
          error
        );
      }

      return {
        success: false,
        message: errorMessage,
        result: null,
      };
    }
  }

  /**
   * 조건 노드 평가
   * @param actions Actions 인스턴스
   * @param node 조건 노드
   */
  async evaluateCondition(
    actions: Actions,
    node: ExecutableNode
  ): Promise<ConditionEvaluationResult> {
    const params = node.params || node.data || {};
    const conditionType = params.conditionType as string;
    const selector = params.selector as string;
    const selectorType = params.selectorType || 'id';
    const text = params.text as string;
    const deviceId = actions.getDeviceId();

    logger.info(`[${deviceId}] 조건 평가: ${conditionType}`);

    try {
      switch (conditionType) {
        case 'elementExists': {
          const result = await actions.elementExists(selector, selectorType);
          return { passed: result.exists };
        }

        case 'elementNotExists': {
          const result = await actions.elementExists(selector, selectorType);
          return { passed: !result.exists };
        }

        case 'textContains': {
          const result = await actions.elementTextContains(selector, text, selectorType);
          return { passed: result.contains };
        }

        case 'screenContainsText': {
          const result = await actions.screenContainsText(text);
          return { passed: result.contains };
        }

        case 'elementEnabled': {
          const result = await actions.elementIsEnabled(selector, selectorType);
          return { passed: result.enabled === true };
        }

        case 'elementDisplayed': {
          const result = await actions.elementIsDisplayed(selector, selectorType);
          return { passed: result.displayed === true };
        }

        // 이미지 기반 조건 (통합)
        case 'imageExists':
        case 'imageNotExists': {
          const templateId = params.templateId as string;
          if (!templateId) {
            logger.warn(`[${deviceId}] 이미지 조건: templateId가 지정되지 않음`);
            return { passed: false, error: '템플릿이 선택되지 않았습니다' };
          }
          const threshold = params.threshold as number | undefined;
          const region = params.region as { x: number; y: number; width: number; height: number } | undefined;
          const result = await actions.imageExists(templateId, { threshold, region });
          const expectExists = conditionType === 'imageExists';
          const passed = expectExists ? result.exists : !result.exists;
          logger.info(`[${deviceId}] 이미지 ${expectExists ? '존재' : '부재'} 확인: ${passed} (confidence: ${(result.confidence * 100).toFixed(1)}%)`);
          return { passed };
        }

        // OCR 텍스트 기반 조건 (통합)
        case 'ocrTextExists':
        case 'ocrTextNotExists': {
          if (!text || text.trim() === '') {
            logger.warn(`[${deviceId}] OCR 조건: 검색 텍스트가 비어있음`);
            return { passed: false, error: '검색할 텍스트를 입력하세요' };
          }
          const matchType = (params.matchType as 'exact' | 'contains' | 'regex') || 'contains';
          const caseSensitive = params.caseSensitive as boolean | undefined;
          const region = params.region as { x: number; y: number; width: number; height: number } | undefined;
          const result = await actions.ocrTextExists(text, { matchType, caseSensitive, region });
          const expectExists = conditionType === 'ocrTextExists';
          const passed = expectExists ? result.exists : !result.exists;
          logger.info(`[${deviceId}] OCR 텍스트 ${expectExists ? '존재' : '부재'} 확인: "${text}" = ${passed} (confidence: ${(result.confidence * 100).toFixed(1)}%)`);
          return { passed };
        }

        default:
          logger.warn(`[${deviceId}] 알 수 없는 조건 타입: ${conditionType}, 기본값 true`);
          return { passed: true };
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const errorMessage = err.message;
      logger.error(`[${deviceId}] 조건 평가 실패: ${errorMessage}`);

      // 세션 크래시 감지 - 상위로 전파하여 시나리오 실행 중단
      if (isSessionCrashError(err)) {
        logger.error(`[${deviceId}] 세션 크래시 감지됨 - 실행 중단 필요`);
        throw new SessionCrashError(
          `세션 크래시: ${errorMessage}`,
          err
        );
      }

      // 조건 평가 실패 시 false 반환 (no 분기)
      return { passed: false, error: errorMessage };
    }
  }

  /**
   * 액션 결과에서 성능 메트릭 추출
   */
  private extractPerformanceMetrics(
    result: ActionResult | null,
    params: NodeParams
  ): ActionExecutionResult['performance'] {
    const performance: ActionExecutionResult['performance'] = {};

    if (result?.matchTime !== undefined && result.matchTime !== null) {
      performance.matchTime = result.matchTime as number;
    }
    if (result?.confidence !== undefined && result.confidence !== null) {
      performance.confidence = result.confidence as number;
    }
    if (result?.templateId !== undefined && result.templateId !== null) {
      performance.templateId = result.templateId as string;
    }
    if (result?.ocrTime !== undefined && result.ocrTime !== null) {
      performance.ocrTime = result.ocrTime as number;
    }
    if (result?.searchText !== undefined || params.text !== undefined) {
      performance.searchText = (result?.searchText || params.text) as string;
    }
    // OCR 액션의 경우 matchType 추가
    if (params.matchType) {
      performance.matchType = params.matchType;
    }

    return performance;
  }
}

// 싱글톤 인스턴스
export const actionExecutionService = new ActionExecutionService();
