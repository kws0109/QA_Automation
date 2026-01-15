# OCR 텍스트 매칭 액션 회고록

## 개요

**날짜**: 2026년 01월 15일
**목표**: Google Cloud Vision API를 활용한 OCR 기반 텍스트 인식 및 자동화 액션 구현

---

## 배경

기존 이미지 템플릿 매칭 방식은 정적인 UI 요소에는 효과적이지만, 동적으로 변하는 텍스트(예: 사용자 이름, 숫자, 날짜 등)를 인식하기 어렵습니다. OCR 기반 텍스트 인식을 추가하여 더 유연한 자동화 시나리오를 구성할 수 있도록 했습니다.

---

## 구현 내용

### 1. TextMatcherService (`backend/src/services/textMatcher/`)

Google Cloud Vision API를 활용한 텍스트 인식 서비스:

```typescript
class TextMatcherService {
  // 스크린샷에서 텍스트 인식
  async detectText(screenshotBuffer: Buffer): Promise<TextDetectionResult[]>

  // 특정 텍스트 찾기 (정확/부분 매칭)
  async findText(
    screenshotBuffer: Buffer,
    targetText: string,
    options?: { exact?: boolean; caseSensitive?: boolean }
  ): Promise<TextLocation | null>

  // 텍스트 존재 여부 확인
  async textExists(
    screenshotBuffer: Buffer,
    targetText: string
  ): Promise<boolean>
}
```

### 2. 텍스트 관련 액션 (`backend/src/appium/actions.ts`)

4가지 텍스트 기반 액션 추가:

| 액션 | 설명 |
|------|------|
| `tapText(text, options?)` | 정확한 텍스트 매칭 후 해당 위치 탭 |
| `tapOcrText(text, options?)` | OCR로 텍스트 인식 후 탭 |
| `waitUntilTextExists(text, timeout?)` | 텍스트가 화면에 나타날 때까지 대기 |
| `waitUntilTextGone(text, timeout?)` | 텍스트가 화면에서 사라질 때까지 대기 |

### 3. 타입 정의 (`backend/src/services/textMatcher/types.ts`)

```typescript
interface TextDetectionResult {
  text: string;
  confidence: number;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

interface TextLocation {
  text: string;
  centerX: number;
  centerY: number;
  boundingBox: BoundingBox;
}

interface TextMatchOptions {
  exact?: boolean;        // 정확히 일치 (기본: false)
  caseSensitive?: boolean; // 대소문자 구분 (기본: false)
  timeout?: number;       // 대기 시간 (ms)
}
```

### 4. Panel UI 업데이트 (`frontend/src/components/Panel/Panel.tsx`)

"텍스트 탭 (OCR)" 액션 타입 추가:
- 타겟 텍스트 입력 필드
- 정확히 일치 옵션 체크박스
- 대소문자 구분 옵션 체크박스

---

## 영향 받는 파일

```
backend/src/services/textMatcher/
  ├── index.ts           - 서비스 export
  ├── textMatcher.ts     - TextMatcherService 클래스
  └── types.ts           - 타입 정의
backend/src/appium/actions.ts      - 텍스트 액션 메서드 추가
backend/src/services/testExecutor.ts - 텍스트 액션 실행 처리
frontend/src/components/Panel/Panel.tsx - UI 업데이트
backend/package.json               - @google-cloud/vision 의존성
```

---

## 사용 방법

### 시나리오 편집기에서
1. 노드 추가 후 액션 타입에서 "텍스트 탭 (OCR)" 선택
2. 찾을 텍스트 입력
3. 필요시 옵션 설정 (정확히 일치, 대소문자 구분)

### API 직접 호출
```typescript
import { Actions } from './appium/actions';

// 텍스트 탭
await actions.tapOcrText('로그인');

// 텍스트 대기
await actions.waitUntilTextExists('환영합니다', 10000);

// 텍스트 사라짐 대기
await actions.waitUntilTextGone('로딩 중...', 30000);
```

---

## 환경 설정

### Google Cloud Vision API 설정
1. Google Cloud Console에서 프로젝트 생성
2. Vision API 활성화
3. 서비스 계정 생성 및 키 파일 다운로드
4. 환경 변수 설정:
```bash
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account-key.json"
```

---

## 향후 개선 가능 사항

1. **캐싱**: 동일 스크린샷에 대한 OCR 결과 캐싱으로 성능 향상
2. **언어 설정**: 특정 언어에 최적화된 인식 옵션 추가
3. **정규식 매칭**: 패턴 기반 텍스트 검색 지원
4. **하이라이트**: 매칭된 텍스트 영역 시각화

---

*최종 수정일: 2026-01-15*
