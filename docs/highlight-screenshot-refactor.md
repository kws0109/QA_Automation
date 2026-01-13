# 하이라이트 스크린샷 리팩토링 회고록

## 개요

**날짜**: 2026년 01월 13일
**목표**: 이미지 매칭 하이라이트 스크린샷을 이벤트 기반 시스템으로 리팩토링하여 세션 안정성과 50대 디바이스 확장성 확보

---

## 배경

### 기존 문제점

1. **세션 크래시**: ActionResult에 Buffer를 담아 전달하는 방식이 Appium 세션 불안정을 유발
2. **메모리 집중**: 50대 디바이스가 동시에 스크린샷을 저장할 때 단일 큐에 메모리 집중
3. **비디오 시크 불가**: `res.send(buffer)` 방식이 HTTP Range 요청을 지원하지 않아 비디오 탐색 불가

### 요구사항

- 하이라이트 스크린샷 품질 유지 (매칭 직후 캡처)
- 50대 이상 디바이스 동시 실행 지원
- 비디오 타임라인 마커 클릭 시 정확한 시점으로 이동

---

## 구현 내용

### 1. 이벤트 기반 하이라이트 스크린샷 시스템

**파일**: `backend/src/services/screenshotEventService.ts` (신규)

기존 ActionResult를 통한 Buffer 전달 대신, EventEmitter 기반으로 분리:

```
[Actions] → emitMatchSuccess() → [ImageMatchEventEmitter]
                                        ↓
                               [DeviceScreenshotQueue]
                                        ↓
                               파일 저장 → 'screenshot:saved' 이벤트
                                        ↓
                               [TestExecutor] → 리포트에 반영
```

**핵심 클래스**:
- `ImageMatchEventEmitter`: 싱글톤 이벤트 허브
- `DeviceScreenshotQueue`: 디바이스별 저장 큐 (fire-and-forget)

### 2. 디바이스별 큐 시스템 (50대 확장성)

단일 큐 → 디바이스별 큐로 변경하여 메모리 분산:

| 항목 | 단일 큐 | 디바이스별 큐 |
|------|---------|--------------|
| 메모리 | 중앙 집중 | 분산 |
| 병목 | 50대 경쟁 | 없음 |
| 최대 대기 | 전역 10개 | 디바이스당 10개 |
| 동시 저장 | 전역 1개 | 디바이스당 1개 |

```typescript
class DeviceScreenshotQueue {
  private queue: ScreenshotSaveTask[] = [];
  private isProcessing = false;
  private readonly maxQueueSize = 10;  // 디바이스당

  enqueue(task: ScreenshotSaveTask): boolean {
    if (this.queue.length >= this.maxQueueSize) {
      task.buffer = null;  // GC 유도
      return false;  // 드롭
    }
    this.queue.push(task);
    this.processNext();
    return true;
  }
}
```

### 3. 비디오 HTTP Range 지원

**파일**: `backend/src/routes/testReport.ts`

```typescript
// Before (시크 불가)
const buffer = await testReportService.getVideo(relativePath);
res.send(buffer);

// After (시크 가능)
res.sendFile(videoPath, {
  headers: {
    'Content-Type': 'video/mp4',
    'Accept-Ranges': 'bytes',
  },
});
```

`res.sendFile()`은 Express가 자동으로 HTTP Range 요청을 처리하여 브라우저의 비디오 시크를 지원.

### 4. 레거시 코드 정리

| 삭제 항목 | 파일 | 이유 |
|-----------|------|------|
| `getVideo()` | testReportService.ts | sendFile()로 대체 |
| `saveHighlightScreenshot()` | testReportService.ts | screenshotEventService로 이전 |
| `highlightedScreenshot?: Buffer` | types/action.ts | 세션 크래시 원인 제거 |
| `CAPTURE_FINAL_SCREENSHOT` | testExecutor.ts | 비활성화 코드 제거 |

---

## 영향 받는 파일

```
backend/src/services/screenshotEventService.ts  (신규)
backend/src/services/testExecutor.ts            (이벤트 연동)
backend/src/services/testReportService.ts       (메서드 삭제)
backend/src/appium/actions.ts                   (이벤트 emit)
backend/src/routes/testReport.ts                (sendFile 변경)
backend/src/types/action.ts                     (필드 삭제)
```

---

## 결과

### 해결된 문제

1. **세션 안정성**: Buffer가 ActionResult를 통해 전달되지 않아 세션 크래시 해결
2. **50대 확장성**: 디바이스별 독립 큐로 메모리 분산, 병목 제거
3. **비디오 시크**: HTTP Range 지원으로 타임라인 마커 클릭 시 정확한 시점 이동

### 성능 특성

| 시나리오 | 동작 |
|----------|------|
| 정상 속도 | 모든 하이라이트 스크린샷 저장 |
| 과부하 시 | 디바이스당 10개 초과 시 드롭 (메모리 보호) |
| 디바이스 종료 | 해당 큐 자동 정리 (unregisterContext) |

---

## 향후 개선 가능 사항

1. **CAPTURE_FINAL_SCREENSHOT 재구현**: 시나리오 완료 시점 스크린샷 (새 로직으로)
2. **스크린샷 압축**: PNG → WebP 변환으로 저장 용량 절감
3. **실패 재시도**: 저장 실패 시 재시도 로직 추가

---

*최종 수정일: 2026-01-13*
