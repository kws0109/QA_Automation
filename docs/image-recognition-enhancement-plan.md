# 이미지 인식 고도화 계획 회고록

## 개요

**날짜**: 2026년 01월 12일
**목표**: 게임 엔진 기반 앱(Unity, Unreal) 자동화를 위한 이미지 인식 고도화

---

## 배경

### 문제 상황

게임 엔진(Unity, Unreal)으로 개발된 앱은 자체 렌더링을 사용하여 네이티브 UI 트리를 생성하지 않음. 따라서 Appium의 UiAutomator2/XCUITest 드라이버가 UI 요소를 인식하지 못함.

| 제약 | 설명 |
|------|------|
| 네이티브 UI 없음 | 게임 엔진이 자체 렌더링 → 접근성 API 무력화 |
| 코드 접근 불가 | 개발팀이 아니므로 SDK 삽입, 디버그 빌드 불가 |
| 블랙박스 테스트 | 오직 화면 이미지와 좌표 기반 상호작용만 가능 |

### 현재 구현 상태

- Appium + 이미지 템플릿 매칭 (pixelmatch, sharp)
- 기본적인 `tapImage`, `waitUntilImage`, `waitUntilImageGone` 액션 지원
- 고정 해상도에서는 동작하나 다양한 환경에서 불안정

### 잠재적 문제점

1. **해상도/기기별 차이**: 같은 템플릿이 다른 해상도 기기에서 매칭 실패
2. **타이밍 이슈**: 애니메이션/로딩 중 이미지 매칭 실패
3. **텍스트 기반 UI**: 동적 텍스트는 이미지 매칭보다 OCR이 효과적

---

## 대안 프레임워크 분석

### 게임 테스트 전용 프레임워크

| 프레임워크 | 개발사 | 특징 | 코드 접근 필요 |
|------------|--------|------|----------------|
| **AirTest + Poco** | NetEase | 이미지 기반 + SDK(선택) | SDK는 필요, 이미지만 가능 |
| **GameDriver** | GameDriver.io | Unity/Unreal 전용 | 필요 (SDK 삽입) |
| **SikuliX** | 오픈소스 | 순수 이미지 기반 | 불필요 |
| **Appium + OpenCV** | 오픈소스 | 이미지 매칭 확장 | 불필요 |

### 결론

코드 접근이 불가능하므로 **이미지 기반 접근법 강화**가 유일한 현실적 방안.
현재 Appium 기반 시스템을 유지하면서 이미지 인식 엔진을 고도화하는 방향 선택.

---

## 고도화 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│                  Enhanced Image Recognition                  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  [스크린샷] → [전처리] → [매칭 엔진] → [결과]                │
│                  │           │                               │
│                  ▼           ▼                               │
│            ┌─────────┐  ┌──────────────┐                    │
│            │ 스케일  │  │ 템플릿 매칭   │ ← 멀티스케일      │
│            │ 정규화  │  │ OCR 매칭     │ ← 텍스트 인식     │
│            └─────────┘  │ 하이브리드   │ ← 복합 전략       │
│                         └──────────────┘                    │
│                                │                             │
│                                ▼                             │
│                    [화면 안정화 대기] ← 타이밍 해결          │
│                                │                             │
│                                ▼                             │
│                         [액션 실행]                          │
└─────────────────────────────────────────────────────────────┘
```

---

## 구현 계획

### Phase 1: 화면 안정화 대기 (타이밍 문제 해결)

> **검토 필요**: 게임 앱은 배경 애니메이션, 파티클 등이 항상 움직여서 "전체 화면 안정화"가 적합하지 않을 수 있음.
> - 일반 앱: 로딩 → 정지 화면 (안정화 감지 가능)
> - 게임 앱: 로딩 → 배경 애니메이션 계속 (무한 대기 위험)
>
> **대안**: ROI 기반 안정화 (UI 영역만 체크) 또는 기존 `waitUntilImage`/`waitUntilImageGone` 활용
>
> **결론**: 실제 테스트 후 필요 여부 판단 예정

**문제**: 애니메이션, 로딩 중 이미지 매칭 실패

**해결**: 화면 변화가 멈출 때까지 대기하는 메커니즘

```typescript
interface WaitForStableOptions {
  timeout: number;        // 최대 대기 시간 (ms)
  stabilityTime: number;  // 화면이 N ms 동안 변화 없으면 안정
  threshold: number;      // 변화 감지 임계값 (%)
}

// 구현 로직
async function waitForScreenStable(options: WaitForStableOptions): Promise<void> {
  const { timeout, stabilityTime, threshold } = options;
  const startTime = Date.now();
  let lastScreenshot = await takeScreenshot();
  let stableStartTime = Date.now();

  while (Date.now() - startTime < timeout) {
    await sleep(100);
    const currentScreenshot = await takeScreenshot();
    const diffPercentage = await compareScreenshots(lastScreenshot, currentScreenshot);

    if (diffPercentage > threshold) {
      // 화면 변화 감지 → 안정화 타이머 리셋
      stableStartTime = Date.now();
      lastScreenshot = currentScreenshot;
    } else if (Date.now() - stableStartTime >= stabilityTime) {
      // 안정화 완료
      return;
    }
  }
  throw new Error('Screen did not stabilize within timeout');
}
```

**새 액션 타입**:
```typescript
{
  type: 'waitForStable',
  params: {
    timeout: 10000,      // 최대 10초
    stabilityTime: 500,  // 0.5초간 변화 없으면 OK
    threshold: 2,        // 2% 이하 변화는 무시
  }
}
```

**예상 기간**: 2~3일

---

### Phase 2: 멀티스케일 템플릿 매칭 (해상도 문제 해결) ✅ 완료

**문제**: 720p에서 만든 템플릿이 1080p, 1440p 기기에서 매칭 실패

**해결**: 여러 스케일로 리사이즈하여 매칭 시도

**구현 완료 (2026-01-12)** - 커밋: `48363db`

```typescript
// backend/src/types/image.ts
interface MultiScaleOptions {
  enabled: boolean;        // 멀티스케일 활성화 여부
  minScale?: number;       // 최소 스케일 (기본: 0.7)
  maxScale?: number;       // 최대 스케일 (기본: 1.3)
  scaleSteps?: number;     // 스케일 단계 수 (기본: 5)
}

interface MatchResult {
  // ... 기존 필드
  scale?: number;  // 매칭된 스케일 (멀티스케일 사용 시)
}
```

**사용 예시**:
```typescript
const result = await imageMatchService.matchTemplate(
  screenshotBuffer,
  'template_id',
  {
    threshold: 0.85,
    multiScale: {
      enabled: true,
      minScale: 0.7,
      maxScale: 1.3,
      scaleSteps: 5,
    },
  }
);

console.log(result.scale);      // 매칭된 스케일 (예: 0.85)
console.log(result.confidence); // 신뢰도 (예: 0.92)
```

**구현 특징**:
- 1.0에 가까운 스케일부터 우선 탐색 (원본 크기 먼저)
- 임계값 달성 시 조기 종료 (성능 최적화)
- 상세 로그 출력 (스케일별 신뢰도)
- grayscale 옵션 추가 (색상 변화에 강건)

---

### Phase 3: ROI 기반 매칭 (속도/정확도 향상) ✅ 완료

**문제**: 전체 화면 스캔은 느리고 오탐 가능성 높음

**해결**: 관심 영역(ROI) 지정하여 해당 영역만 스캔

**구현 완료 (2026-01-12)** - 커밋: `f8fdcb2`

```typescript
// backend/src/types/image.ts
interface RegionOptions {
  x: number;              // X 좌표 (absolute: 픽셀, relative: 0-1 비율)
  y: number;              // Y 좌표
  width: number;          // 너비
  height: number;         // 높이
  type?: 'absolute' | 'relative';  // 좌표 타입 (기본: 'absolute')
}
```

**사용 예시**:
```typescript
// 상대 좌표 사용 (화면 하단 20%만 검색)
const result = await imageMatchService.matchTemplate(
  screenshotBuffer,
  'start_button',
  {
    threshold: 0.85,
    region: {
      x: 0,
      y: 0.8,
      width: 1,
      height: 0.2,
      type: 'relative',
    },
  }
);

// 절대 좌표 사용 (픽셀 단위)
const result2 = await imageMatchService.matchTemplate(
  screenshotBuffer,
  'start_button',
  {
    region: {
      x: 100,
      y: 1500,
      width: 800,
      height: 400,
      type: 'absolute',  // 또는 생략 (기본값)
    },
  }
);
```

**구현 특징**:
- 상대 좌표(0-1 비율) → 절대 좌표(픽셀) 자동 변환
- ROI 영역 경계 검증 (이미지 범위 초과 방지)
- 멀티스케일 매칭과 조합 가능
- 상세 로그 출력 (변환된 좌표 확인)

---

### Phase 3.5: ROI 자동 계산 (사용성 향상) ✅ 완료

**문제**: ROI 좌표를 수동으로 입력하는 것이 번거로움

**해결**: 템플릿 캡처 시 좌표 저장 → 액션 설정 시 자동 ROI 계산

**구현 완료 (2026-01-12)** - 커밋: `dcd9791`

**데이터 구조 확장**:
```typescript
// backend/src/types/image.ts
interface ImageTemplate {
  // ... 기존 필드
  captureX?: number;        // 원본 스크린샷에서의 X 좌표
  captureY?: number;        // 원본 스크린샷에서의 Y 좌표
  sourceWidth?: number;     // 원본 스크린샷 너비
  sourceHeight?: number;    // 원본 스크린샷 높이
}
```

**ROI 자동 계산 API**:
```
GET /api/image/templates/:id/recommended-roi?margin=0.2
```

**응답 예시**:
```json
{
  "success": true,
  "data": {
    "x": 0.1234,
    "y": 0.5678,
    "width": 0.15,
    "height": 0.08,
    "type": "relative"
  },
  "hasCaptureInfo": true
}
```

**Frontend UI**:
- "검색 영역 제한 (ROI)" 체크박스
- ROI 좌표 입력 필드 (X, Y, W, H)
- "자동" 버튼 (캡처 좌표 정보 있을 때만 활성화)
- 캡처 좌표 없으면 경고 메시지 표시

**호환성**:
- 기존 템플릿: 좌표 정보 없음 → 자동 ROI 불가, 수동 입력 가능
- 신규 템플릿: 좌표 정보 저장됨 → 자동 ROI 사용 가능

---

### Phase 3.6: OpenCV 템플릿 매칭 (인식률 향상) ✅ 완료

**문제**: 기존 pixelmatch 기반 매칭은 밝기 변화, 노이즈에 취약

**해결**: OpenCV.js의 TM_CCOEFF_NORMED 알고리즘으로 교체

**구현 완료 (2026-01-12)**

**알고리즘 비교**:
| 항목 | pixelmatch (기존) | OpenCV TM_CCOEFF_NORMED (신규) |
|------|-------------------|-------------------------------|
| 방식 | 픽셀별 직접 비교 | 정규화된 상관계수 |
| 밝기 변화 | ❌ 민감 | ✅ 강건 |
| 속도 | 빠름 | 빠름 (WASM) |
| 정확도 | 보통 | 높음 |

**기술 스택**:
```
@techstark/opencv-js (WebAssembly)
- 네이티브 빌드 불필요
- Node.js/Browser 모두 지원
- OpenCV 4.x 기능 대부분 포함
```

**구현 특징**:
- 자동 그레이스케일 변환 (매칭 성능 향상)
- TM_CCOEFF_NORMED: -1~1 범위 → 0~1 정규화
- OpenCV 실패 시 pixelmatch 폴백
- 멀티스케일 매칭에도 OpenCV 적용

**코드 위치**: `backend/src/services/imageMatch.ts`
- `matchTemplateOpenCV()`: OpenCV 기반 매칭
- `matchTemplateFallback()`: pixelmatch 폴백
- `findBestMatchLegacy()`: 기존 슬라이딩 윈도우

---

### Phase 4: OCR 통합 (텍스트 기반 UI 인식)

**문제**: 동적 텍스트, 버튼 텍스트는 이미지보다 OCR이 효과적

**해결**: OCR 엔진 통합하여 텍스트 기반 액션 지원

#### OCR 엔진 비교

| 엔진 | 장점 | 단점 | 추천 |
|------|------|------|------|
| **Tesseract.js** | 무료, Node.js 네이티브 | 한글 정확도 보통 | 초기 적용 |
| **EasyOCR** | 한글 우수, 딥러닝 | Python 의존, 느림 | 정확도 중시 |
| **Google Cloud Vision** | 최고 정확도 | 유료 (1000회/월 무료) | 프로덕션 |
| **Naver Clova OCR** | 한글 최적화 | 유료 | 한글 집중 |

#### 새 액션 타입

```typescript
// 텍스트 탭
{
  type: 'tapText',
  params: {
    text: '시작하기',
    lang: 'kor+eng',
    matchType: 'exact',      // 'exact' | 'contains' | 'regex'
    index: 0,                // 여러 개 있을 때 인덱스
    region: { ... },         // 선택적 ROI
  }
}

// 텍스트 대기
{
  type: 'waitUntilText',
  params: {
    text: '로딩 완료',
    timeout: 30000,
    matchType: 'contains',
  }
}

// 텍스트 사라질 때까지 대기
{
  type: 'waitUntilTextGone',
  params: {
    text: '로딩 중',
    timeout: 30000,
  }
}

// 텍스트 읽기 (검증용)
{
  type: 'readText',
  params: {
    region: { x: 100, y: 200, width: 300, height: 50 },
    lang: 'kor',
    saveAs: 'goldAmount',    // 변수에 저장
  }
}
```

**예상 기간**: 1주

---

### Phase 5: 하이브리드 매칭 (고급)

이미지 + OCR + 좌표를 조합한 복합 전략

```typescript
{
  type: 'tapHybrid',
  params: {
    strategies: [
      { type: 'image', templateId: 'start_button', priority: 1 },
      { type: 'text', text: '시작', priority: 2 },
      { type: 'coordinate', x: 540, y: 1600, priority: 3 },
    ],
    fallbackDelay: 1000,  // 실패 시 다음 전략까지 대기
  }
}
```

**예상 기간**: 1주 (Phase 4 완료 후)

---

## 기술 스택

### 현재 사용 중
- **sharp**: 이미지 리사이즈, 전처리
- **pixelmatch**: 이미지 비교 (폴백용)
- **pngjs**: PNG 처리
- **@techstark/opencv-js**: OpenCV 템플릿 매칭 (WebAssembly) ✅ 추가됨

### 추가 예정
| 기능 | 라이브러리 | 설치 |
|------|------------|------|
| OCR | tesseract.js | `npm install tesseract.js` |
| OCR (대안) | @anthropic-ai/sdk + Vision | Claude Vision API 활용 |

---

## 구현 우선순위

| 순서 | 기능 | 해결 문제 | 난이도 | 예상 기간 | 비고 |
|------|------|-----------|--------|-----------|------|
| 1 | 멀티스케일 매칭 | 해상도 | ⭐⭐⭐ | 3~5일 | ✅ **완료** (2026-01-12) |
| 2 | ROI 기반 매칭 | 속도/정확도 | ⭐ | 1~2일 | ✅ **완료** (2026-01-12) |
| 2.5 | ROI 자동 계산 | 사용성 | ⭐⭐ | 1일 | ✅ **완료** (2026-01-12) |
| 2.6 | OpenCV 매칭 | 인식률 | ⭐⭐ | 2~4시간 | ✅ **완료** (2026-01-12) |
| 3 | OCR 통합 | 텍스트 UI | ⭐⭐⭐ | 1주 | **다음 순위** |
| 4 | 화면 안정화 대기 | 타이밍 | ⭐⭐ | 2~3일 | ⚠️ 테스트 후 결정 |
| 5 | 하이브리드 매칭 | 종합 안정성 | ⭐⭐⭐ | 1주 | |

**총 예상 기간**: 3~4주

---

## 향후 고려사항

### AI/ML 기반 고도화 (장기)

| 접근법 | 설명 | 난이도 |
|--------|------|--------|
| YOLO 객체 인식 | 버튼, 아이콘 자동 인식 | ⭐⭐⭐⭐⭐ |
| 자체 모델 학습 | 게임별 UI 인식 모델 | ⭐⭐⭐⭐⭐ |
| Claude Vision | 화면 분석 + 요소 추출 | ⭐⭐⭐ |

### AirTest 연동 (대안)

현재 시스템과 AirTest를 병행 사용하는 방안도 고려 가능.
AirTest는 게임 테스트에 특화되어 있어 복잡한 시나리오에서 유리할 수 있음.

---

## 참고 자료

- [AirTest 공식 문서](https://airtest.netease.com/)
- [Tesseract.js GitHub](https://github.com/naptha/tesseract.js)
- [OpenCV Template Matching](https://docs.opencv.org/4.x/d4/dc6/tutorial_py_template_matching.html)
- [EasyOCR GitHub](https://github.com/JaidedAI/EasyOCR)

---

*최종 수정일: 2026-01-12 (OpenCV 통합 완료)*
