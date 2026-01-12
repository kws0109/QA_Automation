# 레거시 parallelExecutor 제거 계획 회고록

## 개요

**날짜**: 2026년 01월 12일
**목표**: 단일 실행 시스템(parallelExecutor)을 제거하고 모든 테스트 실행을 큐 시스템(testOrchestrator)으로 통합

---

## 배경

프로젝트에 두 가지 테스트 실행 시스템이 공존하고 있었습니다:

| 시스템 | 서비스 | API 경로 | 특징 |
|--------|--------|----------|------|
| 레거시 | `parallelExecutor` | `/api/session/execute-parallel` | 직접 실행, 큐 없음 |
| 현재 | `testOrchestrator` | `/api/test/*` | 큐 기반, 다중 사용자 지원 |

이중 시스템으로 인해:
- 코드 중복 및 유지보수 부담
- 디바이스 잠금 충돌 가능성
- 사용자 혼란 (어떤 API를 사용해야 하는지)

---

## 완료된 작업

### 1. 레거시 API 제거 (session.ts)

**제거된 라우트:**
- `POST /api/session/execute-parallel` - 병렬 시나리오 실행
- `GET /api/session/parallel/status` - 병렬 실행 상태 조회
- `POST /api/session/parallel/stop/:deviceId` - 특정 디바이스 중지
- `POST /api/session/parallel/stop-all` - 모든 병렬 실행 중지

**유지된 라우트:**
- `/api/session/parallel/reports/*` - 리포트 관련 API (parallelReportService 사용)

### 2. 미사용 Frontend 컴포넌트 삭제

**삭제된 폴더:**
```
frontend/src/components/
├── ScenarioExecution/    (삭제됨)
│   ├── ScenarioExecution.tsx
│   ├── ScenarioExecution.css
│   └── index.ts
└── ParallelControl/      (삭제됨)
    ├── ParallelControl.tsx
    ├── ParallelControl.css
    └── index.ts
```

이 컴포넌트들은 App.tsx에서 import되지 않아 사용되지 않는 코드였습니다.

---

## 미완료 작업 (스케줄 시스템 의존성)

`scheduleManager.ts`가 `parallelExecutor`를 직접 사용하고 있어 다음 항목들은 스케줄 시스템 리팩토링 시 처리 필요:

### To-Do 목록

| # | 파일 | 작업 | 상태 |
|---|------|------|------|
| 1 | `scheduleManager.ts` | `parallelExecutor` → `testOrchestrator` 변경 | 대기 |
| 2 | `session.ts` | `parallelExecutor.setSocketIO` 미들웨어 제거 | 대기 |
| 3 | `session.ts` | `parallelExecutor` import 제거 | 대기 |
| 4 | `parallelExecutor.ts` | 서비스 파일 삭제 | 대기 |
| 5 | - | 빌드 및 테스트 | 대기 |

### 변경 가이드

**scheduleManager.ts 수정 방향:**

```typescript
// 현재 코드 (라인 156)
const result = await parallelExecutor.executeParallel(
  schedule.scenarioId,
  activeDeviceIds,
  { captureOnComplete: true, recordVideo: true }
);

// 변경 후 (testOrchestrator 큐 시스템 사용)
const result = await testOrchestrator.submitTest(
  {
    deviceIds: activeDeviceIds,
    scenarioIds: [schedule.scenarioId],
    repeatCount: 1,
    scenarioInterval: 0,
  },
  'scheduler',  // userName
  `schedule-${schedule.id}`,  // socketId
  { testName: schedule.name, priority: 10 }  // 스케줄 우선순위 높게
);
```

### 고려사항

1. **우선순위**: 스케줄 실행은 수동 실행보다 우선순위를 높게 설정할지 검토
2. **실행 대기**: 큐 시스템 사용 시 디바이스가 사용 중이면 대기하게 됨 (기존에는 에러 발생)
3. **결과 처리**: `submitTest`는 즉시 반환되므로 실행 완료 대기 로직 추가 필요

---

## 영향 받는 파일

```
backend/src/
├── routes/session.ts           ✅ 수정됨 (레거시 API 제거)
├── services/parallelExecutor.ts  ⏳ 삭제 예정 (스케줄 시스템 수정 후)
└── services/scheduleManager.ts   ⏳ 수정 예정

frontend/src/components/
├── ScenarioExecution/          ✅ 삭제됨
└── ParallelControl/            ✅ 삭제됨
```

---

## 현재 아키텍처

```
[사용자 요청]
     │
     ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ TestExecution   │────▶│ /api/test/*     │────▶│ testOrchestrator│
│ Panel           │     │ (큐 시스템)      │     │ (큐 + 실행)      │
└─────────────────┘     └─────────────────┘     └─────────────────┘

[스케줄 실행]
     │
     ▼
┌─────────────────┐     ┌─────────────────┐
│ ScheduleManager │────▶│ parallelExecutor│  ⬅ 향후 testOrchestrator로 변경
└─────────────────┘     │ (직접 실행)      │
                        └─────────────────┘
```

---

## 향후 개선 가능 사항

1. **스케줄 시스템 통합**: `scheduleManager`가 `testOrchestrator` 사용하도록 변경
2. **parallelExecutor 완전 제거**: 스케줄 시스템 통합 후 서비스 삭제
3. **리포트 시스템 통합**: `parallelReportService`와 큐 시스템 리포트 통합 검토

---

*최종 수정일: 2026-01-12*
