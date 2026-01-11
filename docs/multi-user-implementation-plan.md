# 다중 사용자 테스트 큐 구현 계획

## 개요

**브랜치**: `feature/multi-user-test-queue`
**베이스**: `main` (커밋: c56abf4)
**목표**: 여러 사용자가 동시에 테스트를 실행할 수 있는 큐 시스템 구현

---

## 롤백 전략

### Git 브랜치 구조
```
main (안정)
  │
  └── feature/multi-user-test-queue (작업 브랜치)
        │
        ├── Step 1: DeviceLockService ──── 커밋 후 태그: step-1-device-lock
        ├── Step 2: TestQueueService ───── 커밋 후 태그: step-2-test-queue
        ├── Step 3: TestOrchestrator ───── 커밋 후 태그: step-3-orchestrator
        ├── Step 4: TestExecutor 수정 ──── 커밋 후 태그: step-4-executor
        ├── Step 5: Socket 이벤트 ──────── 커밋 후 태그: step-5-socket
        ├── Step 6: 닉네임 UI ─────────── 커밋 후 태그: step-6-nickname
        ├── Step 7: 디바이스 상태 UI ───── 커밋 후 태그: step-7-device-ui
        └── Step 8: 대기열 UI ─────────── 커밋 후 태그: step-8-queue-ui
```

### 롤백 명령어
```bash
# 특정 단계로 롤백
git reset --hard step-X-xxx

# 전체 취소 (main으로 복귀)
git checkout main
git branch -D feature/multi-user-test-queue

# 특정 커밋으로 롤백
git reset --hard <commit-hash>
```

---

## 기존 코드 보존 전략

### 1. TestExecutor 호환성 유지
```typescript
// 기존 API 유지 (하위 호환)
testExecutor.execute(request)  // 단일 사용자 모드로 동작

// 새 API 추가
testOrchestrator.submitTest(request, userName)  // 큐 기반 다중 사용자
```

### 2. 점진적 마이그레이션
- 기존 `testExecutor.ts`는 수정 최소화
- 새 서비스들이 `testExecutor`를 내부적으로 호출
- 기존 API 엔드포인트 유지, 새 엔드포인트 추가

### 3. Feature Flag (선택적)
```typescript
// config.ts
export const FEATURE_FLAGS = {
  MULTI_USER_QUEUE: process.env.MULTI_USER_QUEUE === 'true' || false
};

// 사용
if (FEATURE_FLAGS.MULTI_USER_QUEUE) {
  // 새 큐 시스템 사용
} else {
  // 기존 단일 실행 시스템 사용
}
```

---

## 구현 단계 상세

### Step 1: DeviceLockService (1일)

**목표**: 디바이스별 잠금 관리

**파일**:
- `backend/src/services/deviceLockService.ts` (신규)
- `backend/src/types/queue.ts` (신규)

**롤백 포인트**: 독립적 서비스, 삭제만 하면 됨

**구현 내용**:
```typescript
interface DeviceLock {
  deviceId: string;
  executionId: string;
  lockedBy: string;        // 사용자 이름
  lockedAt: Date;
  testName?: string;
}

class DeviceLockService {
  private locks: Map<string, DeviceLock> = new Map();

  lockDevices(deviceIds: string[], executionId: string, userName: string): boolean
  unlockDevices(deviceIds: string[]): void
  isDeviceBusy(deviceId: string): boolean
  getDeviceLocks(): DeviceLock[]
  getDeviceOwner(deviceId: string): string | null
}
```

**검증**:
- [ ] 잠금/해제 동작 확인
- [ ] 동시 잠금 요청 처리 확인

---

### Step 2: TestQueueService (1.5일)

**목표**: 테스트 대기열 관리

**파일**:
- `backend/src/services/testQueueService.ts` (신규)

**롤백 포인트**: 독립적 서비스, 삭제만 하면 됨

**구현 내용**:
```typescript
interface QueuedTest {
  queueId: string;
  request: TestExecutionRequest;
  requesterName: string;
  requesterSocketId: string;
  requestedAt: Date;
  status: 'queued' | 'running' | 'completed' | 'cancelled';
  priority: number;
}

class TestQueueService {
  private queue: QueuedTest[] = [];

  addToQueue(request: TestExecutionRequest, userName: string, socketId: string): QueuedTest
  removeFromQueue(queueId: string): boolean
  getQueue(): QueuedTest[]
  getNextExecutable(busyDevices: Set<string>): QueuedTest | null
  updateStatus(queueId: string, status: QueuedTest['status']): void
  getPosition(queueId: string): number
  getEstimatedWaitTime(queueId: string): number
}
```

**검증**:
- [ ] FIFO 순서 확인
- [ ] 상태 변경 확인

---

### Step 3: TestOrchestrator (2일)

**목표**: 전체 조율 (큐 감시, 자동 실행)

**파일**:
- `backend/src/services/testOrchestrator.ts` (신규)

**롤백 포인트**: 독립적 서비스, 삭제만 하면 됨

**의존성**: DeviceLockService, TestQueueService, TestExecutor

**구현 내용**:
```typescript
class TestOrchestrator {
  private io: SocketIOServer | null = null;

  setSocketIO(io: SocketIOServer): void

  // 테스트 제출 (진입점)
  async submitTest(request: TestExecutionRequest, userName: string, socketId: string): Promise<{
    queueId: string;
    status: 'started' | 'queued';
    position?: number;
    estimatedWait?: number;
  }>

  // 테스트 취소
  cancelTest(queueId: string, socketId: string): boolean

  // 상태 조회
  getStatus(): {
    activeExecutions: ExecutionInfo[];
    queue: QueuedTest[];
    deviceLocks: DeviceLock[];
  }

  // 내부: 큐 처리 (테스트 완료 시 호출)
  private processQueue(): void

  // 내부: 브로드캐스트
  private broadcastStatus(): void
}
```

**검증**:
- [ ] 즉시 실행 케이스
- [ ] 대기열 추가 케이스
- [ ] 자동 실행 케이스

---

### Step 4: TestExecutor 수정 (1일)

**목표**: 다중 실행 지원, Orchestrator 콜백

**파일**:
- `backend/src/services/testExecutor.ts` (수정)

**롤백 포인트**: 변경 최소화, git diff로 복원 가능

**변경 내용**:
```typescript
// 기존 유지
class TestExecutor {
  // 변경: 전역 isRunning 제거
  // private isRunning = false;  // 삭제

  // 추가: 실행 중인 테스트 Map
  private activeExecutions: Map<string, ExecutionContext> = new Map();

  // 변경: execute 시그니처 확장
  async execute(
    request: TestExecutionRequest,
    options?: {
      executionId?: string;
      userName?: string;
      onComplete?: (result: TestExecutionResult) => void;
    }
  ): Promise<TestExecutionResult>

  // 추가: 특정 실행 중지
  stopExecution(executionId: string): void

  // 추가: 실행 중 여부 확인
  isExecutionRunning(executionId: string): boolean

  // 기존 유지 (하위 호환)
  stop(): void  // 모든 실행 중지
  getStatus(): TestExecutionStatus  // 첫 번째 실행 상태 반환
}
```

**검증**:
- [ ] 기존 단일 실행 동작 유지
- [ ] 다중 실행 동작 확인

---

### Step 5: Socket 이벤트 (0.5일)

**목표**: 새 이벤트 추가

**파일**:
- `backend/src/index.ts` (수정)
- `backend/src/routes/test.ts` (신규 또는 수정)

**롤백 포인트**: 이벤트 추가만, 기존 이벤트 유지

**추가 이벤트**:
```typescript
// 대기열 관련
'queue:updated'      // 전체 대기열 상태
'queue:position'     // 내 대기 순서 변경
'queue:auto_start'   // 대기 중이던 테스트 자동 시작

// 디바이스 관련
'device:locks_updated'  // 디바이스 잠금 상태 변경
```

**새 API 엔드포인트**:
```
POST /api/test/submit      # 테스트 제출 (큐 시스템)
POST /api/test/cancel/:queueId  # 테스트 취소
GET  /api/test/queue       # 대기열 조회
GET  /api/test/status      # 전체 상태 조회
```

**검증**:
- [ ] 이벤트 발송 확인
- [ ] API 응답 확인

---

### Step 6: 닉네임 UI (0.5일)

**목표**: 사용자 식별

**파일**:
- `frontend/src/components/NicknameModal/NicknameModal.tsx` (신규)
- `frontend/src/App.tsx` (수정)

**롤백 포인트**: 컴포넌트 삭제, App.tsx 복원

**구현 내용**:
```typescript
// localStorage에 저장
const NICKNAME_KEY = 'qa_tool_nickname';

// 첫 접속 시 모달 표시
// 이후 자동 사용
// 변경 버튼으로 수정 가능
```

**검증**:
- [ ] 첫 접속 시 모달 표시
- [ ] localStorage 저장/로드

---

### Step 7: 디바이스 상태 UI (1일)

**목표**: 디바이스 사용 상태 표시

**파일**:
- `frontend/src/components/TestExecutionPanel/DeviceSelector.tsx` (수정)
- `frontend/src/types/index.ts` (수정)

**롤백 포인트**: git diff로 복원

**변경 내용**:
```typescript
// DeviceSelector에 상태 표시 추가
// - 사용 가능: 녹색
// - 사용 중 (본인): 파란색
// - 사용 중 (타인): 빨간색 + 사용자 이름
// - 대기열 예약: 노란색
```

**검증**:
- [ ] 상태별 색상 표시
- [ ] 실시간 업데이트

---

### Step 8: 대기열 UI (1.5일)

**목표**: 대기열 표시 및 관리

**파일**:
- `frontend/src/components/TestExecutionPanel/TestQueuePanel.tsx` (신규)
- `frontend/src/components/TestExecutionPanel/TestExecutionPanel.tsx` (수정)

**롤백 포인트**: 컴포넌트 삭제, TestExecutionPanel 복원

**구현 내용**:
```
┌─────────────────────────────────────────────────────┐
│ 테스트 대기열                                        │
├─────────────────────────────────────────────────────┤
│ 🔄 실행 중 (2)                                      │
│   ├── 김철수: 로그인 테스트 (POCO_F1) - 45%          │
│   └── 박영희: 결제 테스트 (Galaxy_S21) - 20%         │
├─────────────────────────────────────────────────────┤
│ ⏳ 대기 중 (1)                                      │
│   └── 나: 튜토리얼 테스트 (POCO_F1)                  │
│       예상 시작: 약 5분 후              [취소]       │
└─────────────────────────────────────────────────────┘
```

**검증**:
- [ ] 실행 중 테스트 표시
- [ ] 대기 중 테스트 표시
- [ ] 취소 기능

---

## 체크포인트 및 검증

### 각 Step 완료 후
1. 빌드 확인: `npm run build` (backend + frontend)
2. 기존 기능 테스트: 단일 테스트 실행
3. 새 기능 테스트: 해당 Step 기능
4. 커밋 + 태그 생성

### Step 4 완료 후 (중간 검증)
- [ ] 기존 단일 사용자 테스트 실행 정상
- [ ] 새 다중 사용자 API 응답 정상
- [ ] Socket 이벤트 수신 정상

### Step 8 완료 후 (최종 검증)
- [ ] 사용자 A 테스트 실행 중 사용자 B 테스트 대기열 추가
- [ ] 사용자 A 완료 후 사용자 B 자동 시작
- [ ] 대기열 취소 동작
- [ ] 디바이스 상태 실시간 동기화

---

## 위험 완화

### 1. 기존 기능 깨짐 방지
- 각 Step 후 기존 테스트 실행 검증
- Feature flag로 새 기능 비활성화 가능

### 2. 데이터 손실 방지
- 메모리 기반 큐 (재시작 시 초기화)
- 추후 필요 시 영구 저장 추가

### 3. 성능 저하 방지
- 큐 폴링 대신 이벤트 기반
- 브로드캐스트 최적화 (변경 시에만)

---

## 롤백 시나리오

### 시나리오 1: Step 3에서 문제 발견
```bash
git reset --hard step-2-test-queue
# DeviceLockService, TestQueueService만 유지
# TestOrchestrator 재구현
```

### 시나리오 2: 전체 접근법 변경 필요
```bash
git checkout main
git branch -D feature/multi-user-test-queue
# 새 브랜치에서 다른 접근법으로 시작
```

### 시나리오 3: 특정 파일만 복원
```bash
git checkout main -- backend/src/services/testExecutor.ts
# 특정 파일만 main 버전으로 복원
```

---

## 다음 단계

Phase 1 완료 후:
- [ ] main에 머지
- [ ] 운영 테스트
- [ ] Phase 2 (우선순위) 진행

---

*작성일: 2026-01-11*
