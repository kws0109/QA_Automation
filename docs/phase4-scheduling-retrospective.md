# Phase 4 회고록: 스케줄링 기능

## 개요

**기간**: 2026년 1월 9일
**목표**: 예약/반복 실행 기능을 구현하여 특정 시간에 자동으로 테스트 시나리오 실행

---

## 구현 내용

### Backend

#### 1. ScheduleService (`backend/src/services/scheduleService.ts`)
- 스케줄 CRUD 기능
  - `create()`: 새 스케줄 생성
  - `getAll()`: 스케줄 목록 조회 (시나리오명 포함)
  - `getById()`: 스케줄 상세 조회
  - `update()`: 스케줄 수정
  - `delete()`: 스케줄 삭제
- 활성화/비활성화
  - `enable()`: 스케줄 활성화
  - `disable()`: 스케줄 비활성화
  - `getEnabledSchedules()`: 활성화된 스케줄 목록
- 실행 시간 관리
  - `updateLastRunAt()`: 마지막 실행 시간 업데이트
  - `updateNextRunAt()`: 다음 실행 예정 시간 업데이트
- 실행 이력 관리
  - `addHistory()`: 실행 이력 추가
  - `getAllHistory()`: 전체 이력 조회
  - `getHistoryByScheduleId()`: 특정 스케줄 이력 조회
- 저장 경로: `backend/schedules/`

#### 2. ScheduleManager (`backend/src/services/scheduleManager.ts`)
- node-cron 기반 스케줄 실행 관리
- 서버 시작 시 활성화된 스케줄 자동 로드
- Cron 작업 관리
  - `_startCronJob()`: Cron 작업 시작
  - `_stopCronJob()`: Cron 작업 중지
  - `cronJobs: Map<scheduleId, ScheduledTask>`
- 스케줄 실행
  - `_executeSchedule()`: 시나리오 병렬 실행 (`parallelExecutor.executeParallel()` 호출)
  - 실행 전 활성 세션 확인
  - 실행 이력 자동 저장
- 다음 실행 시간 계산
  - `_getNextRunTime()`: Cron 표현식 파싱하여 다음 실행 시간 추정
- Socket.IO 이벤트 발송
  - `schedule:start`: 스케줄 실행 시작
  - `schedule:complete`: 스케줄 실행 완료
  - `schedule:enabled`: 스케줄 활성화됨
  - `schedule:disabled`: 스케줄 비활성화됨

#### 3. Schedule API (`backend/src/routes/schedule.ts`)
| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/schedules` | 스케줄 목록 |
| GET | `/api/schedules/:id` | 스케줄 상세 |
| POST | `/api/schedules` | 스케줄 생성 |
| PUT | `/api/schedules/:id` | 스케줄 수정 |
| DELETE | `/api/schedules/:id` | 스케줄 삭제 |
| POST | `/api/schedules/:id/enable` | 활성화 |
| POST | `/api/schedules/:id/disable` | 비활성화 |
| POST | `/api/schedules/:id/run` | 즉시 실행 |
| GET | `/api/schedules/history` | 전체 실행 이력 |
| GET | `/api/schedules/:id/history` | 특정 스케줄 이력 |

#### 4. 타입 정의 (`backend/src/types/index.ts`)
```typescript
interface Schedule {
  id: string;
  name: string;
  scenarioId: string;
  deviceIds: string[];
  cronExpression: string;  // '0 10 * * *' 형식
  enabled: boolean;
  description?: string;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  nextRunAt?: string;
}

interface ScheduleHistory {
  id: string;
  scheduleId: string;
  scheduleName: string;
  scenarioId: string;
  scenarioName: string;
  deviceIds: string[];
  startedAt: string;
  completedAt: string;
  success: boolean;
  reportId?: string;
  error?: string;
}
```

---

### Frontend

#### 1. ScheduleManager 컴포넌트 (`frontend/src/components/ScheduleManager/`)
- 스케줄 목록 테이블
  - 활성화 토글 스위치
  - 시나리오명, 실행 주기, 디바이스 수 표시
  - 마지막/다음 실행 시간 표시
  - 즉시 실행, 수정, 삭제 버튼
- 스케줄 생성/수정 폼 (모달)
  - 스케줄 이름 입력
  - 시나리오 선택 드롭다운
  - 디바이스 선택 체크박스
  - **드롭다운 기반 시간 선택 UI**
  - 설명 입력 (선택)
- 실행 이력 테이블
  - 스케줄명, 시나리오명
  - 시작/종료 시간
  - 성공/실패 배지
  - 에러 메시지 표시

#### 2. 드롭다운 기반 시간 선택 UI
기존 Cron 프리셋 버튼 대신 직관적인 드롭다운 UI 구현:
- **반복 선택**: 매일 / 평일(월~금) / 주말(토,일) / 요일 선택
- **커스텀 요일 선택**: 원형 버튼으로 일~토 개별 선택
- **시간 선택**: 오전/오후 시간 드롭다운 (0~23시)
- **분 선택**: 0분, 15분, 30분, 45분 드롭다운
- **스케줄 요약**: "매일 오전 10시에 실행" 형태로 표시

내부적으로 드롭다운 값을 Cron 표현식으로 자동 변환:
```typescript
// 드롭다운 → Cron 표현식 변환
scheduleTimeToCron({ dayOption: 'weekdays', hour: 10, minute: 30 })
// → "30 10 * * 1-5"

// Cron 표현식 → 드롭다운 변환 (수정 시)
parseCronToScheduleTime("30 10 * * 1-5")
// → { dayOption: 'weekdays', hour: 10, minute: 30, customDays: [] }
```

#### 3. App.tsx 수정
- 네 번째 탭 "스케줄 관리" 추가
- ScheduleManager 컴포넌트 연동

---

## 해결한 문제들

### 1. node-cron TypeScript 타입 오류
**증상**: `'scheduled' does not exist in type 'TaskOptions'` 에러
**원인**: node-cron v3.x에서 옵션 인터페이스 변경됨
**해결**: 옵션 객체 제거, 기본값 사용
```typescript
// Before
cron.schedule(expression, callback, { scheduled: true, timezone: 'Asia/Seoul' });

// After
cron.schedule(expression, callback);
```

### 2. Cron 표현식 UI 사용성 문제
**증상**: 사용자가 Cron 표현식을 직접 이해하기 어려움
**해결**: 드롭다운 기반 UI로 완전 대체
- 사용자는 드롭다운만 선택
- 시스템이 내부적으로 Cron 표현식 생성
- 기존 스케줄 수정 시 Cron 표현식을 파싱하여 드롭다운에 표시

---

## 기술적 결정사항

### 1. 스케줄링 라이브러리 선택
- **선택**: `node-cron`
- **이유**: 가볍고, 표준 GNU crontab 문법 지원, TypeScript 타입 제공
- **대안**: `node-schedule` (더 많은 기능), `agenda` (MongoDB 필요)

### 2. 데이터 저장 방식
- **선택**: JSON 파일 기반
- **이유**: 기존 시나리오/리포트와 동일한 패턴, 별도 DB 불필요
- **구조**:
  ```
  backend/schedules/
  ├── schedules.json      # 스케줄 목록
  └── history.json        # 실행 이력
  ```

### 3. 놓친 스케줄 처리
- **현재**: 서버가 꺼져 있는 동안 놓친 스케줄은 실행 안함, 다음 예정 시간에 실행
- **이유**: 구현 단순화, 대부분의 테스트 자동화 도구와 동일한 동작
- **향후**: 옵션으로 "놓친 실행 즉시 실행" 또는 "missed 상태로 이력 기록" 추가 가능

### 4. 드롭다운 시간 간격
- **분 선택**: 0, 15, 30, 45분 (15분 단위)
- **이유**: 대부분의 테스트 스케줄은 정각 또는 15분 단위로 설정
- **향후**: 필요 시 1분 단위 선택 가능하도록 확장 가능

---

## 파일 구조

```
backend/src/
├── services/
│   ├── scheduleService.ts   # 스케줄 CRUD (NEW)
│   ├── scheduleManager.ts   # Cron 작업 관리 (NEW)
│   └── ...
├── routes/
│   └── schedule.ts          # 스케줄 API (NEW)
└── types/index.ts           # 타입 정의 추가

backend/schedules/           # 스케줄 데이터 저장 (NEW)
├── schedules.json
└── history.json

frontend/src/
├── components/
│   └── ScheduleManager/     # 스케줄 관리 UI (NEW)
│       ├── ScheduleManager.tsx
│       └── ScheduleManager.css
├── types/index.ts           # 타입 정의 추가
└── App.tsx                  # 탭 추가
```

---

## 남은 작업 (향후 개선)

### 1. 스케줄 기능 확장
- [ ] 놓친 스케줄 처리 옵션
- [ ] 스케줄 복사 기능
- [ ] 스케줄 그룹화

### 2. 알림 기능
- [ ] 실행 완료/실패 알림
- [ ] Slack/Discord 웹훅 연동
- [ ] 이메일 알림

### 3. 대시보드
- [ ] 실행 통계 차트
- [ ] 성공률 추이 그래프
- [ ] 스케줄 캘린더 뷰

---

## 배운 점

### 1. node-cron 사용법
- `cron.schedule(expression, callback)`: 기본 스케줄 등록
- `cron.validate(expression)`: 표현식 유효성 검사
- `task.stop()`: 작업 중지
- TypeScript에서 옵션 타입 주의 필요

### 2. Cron 표현식 파싱
- 5필드: `분 시 일 월 요일`
- `*`: 모든 값
- `1-5`: 범위 (월~금)
- `0,6`: 특정 값 (일,토)
- `*/30`: 간격 (30분마다)

### 3. UX 고려사항
- 기술적으로 정확한 UI(Cron 표현식)보다 직관적인 UI(드롭다운)가 사용자 경험 향상
- 내부적으로는 표준 형식 유지하면서 UI만 추상화

---

## 관련 커밋

- `23213fb` feat: Phase 4 - 스케줄링 기능 구현

---

*최종 수정일: 2026-01-09*
