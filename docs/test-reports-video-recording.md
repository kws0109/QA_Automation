# TestReports 비디오 녹화 및 ParallelReports 레거시 삭제 회고록

## 개요

**날짜**: 2026년 1월 13일
**목표**: TestReports에 시나리오 진행 영상 녹화 기능 추가 및 ParallelReports 레거시 코드 삭제

---

## 배경

### 기존 리포트 시스템의 이원화 문제

프로젝트에 두 가지 리포트 시스템이 존재했습니다:

| 시스템 | 용도 | 비디오 녹화 |
|--------|------|-------------|
| **ParallelReports** | 단일 시나리오 → 다중 디바이스 (병렬) | ✅ 있음 |
| **TestReports** | 다중 시나리오 → 다중 디바이스 (순차) | ❌ 없음 |

### 통합 필요성

- TestReports가 더 발전된 "Who/What/When" 패러다임 기반
- ParallelReports는 단일 시나리오만 지원하는 제한적인 구조
- 비디오 녹화 기능을 TestReports로 이전 후 ParallelReports 삭제 결정

---

## 구현 내용

### Phase 1: testExecutor.ts 비디오 녹화 추가

#### 1.1 ExecutionState 확장

```typescript
interface ExecutionState {
  // ... 기존 필드
  deviceScreenshots: Map<string, Map<string, ScreenshotInfo[]>>;
  deviceVideos: Map<string, VideoInfo>;  // [NEW] 디바이스당 1개 비디오
}
```

#### 1.2 비디오 녹화 흐름

```
executeDeviceScenarios() 메서드:

1. driver.startRecordingScreen() ← 디바이스 시작 후
   ├─ videoSize: '720x1280' (720p 세로)
   ├─ timeLimit: 1800 (최대 30분)
   ├─ bitRate: 4000000 (4Mbps)
   └─ forceRestart: true

2. 시나리오 순차 실행...

3. driver.stopRecordingScreen() ← 디바이스 완료 전
   └─ testReportService.saveVideo(reportId, deviceId, videoBase64, duration)

4. state.deviceVideos.set(deviceId, videoInfo)
```

#### 1.3 리포트 생성 시 비디오 포함

```typescript
const deviceResults: DeviceScenarioResult[] = summary.deviceResults.map(dr => {
  const video = state.deviceVideos.get(dr.deviceId);

  return {
    deviceId: dr.deviceId,
    // ... 기존 필드
    screenshots,
    video,  // [NEW]
  };
});
```

### Phase 2: TestReports 비디오 플레이어

기존에 이미 구현되어 있음을 확인:
- `DeviceResultView` 컴포넌트에서 `device.video` 있을 때 비디오 섹션 렌더링
- 타임라인 마커, 진행 바, 재생 컨트롤 포함

### Phase 3: ParallelReports 레거시 삭제

#### 3.1 삭제된 파일

**Backend:**
```
backend/src/services/
├── parallelExecutor.ts    (1,169 lines 삭제)
├── parallelReport.ts      (480 lines 삭제)
└── reportExporter.ts      (666 lines 삭제)
```

**Frontend:**
```
frontend/src/components/
├── ParallelReports/       (폴더 전체 삭제)
└── ParallelLogs/          (폴더 전체 삭제)
```

#### 3.2 session.ts 엔드포인트 정리

삭제된 엔드포인트:
- `POST /api/session/execute-parallel`
- `GET /api/session/parallel/status`
- `POST /api/session/parallel/stop/:deviceId`
- `POST /api/session/parallel/stop-all`
- `GET /api/session/parallel/reports`
- `GET /api/session/parallel/reports/:id`
- `DELETE /api/session/parallel/reports/:id`
- `DELETE /api/session/parallel/reports`
- `GET /api/session/parallel/screenshots/*`
- `GET /api/session/parallel/videos/*`
- `GET /api/session/parallel/reports/:id/export/html`
- `GET /api/session/parallel/reports/:id/export/pdf`
- `GET /api/session/parallel/r2/status`
- `POST /api/session/parallel/r2/share/:id`

#### 3.3 scheduleManager 마이그레이션

```typescript
// Before
import { parallelExecutor } from './parallelExecutor';

const result = await parallelExecutor.executeParallel(
  schedule.scenarioId,
  activeDeviceIds,
  { captureOnComplete: true, recordVideo: true }
);

// After
import { testExecutor } from './testExecutor';

const result = await testExecutor.execute({
  scenarioIds: [schedule.scenarioId],
  deviceIds: activeDeviceIds,
  repeatCount: 1,
  testName: `스케줄: ${schedule.name}`,
  requesterName: 'System (스케줄)',
});
```

#### 3.4 App.tsx 정리

- `ParallelLog` 타입 import 제거
- `isParallelRunning`, `parallelLogs`, `runningScenarioByDevice` state 제거
- `parallel:*`, `device:*` 소켓 이벤트 핸들러 제거
- `deviceExecutionStatus` useMemo 간소화 (빈 Map 반환)
- 탭 배지 (`실행중`) 제거

---

## 영향 받는 파일

### 수정된 파일
```
backend/src/services/testExecutor.ts      # 비디오 녹화 로직 추가
backend/src/services/scheduleManager.ts   # testExecutor로 마이그레이션
backend/src/routes/session.ts             # parallel 엔드포인트 삭제
frontend/src/App.tsx                      # parallel 관련 코드 제거
```

### 삭제된 파일
```
backend/src/services/parallelExecutor.ts
backend/src/services/parallelReport.ts
backend/src/services/reportExporter.ts
frontend/src/components/ParallelReports/
frontend/src/components/ParallelLogs/
```

---

## 비디오 저장 경로 구조

```
reports/
├── test/
│   └── {reportId}.json
├── screenshots/
│   └── {reportId}/
│       └── {deviceId}/
│           └── {nodeId}_{type}_{timestamp}.png
└── videos/
    └── {reportId}/
        └── {deviceId}.mp4
```

---

## API 엔드포인트

비디오 조회 (기존 유지):
```
GET /api/test-reports/:reportId/videos/:filename
```

URL 형식:
```
http://127.0.0.1:3001/api/test-reports/{reportId}/videos/{deviceId}.mp4
```

---

## 향후 개선 가능 사항

1. **실시간 실행 상태 표시 복원**
   - `deviceExecutionStatus` 기능을 `testExecutor`의 `test:*` 이벤트 기반으로 재구현
   - DeviceDashboard에서 현재 실행 중인 시나리오 상태 표시

2. **리포트 내보내기 기능 재구현**
   - `reportExporter.ts` 삭제로 HTML/PDF 내보내기 비활성화
   - TestReport 구조에 맞는 새로운 내보내기 기능 필요 시 구현

3. **시나리오별 비디오 분리**
   - 현재: 디바이스당 1개 비디오 (모든 시나리오 포함)
   - 개선: 시나리오별 비디오 분리 옵션

---

## 결론

이번 작업으로 리포트 시스템이 TestReports로 통합되었습니다:

- **단순화**: 두 개의 리포트 시스템에서 하나로 통합
- **확장성**: "Who/What/When" 패러다임의 유연한 구조 유지
- **기능 완성**: 비디오 녹화 기능 TestReports에 통합
- **코드 정리**: ~2,300 라인의 레거시 코드 삭제

---

*최종 수정일: 2026-01-13*
