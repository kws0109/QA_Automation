# 비디오 타임라인 호환성 수정 회고록

## 개요

**날짜**: 2026년 1월 13일
**목표**: TestReports 비디오 타임라인의 duration 단위 호환성 문제 및 UI 개선

---

## 배경

시나리오별 개별 비디오 녹화 기능 구현 후, 비디오 타임라인에서 다음 문제가 발생했습니다:

1. **진행 바가 즉시 100%로 점프**: 비디오 재생 시작과 동시에 진행 바가 끝까지 이동
2. **가장자리 마커 잘림**: 0%와 100% 위치의 마커가 타임라인 영역 밖으로 잘림
3. **툴팁 잘림**: 마커에 호버 시 나타나는 툴팁이 비디오 컨테이너에 의해 잘림

---

## 문제 원인 분석

### 1. Duration 단위 불일치

**Backend 코드 (수정 전)**:
```typescript
const recordingDuration = Math.round((Date.now() - recordingStartTime) / 1000);  // 초 단위
```

**Frontend 기대값**: 밀리초(ms) 단위

**결과**:
- 저장된 duration: `28` (초)
- Frontend 계산: `currentTime / (28 / 1000)` = `currentTime / 0.028`
- 1초 재생 시: `1 / 0.028 * 100` = 3571% → 즉시 100%

### 2. 기존 리포트 호환성

이미 저장된 리포트들은 초 단위로 duration이 저장되어 있어, 단순히 Backend만 수정하면 기존 리포트에서 문제 발생

### 3. CSS overflow 문제

`.video-container`에 `overflow: hidden` 적용으로 내부 요소가 컨테이너를 벗어날 수 없음

---

## 구현 내용

### 1. Backend: Duration을 ms 단위로 저장

**파일**: `backend/src/services/testExecutor.ts`

```typescript
// 수정 전
const recordingDuration = Math.round((Date.now() - recordingStartTime) / 1000);

// 수정 후
const recordingDuration = Date.now() - recordingStartTime;  // ms 단위
```

### 2. Frontend: 초/ms 양방향 호환성 지원

**파일**: `frontend/src/components/TestReports/TestReports.tsx`

```typescript
// duration 정규화 함수 추가
const normalizeDurationToMs = (duration: number): number => {
  if (duration < 1000) {
    return duration * 1000; // 초 → ms (기존 리포트)
  }
  return duration; // 이미 ms (새 리포트)
};
```

**적용 위치**:
- `getStepPosition()`: 마커 위치 계산
- `handleTimelineClick()`: 타임라인 클릭 시 비디오 시크
- 진행 바 width 계산

### 3. 마커 위치 범위 제한

```typescript
// 0-100% → 2-98% 범위로 제한
return Math.max(2, Math.min(98, position));
```

가장자리 마커가 타임라인 영역 밖으로 벗어나지 않도록 제한

### 4. CSS 개선

**파일**: `frontend/src/components/TestReports/TestReports.css`

| 변경 사항 | 수정 전 | 수정 후 |
|-----------|---------|---------|
| 타임라인 높이 | 24px | 32px |
| 마커 크기 | 8px | 10px |
| 마커 호버 크기 | 12px | 14px |
| 타임라인 여백 | 없음 | 좌우 8px |
| 마커 테두리 | 없음 | 1px solid rgba(255,255,255,0.3) |

### 5. 툴팁 잘림 수정

```css
/* video-container */
/* overflow: hidden 제거 */

/* video-player */
overflow: hidden;  /* 비디오만 클리핑 */

/* video-timeline */
overflow: visible;  /* 툴팁이 위로 올라갈 수 있도록 */
```

---

## 영향 받는 파일

```
backend/src/services/testExecutor.ts
frontend/src/components/TestReports/TestReports.tsx
frontend/src/components/TestReports/TestReports.css
```

---

## 호환성 매트릭스

| 리포트 유형 | Duration 값 예시 | 처리 방식 |
|-------------|------------------|-----------|
| 기존 리포트 | `28` (초) | × 1000 → 28000ms |
| 새 리포트 | `28000` (ms) | 그대로 사용 |

**판단 기준**: `duration < 1000` 이면 초 단위로 간주

---

## 커밋 내역

1. `dcd3276` - fix: 비디오 타임라인 duration 단위 호환성 개선
2. `823c508` - fix: 타임라인 마커 툴팁 잘림 현상 수정

---

## 테스트 결과

- [x] Backend 타입체크 통과
- [x] Backend 빌드 통과
- [x] Frontend 린트 통과 (경고만, 에러 없음)
- [x] Frontend 빌드 통과

---

## 향후 개선 가능 사항

1. **마이그레이션 스크립트**: 기존 리포트의 duration을 일괄 변환하는 스크립트 작성
2. **단위 명시**: VideoInfo 타입에 duration 단위를 명시하는 필드 추가 (`durationUnit: 'ms' | 's'`)

---

*최종 수정일: 2026-01-13*
