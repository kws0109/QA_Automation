# 스와이프 좌표 선택 기능 회고록

## 개요

**날짜**: 2026년 1월 29일
**목표**: 화면에서 드래그로 스와이프 시작/끝점을 선택하고 자동으로 비율(%)을 계산하는 기능 구현

---

## 배경

기존 스와이프 액션은 좌표를 수동으로 입력해야 했습니다. 이는 다음과 같은 불편함이 있었습니다:
- 정확한 좌표를 알기 어려움
- 시행착오로 좌표 조정 필요
- 디바이스 해상도에 따라 좌표가 달라짐

비율(%) 기반 좌표를 사용하면 해상도에 관계없이 동일한 위치에서 스와이프가 가능합니다.

---

## 구현 내용

### 1. useSwipeSelect 훅

**파일**: `frontend/src/components/DevicePreview/hooks/useSwipeSelect.ts`

스와이프 드래그 로직을 커스텀 훅으로 분리하여 재사용성과 테스트 용이성을 높였습니다.

```typescript
export function useSwipeSelect(
  imageRef: RefObject<HTMLImageElement | null>,
  swipeSelectMode: boolean
): UseSwipeSelectReturn {
  // 상태
  const [swipeStart, setSwipeStart] = useState<SwipePosition | null>(null);
  const [swipeEnd, setSwipeEnd] = useState<SwipePosition | null>(null);
  const [isSwipeDragging, setIsSwipeDragging] = useState(false);

  // 핸들러
  const handleSwipeMouseDown = useCallback(...);
  const handleSwipeMouseMove = useCallback(...);
  const handleSwipeMouseUp = useCallback(...);

  // 유틸리티
  const getDeviceSwipe = useCallback((): DeviceSwipeCoords | null => {
    // 디스플레이 좌표 → 디바이스 좌표 + 비율(%) 계산
  }, [...]);

  const resetSwipe = useCallback(...);

  return { swipeStart, swipeEnd, isSwipeDragging, handlers, getDeviceSwipe, resetSwipe };
}
```

### 2. SwipeSelectPanel 컴포넌트

**파일**: `frontend/src/components/DevicePreview/components/SwipeSelectPanel.tsx`

선택된 스와이프 좌표 정보를 표시하는 패널:
- 시작점/끝점 좌표 (픽셀 + 비율%)
- 스와이프 방향 (↑↓←→↗↘↙↖)
- 이동 거리 (픽셀)
- 적용/취소 버튼

### 3. ScreenshotViewer 리팩토링

**파일**: `frontend/src/components/DevicePreview/components/ScreenshotViewer.tsx`

모드별 렌더 함수로 분리하여 가독성 향상:

| 함수 | 담당 모드 |
|------|----------|
| `renderEmptyContainer()` | 빈 상태 공통 컨테이너 |
| `renderNoDevices()` | 디바이스 없음 |
| `renderNoSelection()` | 디바이스 미선택 |
| `renderCreatingSession()` | 세션 생성 중 |
| `renderNoSession()` | 세션 없음 |
| `renderSelectionMode()` | 캡처/텍스트추출/영역선택 |
| `renderSwipeMode()` | 스와이프 선택 |
| `renderLiveMode()` | MJPEG 실시간 스트리밍 |
| `renderStaticMode()` | 정지 스크린샷 |

### 4. SVG 화살표 오버레이

스와이프 경로를 시각적으로 표시:
- 시작점: 녹색 원 (#00ff88)
- 끝점: 분홍색 원 (#ff4488)
- 경로: 점선 화살표

```tsx
<svg className="swipe-arrow-overlay">
  <circle cx={swipeStart.x} cy={swipeStart.y} r="8" fill="#00ff88" />
  <line x1={swipeStart.x} y1={swipeStart.y} x2={swipeEnd.x} y2={swipeEnd.y}
        stroke="#00ff88" strokeDasharray="8,4" markerEnd="url(#arrowhead)" />
  <circle cx={swipeEnd.x} cy={swipeEnd.y} r="6" fill="#ff4488" />
</svg>
```

### 5. MJPEG 프록시 안정성 개선

**파일**: `backend/src/index.ts`

세션이 죽었을 때 MJPEG 프록시 오류 처리 개선:

| 항목 | Before | After |
|------|--------|-------|
| 세션 검증 | `getSessionInfo()` 만 | `checkSessionHealth()` 추가 |
| 응답 코드 | 502 | 410 (세션 만료) |
| 에러 로그 | 매 재시도마다 ERROR | WARN 1회만 |
| 세션 정리 | 수동 | 자동 정리 |

---

## 영향 받는 파일

```
backend/src/index.ts                                    - MJPEG 프록시 개선
frontend/src/App.tsx                                    - 스와이프 모드 상태
frontend/src/components/DevicePreview/
  ├── DevicePreview.tsx                                 - useSwipeSelect 훅 사용
  ├── DevicePreview.css                                 - 스와이프 스타일
  ├── types.ts                                          - 스와이프 타입 정의
  ├── components/
  │   ├── ScreenshotViewer.tsx                          - 모드별 렌더 함수
  │   ├── SwipeSelectPanel.tsx                          - 새 컴포넌트
  │   └── index.ts                                      - export 추가
  └── hooks/
      ├── useSwipeSelect.ts                             - 새 훅
      └── index.ts                                      - export 추가
frontend/src/components/Panel/
  ├── Panel.tsx                                         - 스와이프 props 전달
  ├── Panel.css                                         - 버튼 스타일
  └── components/ActionFields/TouchFields.tsx           - 선택 버튼
frontend/src/contexts/
  ├── AppStateContext.tsx                               - 상태 pass-through
  └── EditorPreviewContext.tsx                          - SwipeCoordinates 타입
```

---

## 사용 방법

### 스와이프 좌표 선택

1. **스와이프 액션 노드 선택**: 캔버스에서 swipe 액션 노드를 선택
2. **좌표 선택 모드 활성화**: Panel에서 "화면에서 드래그로 선택" 버튼 클릭
3. **드래그로 경로 지정**: 프리뷰 화면에서 시작점을 클릭하고 끝점까지 드래그
4. **좌표 확인**: 패널에서 픽셀 좌표와 비율(%) 확인
5. **적용**: "적용" 버튼 클릭하여 노드에 좌표 저장

### 비율(%) 좌표 사용의 장점

- 다양한 해상도의 디바이스에서 동일한 위치 스와이프
- 가로/세로 모드 전환 시에도 상대적 위치 유지
- 수동 좌표 입력 대비 직관적인 UX

---

## 향후 개선 가능 사항

1. **스와이프 프리셋**: 자주 사용하는 스와이프 패턴 저장 (위로 스크롤, 좌우 스와이프 등)
2. **다중 스와이프**: 여러 개의 연속 스와이프 동작 녹화
3. **스와이프 속도 조절**: 드래그 속도에 따른 duration 자동 계산

---

*최종 수정일: 2026-01-29*
