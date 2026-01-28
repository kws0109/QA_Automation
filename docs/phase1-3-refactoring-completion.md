# Phase 1-3 대규모 리팩토링 완료 회고록

## 개요

**날짜**: 2026년 01월 28일
**목표**: 코드 품질, 성능, 유지보수성 개선을 위한 체계적인 리팩토링

---

## 배경

프로젝트 규모가 커지면서 다음 문제들이 발생했습니다:

| 문제 | 원인 |
|------|------|
| API 폴링 과부하 | 여러 컴포넌트에서 중복 폴링 (216회/분) |
| Context 비대화 | AppStateContext 687줄 단일 파일 |
| Props Drilling | App.tsx에서 42개 props 전달 |
| Window 이벤트 남용 | 타입 안전하지 않은 커스텀 이벤트 |
| 입력 검증 부재 | API 요청 검증 없음 |
| 에러 처리 미흡 | React 에러 시 전체 앱 크래시 |

---

## Phase 1: 즉시 개선

### 1.1 중복 폴링 통합

**새 파일**: `frontend/src/hooks/useQueueStatus.ts`

중앙 집중식 큐 상태 관리 훅 생성:

```typescript
export function useQueueStatus(
  socket: Socket | null,
  intervalMs = 3000
): QueueStatusResult
```

**적용 결과**:

| 컴포넌트 | 변경 전 | 변경 후 |
|----------|---------|---------|
| TestStatusBar | 독립 폴링 (3초) | useQueueStatus 사용 |
| TestQueuePanel | 독립 폴링 (3초) | useQueueStatus 사용 |
| QueueSidebar | 독립 폴링 (3초) | useQueueStatus 사용 |
| DeviceList | 독립 폴링 (5초) | DeviceContext 구독 |
| useDeviceConnection | 독립 폴링 (30초) | DeviceContext 구독 |

**효과**: 216회/분 → 52회/분 (76% 감소)

---

## Phase 2: 단기 개선

### 2.2 AppStateContext 분리

687줄의 거대한 Context를 3개의 목적별 Context로 분리:

```
frontend/src/contexts/
├── FlowEditorContext.tsx      # ~320줄, 노드/연결 관리
├── ScenarioEditorContext.tsx  # ~170줄, 시나리오/패키지/템플릿
├── EditorPreviewContext.tsx   # ~160줄, 하이라이트/미리보기
└── AppStateContext.tsx        # ~200줄, 래퍼 (하위 호환성)
```

**FlowEditorContext 주요 상태**:
- `nodes`, `connections`, `selectedNodeId`, `selectedConnectionIndex`
- `handleNodeAdd`, `handleNodeDelete`, `handleNodeUpdate`, `handleNodeMove`
- `handleConnectionAdd`, `handleConnectionDelete`

**ScenarioEditorContext 주요 상태**:
- `packages`, `scenarios`, `templates`
- `currentScenarioId`, `currentScenarioName`
- `handleScenarioLoad`, `handleSaveScenario`, `fetchPackagesAndScenarios`

**EditorPreviewContext 주요 상태**:
- `highlightedNodeId`, `highlightStatus`
- `handleHighlightNode`, `handlePreviewCoordinate`, `handlePreviewTemplate`

### 2.3 Props Drilling 제거

| 컴포넌트 | 변경 전 | 변경 후 |
|----------|---------|---------|
| Canvas | 17개 props | `useFlowEditor()` 직접 호출 |
| Panel | 7개 props | `useFlowEditor()` + `useUI()` |
| Sidebar | 5개 props | `useFlowEditor()` 직접 호출 |

**App.tsx 변경**:
```tsx
// Before
<Canvas
  nodes={nodes}
  connections={connections}
  selectedNodeId={selectedNodeId}
  onNodeSelect={handleNodeSelect}
  // ... 13개 더
/>

// After
<Canvas />
```

### 2.4 Rate Limiting 추가

**새 파일**: `backend/src/middleware/rateLimiter.ts`

```typescript
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15분
  max: 1000
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20
});

export const executionLimiter = rateLimit({
  windowMs: 60 * 1000,       // 1분
  max: 10
});
```

### 2.5 Window 이벤트 → Context 콜백

**UIContext에 추가된 콜백 함수**:

```typescript
interface UIContextType {
  // 기존 상태...

  // 새로운 콜백 함수
  openSaveModal: () => void;
  closeSaveModal: () => void;
  openTemplateModal: () => void;
  closeTemplateModal: () => void;
  openLoadModal: () => void;
  closeLoadModal: () => void;
  requestRegionSelect: () => void;
  cancelRegionSelect: () => void;
}
```

**변경 전**:
```typescript
window.dispatchEvent(new CustomEvent('openSaveModal'));
```

**변경 후**:
```typescript
const { openSaveModal } = useUI();
openSaveModal();
```

---

## Phase 3: 중기 개선

### 3.1 Zod 입력 검증

**새 파일들**:
- `backend/src/schemas/scenario.schema.ts`
- `backend/src/schemas/execution.schema.ts`
- `backend/src/middleware/validateSchema.ts`

**스키마 예시**:
```typescript
export const ScenarioCreateSchema = z.object({
  name: z.string().min(1).max(100),
  packageId: z.string().uuid(),
  nodes: z.array(NodeSchema),
  connections: z.array(ConnectionSchema)
});
```

**미들웨어**:
```typescript
export const validateBody = (schema: ZodSchema) =>
  (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: result.error.errors
      });
    }
    req.body = result.data;
    next();
  };
```

**적용된 라우트**:
- `scenario.ts` - 시나리오 생성/수정
- `test.ts` - 테스트 실행 요청

### 3.2 ErrorBoundary 추가

**새 파일**: `frontend/src/components/ErrorBoundary/ErrorBoundary.tsx`

```typescript
class ErrorBoundary extends Component<Props, State> {
  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || <DefaultErrorUI />;
    }
    return this.props.children;
  }
}
```

**적용 위치**:
- `main.tsx` - 전체 앱 래핑
- `App.tsx` - 각 탭 컨텐츠 개별 래핑

### 3.3 순환 의존성 검사

```bash
npx madge --circular backend/src
npx madge --circular frontend/src
```

**결과**: 순환 의존성 없음 ✅

---

## 영향 받는 파일

### 신규 파일 (11개)
```
backend/src/middleware/rateLimiter.ts
backend/src/middleware/validateSchema.ts
backend/src/schemas/execution.schema.ts
backend/src/schemas/scenario.schema.ts
frontend/src/components/ErrorBoundary/ErrorBoundary.tsx
frontend/src/components/ErrorBoundary/ErrorBoundary.css
frontend/src/components/ErrorBoundary/index.ts
frontend/src/contexts/EditorPreviewContext.tsx
frontend/src/contexts/FlowEditorContext.tsx
frontend/src/contexts/ScenarioEditorContext.tsx
frontend/src/hooks/useQueueStatus.ts
```

### 수정 파일 (18개)
```
backend/src/index.ts
backend/src/routes/scenario.ts
backend/src/routes/test.ts
frontend/src/App.tsx
frontend/src/main.tsx
frontend/src/components/Canvas/Canvas.tsx
frontend/src/components/DeviceList/DeviceList.tsx
frontend/src/components/DevicePreview/hooks/useDeviceConnection.ts
frontend/src/components/ExecutionCenter/ExecutionCenter.tsx
frontend/src/components/Panel/Panel.tsx
frontend/src/components/Sidebar/Sidebar.tsx
frontend/src/components/TestExecutionPanel/QueueSidebar.tsx
frontend/src/components/TestExecutionPanel/TestQueuePanel.tsx
frontend/src/components/TestExecutionPanel/TestStatusBar.tsx
frontend/src/components/TestReports/TestReports.tsx
frontend/src/contexts/AppStateContext.tsx
frontend/src/contexts/UIContext.tsx
frontend/src/contexts/index.ts
```

---

## 코드 변화량

| 항목 | 값 |
|------|-----|
| 수정된 파일 | 29개 |
| 추가된 줄 | +2,289 |
| 삭제된 줄 | -1,646 |

---

## 예상 효과

| 항목 | Before | After | 개선율 |
|------|--------|-------|--------|
| API 폴링 | 216회/분 | 52회/분 | 76% ↓ |
| AppStateContext | 687줄 | ~200줄 | 70% ↓ |
| App.tsx props | 42개 | <10개 | 76% ↓ |
| 리렌더링 범위 | 전체 | 선택적 | ~50% ↓ |

---

## 향후 개선 가능 사항

1. **Zod 스키마 확장**: `schedule.ts`, `session.ts` 등 다른 라우트에도 적용
2. **testExecutor 추가 분해**: 현재 헬퍼 메서드만 추출됨, 완전 분리 가능
3. **React Query 도입 검토**: API 상태 관리 더욱 체계화

---

*최종 수정일: 2026-01-28*
