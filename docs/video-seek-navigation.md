# 비디오 시점 이동 기능 회고록

## 개요

**날짜**: 2026년 01월 13일
**목표**: 테스트 리포트에서 비디오 타임라인 마커와 실행 단계 테이블 행 클릭 시 해당 시점으로 비디오 이동

---

## 배경

테스트 리포트의 비디오 타임라인에는 각 스텝의 실행 시점을 나타내는 마커가 있었으나, 마커 클릭 시 비디오가 해당 시점으로 이동하는 기능이 제대로 동작하지 않았다. 또한 실행 단계 테이블에서 특정 행을 클릭하면 해당 시점의 영상을 바로 볼 수 있으면 QA 담당자가 문제 지점을 빠르게 확인할 수 있다는 요구사항이 있었다.

---

## 구현 내용

### 1. seekToTime 공용 함수 생성

마커 클릭과 테이블 행 클릭이 동일한 로직을 사용하도록 `seekToTime` 함수를 분리:

```typescript
// 비디오 시점 이동 (마커 클릭, 테이블 행 클릭 공용)
const seekToTime = (startTime: string | undefined, videoStartTime: string) => {
  if (!videoRef.current || !startTime || !videoStartTime) return;
  const stepTime = new Date(startTime).getTime();
  const videoStart = new Date(videoStartTime).getTime();
  if (isNaN(stepTime) || isNaN(videoStart)) return;
  const offsetMs = stepTime - videoStart;
  const seekTime = Math.max(0, offsetMs / 1000);
  videoRef.current.currentTime = seekTime;
};
```

### 2. 타임라인 마커 클릭 핸들러 수정

기존 `handleTimelineMarkerClick` 함수를 `seekToTime`을 사용하도록 리팩토링:

```typescript
const handleTimelineMarkerClick = (step: StepResult, videoStartTime: string, _totalDuration: number) => {
  seekToTime(step.startTime, videoStartTime);
};
```

### 3. DeviceDetail 컴포넌트에 seekToTime prop 추가

- Props 타입 정의에 `seekToTime` 추가
- 함수 파라미터에 `seekToTime` 추가
- 부모 컴포넌트에서 prop으로 전달

### 4. 테이블 행 클릭 핸들러 추가

실행 단계 테이블의 각 행에 클릭 이벤트 추가:

```tsx
<tr
  key={`${group.nodeId}-${idx}`}
  className={`step-row ${group.status} clickable`}
  onClick={() => scenario && seekToTime(group.startTime, scenario.startedAt)}
  title="클릭하면 해당 시점으로 영상 이동"
>
```

### 5. CSS 스타일 추가

클릭 가능한 행임을 시각적으로 표시:

```css
.steps-table tr.clickable {
  cursor: pointer;
  transition: background 0.15s;
}

.steps-table tr.clickable:hover {
  background: rgba(14, 99, 156, 0.15);
}
```

---

## 영향 받는 파일

```
frontend/src/components/TestReports/TestReports.tsx
frontend/src/components/TestReports/TestReports.css
```

---

## 사용 방법

### 마커 클릭으로 이동
1. 테스트 리포트에서 디바이스 선택
2. 비디오 아래 타임라인에서 원하는 마커 클릭
3. 비디오가 해당 시점으로 이동

### 테이블 행 클릭으로 이동
1. 테스트 리포트에서 디바이스 선택
2. "실행 단계" 테이블에서 원하는 행 클릭
3. 비디오가 해당 스텝의 시작 시점으로 이동

---

## 관련 개선사항 (동일 세션)

이번 세션에서 비디오 타임라인 관련 여러 개선이 함께 이루어졌다:

1. **대기 완료 마커 겹침 방지**: 대기 액션 완료 마커를 1초 앞당겨 다음 스텝 마커와 겹치지 않도록 함
2. **대기 완료 마커 표시 수정**: 대기 완료 스텝의 `startTime`을 완료 시점으로 기록하여 마커가 올바른 위치에 표시되도록 함
3. **마커 스타일 변경**: 원형 마커를 세로 실선으로 변경하여 스텝이 많아도 겹침이 적도록 함

---

## 향후 개선 가능 사항

- 키보드 단축키로 이전/다음 스텝 이동
- 현재 재생 중인 스텝 하이라이트
- 스텝별 재생 구간 반복 기능

---

*최종 수정일: 2026-01-13*
