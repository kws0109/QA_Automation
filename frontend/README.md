# Frontend

QA Automation Tool의 React 기반 웹 클라이언트

---

## 개요

- **프레임워크**: React 18 + TypeScript
- **빌드 도구**: Vite
- **실시간 통신**: Socket.IO Client
- **차트**: Recharts
- **가상화**: react-window

---

## 디렉토리 구조

```
frontend/src/
├── main.tsx                 # 앱 엔트리포인트
├── App.tsx                  # 메인 앱 컴포넌트 (탭 라우팅)
├── App.css                  # 전역 스타일
├── components/
│   ├── Canvas/              # 비주얼 노드 에디터
│   ├── Panel/               # 노드 속성 패널
│   ├── Sidebar/             # 노드 타입 선택 사이드바
│   ├── DeviceDashboard/     # 디바이스 관리 대시보드
│   ├── DevicePreview/       # 디바이스 실시간 미리보기
│   ├── ExecutionCenter/     # 통합 실행 센터
│   ├── SuiteManager/        # Suite 관리
│   ├── TestReports/         # 통합 리포트 뷰어
│   ├── MetricsDashboard/    # 메트릭 대시보드
│   ├── ScheduleManager/     # 스케줄 관리
│   ├── SlackSettings/       # Slack 설정
│   ├── LoginPage/           # 로그인 페이지
│   ├── Header/              # 상단 헤더
│   ├── TemplateModal/       # 이미지 템플릿 모달
│   ├── ScenarioTreePanel/   # 시나리오 트리 탐색기
│   ├── EditorTestPanel/     # 에디터 테스트 패널
│   └── ErrorBoundary/       # 에러 바운더리
├── contexts/                # React Context (상태 관리)
├── hooks/                   # 커스텀 훅
├── types/                   # TypeScript 타입 정의
├── config/                  # 설정 (API URL 등)
└── utils/                   # 유틸리티 함수
```

---

## 주요 컴포넌트

### 탭 구조

| 탭 | 컴포넌트 | 설명 |
|----|----------|------|
| **시나리오 편집** | `Canvas`, `Panel`, `Sidebar` | 노드 에디터 |
| **디바이스 관리** | `DeviceDashboard` | 디바이스 목록, 세션 관리 |
| **실행 센터** | `ExecutionCenter` | 시나리오/Suite 실행 |
| **테스트 리포트** | `TestReports` | 실행 결과 조회 |
| **대시보드** | `MetricsDashboard` | 성공률, 실행 통계 |
| **스케줄** | `ScheduleManager` | 예약 실행 관리 |
| **Slack 설정** | `SlackSettings` | 알림 채널 설정 |

### Canvas (노드 에디터)

```
┌──────────────────────────────────────────────────┐
│ [Sidebar]  │        [Canvas]        │  [Panel]   │
│            │                        │            │
│  ○ tap     │  ┌────┐    ┌────┐     │  속성 편집  │
│  ○ swipe   │  │Start│───▶│ Tap│    │            │
│  ○ wait    │  └────┘    └────┘     │  x: 100    │
│  ○ image   │       │        │      │  y: 200    │
│  ...       │       ▼        ▼      │            │
└──────────────────────────────────────────────────┘
```

- **Sidebar**: 드래그 가능한 노드 타입 목록
- **Canvas**: 노드 배치 및 연결, 줌/팬 지원
- **Panel**: 선택된 노드의 속성 편집

### DevicePreview

- MJPEG 스트리밍으로 디바이스 화면 실시간 표시
- 클릭/드래그로 좌표 캡처
- 영역 선택으로 ROI/스와이프 설정

### TestReports

- 가상화 그리드로 대량 스크린샷 최적화
- 썸네일 → 원본 라이트박스
- 비디오 타임라인 마커

---

## Context (상태 관리)

### Context 분리 구조

```
AppStateContext (전역 공유 데이터)
├── AuthContext (인증 상태)
├── DeviceContext (디바이스/세션 상태)
├── ExecutionContext (실행 상태)
├── UIContext (UI 상태 - 탭, 모달)
├── FlowEditorContext (노드/연결 편집)
├── ScenarioEditorContext (시나리오/패키지/템플릿)
└── EditorPreviewContext (프리뷰/하이라이트)
```

### 주요 Context

| Context | 역할 | 주요 상태 |
|---------|------|----------|
| `AuthContext` | 인증 | user, isAuthenticated |
| `DeviceContext` | 디바이스 | devices, sessions |
| `ExecutionContext` | 실행 | queueStatus, progress |
| `UIContext` | UI | activeTab, modals |
| `FlowEditorContext` | 에디터 | nodes, connections |
| `ScenarioEditorContext` | 시나리오 | scenarios, packages |
| `EditorPreviewContext` | 프리뷰 | previewDevice, highlight |

---

## 커스텀 훅

| 훅 | 용도 |
|----|------|
| `useQueueStatus` | 테스트 큐 상태 폴링 (3초) |
| `useContainerWidth` | 컨테이너 너비 추적 (ResizeObserver) |
| `useScenarioTree` | 시나리오 트리 데이터 관리 |

---

## 환경 변수

### 기본 설정

```bash
# .env
VITE_API_URL=http://localhost:3001
VITE_WS_URL=http://localhost:3001
```

### 외부 접근 설정

```bash
# 다른 PC에서 접근할 때
VITE_SERVER_HOST=192.168.1.100
VITE_BACKEND_PORT=3001

# 또는 전체 URL 직접 지정
VITE_API_URL=http://192.168.1.100:3001
VITE_WS_URL=http://192.168.1.100:3001
VITE_WS_STREAM_URL=ws://192.168.1.100:3001
```

### URL 우선순위

1. `VITE_API_URL` (직접 지정)
2. `VITE_SERVER_HOST:VITE_BACKEND_PORT` (조합)
3. `window.location.hostname:3001` (폴백)

---

## 스크립트

```bash
# 개발 서버
npm run dev

# 프로덕션 빌드
npm run build

# 빌드 미리보기
npm run preview

# ESLint 검사
npm run lint

# ESLint 자동 수정
npm run lint:fix

# 단위 테스트
npm run test

# 테스트 (단일 실행)
npm run test:run

# 커버리지
npm run test:coverage
```

---

## 의존성

### 핵심

| 패키지 | 버전 | 용도 |
|--------|------|------|
| `react` | 19.x | UI 프레임워크 |
| `react-dom` | 19.x | DOM 렌더링 |
| `socket.io-client` | 4.x | 실시간 통신 |
| `axios` | 1.x | HTTP 클라이언트 |
| `recharts` | 3.x | 차트 라이브러리 |
| `react-window` | 1.x | 가상화 리스트/그리드 |

### 개발 도구

| 패키지 | 용도 |
|--------|------|
| `vite` | 빌드 도구 |
| `typescript` | 타입 체크 |
| `eslint` | 린트 |
| `vitest` | 테스트 프레임워크 |

---

## UI 스타일

### 테마

- **Catppuccin Mocha**: 다크 테마 색상 팔레트
- CSS Variables 기반

### 주요 색상

```css
:root {
  --ctp-base: #1e1e2e;        /* 배경 */
  --ctp-surface0: #313244;    /* 카드 배경 */
  --ctp-text: #cdd6f4;        /* 텍스트 */
  --ctp-blue: #89b4fa;        /* 강조 */
  --ctp-green: #a6e3a1;       /* 성공 */
  --ctp-red: #f38ba8;         /* 에러 */
  --ctp-yellow: #f9e2af;      /* 경고 */
}
```

### 반응형

- 최소 너비: 1500px (탭 컨텐츠)
- 그리드 기반 레이아웃

---

## 성능 최적화

### 탭 전환

- CSS `display: none`으로 탭 숨김 (DOM 유지)
- 탭 전환 시 리렌더링 없음

### 가상화

- `react-window` 사용
- 스크린샷 그리드: 뷰포트 내 이미지만 렌더링
- 10개 이하는 일반 그리드 사용

### 이미지 최적화

- 썸네일: WebP 300px (서버에서 생성)
- 원본: 라이트박스에서 온디맨드 로드

### 폴링 통합

- `DeviceContext`: 디바이스 목록 10초 폴링
- `useQueueStatus`: 큐 상태 3초 폴링
- 중복 폴링 제거

---

## 테스트

### Vitest 설정

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
```

### 테스트 파일

- `*.test.ts` 또는 `*.test.tsx`
- `__tests__/` 폴더

---

## 빌드 & 배포

### 프로덕션 빌드

```bash
npm run build
# dist/ 폴더에 빌드 결과물 생성
```

### 정적 파일 서빙

빌드 결과물은 정적 파일로 Nginx, Cloudflare Pages 등에서 서빙 가능.

### API 프록시 (개발)

```typescript
// vite.config.ts
server: {
  proxy: {
    '/api': 'http://localhost:3001',
    '/auth': 'http://localhost:3001',
  }
}
```

---

*최종 수정일: 2026-01-30*
