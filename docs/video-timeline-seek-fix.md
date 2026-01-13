# 비디오 타임라인 시크 버그 수정 회고록

## 개요

**날짜**: 2026년 01월 13일
**목표**: TestReports 비디오 타임라인에서 마커 클릭 시 해당 시점으로 정확하게 이동하도록 수정

---

## 배경

TestReports 컴포넌트의 비디오 타임라인에서 마커(스텝 위치 표시)를 클릭하면 해당 시점으로 비디오가 이동해야 하지만, 다음과 같은 문제가 발생했습니다:

1. **마커 클릭 시 항상 영상 시작점(0초)으로 이동**
2. **두 번째 시나리오부터 마커 클릭이 첫 번째 시나리오의 비디오에 영향**

---

## 문제 분석

### 문제 1: 비디오 녹화 시작 시간 미저장

**증상**: 마커 클릭 시 항상 영상 시작점으로 이동

**원인 분석**:
- 비디오 타임라인 시크 계산: `seekTime = (stepTime - videoStartTime) / 1000`
- 기존 코드는 `scenario.startedAt` (테스트 실행 시작 시간)을 `videoStartTime`으로 사용
- 하지만 비디오 녹화는 테스트 실행 시작 **후** 별도로 시작됨
- `scenario.startedAt`과 실제 비디오 녹화 시작 시간 사이에 차이가 있어 계산이 부정확

**코드 흐름**:
```
테스트 시작 (scenario.startedAt)
    ↓
비디오 녹화 시작 (recordingStartTime) ← 이 시간이 저장되지 않음
    ↓
스텝 1 실행 (step.startTime)
    ↓
스텝 2 실행 (step.startTime)
    ...
```

### 문제 2: React 컴포넌트 재사용으로 인한 상태 공유

**증상**: 두 번째 시나리오의 마커 클릭 시 첫 번째 시나리오의 데이터가 사용됨

**원인 분석**:
- `DeviceDetail` 컴포넌트에 `key` prop이 없음
- React는 `key`가 없으면 동일 위치의 컴포넌트를 재사용
- 첫 번째 시나리오의 `DeviceDetail` 인스턴스(videoRef 포함)가 두 번째 시나리오에서도 재사용
- 결과적으로 `videoRef.current`가 첫 번째 시나리오의 비디오 엘리먼트를 참조

**디버깅 로그 비교**:
```javascript
// 첫 번째 시나리오 (정상)
{ startTime: '2026-01-13T08:19:27.344Z', videoStartTime: '2026-01-13T08:19:08.038Z' }

// 두 번째 시나리오 (비정상 - 첫 번째와 동일한 값!)
{ startTime: '2026-01-13T08:19:27.344Z', videoStartTime: '2026-01-13T08:19:08.038Z' }
```

---

## 해결 방법

### 수정 1: VideoInfo에 녹화 시작 시간 추가

**Backend 타입 정의** (`backend/src/types/execution.ts`):
```typescript
export interface VideoInfo {
  path: string;
  duration: number;
  size: number;
  startedAt: string;  // 녹화 시작 시간 (ISO 문자열) ← 추가
}
```

**Backend 서비스** (`backend/src/services/testReportService.ts`):
```typescript
async saveVideo(
  reportId: string,
  deviceId: string,
  scenarioKey: string,
  videoBase64: string,
  duration: number,
  startedAt: string  // ← 파라미터 추가
): Promise<VideoInfo | null> {
  // ...
  return {
    path: relativePath,
    duration,
    size: stats.size,
    startedAt,  // ← 반환값에 포함
  };
}
```

**Backend 실행기** (`backend/src/services/testExecutor.ts`):
```typescript
const recordingStartTime = Date.now();
// ... 비디오 녹화 ...
const videoInfo = await testReportService.saveVideo(
  state.reportId,
  deviceId,
  scenarioKey,
  videoBase64,
  recordingDuration,
  new Date(recordingStartTime).toISOString()  // ← 녹화 시작 시간 전달
);
```

**Frontend 타입** (`frontend/src/types/index.ts`):
```typescript
export interface VideoInfo {
  path: string;
  duration: number;
  size: number;
  startedAt: string;  // ← 추가
}
```

**Frontend 타임라인** (`frontend/src/components/TestReports/TestReports.tsx`):
```typescript
// 변경 전
const videoStartTime = device.steps[0]?.startTime || scenario.startedAt;

// 변경 후
const videoStartTime = device.video!.startedAt;
```

### 수정 2: DeviceDetail 컴포넌트에 key 추가

```jsx
// 변경 전
<DeviceDetail
  device={scenario.deviceResults.find(d => d.deviceId === selectedDeviceIds[key])}
  scenario={scenario}
  ...
/>

// 변경 후
<DeviceDetail
  key={`${key}-${selectedDeviceIds[key]}`}  // ← 고유 key 추가
  device={scenario.deviceResults.find(d => d.deviceId === selectedDeviceIds[key])}
  scenario={scenario}
  ...
/>
```

---

## 영향 받는 파일

```
backend/src/types/execution.ts          - VideoInfo 타입에 startedAt 필드 추가
backend/src/services/testReportService.ts - saveVideo 함수에 startedAt 파라미터 추가
backend/src/services/testExecutor.ts     - recordingStartTime을 saveVideo에 전달
frontend/src/types/index.ts              - VideoInfo 타입에 startedAt 필드 추가
frontend/src/components/TestReports/TestReports.tsx - 타임라인 시크 로직 수정, key prop 추가
```

---

## 기술적 교훈

### 1. 시간 기준점의 중요성
비디오 타임라인처럼 시간 기반 계산에서는 **정확한 기준점**이 중요합니다. 테스트 실행 시작 시간과 비디오 녹화 시작 시간은 다를 수 있으며, 이 차이가 타임라인 동기화 오류를 유발합니다.

### 2. React key의 역할
React의 `key` prop은 단순한 경고 제거용이 아닙니다. 컴포넌트의 **identity**를 결정하며, key가 없거나 동일하면 React는 컴포넌트를 재사용합니다. 특히 `useRef`나 내부 상태를 가진 컴포넌트에서는 key 설정이 필수입니다.

### 3. 디버깅 로그의 효과
문제 원인을 파악하기 어려울 때 **핵심 함수에 로그를 추가**하여 실제 데이터 흐름을 확인하는 것이 효과적입니다. 이번 케이스에서는 두 시나리오의 로그가 동일한 값을 출력하는 것을 보고 컴포넌트 재사용 문제를 발견했습니다.

---

## 테스트 방법

1. 백엔드 서버 재시작
2. **새로운 테스트 실행** (기존 리포트에는 startedAt 데이터 없음)
3. 리포트에서 첫 번째 시나리오 → 디바이스 선택 → 마커 클릭 → 해당 시점으로 이동 확인
4. 두 번째 시나리오 → 디바이스 선택 → 마커 클릭 → 해당 시점으로 이동 확인
5. 두 시나리오 간 비디오가 독립적으로 동작하는지 확인

---

*최종 수정일: 2026-01-13*
