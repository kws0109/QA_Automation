# 탭 전환 성능 최적화 회고록

## 개요

**날짜**: 2026년 01월 10일
**목표**: 디바이스 관리/시나리오 실행 탭 전환 시 로딩 시간 단축

---

## 배경

디바이스 관리 탭과 시나리오 실행 탭 간 전환 시 매번 API를 호출하고 컴포넌트를 리렌더링하여 로딩이 발생했습니다. 두 탭 모두 디바이스 목록과 세션 정보를 필요로 하므로, 중복 데이터 요청과 상태 초기화가 성능 저하의 원인이었습니다.

---

## 구현 내용

### 1. 공유 데이터 상태 끌어올리기 (State Lifting)

App.tsx에서 devices, sessions 상태를 관리하고 하위 컴포넌트에 props로 전달하는 방식으로 변경했습니다.

```typescript
// App.tsx
const [devices, setDevices] = useState<DeviceDetailedInfo[]>([]);
const [sessions, setSessions] = useState<SessionInfo[]>([]);
const [devicesLoading, setDevicesLoading] = useState(true);
const [devicesRefreshing, setDevicesRefreshing] = useState(false);

const fetchDevices = useCallback(async () => { ... }, []);
const fetchSessions = useCallback(async () => { ... }, []);
```

### 2. CSS display:none 기반 탭 렌더링

조건부 렌더링(`{activeTab === 'devices' && ...}`) 대신 CSS로 탭을 숨기는 방식으로 변경하여 컴포넌트 상태를 유지합니다.

```tsx
// Before: 조건부 렌더링 (탭 변경 시 컴포넌트 언마운트/마운트)
{activeTab === 'devices' && <DeviceDashboard />}

// After: CSS로 숨김 (컴포넌트 상태 유지)
<div style={{ display: activeTab === 'devices' ? 'flex' : 'none' }}>
  <DeviceDashboard devices={devices} sessions={sessions} ... />
</div>
```

### 3. Props 기반 컴포넌트로 전환

DeviceDashboard와 ScenarioExecution 컴포넌트가 내부에서 API를 호출하는 대신, App.tsx에서 받은 props를 사용하도록 변경했습니다.

```typescript
// DeviceDashboard.tsx
interface DeviceDashboardProps {
  devices: DeviceDetailedInfo[];
  sessions: SessionInfo[];
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onSessionChange: () => void;
}
```

---

## 영향 받는 파일

```
frontend/src/App.tsx
frontend/src/components/DeviceDashboard/DeviceDashboard.tsx
frontend/src/components/ScenarioExecution/ScenarioExecution.tsx
CLAUDE.md
```

---

## 성능 개선 효과

| 항목 | Before | After |
|------|--------|-------|
| 탭 전환 시 API 호출 | 매번 호출 | 없음 |
| 컴포넌트 리렌더링 | 전체 마운트/언마운트 | CSS 토글만 |
| 스크롤 위치 | 초기화됨 | 유지됨 |
| 입력 상태 | 초기화됨 | 유지됨 |

---

## 기술적 결정 사항

### 선택하지 않은 대안: React Query

React Query(@tanstack/react-query)는 더 강력한 캐싱과 상태 관리를 제공하지만, 현재 규모에서는 과도한 복잡성을 추가합니다. CLAUDE.md에 다음 조건 시 마이그레이션을 검토하도록 문서화했습니다:

- API 엔드포인트 10개 이상
- 여러 컴포넌트에서 동일 데이터 독립적 fetch
- 오프라인 지원, 낙관적 업데이트 필요
- 복잡한 캐시 무효화 로직 필요

---

## 향후 개선 가능 사항

1. **자동 새로고침 주기 조정**: 현재 5초 간격 폴링을 WebSocket 기반으로 전환
2. **데이터 캐시 TTL**: 오래된 데이터 자동 갱신 로직 추가
3. **React Query 마이그레이션**: 조건 충족 시 도입

---

*최종 수정일: 2026-01-10*
