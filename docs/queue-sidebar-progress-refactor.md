# QueueSidebar 진행률 계산 리팩토링 회고록

## 개요

**날짜**: 2026년 01월 12일
**목표**: QueueSidebar의 진행률 표시를 정확하고 일관성 있게 개선

---

## 배경

### 문제 상황
1. **진행률 업데이트 안됨**: 테스트 현황에서 진행 카드의 진행률이 업데이트되지 않음
2. **진행률 계산 오류**: 시나리오 여러 개 선택 시 1개 시나리오 기준으로 진행률 표시
3. **executionId 불일치**: testOrchestrator와 testExecutor 간 executionId 매칭 실패

### 근본 원인
- `testOrchestrator.executeTest()`가 `testExecutor.execute()`에 `executionId`를 전달하지 않음
- 백엔드의 `test:progress` 이벤트가 보내는 `percentage` 값과 프론트엔드 표시 불일치
- QueueSidebar와 TestDetailPanel이 서로 다른 진행률 계산 로직 사용

---

## 구현 내용

### 1. executionId 일관성 수정 (Backend)

**파일**: `backend/src/services/testOrchestrator.ts`

```typescript
private async executeTest(context: ExecutionContext): Promise<void> {
  const result = await testExecutor.execute(context.request, {
    executionId: context.executionId,  // executionId 전달 추가
  });
}
```

### 2. 신규 컴포넌트 추가 (Frontend)

| 컴포넌트 | 역할 |
|----------|------|
| `QueueSidebar.tsx` | 대기/진행/완료 3섹션 큐 사이드바 |
| `TestDetailPanel.tsx` | 선택된 테스트의 상세 정보 표시 |

### 3. 진행률 계산 방식 통일

**이전 방식** (test:progress 핸들러):
```typescript
// QueueSidebar에서 별도 핸들러로 progress 상태 관리
const handleTestProgress = (data: { executionId: string; percentage: number }) => {
  const updatedRunningTests = current.runningTests.map(test =>
    test.executionId === data.executionId
      ? { ...test, progress: data.percentage }
      : test
  );
  onQueueStatusChange({ ...current, runningTests: updatedRunningTests });
};
```

**현재 방식** (deviceProgress 직접 계산):
```typescript
// TestDetailPanel과 동일한 계산 로직
const calculateTestProgress = (test: QueuedTest): number => {
  const deviceIds = test.request.deviceIds;
  let completed = 0, total = 0;
  for (const deviceId of deviceIds) {
    const dp = deviceProgress.get(deviceId);
    if (dp) {
      completed += dp.completedScenarios + dp.failedScenarios;
      total += dp.totalScenarios;
    }
  }
  return total > 0 ? Math.round((completed / total) * 100) : 0;
};
```

### 4. 레거시 컴포넌트 삭제

- `ExecutionProgress.tsx` 삭제 (더 이상 사용 안 함)
- 관련 CSS 스타일 정리 (~195줄 제거)
- `index.ts`에서 export 제거

---

## 영향 받는 파일

```
backend/src/services/testOrchestrator.ts  # executionId 전달 수정
backend/src/services/testExecutor.ts      # 디버그 로그 추가
backend/src/services/testQueueService.ts  # 큐 상태 관리
backend/src/types/queue.ts                # 큐 타입 정의

frontend/src/components/TestExecutionPanel/
├── QueueSidebar.tsx       # 신규 (큐 사이드바)
├── QueueSidebar.css       # 신규
├── TestDetailPanel.tsx    # 신규 (테스트 상세)
├── TestDetailPanel.css    # 신규
├── TestExecutionPanel.tsx # 리팩토링
├── TestExecutionPanel.css # 레거시 스타일 제거
├── ExecutionProgress.tsx  # 삭제
└── index.ts               # export 정리

frontend/src/types/index.ts  # DeviceProgress 타입 추가
```

---

## 성능 분석

### 부하 시나리오 (50대 디바이스, 80노드×30시나리오)

| 메트릭 | 이전 방식 | 현재 방식 |
|--------|-----------|-----------|
| progress 이벤트 | 1,500회/테스트 | 동일 |
| 상태 업데이트 | 1,500회 | 0회 (부모에서만) |
| 계산 비용 | 0 | 100회 Map.get/초 |
| GC 압력 | 높음 (배열 복사) | 낮음 |

**결론**: 두 방식 모두 초당 2회 정도의 progress 이벤트로 부하 차이 미미

---

## 방식 비교

| 항목 | test:progress 핸들러 | deviceProgress 직접 계산 |
|------|---------------------|-------------------------|
| 데이터 소스 | 백엔드 계산 percentage | 프론트엔드 직접 계산 |
| 일관성 | TestDetailPanel과 다름 | TestDetailPanel과 동일 |
| 의존성 | 독립적 | 부모 prop에 의존 |
| 코드 복잡도 | 높음 (ref, 핸들러) | 낮음 (함수만) |
| 디버깅 | 백엔드+프론트 확인 | 프론트만 확인 |

**선택**: deviceProgress 직접 계산 방식 채택
- 일관성과 코드 단순성 우선
- 부하 차이 무시할 수준

---

## 사용 방법

### QueueSidebar Props
```typescript
<QueueSidebar
  socket={socket}
  userName={userName}
  selectedQueueId={selectedQueueId}
  onSelectTest={setSelectedQueueId}
  queueStatus={queueStatus}
  onQueueStatusChange={setQueueStatus}
  deviceProgress={deviceProgressMap}  // Map<string, DeviceProgress>
/>
```

### TestDetailPanel Props
```typescript
<TestDetailPanel
  selectedQueueId={selectedQueueId}
  queueStatus={queueStatus}
  logs={executionLogs}
  deviceProgress={deviceProgressMap}
  onClose={() => setSelectedQueueId(null)}
  onStop={handleStopQueueItem}
  userName={userName}
/>
```

---

## 향후 개선 가능 사항

1. **useMemo 최적화**: 100대+ 디바이스 환경에서 필요 시 적용
2. **로그 가상화**: 대량 로그 렌더링 시 react-window 적용
3. **진행률 애니메이션**: CSS transition으로 부드러운 진행률 표시

---

*최종 수정일: 2026-01-12*
