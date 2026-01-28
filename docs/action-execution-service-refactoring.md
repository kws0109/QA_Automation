# ActionExecutionService 리팩토링 회고록

## 개요

**날짜**: 2026년 01월 28일
**목표**: testExecutor와 suiteExecutor의 중복 액션 실행 로직을 통합하여 유지보수성 향상

---

## 배경

### 문제점
- **testExecutor.ts (1,943줄)**와 **suiteExecutor.ts (1,216줄)**가 거의 동일한 로직 중복
- 핵심 중복: `executeActionNode` (27개 switch문), `evaluateCondition` (6개 조건)
- 새 액션 추가 시 4곳 수정 필요 (testExecutor, suiteExecutor, ScenarioExecutionEngine, + 프론트엔드)
- 버그 수정 시에도 여러 곳을 동일하게 수정해야 하는 위험

### 기존 구조
```
testExecutor.ts
├── executeActionNode() - 172줄 switch문
├── evaluateCondition() - 45줄 switch문
└── _findNextNode() - 26줄

suiteExecutor.ts
├── _executeAction() - 160줄 switch문
├── _evaluateCondition() - 45줄 switch문
└── (노드 탐색 로직)

ScenarioExecutionEngine.ts
├── executeActionNode() - 167줄 switch문
├── evaluateCondition() - 44줄 switch문
└── _findNextNode() - 22줄
```

---

## 구현 내용

### 1. ActionExecutionService 생성
**파일**: `backend/src/services/execution/ActionExecutionService.ts`

27개 액션 타입과 6개 조건 타입을 통합한 단일 서비스:

```typescript
export class ActionExecutionService {
  // 27개 액션 타입 통합 처리
  async executeAction(
    actions: Actions,
    node: ExecutableNode,
    appPackage: string
  ): Promise<ActionExecutionResult>;

  // 6개 조건 타입 통합 처리
  async evaluateCondition(
    actions: Actions,
    node: ExecutableNode
  ): Promise<ConditionEvaluationResult>;

  // 성능 메트릭 추출
  private extractPerformanceMetrics(result, params);
}
```

**지원 액션 타입**:
- 기본: tap, doubleTap, longPress, swipe, inputText, clearText, pressKey, wait
- 앱: launchApp, terminateApp, clearData, clearCache, screenshot
- 요소: waitUntilExists, waitUntilGone, tapElement, tapText
- 이미지: tapImage, waitUntilImage, waitUntilImageGone
- OCR: tapTextOcr, waitUntilTextOcr, waitUntilTextGoneOcr, assertTextOcr
- 텍스트: waitUntilTextExists, waitUntilTextGone

**지원 조건 타입**:
- elementExists, elementNotExists
- textContains, screenContainsText
- elementEnabled, elementDisplayed

### 2. NodeNavigationService 생성
**파일**: `backend/src/services/execution/NodeNavigationService.ts`

노드 탐색 로직을 통합한 유틸리티 서비스:

```typescript
export class NodeNavigationService {
  // 다음 노드 ID 찾기 (조건 분기 지원)
  findNextNodeId(currentNode, connections): string | null;

  // 시작 노드 찾기
  findStartNode(nodes): ExecutionNode | undefined;

  // 노드 ID로 노드 찾기
  findNodeById(nodes, nodeId): ExecutionNode | undefined;

  // 연결 조회
  getOutgoingConnections(connections, nodeId): NodeConnection[];
  getIncomingConnections(connections, nodeId): NodeConnection[];
}
```

### 3. 기존 서비스 마이그레이션

**testExecutor.ts**:
```typescript
// Before: 172줄 switch문
private async executeActionNode(...) { /* 27개 case */ }

// After: 8줄 위임
private async executeActionNode(actions, node, appPackage) {
  const result = await actionExecutionService.executeAction(actions, node, appPackage);
  return result.result ?? null;
}
```

**suiteExecutor.ts**:
```typescript
// Before: 160줄 switch문
private async _executeAction(...) { /* 유사한 로직 */ }

// After: 위임
private async _executeAction(actions, node, _deviceId, appPackageName) {
  return await actionExecutionService.executeAction(actions, node, appPackageName || '');
}
```

**ScenarioExecutionEngine.ts**:
동일하게 ActionExecutionService와 NodeNavigationService에 위임

### 4. 추가 위임
- `testExecutor.buildQueue()` → `executionStateManager.buildQueue()` 위임
- `testExecutor._captureAndStoreScreenshot()` → `executionMediaManager.captureAndStoreScreenshot()` 위임

---

## 영향 받는 파일

```
# 신규 생성
backend/src/services/execution/ActionExecutionService.ts (432줄)
backend/src/services/execution/NodeNavigationService.ts (102줄)

# 수정
backend/src/services/execution/index.ts - export 추가
backend/src/services/execution/ScenarioExecutionEngine.ts - 위임 적용
backend/src/services/testExecutor.ts - 위임 적용
backend/src/services/suiteExecutor.ts - 위임 적용
```

---

## 결과

### 라인 수 변화

| 파일 | Before | After | 변화 |
|------|--------|-------|------|
| testExecutor.ts | 1,943줄 | 1,622줄 | **-321줄** |
| suiteExecutor.ts | 1,216줄 | 1,013줄 | **-203줄** |
| ScenarioExecutionEngine.ts | 845줄 | 642줄 | **-203줄** |
| **소계** | 4,004줄 | 3,277줄 | **-727줄** |

### 유지보수성 개선

| 항목 | Before | After |
|------|--------|-------|
| 액션 switch문 위치 | 4곳 | **1곳** |
| 조건 평가 로직 위치 | 4곳 | **1곳** |
| 노드 탐색 로직 위치 | 3곳 | **1곳** |
| 새 액션 추가 시 수정 | 4곳 | **1곳** |

---

## 사용 방법

### 새 액션 추가 시
`ActionExecutionService.ts`의 `executeAction()` 메서드에만 case 추가:

```typescript
case 'newAction':
  result = await actions.newAction(params.someParam);
  break;
```

### 새 조건 추가 시
`ActionExecutionService.ts`의 `evaluateCondition()` 메서드에만 case 추가:

```typescript
case 'newCondition': {
  const result = await actions.someCheck(selector, selectorType);
  return { passed: result.value };
}
```

---

## 추가 리팩토링: PerformanceMetricsCollector 통합 (2026-01-28)

### 구현 내용

성능 메트릭 관련 중복 로직을 `PerformanceMetricsCollector`로 통합:

```typescript
// PerformanceMetricsCollector에 추가된 메서드
buildStepPerformance(
  stepDuration: number,
  isWaitAction: boolean,
  actionResult: ActionResult | null,
  nodeParams: Record<string, unknown>
): StepResult['performance'] | undefined;
```

### 제거된 중복 코드

| 파일 | 제거된 메서드 | 줄 수 |
|------|--------------|-------|
| testExecutor.ts | `_buildStepPerformance()` | 30줄 |
| testExecutor.ts | `_calculatePerformanceSummary()` | 45줄 |
| testExecutor.ts | `createStepPerformance()` | 23줄 (미사용) |
| ScenarioExecutionEngine.ts | `_buildStepPerformance()` | 29줄 |

### 라인 수 변화 (추가)

| 파일 | Before | After | 변화 |
|------|--------|-------|------|
| testExecutor.ts | 1,622줄 | 1,512줄 | **-110줄** |
| ScenarioExecutionEngine.ts | 642줄 | 610줄 | **-32줄** |
| PerformanceMetricsCollector.ts | 141줄 | 175줄 | +34줄 |
| **순 감소** | | | **-108줄** |

### 유지보수성 개선 (추가)

| 항목 | Before | After |
|------|--------|-------|
| 성능 메트릭 빌드 로직 | 3곳 | **1곳** |
| 성능 요약 계산 로직 | 2곳 | **1곳** |

---

## 향후 개선 가능 사항

1. **ExecutionStateManager 완전 통합**
   - 현재 testExecutor가 자체 activeExecutions Map 사용
   - execute() 메서드 구조 변경 필요 (50+ state 참조)
   - 리스크 대비 이득이 크지 않아 보류

2. **ScenarioExecutionEngine 활용**
   - executeDeviceScenarios, executeSingleScenarioOnDevice 등 큰 메서드 통합
   - state 구조 통일 및 비디오 녹화 로직 분리 필요
   - execute() 수정 없이는 불가능

3. ~~**PerformanceMetricsCollector 활용**~~ ✅ 완료
   - ~~현재 미사용 상태~~
   - ~~성능 메트릭 수집 로직 통합 가능~~

---

*최종 수정일: 2026-01-28*
