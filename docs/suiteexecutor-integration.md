# SuiteExecutor 점진적 통합 회고록

## 개요

**날짜**: 2026년 01월 28일
**목표**: SuiteExecutor의 중복 코드를 제거하고 공유 서비스로 통합

---

## 배경

TestExecutor와 SuiteExecutor에 동일한 로직이 중복으로 구현되어 있었습니다:
- 노드 탐색 로직 (`_getNextNodeId` vs `NodeNavigationService`)
- 성능 메트릭 수집 로직 (직접 구현 vs `PerformanceMetricsCollector`)

이전 리팩토링(2026-01-28)에서 TestExecutor는 이미 공유 서비스들을 사용하도록 변경되었으나, SuiteExecutor는 독립적인 구현을 유지하고 있었습니다.

### 통합 전 구조
```
TestExecutor ────────────────────┐
                                 ├──> execution/
SuiteExecutor (독립 구현)         │    ├─ ActionExecutionService ✓
                                 │    ├─ NodeNavigationService (미사용)
                                 │    └─ PerformanceMetricsCollector (미사용)
```

---

## 구현 내용

### 1. NodeNavigationService 적용

**제거된 메서드**: `SuiteExecutor._getNextNodeId()` (19줄)

**변경 전**:
```typescript
private _getNextNodeId(
  connections: Array<{ from: string; to: string; branch?: string; label?: string }>,
  currentNodeId: string,
  branch?: string
): string | null { ... }
```

**변경 후**:
```typescript
// nodeNavigationService 사용
const nextNodeId = nodeNavigationService.findNextNodeId(node, connections as NodeConnection[]);

// 조건 노드의 경우 _conditionResult 설정
const nodeWithResult = { ...node, _conditionResult: conditionResult };
const nextNodeId = nodeNavigationService.findNextNodeId(nodeWithResult, connections as NodeConnection[]);
```

### 2. PerformanceMetricsCollector 적용

**제거된 로직**: 직접 구현된 성능 메트릭 수집 (30줄)

**변경 전**:
```typescript
// 성능 메트릭 변환
if (result.performance) {
  actionPerformance = {
    totalTime: stepEndTimeForPerf.getTime() - stepStartedAt.getTime(),
  };
  // 이미지 매칭 메트릭 직접 구현
  // OCR 매칭 메트릭 직접 구현
}
```

**변경 후**:
```typescript
// PerformanceMetricsCollector 사용
actionPerformance = performanceMetricsCollector.buildFromExecutionResult(
  stepDuration,
  isWaitAction,
  result.performance,
  node.params || {},
  result.success
);
```

### 3. 새 메서드 추가 (PerformanceMetricsCollector)

SuiteExecutor의 `ActionExecutionResult.performance`를 처리하기 위한 새 메서드:

```typescript
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
): StepPerformance | undefined
```

- 기존 `buildStepPerformance()`와 분리하여 하위 호환성 유지
- 이미지 매칭 + OCR 매칭 메트릭 모두 지원

---

## 영향 받는 파일

```
backend/src/services/suiteExecutor.ts                    - NodeNavigationService, PerformanceMetricsCollector 적용
backend/src/services/execution/PerformanceMetricsCollector.ts - buildFromExecutionResult() 추가
```

---

## 유지된 고위험 요소

안전한 통합을 위해 다음 요소들은 변경하지 않았습니다:

| 요소 | 이유 |
|------|------|
| 이벤트명 (`suite:*`) | 프론트엔드 호환성 |
| 결과 타입 (`StepSuiteResult`) | 리포트 호환성 |
| Suite 특화 로직 (repeatCount, scenarioInterval) | Suite 고유 기능 |
| 3계층 구조 (Suite → Scenario → Step) | 아키텍처 유지 |

---

## 정량적 효과

| 항목 | Before | After | 변화 |
|------|--------|-------|------|
| `_getNextNodeId()` | 19줄 | 0줄 | -19줄 |
| 성능 메트릭 직접 구현 | 30줄 | 0줄 | -30줄 |
| **총 중복 코드** | ~49줄 | 0줄 | **-49줄** |

### 통합 후 구조
```
TestExecutor ────────────────────┐
                                 ├──> execution/
SuiteExecutor ───────────────────┤    ├─ ActionExecutionService ✓
                                 │    ├─ NodeNavigationService ✓ (NEW)
                                 │    └─ PerformanceMetricsCollector ✓ (NEW)
```

---

## 향후 개선 가능 사항

1. **노드 실행 엔진 통합**: `_executeNodes()`와 `executeSingleScenarioOnDevice()` 내 노드 순회 로직 통합 검토
2. **타입 통합**: `StepSuiteResult`와 `StepResult` 타입 통합 검토 (고위험)
3. **이벤트 통합**: `suite:*`와 `test:*` 이벤트 네임스페이스 통합 검토 (고위험)

---

*최종 수정일: 2026-01-28*
