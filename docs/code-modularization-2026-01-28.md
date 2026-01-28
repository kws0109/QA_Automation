# 코드 모듈화 및 구조 개선 회고록

## 개요

**날짜**: 2026년 01월 28일
**목표**: 대규모 컴포넌트/모듈 분리 및 코드 품질 개선

---

## 배경

프로젝트가 성장하면서 일부 파일이 1000줄을 초과하고, 중복 코드와 일관성 없는 에러 핸들링이 문제가 되었습니다. 유지보수성과 가독성을 높이기 위해 체계적인 리팩토링을 수행했습니다.

### 리팩토링 전 문제점
- `actions.ts`: 1572줄의 거대한 단일 파일
- `DeviceDashboard.tsx`: 1070줄
- `DevicePreview.tsx`: 1139줄
- `TestReports.tsx`: 1379줄
- 라우트마다 다른 에러 핸들링 방식
- API URL 하드코딩 (17개 파일)

---

## 구현 내용

### 1. Backend - Actions 모듈 분리

`backend/src/appium/actions.ts` (1572줄) → 9개 모듈로 분리:

| 파일 | 설명 |
|------|------|
| `actions/index.ts` | 통합 Actions 클래스 |
| `actions/types.ts` | 공통 타입 정의 |
| `actions/utils.ts` | 유틸리티 함수 (`delayMs`, `_pollUntil`) |
| `actions/touch.ts` | 터치 액션 (tap, swipe, longPress) |
| `actions/element.ts` | 요소 액션 (findElement, getAttribute) |
| `actions/text.ts` | 텍스트 액션 (type, tapText, OCR) |
| `actions/image.ts` | 이미지 액션 (tapImage, waitUntilImage) |
| `actions/app.ts` | 앱 액션 (launchApp, terminateApp) |
| `actions/wait.ts` | 대기 액션 (wait, waitUntilExists) |
| `actions/device.ts` | 디바이스 액션 (screenshot, pressKey) |

### 2. Backend - 에러 핸들링 통합

**새 파일**: `backend/src/utils/asyncHandler.ts`

```typescript
// asyncHandler - async 라우트 래퍼
export function asyncHandler<P, ReqBody, ReqQuery>(
  fn: AsyncRouteHandler<P, unknown, ReqBody, ReqQuery>
): RequestHandler

// syncHandler - sync 라우트 래퍼
export function syncHandler<P, ReqBody, ReqQuery>(
  fn: SyncRouteHandler<P, unknown, ReqBody, ReqQuery>
): RequestHandler

// 커스텀 에러 클래스
export class HttpError extends Error { status: number }
export class BadRequestError extends HttpError { status = 400 }
export class NotFoundError extends HttpError { status = 404 }
```

**적용된 라우트 파일** (15개):
- `ai.ts`, `auth.ts`, `category.ts`, `dashboard.ts`, `device.ts`
- `ocr.ts`, `package.ts`, `report.ts`, `scenario.ts`, `schedule.ts`
- `screenshot.ts`, `slack.ts`, `suite.ts`, `test.ts`, `testReport.ts`, `video.ts`

### 3. Backend - 이벤트 시스템 중앙화

**새 폴더**: `backend/src/events/`

```typescript
// eventTypes.ts - 타입 안전한 이벤트 정의
interface DeviceEventMap {
  'device:connected': { deviceId: string };
  'device:disconnected': { deviceId: string };
  // ...
}

// eventEmitter.ts - 싱글톤 이벤트 에미터
export const appEventEmitter = new AppEventEmitter();
```

### 4. Backend - Logger 개선

```typescript
// 새로 추가된 정적 메서드
static getGlobalLevel(): LogLevel {
  return globalLogLevel;
}
```

### 5. Frontend - Context 분리

`App.tsx`에서 상태 관리 로직을 Context로 분리:

**새 폴더**: `frontend/src/contexts/`

| Context | 역할 |
|---------|------|
| `AuthContext` | 인증 상태 (user, login, logout) |
| `DeviceContext` | 디바이스 목록, 세션 관리 |
| `UIContext` | UI 상태 (activeTab, modals) |
| `AppStateContext` | 통합 Provider |

### 6. Frontend - 컴포넌트 분리

#### DeviceDashboard (1070줄 → 395줄)
```
DeviceDashboard/
├── DeviceDashboard.tsx      # 메인 컴포넌트 (395줄)
├── components/
│   ├── DashboardHeader.tsx  # 헤더 + 새로고침
│   ├── DeviceCard.tsx       # 디바이스 카드
│   ├── EmptyState.tsx       # 빈 상태 UI
│   ├── FilterBar.tsx        # 필터 바
│   ├── PreviewPanel.tsx     # 미리보기 패널
│   └── WifiPanel.tsx        # WiFi 연결 패널
├── hooks/
│   └── useWifiAdb.ts        # WiFi ADB 훅
└── utils.ts                 # 유틸리티 함수
```

#### DevicePreview
```
DevicePreview/
├── DevicePreview.tsx
├── types.ts                 # 타입 정의
├── index.ts                 # barrel export
├── components/
│   ├── CapturePanel.tsx
│   ├── InfoPanel.tsx
│   ├── PreviewHeader.tsx
│   ├── RegionSelectPanel.tsx
│   ├── ScreenshotViewer.tsx
│   └── TextExtractPanel.tsx
└── hooks/
    ├── useDeviceConnection.ts
    └── useScreenCapture.ts
```

#### ScheduleManager, SuiteManager, VideoConverter, TestReports
동일한 패턴으로 `components/` 하위 폴더로 분리 완료.

### 7. 기타 개선

- **NicknameModal 제거**: 미사용 컴포넌트 삭제
- **API URL 통합**: 17개 파일에서 `API_BASE = API_BASE_URL` 패턴 제거
- **README 업데이트**: ngrok + Slack OAuth 통합 가이드 추가

---

## 영향 받는 파일

### Backend (신규)
```
backend/src/appium/actions/        # 9개 파일
backend/src/events/                # 3개 파일
backend/src/middleware/auth.ts
backend/src/utils/asyncHandler.ts  # 개선
backend/src/utils/logger.ts        # 개선
```

### Backend (수정)
```
backend/src/routes/*.ts            # 15개 파일 asyncHandler 적용
backend/src/services/*.ts          # 헬퍼 메서드 추출
```

### Frontend (신규)
```
frontend/src/contexts/             # 5개 파일
frontend/src/components/*/components/  # 각 컴포넌트 하위 폴더
frontend/src/components/*/hooks/       # 각 컴포넌트 훅
```

### Frontend (수정/삭제)
```
frontend/src/App.tsx               # Context 분리
frontend/src/components/NicknameModal/  # 삭제
```

---

## 코드 변화량

| 항목 | 변경 |
|------|------|
| 파일 수 | 133개 |
| 추가 | +13,273줄 |
| 삭제 | -11,092줄 |
| 순 증가 | +2,181줄 (구조화로 인한 증가) |

---

## 향후 개선 가능 사항

1. **테스트 코드 추가**: 분리된 모듈에 대한 단위 테스트
2. **Prop Drilling 해소**: 더 많은 상태를 Context로 이동
3. **코드 생성 자동화**: 반복되는 컴포넌트 구조 템플릿화

---

*최종 수정일: 2026-01-28*
