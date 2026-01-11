# 다중 테스트 병렬 실행 아키텍처 회고록

## 개요

**날짜**: 2026년 01월 11일
**목표**: 다중 사용자가 동시에 테스트를 실행할 때 디바이스 겹침 시에만 대기열에 추가하고, 겹치지 않는 테스트는 즉시 병렬 실행하는 시스템 구현

---

## 배경

기존 큐 시스템의 문제점:
1. **전역 잠금**: 하나의 테스트가 실행 중이면 모든 테스트가 대기
2. **디바이스 낭비**: 사용하지 않는 디바이스가 있어도 다른 테스트 불가
3. **예측 어려움**: 왜 테스트가 대기 중인지 사용자가 알기 어려움

목표:
- 디바이스 단위 잠금 (테스트 단위 X)
- 실행 가능한 모든 테스트 즉시 시작
- 대기 원인을 UI에 명확히 표시

---

## 구현 내용

### 1. Backend: testOrchestrator 다중 실행 지원

**파일**: `backend/src/services/testOrchestrator.ts`

기존 `processQueue()` 메서드를 `tryDispatchPending()`로 대체:

```typescript
private async tryDispatchPending(): Promise<void> {
  const busyDeviceIds = new Set(
    deviceLockService.getAllLocks().map(l => l.deviceId)
  );

  const pendingTests = testQueueService.getPendingTests();

  for (const test of pendingTests) {
    const requiredDevices = new Set(test.request.deviceIds);
    const blockedDevices = [...requiredDevices].filter(d => busyDeviceIds.has(d));

    if (blockedDevices.length === 0) {
      // 모든 디바이스 가용 → 즉시 실행
      await this.startQueuedTest(test);
      test.request.deviceIds.forEach(d => busyDeviceIds.add(d));
    }
  }

  // 대기 중인 테스트들의 waitingInfo 업데이트
  this.updatePendingTestsWaitingInfo();
}
```

**핵심 변경:**
- 대기열의 모든 테스트를 순회하며 실행 가능 여부 확인
- 실행 시작된 디바이스는 즉시 `busyDeviceIds`에 추가
- 테스트 완료 시 `tryDispatchPending()` 재호출로 다음 실행 가능 테스트 자동 시작

### 2. Backend: WaitingInfo 계산 로직

**파일**: `backend/src/types/queue.ts`

새 타입 정의:

```typescript
interface WaitingInfo {
  blockedByDevices: BlockingDeviceInfo[];  // 차단 디바이스 목록
  estimatedWaitTime: number;               // 예상 대기 시간 (초)
  queuePosition: number;                   // 대기열 순서
  canRunImmediatelyIf?: string[];          // 해제 시 즉시 실행 가능한 디바이스
}

interface BlockingDeviceInfo {
  deviceId: string;
  deviceName: string;
  usedBy: string;            // 사용 중인 사용자
  testName?: string;         // 실행 중인 테스트 이름
  estimatedRemaining: number; // 예상 남은 시간 (초)
}
```

**파일**: `backend/src/services/testQueueService.ts`

`updateWaitingInfo()` 메서드 추가로 대기 테스트의 차단 정보 업데이트.

### 3. Backend: Socket 응답 확장

**파일**: `backend/src/index.ts`

`queue:status` 응답 형식 개선:

```typescript
socket.emit('queue:status:response', {
  isProcessing: runningTests.length > 0,
  queueLength: pendingTests.length,
  runningCount: runningTests.length,
  pendingTests,      // waitingInfo 포함
  runningTests,
  deviceStatuses,
});
```

### 4. Frontend: TestQueuePanel 대기 상태 UI

**파일**: `frontend/src/components/TestExecutionPanel/TestQueuePanel.tsx`

대기 원인 표시 UI 추가:

```tsx
{test.waitingInfo && test.waitingInfo.blockedByDevices.length > 0 && (
  <div className="waiting-reason">
    <span className="waiting-icon">⏳</span>
    <span className="waiting-text">
      {getWaitingReason(test.waitingInfo)}
    </span>
    {test.waitingInfo.estimatedWaitTime > 0 && (
      <span className="estimated-time">
        ({formatEstimatedTime(test.waitingInfo.estimatedWaitTime)})
      </span>
    )}
    <div className="blocking-details">
      {test.waitingInfo.blockedByDevices.map(device => (
        <span key={device.deviceId} className="blocking-device">
          {device.deviceName}: {device.usedBy}
        </span>
      ))}
    </div>
  </div>
)}
```

### 5. Frontend: DeviceSelector 경고 표시

**파일**: `frontend/src/components/TestExecutionPanel/DeviceSelector.tsx`

이미 구현되어 있던 기능:
- `busy_other` 상태 디바이스에 🔒 아이콘 + 사용자명 표시
- 선택 불가 처리 (체크박스 disabled)
- 툴팁으로 상세 정보 제공

### 6. Frontend: ExecutionOptions 버튼 레이블 동적 변경

**파일**: `frontend/src/components/TestExecutionPanel/ExecutionOptions.tsx`

선택한 디바이스 중 바쁜 디바이스가 있으면 버튼 레이블 변경:

```tsx
<button
  className={`execute-btn ${busyDeviceCount > 0 ? 'queue-mode' : ''}`}
>
  {busyDeviceCount > 0
    ? `테스트 예약 (${busyDeviceCount}대 대기 중)`
    : '테스트 시작'
  }
</button>
```

---

## 영향 받는 파일

```
backend/src/services/testOrchestrator.ts   - 다중 실행 로직
backend/src/services/testQueueService.ts   - 대기열 서비스 확장
backend/src/types/queue.ts                 - 타입 정의 추가
backend/src/index.ts                       - Socket 응답 형식 수정

frontend/src/types/index.ts                - 타입 정의 추가
frontend/src/components/TestExecutionPanel/
  TestQueuePanel.tsx                       - 대기 원인 UI
  TestQueuePanel.css                       - 대기 원인 스타일
  ExecutionOptions.tsx                     - 동적 버튼 레이블
  TestExecutionPanel.tsx                   - busyDeviceCount 계산
  TestExecutionPanel.css                   - 큐 모드 버튼 스타일
```

---

## 아키텍처 결정 사항

### 1. 가용성 우선 실행 (Availability-First)
FIFO 순서보다 실행 가능성을 우선시합니다. 낮은 우선순위 테스트라도 필요한 디바이스가 모두 가용하면 먼저 실행됩니다.

**장점:**
- 디바이스 유휴 시간 최소화
- 전체 처리량 향상

**단점:**
- 대기 순서 예측 어려움 (UI로 해결)

### 2. 전체 테스트 단위 큐잉
디바이스별로 분리하지 않고 테스트 요청 전체를 하나의 단위로 큐잉합니다.

**이유:**
- 시나리오 세트의 일관성 보장
- 부분 실행으로 인한 혼란 방지
- 결과 분석 용이

### 3. 예측 어려움의 UI/UX 해결
대기 순서 예측이 어려운 문제를 다음 UI로 해결:
- 차단 중인 디바이스 목록 표시
- 예상 대기 시간 표시
- 실행 가능 조건 표시 (`canRunImmediatelyIf`)

---

## 사용 시나리오

### 시나리오 A: 겹치지 않는 테스트
- 사용자 A: 디바이스 1, 2 선택
- 사용자 B: 디바이스 3, 4 선택
- **결과**: 두 테스트 동시 실행

### 시나리오 B: 일부 겹치는 테스트
- 사용자 A: 디바이스 1, 2 (실행 중)
- 사용자 B: 디바이스 2, 3 선택
- **결과**: B의 테스트는 대기열에 추가, UI에 "디바이스 2: 사용자A 사용 중" 표시

### 시나리오 C: 완전히 겹치는 테스트
- 사용자 A: 디바이스 1, 2 (실행 중)
- 사용자 B: 디바이스 1, 2 선택
- **결과**: B의 테스트는 대기열에 추가, A 완료 후 자동 시작

---

## 향후 개선 가능 사항

1. **예상 대기 시간 정확도 개선**
   - 시나리오별 평균 실행 시간 학습
   - 디바이스 성능 차이 반영

2. **디바이스 일부만 가용한 경우 부분 실행 옵션**
   - 고급 사용자를 위한 옵션 제공
   - "가용한 디바이스만 먼저 시작" 체크박스

3. **우선순위 기반 디바이스 선점**
   - 긴급 테스트가 다른 테스트의 디바이스 양보 요청

---

*최종 수정일: 2026-01-11*
