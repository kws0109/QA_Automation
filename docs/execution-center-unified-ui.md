# 실행 센터 통합 UI 및 Suite 반복/간격 옵션 회고록

## 개요

**날짜**: 2026년 01월 27일
**목표**: 시나리오 실행과 묶음 실행을 하나의 통합 UI로 병합하고, Suite 실행에 반복 횟수 및 시나리오 간격 옵션 적용

---

## 배경

기존에는 "시나리오 실행"과 "묶음 실행"이 별도의 탭으로 분리되어 있어 사용자가 두 기능 간 전환 시 불편함이 있었습니다. 또한 Suite(묶음) 실행 시 반복 횟수와 시나리오 간격이 적용되지 않아 일반 테스트 실행과 기능 차이가 있었습니다.

### 기존 문제점
1. **UI 분리**: 시나리오 직접 실행과 Suite 실행이 별도 탭
2. **기능 불일치**: Suite 실행에 반복/간격 옵션 미적용
3. **코드 중복**: 유사한 디바이스 선택기가 여러 곳에 존재

---

## 구현 내용

### 1. ExecutionCenter 통합 UI

**변경 전 (탭 방식)**:
```
[시나리오 실행 탭] [묶음 실행 탭] [실행 이력 탭]
```

**변경 후 (라디오 버튼 방식)**:
```
┌─────────────────────────────────────────────────────────────┐
│  실행 소스:  ○ 시나리오 직접 선택  ○ 저장된 묶음 사용         │
├─────────────────────────┬───────────────────────────────────┤
│  📋 시나리오 선택기      │  📱 디바이스 선택                  │
│  또는                    │                                    │
│  📦 저장된 묶음 목록     │  ☑ 디바이스1   ☑ 디바이스2        │
├─────────────────────────┴───────────────────────────────────┤
│  반복: [1]회  시나리오 간격: [5]초                            │
│  시나리오 3개 × 디바이스 2대 × 반복 1회 = 총 6회 실행         │
│  [ ▶ 테스트 실행 ]                                          │
└─────────────────────────────────────────────────────────────┘
```

**주요 기능**:
- 라디오 버튼으로 실행 소스 선택
- Suite 선택 시 디바이스 자동 선택 (연결된 디바이스만)
- 실시간 디바이스 상태 표시 (사용 중/가용)
- 실행 요약 계산 (시나리오 × 디바이스 × 반복)

### 2. Suite 실행 옵션 적용

**suiteExecutor.ts 변경**:
```typescript
// 옵션 인터페이스 추가
export interface SuiteExecutionOptions {
  repeatCount?: number;        // 반복 횟수 (기본: 1)
  scenarioInterval?: number;   // 시나리오 간격 ms (기본: 0)
}

// 함수 시그니처 변경
async executeSuite(
  suiteId: string,
  options?: SuiteExecutionOptions
): Promise<SuiteExecutionResult>
```

**반복 및 간격 로직**:
```typescript
// 반복 실행
for (let repeat = 1; repeat <= repeatCount; repeat++) {
  // 시나리오 순차 실행
  for (let i = 0; i < totalScenarios; i++) {
    await this._executeScenario(...);

    // 시나리오 간격 대기 (마지막이 아닌 경우)
    if (scenarioInterval > 0 && !isLast) {
      await new Promise(resolve => setTimeout(resolve, scenarioInterval));
    }
  }
}
```

### 3. 진행률 계산 개선

**SuiteProgress 타입 확장**:
```typescript
export interface SuiteProgress {
  // 기존 필드...
  repeatProgress?: {        // 반복 진행 상태 (repeatCount > 1일 때만)
    current: number;
    total: number;
  };
}
```

**진행률 계산**:
```typescript
// 전체 실행 수 = 시나리오 수 × 반복 횟수 × 디바이스 수
const totalExecutionsPerDevice = totalScenarios * repeatCount;
const totalExecutions = totalDevices * totalExecutionsPerDevice;

// 현재 진행률
const currentDeviceExecutions = (currentRepeat - 1) * totalScenarios + scenarioIndex;
const overallProgress = Math.round((completedExecutions / totalExecutions) * 100);
```

### 4. 테스트 리포트 탭 분리

실행 이력을 별도 "테스트 리포트" 탭으로 분리하여 접근성 향상:
```typescript
type AppTab = 'scenario' | 'devices' | 'suite' | 'execution' | 'reports' | ...;
```

---

## 영향 받는 파일

```
backend/src/services/suiteExecutor.ts    - 반복/간격 로직 구현
backend/src/services/testOrchestrator.ts - 옵션 전달
backend/src/routes/suite.ts              - API 파라미터 추가
backend/src/types/suite.ts               - SuiteProgress 확장
backend/src/types/queue.ts               - CompletedTest 필드 추가
frontend/src/App.tsx                     - 리포트 탭 추가
frontend/src/components/ExecutionCenter/ - 통합 UI 구현
frontend/src/components/TestExecutionPanel/TestStatusBar.tsx - 신규
frontend/src/components/TestExecutionPanel/TestDetailModal.tsx - 신규
```

---

## API 변경사항

### POST /api/suites/:id/execute

**요청 Body (변경됨)**:
```json
{
  "userName": "사용자명",
  "repeatCount": 2,           // 추가: 반복 횟수 (기본: 1)
  "scenarioInterval": 5000    // 추가: 시나리오 간격 ms (기본: 0)
}
```

---

## 사용 예시

### 프론트엔드에서 Suite 실행

```typescript
// Suite 실행 시 옵션 전달
await axios.post(`${API_BASE}/api/suites/${suiteId}/execute`, {
  userName: 'tester',
  repeatCount: 3,
  scenarioInterval: 5000,  // 5초
});
```

### 실행 흐름 (repeatCount=2, scenarioInterval=5000)

```
[시나리오1] → 5초 대기 → [시나리오2] → 5초 대기 → [시나리오3]
                              ↓ (1회차 완료)
                         5초 대기
                              ↓
[시나리오1] → 5초 대기 → [시나리오2] → 5초 대기 → [시나리오3]
                              ↓ (2회차 완료, 전체 완료)
```

---

## 향후 개선 가능 사항

1. **반복 중 실패 처리 옵션**: 실패 시 중단/계속 선택
2. **반복별 리포트 분리**: 각 반복 결과를 별도로 저장
3. **대기열에서 실행 시 옵션 유지**: 큐에서 자동 실행될 때 옵션 보존

---

*최종 수정일: 2026-01-27*
