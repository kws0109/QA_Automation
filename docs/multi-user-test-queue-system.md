# 다중 사용자 테스트 큐 시스템 회고록

## 개요

**날짜**: 2026년 1월 11일
**목표**: 여러 QA 담당자가 동시에 테스트를 실행할 수 있는 큐 기반 시스템 구현

---

## 배경

기존 시스템은 단일 사용자만 테스트를 실행할 수 있었습니다. 여러 QA 담당자가 같은 디바이스 풀을 공유할 때 다음 문제가 발생했습니다:

1. **리소스 충돌**: 한 사용자가 테스트 중인 디바이스를 다른 사용자가 사용하려 시도
2. **상태 혼란**: 누가 어떤 디바이스를 사용 중인지 파악 불가
3. **대기 관리 부재**: 디바이스가 사용 가능해질 때까지 수동으로 확인 필요

이를 해결하기 위해 디바이스 수준 잠금, 우선순위 큐, 실시간 상태 공유 기능을 구현했습니다.

---

## 구현 내용

### 1. DeviceLockService (Step 1)

디바이스별 잠금 관리 서비스:

```typescript
// backend/src/services/deviceLockService.ts
interface DeviceLock {
  deviceId: string;
  lockedBy: string;      // 사용자명
  executionId: string;   // 실행 ID
  lockedAt: Date;
}

class DeviceLockService {
  acquire(deviceId, userName, executionId): boolean
  release(deviceId, executionId): void
  isLocked(deviceId): boolean
  getDeviceStatuses(deviceIds, currentUser): DeviceQueueStatus[]
}
```

**핵심 기능:**
- 디바이스별 독립적 잠금 (Map 기반)
- 같은 사용자의 다른 테스트도 잠금 체크
- `getDeviceStatuses()`로 현재 사용자 기준 상태 반환 (available, busy_mine, busy_other)

### 2. TestQueueService (Step 2)

FIFO + 우선순위 기반 테스트 큐:

```typescript
// backend/src/services/testQueueService.ts
interface QueuedTest {
  queueId: string;
  request: TestExecutionRequest;
  requesterName: string;
  socketId: string;
  priority: 0 | 1 | 2;   // 0: 낮음, 1: 보통, 2: 높음
  status: 'pending' | 'running' | 'completed' | 'cancelled' | 'failed';
}

class TestQueueService {
  enqueue(request, userName, socketId, options): QueuedTest
  dequeue(): QueuedTest | null
  cancel(queueId, socketId): boolean
  getNext(): QueuedTest | null  // 실행 가능한 다음 테스트
}
```

**정렬 로직:**
1. 우선순위 (높은 것 먼저)
2. 생성 시간 (오래된 것 먼저 - FIFO)

### 3. TestOrchestrator (Step 3)

큐 처리 및 자동 실행 조율:

```typescript
// backend/src/services/testOrchestrator.ts
class TestOrchestrator {
  submitTest(request, userName, socketId, options): Promise<{queueId, position}>
  cancelTest(queueId, socketId): {success, message}
  processQueue(): void  // 자동 실행 루프
  getStatus(): QueueStatusResponse
  getDeviceStatuses(currentUser): DeviceQueueStatus[]
}
```

**자동 실행 로직:**
- 100ms 간격으로 큐 확인
- 필요한 디바이스가 모두 가용할 때만 실행
- 실행 완료 시 자동으로 다음 테스트 처리

### 4. TestExecutor 수정 (Step 4)

단일 실행 → 다중 동시 실행 지원:

```typescript
// backend/src/services/testExecutor.ts
interface ExecutionState {
  executionId: string;
  request: TestExecutionRequest;
  stopRequested: boolean;
  // ... 실행 상태
}

class TestExecutor {
  private activeExecutions: Map<string, ExecutionState> = new Map();

  execute(request, options?: {executionId}): Promise<TestExecutionResult>
  stopExecution(executionId): boolean
  stop(): void  // 모든 실행 중지 (하위 호환)
}
```

**변경점:**
- 전역 `isRunning` 플래그 제거
- `ExecutionState` Map으로 실행별 상태 격리
- `stopExecution(id)`로 특정 실행만 중지 가능

### 5. Socket 이벤트 추가 (Step 5)

실시간 통신을 위한 이벤트:

| 이벤트 | 방향 | 설명 |
|--------|------|------|
| `user:identify` | C→S | 사용자 닉네임 등록 |
| `user:identified` | S→C | 등록 확인 |
| `queue:status` | C→S | 큐 상태 요청 |
| `queue:status:response` | S→C | 큐 상태 응답 |
| `queue:submit` | C→S | 테스트 제출 |
| `queue:submitted` | S→C | 제출 확인 |
| `queue:cancel` | C→S | 테스트 취소 |
| `queue:updated` | S→C (broadcast) | 큐 변경 알림 |

### 6. 닉네임 UI (Step 6)

사용자 식별을 위한 UI:

- `NicknameModal`: 첫 접속 시 닉네임 입력 요청
- localStorage에 저장 (`qa_tool_nickname`)
- Header에 현재 사용자 표시 + 변경 버튼

### 7. 디바이스 상태 UI (Step 7)

DeviceSelector에 잠금 상태 표시:

| 상태 | 표시 | 설명 |
|------|------|------|
| available | 세션 활성 (녹색) | 사용 가능 |
| busy_mine | 🔓 내가 사용 중 (파란색) | 내 테스트가 사용 중 |
| busy_other | 🔒 {사용자명} (빨간색) | 다른 사용자가 사용 중 |

**기능:**
- 다른 사용자가 사용 중인 디바이스는 선택 불가
- 실행 중인 테스트명 표시
- 5초 간격 상태 갱신

### 8. 대기열 UI (Step 8)

TestQueuePanel 컴포넌트:

- **실행 중 테스트**: 녹색 표시, 취소(중지) 버튼
- **대기 중 테스트**: 노란색 표시, 순번/대기시간/취소 버튼
- **내 테스트 강조**: 파란색 테두리
- **디바이스 요약**: 가용/사용중(나)/사용중(타인) 수 표시
- **접기/펼치기**: 공간 효율적 사용

---

## 영향 받는 파일

### Backend (신규)
```
backend/src/services/deviceLockService.ts
backend/src/services/testQueueService.ts
backend/src/services/testOrchestrator.ts
backend/src/types/queue.ts
```

### Backend (수정)
```
backend/src/services/testExecutor.ts
backend/src/routes/test.ts
backend/src/index.ts
```

### Frontend (신규)
```
frontend/src/components/NicknameModal/
frontend/src/components/TestExecutionPanel/TestQueuePanel.tsx
frontend/src/components/TestExecutionPanel/TestQueuePanel.css
```

### Frontend (수정)
```
frontend/src/App.tsx
frontend/src/components/Header/Header.tsx
frontend/src/components/Header/Header.css
frontend/src/components/TestExecutionPanel/DeviceSelector.tsx
frontend/src/components/TestExecutionPanel/TestExecutionPanel.tsx
frontend/src/components/TestExecutionPanel/TestExecutionPanel.css
frontend/src/types/index.ts
```

---

## 사용 방법

### 1. 닉네임 설정
첫 접속 시 자동으로 모달이 표시됩니다. 2-20자 닉네임을 입력하세요.

### 2. 테스트 실행
기존과 동일하게 디바이스와 시나리오를 선택하고 실행합니다.
- 디바이스가 사용 중이면 자동으로 대기열에 추가됩니다.
- 우선순위를 설정할 수 있습니다 (향후 UI 추가 예정).

### 3. 대기열 확인
"테스트 대기열" 패널에서 현재 상태를 확인할 수 있습니다:
- 내 테스트가 몇 번째인지
- 다른 사용자의 테스트 현황
- 예상 대기 시간

### 4. 테스트 취소
내 테스트만 취소할 수 있습니다. 대기열 패널에서 "취소" 버튼을 클릭하세요.

---

## 롤백 방법

각 단계별 Git 태그가 생성되어 있어 문제 발생 시 특정 시점으로 롤백할 수 있습니다:

```bash
# 태그 목록 확인
git tag -l "step-*"

# 특정 단계로 롤백 (예: Step 5까지만 적용)
git checkout step-5-socket

# 브랜치로 복원
git checkout feature/multi-user-test-queue
```

---

## 향후 개선 가능 사항

1. **우선순위 UI**: 테스트 제출 시 우선순위 선택 옵션
2. **예상 대기 시간**: 평균 실행 시간 기반 계산
3. **알림**: 내 테스트 차례가 되면 브라우저 알림
4. **관리자 기능**: 다른 사용자 테스트 취소 권한
5. **통계 대시보드**: 큐 사용률, 평균 대기 시간 등

---

## 기술적 결정 사항

### 왜 디바이스 수준 잠금인가?
전역 잠금은 비효율적입니다. 디바이스 A를 사용하는 테스트와 디바이스 B를 사용하는 테스트는 동시에 실행 가능해야 합니다.

### 왜 Socket.IO를 사용하는가?
HTTP 폴링 대신 실시간 양방향 통신으로:
- 즉각적인 상태 업데이트
- 연결 해제 감지 및 정리
- 낮은 지연시간

### 왜 localStorage에 닉네임을 저장하는가?
서버 측 인증 시스템 없이 간단한 사용자 식별이 목적입니다. 보안이 필요하면 향후 인증 시스템과 통합할 수 있습니다.

---

*최종 수정일: 2026-01-11*
