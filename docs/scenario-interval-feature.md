# 시나리오 간 인터벌 기능 회고록

## 개요

**날짜**: 2026년 01월 11일
**목표**: 시나리오 A 완료 후 시나리오 B 시작 전 대기 시간(인터벌) 설정 기능 추가

---

## 배경

### 문제점
기존에는 시나리오 A가 끝나면 즉시 시나리오 B가 시작되었습니다. 일부 테스트 케이스에서는 다음과 같은 이유로 시나리오 간 대기 시간이 필요했습니다:

1. **앱 상태 안정화**: 이전 시나리오에서 앱이 특정 상태로 전환된 후 안정화 시간 필요
2. **서버 응답 대기**: 백엔드 처리가 완료되기를 기다려야 하는 경우
3. **리소스 정리**: 이전 시나리오의 리소스가 해제되는 시간 확보
4. **디버깅 편의**: 시나리오 사이에 화면을 확인할 시간 확보

---

## 구현 내용

### 1. 타입 정의 확장

**Backend (`backend/src/types/execution.ts`)**:
```typescript
export interface TestExecutionRequest {
  deviceIds: string[];
  scenarioIds: string[];
  repeatCount: number;
  scenarioInterval?: number;  // 시나리오 간 인터벌 (ms, 기본: 0)
}
```

**Frontend (`frontend/src/types/index.ts`)**:
```typescript
export interface TestExecutionOptions {
  repeatCount: number;
  scenarioInterval: number;   // 시나리오 간 인터벌 (초, 기본: 5)
}
```

### 2. TestExecutor 인터벌 적용

**`backend/src/services/testExecutor.ts`**:

```typescript
class TestExecutor {
  private scenarioInterval = 0;  // ms

  // 지연 헬퍼 메서드
  private _delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // executeDeviceScenarios 내부
  for (let i = 0; i < this.scenarioQueue.length; i++) {
    // ... 시나리오 실행 ...

    // 시나리오 간 인터벌 (마지막이 아닐 경우)
    if (this.scenarioInterval > 0 && i < this.scenarioQueue.length - 1 && !this.stopRequested) {
      console.log(`[TestExecutor] 디바이스 ${deviceId}: ${this.scenarioInterval}ms 대기`);
      await this._delay(this.scenarioInterval);
    }
  }
}
```

### 3. UI 컴포넌트

**ExecutionOptions.tsx**:
- 인터벌 입력 UI 추가 (0~60초 범위)
- +/- 버튼으로 1초씩 조절
- 힌트 텍스트로 설명 제공

```
┌─────────────────────────────────────┐
│ 실행 옵션                            │
├─────────────────────────────────────┤
│ 반복 횟수       [ - ] [ 1 ] [ + ] 회 │
│ 시나리오 인터벌  [ - ] [ 5 ] [ + ] 초 │
│ (시나리오 완료 후 다음 시작 전 대기)   │
└─────────────────────────────────────┘
```

---

## 영향 받는 파일

```
backend/src/types/execution.ts                    - TestExecutionRequest 타입
backend/src/services/testExecutor.ts              - 인터벌 로직 구현
frontend/src/types/index.ts                       - TestExecutionOptions 타입
frontend/src/components/TestExecutionPanel/
  ├── ExecutionOptions.tsx                        - 인터벌 입력 UI
  └── TestExecutionPanel.tsx                      - 초기값 및 요청 전달
```

---

## 동작 방식

### 실행 흐름
```
시나리오 A 시작
    ↓
시나리오 A 완료
    ↓
[인터벌 대기: N초]  ← 설정값 적용
    ↓
시나리오 B 시작
    ↓
시나리오 B 완료
    ↓
[인터벌 대기: N초]
    ↓
시나리오 C 시작
    ↓
시나리오 C 완료 (마지막 → 인터벌 없음)
```

### 인터벌 미적용 케이스
- **마지막 시나리오 후**: 대기 없이 즉시 완료
- **시나리오 실패 시**: 인터벌 없이 즉시 중단
- **중지 요청 시**: 대기 중이더라도 즉시 중단
- **인터벌 0초 설정**: 기존처럼 즉시 다음 시나리오 시작

---

## 설정 값

| 항목 | 값 |
|------|-----|
| 기본값 | 5초 |
| 최소값 | 0초 |
| 최대값 | 60초 |
| 단위 변환 | UI: 초 → API: ms (×1000) |

---

## 사용 예시

### 일반적인 테스트
- **인터벌 5초**: 앱이 안정화되는 시간 확보 (기본값)

### 빠른 회귀 테스트
- **인터벌 0초**: 최대한 빠르게 시나리오 실행

### 서버 의존 테스트
- **인터벌 10~30초**: 서버 처리 완료 대기가 필요한 경우

### 디버깅/모니터링
- **인터벌 30~60초**: 각 시나리오 결과를 천천히 확인

---

## 향후 개선 가능 사항

1. **시나리오별 개별 인터벌**: 특정 시나리오 후에만 긴 대기 시간 설정
2. **조건부 인터벌**: 성공/실패에 따라 다른 인터벌 적용
3. **인터벌 중 상태 표시**: UI에서 "대기 중... (3초 남음)" 표시

---

*최종 수정일: 2026-01-11*
