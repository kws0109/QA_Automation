# 스케줄 관리 Suite 기반 재구축 회고록

## 개요

**날짜**: 2026년 01월 27일
**목표**: 스케줄 관리 기능을 Suite 기반으로 재구축하고 UI를 다른 탭들과 통일

---

## 배경

기존 스케줄 관리 기능은 시나리오(Scenario) 단위로 실행하도록 설계되어 있었습니다. 하지만 현재 실행 시스템이 Suite(묶음) 기반의 `suiteExecutor`를 사용하도록 변경되면서, 스케줄 관리 기능도 Suite 기반으로 완전히 재구축할 필요가 생겼습니다.

또한, 스케줄 관리 UI가 다른 탭들(ExecutionCenter, SuiteManager)과 스타일이 맞지 않아 일관성 있는 UI로 통일하는 작업도 함께 진행했습니다.

---

## 구현 내용

### 1. Backend 타입 정의 수정

**파일**: `backend/src/types/index.ts`

```typescript
// 변경 전
export interface Schedule {
  scenarioId: string;
  deviceIds: string[];
  // ...
}

// 변경 후
export interface Schedule {
  id: string;
  name: string;
  suiteId: string;              // Suite 기반으로 변경
  cronExpression: string;
  enabled: boolean;
  description?: string;
  repeatCount?: number;         // 반복 횟수 (기본: 1)
  scenarioInterval?: number;    // 시나리오 간격 ms (기본: 0)
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  nextRunAt?: string;
}
```

### 2. ScheduleService 수정

**파일**: `backend/src/services/scheduleService.ts`

- `scenarioService` 참조를 `suiteService` 참조로 변경
- Suite 존재 여부 검증 로직 추가
- 목록 조회 시 `suiteName` 반환

### 3. ScheduleManager 수정

**파일**: `backend/src/services/scheduleManager.ts`

```typescript
// 변경 전
const result = await testExecutor.execute(schedule.scenarioId, schedule.deviceIds);

// 변경 후
const result = await suiteExecutor.executeSuite(schedule.suiteId, {
  repeatCount: schedule.repeatCount ?? 1,
  scenarioInterval: schedule.scenarioInterval ?? 0,
});
success = result.stats.failed === 0;
reportId = result.id;
```

### 4. API 라우트 수정

**파일**: `backend/src/routes/schedule.ts`

- 필수 필드 검증을 `scenarioId, deviceIds` → `suiteId`로 변경
- Suite 기반 응답 형식으로 수정

### 5. Frontend UI 재구축

**파일**: `frontend/src/components/ScheduleManager/`

#### 레이아웃 변경 (SuiteManager 패턴 적용)
- 테이블 기반 UI → 2열 레이아웃
- 좌측: 스케줄 목록 (카드 형태)
- 우측: 상세 뷰 / 편집 폼 / 생성 폼 / 실행 이력

#### CSS 변수 통일
```css
/* 변경 전 */
background: #1e1e2e;
color: #cdd6f4;

/* 변경 후 */
background: var(--bg-base);
color: var(--text-primary);
```

#### 주요 CSS 변수
| 용도 | 변수 |
|------|------|
| 배경 | `--bg-base`, `--bg-surface`, `--bg-elevated` |
| 텍스트 | `--text-primary`, `--text-secondary`, `--text-muted` |
| 테두리 | `--border-default` |
| 강조 | `--accent-primary` |
| 상태 | `--color-success`, `--color-danger`, `--color-warning` |

---

## 영향 받는 파일

```
backend/src/types/index.ts                    - Schedule 타입 정의
backend/src/services/scheduleService.ts       - Suite 참조로 변경
backend/src/services/scheduleManager.ts       - suiteExecutor 연동
backend/src/routes/schedule.ts                - API 검증 로직 수정
frontend/src/types/index.ts                   - Schedule 타입 동기화
frontend/src/components/ScheduleManager/ScheduleManager.tsx  - UI 재구축
frontend/src/components/ScheduleManager/ScheduleManager.css  - 스타일 통일
```

---

## 사용 방법

### 스케줄 생성
1. 스케줄 관리 탭에서 "새 스케줄" 버튼 클릭
2. 스케줄 이름 입력
3. 실행할 묶음(Suite) 선택
4. 실행 주기 설정 (요일, 시간)
5. (선택) 고급 옵션: 반복 횟수, 시나리오 간격
6. "생성" 버튼 클릭

### 스케줄 활성화
- 목록에서 토글 스위치로 활성화/비활성화
- 활성화 시 node-cron으로 자동 실행 등록

### 즉시 실행
- 상세 뷰에서 ▶ 버튼 클릭

---

## 버그 수정

### 세션 유효성 검사 강화 (2026-01-27)

**문제**: 스케줄 실행 시 "WebDriverError: A session is either terminated or not started" 오류 발생

**원인**:
- `suiteExecutor._executeScenario`에서 `getSessionInfo()`로 세션 존재 여부만 확인
- 실제 Appium 세션이 죽었는지는 검사하지 않음
- 세션 정보가 메모리에는 있지만 실제 WebDriver 세션이 종료된 상태

**해결**:
- `getSessionInfo()` + 수동 생성 → `sessionManager.ensureSession()` 사용
- `ensureSession()`은 세션 상태를 검증(`checkSessionHealth`)하고 죽은 세션을 자동 재생성

```typescript
// 변경 전
let session = sessionManager.getSessionInfo(deviceId);
if (!session) {
  session = await sessionManager.createSession(deviceInfo);
}

// 변경 후
const session = await sessionManager.ensureSession(deviceInfo);
```

**영향 받는 파일**:
- `backend/src/services/suiteExecutor.ts`

---

## 향후 개선 가능 사항

1. **알림 기능**: 스케줄 실행 완료 시 Slack/Discord 웹훅 알림
2. **실행 이력 필터링**: 날짜/결과별 필터 기능
3. **리포트 연결**: 실행 이력에서 Suite 리포트로 바로 이동

---

*최종 수정일: 2026-01-27*
