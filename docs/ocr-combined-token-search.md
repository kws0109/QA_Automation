# OCR 인접 토큰 결합 검색 회고록

## 개요

**날짜**: 2026년 01월 15일
**목표**: OCR 텍스트 검색 시 여러 토큰에 걸친 텍스트도 찾을 수 있도록 개선

---

## 배경

Google Cloud Vision API는 텍스트를 **개별 토큰(단어) 단위**로 분리하여 반환합니다.

예를 들어 화면에 "게임을 진행하는 중입니다"라는 텍스트가 있으면:
```
annotations[0] = "게임을 진행하는 중입니다"  (전체 텍스트)
annotations[1] = "게임을"                    (개별 토큰)
annotations[2] = "진행하는"                  (개별 토큰)
annotations[3] = "중입니다"                  (개별 토큰)
```

기존 구현에서는 개별 토큰(annotations[1~n])에서만 검색했기 때문에:
- "진행" → "진행하는" 토큰에 포함되어 발견됨 ✅
- "진행하는" → "진행하는" 토큰과 일치하면 발견됨 ✅
- "진행하는 중" → 두 토큰에 걸쳐있어 발견 안됨 ❌

---

## 구현 내용

### 1. 2단계 검색 로직 도입

`findText()` 메서드를 개선하여 2단계 검색을 수행:

```typescript
// 1단계: 개별 토큰에서 매칭 (기존 방식)
let matches = this.matchTexts(candidates, searchText, matchType, caseSensitive);

// 2단계: 개별 토큰에서 못 찾으면 인접 토큰 결합하여 검색
if (matches.length === 0 && matchType !== 'exact') {
  matches = this.findInCombinedTokens(candidates, searchText, caseSensitive);
}
```

### 2. 인접 토큰 결합 검색 메서드

`findInCombinedTokens()` 메서드 추가:

**핵심 로직:**
1. Y좌표가 비슷한 토큰들을 같은 줄로 그룹화
2. 각 줄 내에서 X좌표로 정렬
3. 슬라이딩 윈도우(2~5개 토큰)로 연속 토큰 결합
4. 결합된 텍스트에서 검색어 포함 여부 확인
5. 매칭 시 결합된 바운딩 박스 계산

**같은 줄 판별 기준:**
```typescript
const threshold = avgHeight * 0.5;  // 토큰 높이의 50%
if (Math.abs(text.boundingBox.y - lineY) <= threshold) {
  // 같은 줄로 간주
}
```

**결합된 바운딩 박스 계산:**
```typescript
const minX = Math.min(...windowTokens.map((t) => t.boundingBox.x));
const minY = Math.min(...windowTokens.map((t) => t.boundingBox.y));
const maxX = Math.max(...windowTokens.map((t) => t.boundingBox.x + t.boundingBox.width));
const maxY = Math.max(...windowTokens.map((t) => t.boundingBox.y + t.boundingBox.height));
```

### 3. 중복 결과 제거

같은 위치(10px 이내)의 결과는 하나만 유지:
```typescript
const uniqueResults = results.filter((result, idx, arr) => {
  return !arr.slice(0, idx).some(
    (prev) =>
      Math.abs(prev.centerX - result.centerX) < 10 &&
      Math.abs(prev.centerY - result.centerY) < 10
  );
});
```

---

## 영향 받는 파일

```
backend/src/services/textMatcher/textMatcher.ts
  - findText() 메서드 수정 (2단계 검색 로직)
  - findInCombinedTokens() 메서드 추가
```

---

## 사용 예시

### 개선 전
```
검색어: "진행하는 중"
결과: 발견 안됨 ❌
```

### 개선 후
```
검색어: "진행하는 중"
결과: 발견됨 ✅
  - text: "진행하는중입니다"
  - centerX: 540
  - centerY: 320
  - confidence: 0.9
```

---

## 제한사항

1. **최대 5개 토큰까지 결합**: 너무 긴 문장은 검색 불가
2. **같은 줄만 결합**: 여러 줄에 걸친 텍스트는 검색 불가
3. **exact 매칭에서는 미적용**: 정확히 일치하는 단일 토큰만 검색
4. **성능 고려**: 토큰이 많은 화면에서 슬라이딩 윈도우 연산 증가

---

## 향후 개선 가능 사항

1. **전체 텍스트(fullText) 검색 옵션**: 위치 정보 없이 존재 여부만 확인
2. **정규식 결합 검색**: 결합된 토큰에서도 정규식 매칭 지원
3. **토큰 간격 고려**: 공백이 있는 경우 자동으로 공백 추가

---

*최종 수정일: 2026-01-15*
