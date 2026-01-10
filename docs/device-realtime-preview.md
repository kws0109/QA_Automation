# 디바이스 실시간 프리뷰 기능 회고록

## 개요

**날짜**: 2026년 01월 10일
**목표**: 외부에서 디바이스 화면을 실시간으로 모니터링할 수 있는 프리뷰 패널 구현

---

## 배경

원격 환경에서 테스트 디바이스의 현재 상태를 실시간으로 확인해야 하는 요구사항이 있었습니다. 50대 이상의 디바이스를 동시에 관리하는 환경을 고려하여, 성능과 사용성의 균형을 맞춘 하이브리드 접근 방식을 채택했습니다.

### 설계 고려사항 (50대 디바이스 기준)

| 접근 방식 | 장점 | 단점 |
|-----------|------|------|
| 전체 항상 스트리밍 | 즉각적인 확인 | 네트워크 과부하, 브라우저 렌더링 한계 |
| 썸네일 + 클릭 확대 | 전체 개요 가능 | 지연 발생, UX 복잡 |
| **온디맨드 4개 제한** | 리소스 효율적, 원하는 디바이스 선택 | 한번에 4개만 가능 |

최종적으로 **온디맨드 방식 + 최대 4개 동시 스트림**을 선택했습니다.

---

## 구현 내용

### 1. 프리뷰 상태 관리

```typescript
const MAX_PREVIEWS = 4;
const [previewDeviceIds, setPreviewDeviceIds] = useState<string[]>([]);
const [previewPanelHeight, setPreviewPanelHeight] = useState(300);
const [isResizing, setIsResizing] = useState(false);
```

- 프리뷰 중인 디바이스 ID 배열 관리
- 패널 높이 동적 조절 (150px ~ 600px)
- 리사이즈 상태 추적

### 2. 프리뷰 버튼 (디바이스 카드)

세션이 활성화된 디바이스에만 프리뷰 버튼 표시:
- 프리뷰 활성 시: 파란색 "프리뷰 닫기" 버튼
- 비활성 시: 녹색 "👁 프리뷰" 버튼
- 4개 초과 시: 버튼 비활성화

### 3. 리사이즈 핸들

마우스 드래그로 패널 높이 조절:

```typescript
const handleResizeStart = (e: React.MouseEvent) => {
  e.preventDefault();
  setIsResizing(true);

  const startY = e.clientY;
  const startHeight = previewPanelHeight;

  const handleMouseMove = (moveEvent: MouseEvent) => {
    const deltaY = startY - moveEvent.clientY;
    const newHeight = Math.max(150, Math.min(600, startHeight + deltaY));
    setPreviewPanelHeight(newHeight);
  };

  // mouseup 시 이벤트 리스너 정리
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
};
```

### 4. MJPEG 스트림 URL

```typescript
const getMjpegUrl = (deviceId: string) => {
  const session = sessions.find(s => s.deviceId === deviceId);
  if (session) {
    return `${API_BASE}/api/session/${deviceId}/mjpeg?t=${Date.now()}`;
  }
  return null;
};
```

타임스탬프를 쿼리 파라미터로 추가하여 캐시 방지.

### 5. 프리뷰 패널 UI

- **헤더**: "실시간 프리뷰 (n/4)" + "모두 닫기" 버튼
- **그리드**: CSS Grid 4열 레이아웃
- **개별 프리뷰**: 디바이스 이름, 닫기 버튼, MJPEG img 태그

---

## 영향 받는 파일

```
CLAUDE.md                                          # 성능 분석 기준 규칙 추가
frontend/src/components/DeviceDashboard/
├── DeviceDashboard.tsx                            # 프리뷰 로직 및 UI
└── DeviceDashboard.css                            # 프리뷰 관련 스타일
```

---

## 사용 방법

1. **디바이스 관리** 탭으로 이동
2. 세션이 활성화된 디바이스 카드에서 **"👁 프리뷰"** 버튼 클릭
3. 화면 하단에 프리뷰 패널이 나타남
4. 상단 핸들을 드래그하여 패널 높이 조절
5. 개별 프리뷰의 **✕** 버튼 또는 **"모두 닫기"** 버튼으로 종료

---

## 성능 최적화

| 항목 | 적용 내용 |
|------|-----------|
| 스트림 제한 | 최대 4개 동시 스트림 |
| 온디맨드 | 사용자가 명시적으로 열 때만 스트림 시작 |
| 리소스 해제 | 프리뷰 닫기 시 img src 제거로 스트림 종료 |
| 렌더링 | object-fit: contain으로 비율 유지 |

---

## 향후 개선 가능 사항

1. **프리뷰 레이아웃 옵션**: 2x2, 1x4 등 다양한 배치
2. **전체화면 모드**: 단일 디바이스 전체화면 보기
3. **스크린샷 저장**: 프리뷰에서 바로 스크린샷 캡처
4. **프리뷰 상태 유지**: 탭 전환 시에도 프리뷰 유지 (현재는 탭 전환 시 초기화)

---

*최종 수정일: 2026-01-10*
