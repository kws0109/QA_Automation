# 스크린샷 로딩 최적화 회고록

## 개요

**날짜**: 2026년 1월 30일
**목표**: 100장 이상의 스크린샷이 포함된 리포트의 로딩 성능 개선

---

## 배경

테스트 리포트에 100장 이상의 스크린샷이 포함될 경우:
- 모든 이미지가 동시에 DOM에 렌더링되어 브라우저 메모리 과부하
- 원본 PNG 이미지(~500KB)가 모두 다운로드되어 초기 로드 지연
- 스크린샷 섹션 스크롤 시 버벅임 발생

---

## 구현 내용

### 1. 백엔드: 썸네일 자동 생성

#### thumbnailService.ts
Sharp 라이브러리를 이용한 WebP 썸네일 생성:
- 최대 너비: 300px
- 품질: 80%
- 포맷: WebP (PNG 대비 ~90% 용량 절감)

```typescript
// 썸네일 생성 API
class ThumbnailService {
  async generateFromBuffer(buffer: Buffer): Promise<Buffer>
  async generateAndSave(originalPath: string): Promise<string>
  getThumbnailPath(originalPath: string): string
}
```

#### screenshotEventService.ts 수정
스크린샷 저장 시 썸네일 자동 생성 (fire-and-forget):
```typescript
// 파일 저장 후 썸네일 생성 (비동기, 실패해도 메인 플로우 영향 없음)
thumbnailService.generateFromBufferAndSave(task.buffer, filepath)
  .then(() => console.log('썸네일 생성 완료'))
  .catch((err) => console.warn('썸네일 생성 실패:', err));
```

#### 썸네일 API 엔드포인트
```
GET /api/test-reports/thumbnails/:reportId/:deviceId/:filename
```
- 썸네일(WebP) 존재 시 WebP 반환
- 썸네일 없으면 원본 PNG로 자동 폴백
- 인증 면제 (img 태그에서 직접 요청)
- 1년 캐시 헤더 적용

### 2. 프론트엔드: 가상화 그리드

#### react-window 도입
뷰포트에 보이는 이미지만 DOM에 렌더링:
- 10개 이하: 기존 그리드 방식 유지
- 11개 이상: FixedSizeGrid 가상화 적용

#### VirtualScreenshotGrid.tsx
```typescript
// 그리드 설정
const ITEM_WIDTH = 200;   // 아이템 너비
const ITEM_HEIGHT = 180;  // 아이템 높이
const MAX_VISIBLE_ROWS = 5;  // 최대 표시 행 수

// 뷰포트 크기에 따른 동적 열 수 계산
const columnCount = Math.floor(containerWidth / (ITEM_WIDTH + GAP));
```

#### useContainerWidth.ts
ResizeObserver 기반 컨테이너 너비 추적 훅:
```typescript
export function useContainerWidth(containerRef: RefObject<HTMLElement>): number
```

### 3. 프론트엔드: 라이트박스

#### ScreenshotLightbox.tsx
원본 이미지를 전체 화면으로 표시:
- 클릭 시에만 원본 PNG 로드
- 키보드 네비게이션: ←/→ 이전/다음, ESC 닫기
- 이전/다음 버튼
- 새 탭에서 열기 링크

---

## 영향 받는 파일

### 백엔드
```
backend/src/services/thumbnailService.ts (신규)
backend/src/services/screenshotEventService.ts (수정)
backend/src/routes/testReport.ts (수정)
backend/src/index.ts (수정)
```

### 프론트엔드
```
frontend/package.json (react-window 추가)
frontend/src/hooks/useContainerWidth.ts (신규)
frontend/src/components/TestReports/components/VirtualScreenshotGrid.tsx (신규)
frontend/src/components/TestReports/components/ScreenshotLightbox.tsx (신규)
frontend/src/components/TestReports/components/DeviceDetail.tsx (수정)
frontend/src/components/TestReports/components/SuiteDeviceDetail.tsx (수정)
frontend/src/components/TestReports/TestReports.css (수정)
frontend/src/utils/reportUrls.ts (수정)
```

---

## 성능 개선 결과

| 지표 | Before | After | 개선율 |
|------|--------|-------|--------|
| DOM 노드 (100장) | 100개 | ~15개 | 85%↓ |
| 초기 로드 용량 | 50MB (100 x 500KB) | ~225KB (15 x 15KB) | 99%↓ |
| 메모리 사용 | 전체 이미지 | 보이는 이미지만 | 대폭 감소 |

---

## 하위 호환성

- **기존 스크린샷**: 썸네일 없으면 원본 PNG로 자동 폴백
- **기존 API**: 변경 없음 (`/screenshots/` 엔드포인트 유지)
- **점진적 적용**: 새 테스트 실행부터 썸네일 자동 생성

---

## 사용 방법

### 썸네일 URL 유틸리티
```typescript
import { getScreenshotThumbnailUrl, getScreenshotUrl } from '../utils/reportUrls';

// 그리드에서는 썸네일 사용
<img src={getScreenshotThumbnailUrl(screenshot.path)} />

// 라이트박스에서는 원본 사용
<img src={getScreenshotUrl(screenshot.path)} />
```

### 가상화 그리드 사용
```tsx
import VirtualScreenshotGrid from './VirtualScreenshotGrid';
import ScreenshotLightbox from './ScreenshotLightbox';

const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

<VirtualScreenshotGrid
  screenshots={device.screenshots}
  steps={device.steps}
  onScreenshotClick={(index) => setLightboxIndex(index)}
/>

{lightboxIndex !== null && (
  <ScreenshotLightbox
    screenshots={device.screenshots}
    steps={device.steps}
    currentIndex={lightboxIndex}
    onClose={() => setLightboxIndex(null)}
    onNavigate={(index) => setLightboxIndex(index)}
  />
)}
```

---

## 향후 개선 가능 사항

1. **기존 스크린샷 썸네일 일괄 생성**: 마이그레이션 스크립트
2. **썸네일 크기 설정 옵션**: 사용자 설정에 따른 썸네일 크기 조절
3. **WebP 미지원 브라우저 폴백**: 구형 브라우저 대응 (현재는 PNG 폴백)
4. **무한 스크롤**: 스크린샷 개수가 1000개 이상일 경우 페이지네이션

---

*최종 수정일: 2026-01-30*
