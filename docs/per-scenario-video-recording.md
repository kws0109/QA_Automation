# 시나리오별 개별 비디오 녹화 기능 회고록

## 개요

**날짜**: 2026년 01월 13일
**목표**: 다중 시나리오 실행 시 각 시나리오별로 개별 비디오를 녹화하도록 변경

---

## 배경

기존에는 다중 시나리오 실행 시 디바이스당 1개의 비디오만 녹화되었습니다. 이로 인해:
- 여러 시나리오가 하나의 긴 비디오에 합쳐져 특정 시나리오 영상을 찾기 어려움
- 실패한 시나리오만 확인하고 싶어도 전체 영상을 탐색해야 함
- 리포트에서 시나리오별로 비디오를 연결할 수 없음

이를 해결하기 위해 각 시나리오 시작 시 녹화를 시작하고, 종료 시 개별 파일로 저장하도록 수정했습니다.

---

## 구현 내용

### 1. deviceVideos 타입 변경

기존 구조에서 시나리오별 저장을 위한 중첩 Map 구조로 변경했습니다.

```typescript
// 기존: 디바이스당 1개 비디오
deviceVideos: Map<string, VideoInfo>;  // deviceId -> VideoInfo

// 변경: 시나리오별 비디오
deviceVideos: Map<string, Map<string, VideoInfo>>;  // deviceId -> scenarioKey -> VideoInfo
```

### 2. 녹화 로직 위치 변경

녹화 시작/종료 로직을 for 루프 외부에서 내부로 이동했습니다.

**기존 구조**:
```
녹화 시작
for (시나리오) {
  시나리오 실행
}
녹화 종료 및 저장
```

**변경 구조**:
```
for (시나리오) {
  녹화 시작
  시나리오 실행
  녹화 종료 및 저장
}
```

### 3. saveVideo 메서드 수정

`scenarioKey` 파라미터를 추가하여 시나리오별 파일명 생성:

```typescript
async saveVideo(
  reportId: string,
  deviceId: string,
  scenarioKey: string,  // 추가된 파라미터
  videoBase64: string,
  duration: number
): Promise<VideoInfo | null>
```

파일명 형식: `{deviceId}_{scenarioKey}.mp4`
- 예: `emulator-5554_scenario1-0.mp4`

### 4. 비디오 조회 로직 수정

리포트 생성 시 시나리오별 비디오를 조회하도록 변경:

```typescript
// 기존
const video = state.deviceVideos.get(dr.deviceId);

// 변경
const deviceVideoMap = state.deviceVideos.get(dr.deviceId);
const video = deviceVideoMap?.get(scenarioKey);
```

---

## 영향 받는 파일

```
backend/src/services/testExecutor.ts   - 녹화 로직 및 타입 변경
backend/src/services/testReportService.ts - saveVideo 메서드 수정
```

---

## 사용 방법

프론트엔드에서는 기존과 동일하게 `device.video`로 접근합니다.
시나리오를 선택하면 해당 시나리오의 비디오만 표시됩니다.

**리포트 구조 예시**:
```
테스트 리포트
├── 시나리오 1 (로그인 테스트)
│   ├── 디바이스 A
│   │   ├── 비디오: emulator-5554_scenario1-0.mp4
│   │   └── 스크린샷: ...
│   └── 디바이스 B
│       ├── 비디오: emulator-5556_scenario1-0.mp4
│       └── 스크린샷: ...
├── 시나리오 2 (메인화면 테스트)
│   ├── 디바이스 A
│   │   ├── 비디오: emulator-5554_scenario2-0.mp4
│   │   └── 스크린샷: ...
│   └── 디바이스 B
│       ├── 비디오: emulator-5556_scenario2-0.mp4
│       └── 스크린샷: ...
```

---

## 고려사항

### 녹화 오버헤드
- 시나리오마다 녹화 시작/종료가 발생하여 약간의 오버헤드 추가
- 시나리오 간 인터벌 시간에 녹화가 중단되므로 불필요한 대기 시간 녹화 방지

### 파일 크기
- 개별 파일이 작아져 관리가 용이해짐
- 총 파일 수는 증가 (시나리오 수 × 디바이스 수)

### 하위 호환성
- 기존 리포트 조회에는 영향 없음 (video 필드 구조 동일)
- 새로 생성되는 리포트부터 시나리오별 비디오 적용

---

*최종 수정일: 2026-01-13*
