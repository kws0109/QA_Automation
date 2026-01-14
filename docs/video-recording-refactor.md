# Video Recording 리팩토링 회고록

## 개요

**날짜**: 2026년 1월 14일
**목표**: scrcpy 기반 녹화를 완전히 제거하고 Device App + ADB 방식으로 단순화

---

## 배경

기존 녹화 시스템은 3가지 방식을 지원했습니다:
1. **scrcpy**: 시간 제한 없음, 하지만 moov atom 누락 문제 빈발
2. **ADB screenrecord**: 안정적이나 3분 제한
3. **Device App (QA Recorder)**: 새로 개발한 Android 앱 기반 녹화

scrcpy 방식에서 지속적으로 발생하는 문제들:
- Windows에서 graceful shutdown 어려움
- moov atom 누락으로 재생 불가한 영상 생성
- Appium 세션과 충돌 가능성

Device App이 안정화되면서 scrcpy를 완전히 제거하기로 결정했습니다.

---

## 구현 내용

### 1. scrcpy 코드 완전 제거

**제거된 파일/메서드:**
- `screenRecorder.ts`: `isScrcpyAvailable()`, `startScrcpyRecording()`, `useScrcpy` 옵션
- `video.ts`: `/api/video/record/scrcpy-available` API 엔드포인트
- `testExecutor.ts`: scrcpy fallback 로직
- `VideoConverter.tsx`: scrcpy 관련 상태 및 UI

### 2. Device App 타임아웃 처리 개선

**문제**: 결과 대기 루프에서 타임아웃 시 명확한 에러 반환 없음

```typescript
// Before
let result = null;
for (let i = 0; i < 10; i++) {
  // ... 결과 확인
}
if (!result || !result.success) { // 타임아웃과 실패 구분 불가
  return { success: false, error: result?.message || '실패' };
}

// After
let result = null;
let foundResult = false;
for (let i = 0; i < 10; i++) {
  // ... 결과 확인
  if (parsed.type === 'recording') {
    result = parsed;
    foundResult = true;
    break;
  }
}
if (!foundResult) {
  return { success: false, error: 'Device App 응답 타임아웃 (5초)' };
}
```

### 3. ADB fallback 해상도 자동 감지

**문제**: ADB fallback 시 `720x1280` 고정으로 가로 앱에서 영상 잘림

```typescript
// Before
result = await screenRecorder.startRecording(deviceId, {
  resolution: '720x1280', // 세로 고정
});

// After
const screenInfo = await screenRecorder.getDeviceScreenInfo(deviceId);
result = await screenRecorder.startRecording(deviceId, {
  resolution: `${screenInfo.width}x${screenInfo.height}`, // 자동 감지
});
```

### 4. RecordingSession method 필드 추가

**문제**: `remotePath.includes()` 로 녹화 방식 판별 - 경로 변경 시 깨짐

```typescript
// Before
const isDeviceApp = session.remotePath.includes('com.qaautomation.recorder');

// After
interface RecordingSession {
  // ...
  method: 'adb' | 'deviceApp'; // 명시적 필드
}

if (session.method === 'deviceApp') { ... }
```

---

## 영향 받는 파일

```
backend/src/services/videoAnalyzer/screenRecorder.ts  # 핵심 녹화 로직
backend/src/services/testExecutor.ts                  # 테스트 실행 시 녹화
backend/src/routes/video.ts                           # API 엔드포인트
frontend/src/components/VideoConverter/VideoConverter.tsx  # UI
```

---

## 녹화 방식 비교

| 항목 | Device App | ADB screenrecord |
|------|------------|------------------|
| 시간 제한 | 없음 | 3분 |
| 화면 방향 | 자동 감지 | 자동 감지 (개선됨) |
| Appium 독립성 | 완전 독립 | 독립 |
| 안정성 | 높음 | 높음 |
| 요구사항 | QA Recorder 앱 설치 | 없음 |

---

## 사용 방법

### 1. Device App 녹화 (권장)

1. 디바이스에 QA Recorder 앱 설치
2. 앱 실행 후 "서비스 시작" 버튼 탭
3. 자동으로 Device App 방식으로 녹화

### 2. ADB fallback

Device App 서비스가 실행되지 않으면 자동으로 ADB screenrecord 사용
- 3분 제한 있음
- 추가 설치 없이 사용 가능

---

## 향후 개선 가능 사항

1. **Device App 자동 시작**: ADB 명령으로 서비스 자동 시작
2. **녹화 품질 설정**: UI에서 비트레이트/해상도 조절
3. **다중 디바이스 녹화**: 50대 동시 녹화 시 성능 모니터링

---

*최종 수정일: 2026-01-14*
