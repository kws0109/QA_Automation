# Cloudflare Tunnel 환경 호환성 개선 회고록

## 개요

**날짜**: 2026년 1월 30일
**목표**: Cloudflare Tunnel을 통해 접속 시 발생하는 인증 경쟁 상태 및 WebSocket 호환성 문제 해결

---

## 배경

QA Automation Tool을 Cloudflare Tunnel을 통해 외부에서 접속할 때 다음 문제가 발생했습니다:

1. **인증 경쟁 상태 (Race Condition)**
   - 페이지 로드 시 컴포넌트들이 인증 완료 전에 API를 호출
   - 401 AUTH_REQUIRED 에러 다수 발생
   - 시나리오 목록, 디바이스 목록 등이 로드되지 않음

2. **WebSocket 호환성 문제**
   - Cloudflare Tunnel이 WebSocket 업그레이드를 제대로 처리하지 못함
   - "Invalid frame header" 에러 발생
   - Socket.IO 연결 실패

---

## 구현 내용

### 1. 인증 체크 패턴 적용

모든 데이터 로딩 컴포넌트에 인증 상태 확인 로직을 추가했습니다.

**적용 패턴:**
```typescript
import { useAuth } from '../../contexts/AuthContext';

const { isAuthenticated, authLoading } = useAuth();

useEffect(() => {
  // 인증 완료 전에는 API 호출하지 않음
  if (authLoading || !isAuthenticated) {
    setLoading(false);
    return;
  }
  // 인증 완료 후 데이터 로드
  loadData();
}, [dependencies, isAuthenticated, authLoading]);
```

**적용된 파일:**
- `frontend/src/contexts/DeviceContext.tsx`
- `frontend/src/contexts/ScenarioEditorContext.tsx`
- `frontend/src/components/SuiteManager/SuiteManager.tsx`
- `frontend/src/components/ScheduleManager/ScheduleManager.tsx`
- `frontend/src/components/TestReports/TestReports.tsx`

### 2. Socket.IO 설정 변경

WebSocket 대신 HTTP Long-polling만 사용하도록 설정을 변경했습니다.

**변경 전:**
```typescript
const newSocket = io(WS_URL);
```

**변경 후:**
```typescript
const newSocket = io(WS_URL, {
  transports: ['polling'],  // WebSocket 비활성화
  upgrade: false,           // 업그레이드 시도 안함
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  timeout: 10000,
});
```

### 3. 스크린샷 프리뷰 기능 제거

DeviceDashboard의 실시간 스크린샷 프리뷰 기능을 제거했습니다.

**제거 이유:**
- WebSocket 의존성으로 Cloudflare Tunnel 환경에서 동작 불가
- 시나리오 편집기의 DevicePreview가 동일 기능 제공

**삭제된 파일:**
- `frontend/src/hooks/useScreenshotPolling.ts`
- `frontend/src/components/DeviceDashboard/components/PreviewPanel.tsx`

**수정된 파일:**
- `DeviceDashboard.tsx` - 프리뷰 관련 상태/로직 제거
- `DeviceCard.tsx` - 프리뷰 버튼 제거
- `DeviceDashboard.css` - 프리뷰 스타일 약 230줄 제거

### 4. WS_URL 자동 감지

HTTPS 환경에서 자동으로 현재 origin을 사용하도록 개선했습니다.

```typescript
export const WS_URL = (() => {
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL;
  }
  // HTTPS 환경(Cloudflare Tunnel)에서는 자동으로 origin 사용
  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    return window.location.origin;
  }
  return `http://${SERVER_HOST}:${BACKEND_PORT}`;
})();
```

---

## 영향 받는 파일

```
frontend/src/
├── config/
│   └── api.ts                          # WS_URL 자동 감지
├── contexts/
│   ├── AuthContext.tsx                 # Socket.IO polling 설정
│   ├── DeviceContext.tsx               # 인증 체크 추가
│   └── ScenarioEditorContext.tsx       # 인증 체크 추가
├── components/
│   ├── DeviceDashboard/
│   │   ├── DeviceDashboard.tsx         # 프리뷰 기능 제거
│   │   ├── DeviceDashboard.css         # 프리뷰 스타일 제거
│   │   └── components/
│   │       ├── DeviceCard.tsx          # 프리뷰 버튼 제거
│   │       ├── index.ts                # PreviewPanel export 제거
│   │       └── PreviewPanel.tsx        # 삭제됨
│   ├── ScheduleManager/
│   │   └── ScheduleManager.tsx         # 인증 체크 추가
│   ├── SuiteManager/
│   │   └── SuiteManager.tsx            # 인증 체크 추가
│   └── TestReports/
│       └── TestReports.tsx             # 인증 체크 추가
└── hooks/
    └── useScreenshotPolling.ts         # 삭제됨
```

---

## 효과

| 항목 | Before | After |
|------|--------|-------|
| 초기 API 호출 | 인증 전 실패 후 재시도 | 인증 후 1회만 호출 |
| WebSocket 연결 | 업그레이드 시도 후 실패 | 직접 polling 성공 |
| 401 에러 | 다수 발생 | 발생 안함 |
| 코드량 | - | 681줄 감소 |

---

## 트레이드오프

1. **HTTP Long-polling 사용**
   - 장점: Cloudflare Tunnel 호환성 확보
   - 단점: WebSocket 대비 약간의 지연 시간 증가

2. **스크린샷 프리뷰 제거**
   - 장점: WebSocket 의존성 제거, 코드 단순화
   - 단점: DeviceDashboard에서 실시간 프리뷰 불가 (시나리오 편집기에서는 가능)

---

## 향후 개선 가능 사항

1. **인증 체크 커스텀 훅**: 반복되는 인증 체크 패턴을 `useAuthenticatedEffect` 훅으로 추상화
2. **WebSocket 재활성화**: Cloudflare Tunnel WebSocket 지원이 개선되면 다시 활성화 검토
3. **다른 컴포넌트 점검**: MetricsDashboard 등 다른 컴포넌트에도 인증 체크 적용 여부 확인

---

*최종 수정일: 2026-01-30*
