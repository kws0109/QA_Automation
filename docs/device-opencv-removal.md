# 디바이스 측 OpenCV 이미지 매칭 제거 회고록

## 개요

**날짜**: 2026년 01월 15일
**목표**: 디바이스 앱 OpenCV 매칭의 낮은 신뢰도 문제 해결을 위해 백엔드 전용 매칭으로 전환

---

## 배경

### 문제 상황
디바이스 앱(QA Recorder)에서 직접 OpenCV 템플릿 매칭을 수행하도록 구현했으나, 지속적인 낮은 매칭 신뢰도(38-80%) 문제가 발생했습니다.

- 동일한 이미지에 대해 백엔드 매칭은 99% 신뢰도, 디바이스 매칭은 72-80% 신뢰도
- CLAHE(Contrast Limited Adaptive Histogram Equalization) 적용 후에도 개선되지 않음
- 테스트 실행 시 타임아웃 및 매칭 실패 빈번

### 결정
디바이스 측 매칭을 포기하고 백엔드 OpenCV(`@u4/opencv4nodejs`)를 통한 단일 매칭 방식으로 통합하기로 결정했습니다.

---

## 구현 내용

### 1. Actions 클래스 정리 (`backend/src/appium/actions.ts`)

**삭제된 코드:**
- `USE_DEVICE_MATCHING` 상수
- `_deviceMatchingEnabled` 속성
- `_isDeviceMatchingAvailable()` 메서드
- `_matchOnDevice()` 메서드
- `screenRecorder`, `imageMatchEmitter` import

**변경된 메서드:**
- `waitUntilImage()` - 백엔드 매칭만 사용
- `waitUntilImageGone()` - 백엔드 매칭만 사용
- `imageExists()` - 백엔드 매칭만 사용
- `tapImage()` - 백엔드 매칭만 사용

### 2. ScreenRecorder 정리 (`backend/src/services/videoAnalyzer/screenRecorder.ts`)

**삭제된 메서드 (~400줄):**
- `matchTemplateOnDevice()` - 디바이스 측 템플릿 매칭
- `pullHighlightImage()` - 하이라이트 이미지 가져오기
- `checkDeviceAppStatus()` - 디바이스 앱 상태 확인
- `isDeviceMatchingAvailable()` - 디바이스 매칭 가용성 확인
- `clearDeviceCache()` - 디바이스 캐시 초기화
- `syncAndCheckDeviceMatching()` - 템플릿 동기화 및 매칭 확인
- `pushTemplate()` - 템플릿 디바이스로 전송
- `pushTemplates()` - 복수 템플릿 전송
- `listDeviceTemplates()` - 디바이스 템플릿 목록 조회
- `deleteDeviceTemplate()` - 디바이스 템플릿 삭제

### 3. TestExecutor 정리 (`backend/src/services/testExecutor.ts`)

**삭제된 코드:**
- 템플릿 자동 동기화 블록 (587-645줄)
- `extractTemplateIdsFromQueue()` 메서드
- `matchMethod` 관련 통계 코드
- 디바이스/백엔드 매칭 카운트 집계

### 4. TemplateManifest 서비스 완전 삭제

**삭제된 파일:** `backend/src/services/templateManifest.ts` (~400줄)

**삭제된 기능:**
- 템플릿 버전 관리 (manifest.json)
- 디바이스 동기화 (`syncToDevice`, `syncToDevices`)
- manifest 재구축

**관련 참조 제거:**
- `device.ts` - 템플릿 동기화 API 4개 삭제
- `image.ts` - manifest 업데이트 호출 제거
- `sessionManager.ts` - 세션 생성 시 자동 동기화 제거

### 5. 타입 정의 정리

**삭제된 필드:**
- `action.ts`: `matchMethod?: 'device' | 'backend'`
- `testReport.ts`: `deviceMatchCount`, `backendMatchCount`, `deviceMatchAvgTime`, `backendMatchAvgTime`
- `reportEnhanced.ts`: `matchMethod?: 'device' | 'backend'`

### 6. ReportExporter 정리

- 디바이스/백엔드 매칭 통계 HTML 섹션 제거

---

## 영향 받는 파일

```
backend/src/appium/actions.ts
backend/src/services/videoAnalyzer/screenRecorder.ts
backend/src/services/testExecutor.ts
backend/src/services/templateManifest.ts (삭제됨)
backend/src/services/sessionManager.ts
backend/src/services/reportExporter.ts
backend/src/routes/device.ts
backend/src/routes/image.ts
backend/src/types/action.ts
backend/src/types/testReport.ts
backend/src/types/reportEnhanced.ts
```

---

## 삭제된 API 엔드포인트

| 엔드포인트 | 메서드 | 설명 |
|------------|--------|------|
| `/api/device/templates/manifest` | GET | 템플릿 manifest 상태 조회 |
| `/api/device/templates/rebuild-manifest` | POST | manifest 재구축 |
| `/api/device/templates/sync/:deviceId` | POST | 특정 디바이스 템플릿 동기화 |
| `/api/device/templates/sync-all` | POST | 모든 디바이스 템플릿 동기화 |

---

## 현재 이미지 매칭 아키텍처

```
┌─────────────────────────────────────────────────────┐
│                    Backend Server                    │
├─────────────────────────────────────────────────────┤
│  Actions.ts                                          │
│  ├── waitUntilImage()                               │
│  ├── waitUntilImageGone()                           │
│  ├── imageExists()                                  │
│  └── tapImage()                                     │
│           │                                          │
│           ▼                                          │
│  _matchOnBackend()                                  │
│           │                                          │
│           ▼                                          │
│  ImageMatchService (OpenCV @u4/opencv4nodejs)       │
│  └── findImageCenter()                              │
│           │                                          │
│           ▼                                          │
│  TM_CCOEFF_NORMED 알고리즘                           │
└─────────────────────────────────────────────────────┘
           │
           │ Appium takeScreenshot()
           ▼
┌─────────────────────────────────────────────────────┐
│                    Android Device                    │
│  (스크린샷만 제공, 매칭은 수행하지 않음)               │
└─────────────────────────────────────────────────────┘
```

---

## 장점

1. **단순화**: 단일 매칭 경로로 코드 복잡도 감소
2. **일관성**: 모든 테스트에서 동일한 매칭 결과 보장
3. **높은 신뢰도**: 백엔드 OpenCV의 99%+ 매칭 신뢰도 활용
4. **유지보수 용이**: 템플릿 동기화, 버전 관리 등 복잡한 로직 제거

---

## 향후 고려 사항

- 네트워크 지연으로 인한 매칭 속도 저하 모니터링
- 대량 테스트 시 서버 부하 모니터링
- 필요 시 이미지 캐싱 전략 검토

---

*최종 수정일: 2026-01-15*
