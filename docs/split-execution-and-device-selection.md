# 분할 실행 및 디바이스 선택 개선 회고록

## 개요

**날짜**: 2026년 01월 12일
**목표**: 다중 사용자 환경에서 유휴 디바이스 즉시 실행 및 다른 사용자가 사용 중인 디바이스 선택 허용

---

## 배경

### 문제 1: 유휴 디바이스 대기
기존에는 요청한 디바이스 중 하나라도 사용 중이면 전체 테스트가 큐에서 대기했습니다.
예: 디바이스 1, 2, 3 요청 시 디바이스 3만 사용 중이어도 1, 2도 함께 대기

### 문제 2: 디바이스 선택 차단
다른 사용자가 사용 중인 디바이스는 체크박스가 비활성화되어 선택 자체가 불가능했습니다.
예: 사용자 A가 기기 1, 2 사용 중이면 사용자 B는 해당 기기를 선택조차 할 수 없음

---

## 구현 내용

### 1. 분할 실행 (Split Execution)

테스트 요청 시 디바이스를 유휴/사용중으로 분류하여 처리:
- **유휴 디바이스**: 즉시 실행 시작
- **사용 중 디바이스**: 큐에 별도 추가

**SubmitTestResult 타입 확장**:
```typescript
export interface SubmitTestResult {
  status: 'started' | 'queued' | 'partial';  // partial 추가
  splitExecution?: {
    immediateDeviceIds: string[];   // 즉시 실행된 디바이스
    queuedDeviceIds: string[];      // 큐에 추가된 디바이스
    immediateExecutionId: string;   // 즉시 실행 ID
    queuedQueueId: string;          // 큐 테스트 ID
    queuePosition: number;          // 큐 위치
  };
}
```

**TestOrchestrator 분할 실행 로직**:
```typescript
private async startSplitExecution(
  request: TestExecutionRequest,
  userName: string,
  socketId: string,
  availableDeviceIds: string[],
  busyDeviceIds: string[],
  options?: { priority?: 0 | 1 | 2; testName?: string; }
): Promise<SubmitTestResult>
```

### 2. 디바이스 선택 허용

DeviceSelector에서 사용 중인 디바이스도 선택 가능하도록 변경:
- `isDeviceAvailable()` 함수 → `isDeviceBusy()` 함수로 변경 (표시 전용)
- 클릭 핸들러에서 `isAvailable` 체크 제거
- 체크박스 `disabled` 조건에서 `!isAvailable` 제거

**변경 전**:
```typescript
onClick={() => !disabled && isAvailable && handleToggle(device.id)}
disabled={disabled || !isAvailable}
```

**변경 후**:
```typescript
onClick={() => !disabled && handleToggle(device.id)}
disabled={disabled}
```

---

## 영향 받는 파일

```
backend/src/types/queue.ts           - SubmitTestResult 타입 확장
backend/src/services/testOrchestrator.ts - startSplitExecution 메서드 추가
frontend/src/types/index.ts          - TestSubmitResponse 타입 업데이트
frontend/src/components/TestExecutionPanel/TestExecutionPanel.tsx - 분할 실행 로그 표시
frontend/src/components/TestExecutionPanel/DeviceSelector.tsx - 선택 제한 제거
```

---

## 사용 방법

### 시나리오 예시

1. **사용자 A**가 디바이스 1, 2에서 테스트 실행 중
2. **사용자 B**가 디바이스 1, 2, 3을 선택하여 테스트 요청
3. 결과:
   - 디바이스 3: 즉시 실행 시작 (`immediateDeviceIds: ['device-3']`)
   - 디바이스 1, 2: 큐에 추가 (`queuedDeviceIds: ['device-1', 'device-2']`)
4. 사용자 A의 테스트 완료 후 자동으로 사용자 B의 대기 중인 테스트 시작

### UI 표시

- 분할 실행 시 로그에 표시:
  - `✅ 1대 즉시 실행: device-3`
  - `⏳ 2대 대기열 추가 (위치: 1번째): device-1, device-2`

---

## 향후 개선 가능 사항

1. **분할 실행 선택권**: 사용자가 분할 실행 여부를 선택할 수 있는 옵션
2. **대기 시간 예측**: 큐에 추가된 디바이스의 예상 대기 시간 표시 개선
3. **부분 취소**: 분할 실행된 테스트 중 일부만 취소하는 기능

---

*최종 수정일: 2026-01-12*
