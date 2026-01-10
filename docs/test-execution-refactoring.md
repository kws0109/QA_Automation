# 테스트 실행 시스템 리팩토링 회고록

## 개요

**날짜**: 2026년 01월 10일
**목표**: 시나리오 실행 시스템을 Who/What/When 패러다임으로 재설계

---

## 배경

기존 시나리오 실행 시스템은 단일 시나리오만 실행할 수 있었습니다. 패키지 > 카테고리 > 시나리오의 3계층 구조로 변경된 후, 여러 시나리오를 연속으로 실행하고 반복 테스트를 지원하는 새로운 실행 시스템이 필요했습니다.

새로운 패러다임:
- **Who**: 어떤 디바이스로 테스트할 것인지
- **What**: 어떤 테스트를 진행할 것인지 (카테고리 전체 또는 개별 시나리오)
- **When**: 즉시 실행 또는 예약, 반복 횟수 설정

---

## 구현 내용

### Phase 1: 백엔드 (TestExecutor 서비스)

#### 1.1 타입 정의 (`backend/src/types/execution.ts`)

다중 시나리오 테스트 실행을 위한 타입 추가:
- `TestExecutionRequest`: Who/What/When 요청 구조
- `ScenarioQueueItem`: 실행 순서 관리
- `ScenarioExecutionSummary`: 개별 시나리오 실행 요약
- `TestExecutionStatus`: 실행 상태 (진행률, 현재 시나리오)
- `TestExecutionResult`: 전체 테스트 결과

#### 1.2 TestExecutor 서비스 (`backend/src/services/testExecutor.ts`)

핵심 기능:
- `execute(request)`: 메인 진입점, 시나리오 큐 생성 후 순차 실행
- `buildQueue()`: 시나리오 ID와 반복 횟수로 실행 큐 생성
- `executeSingleScenario()`: 기존 parallelExecutor 활용하여 단일 시나리오 실행
- `stop()`: 실행 중지
- `getStatus()`: 현재 상태 조회

Socket 이벤트:
- `test:start`: 테스트 시작
- `test:scenario:start`: 시나리오 시작
- `test:scenario:complete`: 시나리오 완료
- `test:progress`: 진행률 업데이트
- `test:complete`: 테스트 완료
- `test:stopping`: 중지 요청

#### 1.3 API 엔드포인트 (`backend/src/routes/test.ts`)

```
POST /api/test/execute  - 테스트 실행
GET  /api/test/status   - 실행 상태 조회
POST /api/test/stop     - 실행 중지
```

---

### Phase 2: 프론트엔드 (TestExecutionPanel)

#### 2.1 컴포넌트 구조

```
TestExecutionPanel/
├── TestExecutionPanel.tsx      # 메인 컴포넌트 (Socket 이벤트 처리)
├── TestExecutionPanel.css      # 스타일
├── DeviceSelector.tsx          # WHO - 디바이스 선택
├── ScenarioSelector.tsx        # WHAT - 시나리오 선택 (트리 구조)
├── ExecutionOptions.tsx        # WHEN - 실행 옵션
├── ExecutionProgress.tsx       # 실행 진행 상황
└── index.ts                    # exports
```

#### 2.2 DeviceSelector 컴포넌트

- 연결된 디바이스 목록 표시
- 체크박스로 다중 선택
- 연결 상태 / 세션 상태 표시
- 전체 선택 / 전체 해제 / 세션 있는 디바이스 선택

#### 2.3 ScenarioSelector 컴포넌트

- 패키지 > 카테고리 > 시나리오 3계층 트리 구조
- 카테고리 전체 선택 기능
- 검색/필터 기능
- 접기/펼치기 기능
- API: `/api/packages`, `/api/categories/{packageId}`, `/api/scenarios`

#### 2.4 ExecutionOptions 컴포넌트

- 즉시 실행 / 예약 실행 (라디오 버튼)
- 반복 횟수 (1-10회)
- 실행 모드 (순차/병렬)

#### 2.5 ExecutionProgress 컴포넌트

- 진행률 바
- 현재 실행 중인 시나리오 표시
- 남은 예상 시간
- 시나리오 큐 목록 (완료/현재/대기 상태)
- 실행 로그

#### 2.6 TestExecutionPanel 메인 컴포넌트

- Socket.IO 이벤트 리스너 설정
- 세션 없는 디바이스 자동 생성
- 실행 요청 전송
- 상태 관리 통합

---

## 영향 받는 파일

### 신규 파일

```
backend/src/services/testExecutor.ts
backend/src/routes/test.ts
frontend/src/components/TestExecutionPanel/TestExecutionPanel.tsx
frontend/src/components/TestExecutionPanel/TestExecutionPanel.css
frontend/src/components/TestExecutionPanel/DeviceSelector.tsx
frontend/src/components/TestExecutionPanel/ScenarioSelector.tsx
frontend/src/components/TestExecutionPanel/ExecutionOptions.tsx
frontend/src/components/TestExecutionPanel/ExecutionProgress.tsx
frontend/src/components/TestExecutionPanel/index.ts
```

### 수정 파일

```
backend/src/types/execution.ts          # 다중 테스트 타입 추가
backend/src/index.ts                    # testRoutes, testExecutor 등록
frontend/src/types/index.ts             # 프론트엔드 타입 추가
frontend/src/App.tsx                    # TestExecutionPanel 통합
```

---

## 사용 방법

### 테스트 실행

1. "시나리오 실행" 탭으로 이동
2. **WHO**: 테스트할 디바이스 선택 (체크박스)
3. **WHAT**: 테스트할 시나리오 선택 (트리에서 개별 또는 카테고리 전체)
4. **WHEN**: 반복 횟수 및 실행 모드 설정
5. "테스트 시작" 버튼 클릭

### API 사용

```typescript
// 테스트 실행 요청
POST /api/test/execute
{
  "deviceIds": ["emulator-5554", "emulator-5556"],
  "scenarioIds": ["scenario-1", "scenario-2", "scenario-3"],
  "repeatCount": 3,
  "executionMode": "parallel"
}

// 실행 상태 조회
GET /api/test/status

// 실행 중지
POST /api/test/stop
```

---

## 향후 개선 가능 사항

1. **예약 실행**: 현재 UI는 있지만 백엔드 연동 필요
2. **통합 리포트**: 다중 시나리오 실행 결과를 하나의 리포트로
3. **기존 ScenarioExecution 컴포넌트 제거**: 레거시 코드 정리

---

*최종 수정일: 2026-01-10*
