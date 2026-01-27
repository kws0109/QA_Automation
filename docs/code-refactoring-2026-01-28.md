# 코드 리팩토링 회고록

## 개요

**날짜**: 2026년 01월 28일
**목표**: 코드 중복 제거 및 유지보수성 향상

---

## 배경

코드베이스가 성장하면서 다음과 같은 문제점이 발견되었습니다:

- **Backend**: 42개 개선점 (높음 9, 중간 18, 낮음 15)
- **Frontend**: 28개 개선점 (높음 8, 중간 12, 낮음 8)

주요 문제:
1. 폴링 로직 중복 (actions.ts에서 8개 함수가 동일 패턴 반복)
2. Route 에러 핸들링 try-catch 보일러플레이트
3. 인라인 유틸리티 함수 중복
4. API URL 정의 분산

---

## 구현 내용

### 1. Backend: 폴링 로직 통합 (`actions.ts`)

**문제**: 8개의 대기 함수가 동일한 폴링 패턴을 중복 구현

**해결**: 제네릭 `_pollUntil<T>` 헬퍼 메서드 추출

```typescript
private async _pollUntil<T>(
  predicate: () => Promise<{ found: boolean; result?: T }>,
  options: { timeout?: number; interval?: number } = {}
): Promise<{ success: boolean; result?: T; waited: number }>
```

**적용 함수**:
- `waitUntilImage`, `waitUntilImageGone`
- `waitUntilExists`, `waitUntilGone`
- `waitUntilTextExists`, `waitUntilTextGone`
- `waitUntilTextOcr`, `waitUntilTextGoneOcr`

**효과**: 각 함수당 ~40줄 감소

### 2. Backend: Route 에러 핸들링 유틸리티

**새 파일**: `backend/src/utils/asyncHandler.ts`

```typescript
// HTTP 에러 클래스
export class HttpError extends Error {
  constructor(public statusCode: number, message: string) { ... }
}
export class BadRequestError extends HttpError { ... }
export class NotFoundError extends HttpError { ... }

// 래퍼 함수
export function asyncHandler(fn): RequestHandler { ... }
export function syncHandler(fn): RequestHandler { ... }
```

**적용 파일**: `image.ts`, `session.ts`

**Before**:
```typescript
router.get('/endpoint', async (req, res) => {
  try {
    // 로직
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
```

**After**:
```typescript
router.get('/endpoint', asyncHandler(async (req, res) => {
  // 로직
  if (!data) throw new NotFoundError('Data not found');
  res.json({ success: true, data });
}));
```

### 3. Backend: 서비스 헬퍼 메서드 추출

**testExecutor.ts**:
- `_buildStepPerformance()`: 성능 메트릭 객체 생성
- `_findNextNode()`: 다음 실행 노드 탐색

**testOrchestrator.ts**:
- `_generateExecutionId()`: 실행 ID 생성
- `_generateQueueId()`: 큐 ID 생성
- `_initDeviceResults()`: 디바이스 결과 맵 초기화

### 4. Frontend: 유틸리티 함수 추출

**새 파일**: `frontend/src/utils/formatters.ts`
```typescript
export const formatDate = (dateStr: string): string => { ... };
export const formatDuration = (ms: number): string => { ... };
export const formatFileSize = (bytes: number): string => { ... };
export const formatPercent = (value: number, total: number): string => { ... };
export const formatTime = (seconds: number): string => { ... };
```

**새 파일**: `frontend/src/utils/reportUrls.ts`
```typescript
export const getScreenshotUrl = (path: string): string => { ... };
export const getVideoUrl = (path: string): string => { ... };
export const getSuiteVideoUrl = (path: string): string => { ... };
export const getSuiteScreenshotUrl = (path: string): string => { ... };
```

### 5. Frontend: API URL 중앙화

5개 파일에서 `import.meta.env.VITE_API_*` 직접 참조를 제거하고 `config/api.ts` 사용:

| 파일 | 변경 내용 |
|------|-----------|
| `App.tsx` | `API_BASE_URL`, `WS_URL` import |
| `useScreenshotPolling.ts` | `WS_URL` import |
| `Canvas.tsx` | `API_BASE_URL` import |
| `ExecutionCenter.tsx` | `API_BASE_URL` import |
| `LoginPage.tsx` | `API_BASE_URL` import |

### 6. Vite 프록시 수정

**문제**: `/auth/*` 경로가 프록시되지 않아 Slack OAuth 실패

**해결**: `vite.config.ts`에 `/auth` 프록시 추가

```typescript
proxy: {
  '/api': { target: 'http://127.0.0.1:3001', changeOrigin: true },
  '/auth': { target: 'http://127.0.0.1:3001', changeOrigin: true },  // 추가
  '/mjpeg': { ... }
}
```

---

## 영향 받는 파일

```
# Backend (새 파일)
backend/src/utils/asyncHandler.ts

# Backend (수정)
backend/src/appium/actions.ts
backend/src/routes/image.ts
backend/src/routes/session.ts
backend/src/services/testExecutor.ts
backend/src/services/testOrchestrator.ts

# Frontend (새 파일)
frontend/src/utils/formatters.ts
frontend/src/utils/reportUrls.ts

# Frontend (수정)
frontend/src/App.tsx
frontend/src/components/Canvas/Canvas.tsx
frontend/src/components/DeviceDashboard/DeviceDashboard.tsx
frontend/src/components/ExecutionCenter/ExecutionCenter.tsx
frontend/src/components/LoginPage/LoginPage.tsx
frontend/src/components/Panel/constants.ts
frontend/src/components/TestReports/TestReports.tsx
frontend/src/hooks/useScreenshotPolling.ts
frontend/vite.config.ts
```

---

## 남은 작업

### Backend (높음 우선순위 4개)
1. `asyncHandler` 확대 적용 (`device.ts`, `scenario.ts`, `schedule.ts`)
2. `testExecutor.ts` 추가 분해 (`executeNode` 메서드)
3. `suiteOrchestrator.ts` 중복 로직 분석
4. 서비스 간 의존성 검토

### Frontend (높음 우선순위 4개)
1. `DeviceDashboard.tsx` 컴포넌트 분리 (1149줄)
2. `DevicePreview.tsx` 컴포넌트 분리 (1114줄)
3. `API_BASE = API_BASE_URL` alias 17개 제거
4. Prop Drilling 개선 (Context 또는 Zustand)

---

## 결과

| 항목 | Before | After |
|------|--------|-------|
| actions.ts 폴링 코드 | 8개 함수 × ~50줄 | 1개 헬퍼 + 8개 × ~15줄 |
| Route 에러 핸들링 | try-catch 반복 | asyncHandler 사용 |
| Frontend 유틸리티 | 인라인 정의 | 공유 모듈 |
| API URL 정의 | 분산 (5곳) | 중앙화 (config/api.ts) |

---

*최종 수정일: 2026-01-28*
