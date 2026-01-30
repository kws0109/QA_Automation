# 게임 자동화 도구 - 코드 가이드

## 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [기술 스택 및 선택 이유](#2-기술-스택-및-선택-이유)
3. [시스템 아키텍처](#3-시스템-아키텍처)
4. [핵심 기능 구현](#4-핵심-기능-구현)
5. [코드 구조](#5-코드-구조)
6. [주요 코드 설명](#6-주요-코드-설명)
7. [설치 및 실행](#7-설치-및-실행)
8. [외부 접근 및 배포](#8-외부-접근-및-배포)
9. [테스트 방법](#9-테스트-방법)
10. [성능 최적화](#10-성능-최적화)
11. [향후 개선 계획](#11-향후-개선-계획)

---

## 1. 프로젝트 개요

### 1.1 프로젝트 목적

**비개발자(QA 담당자)가 코드 작성 없이 모바일 게임 자동화 테스트를 수행할 수 있는 도구**

기존 자동화 도구의 문제점:
- Appium, Selenium 등은 코드 작성 필수
- QA 담당자가 직접 테스트 케이스를 만들기 어려움
- 개발자 리소스 의존도 높음

해결 방안:
- **비주얼 노드 에디터**: 드래그 앤 드롭으로 테스트 플로우 구성
- **이미지 기반 인식**: 게임 UI는 접근성 ID가 없어 이미지 매칭 필수
- **다중 디바이스 병렬 실행**: QA 효율성 극대화

### 1.2 주요 기능

| 기능 | 설명 | 기술적 난이도 |
|------|------|--------------|
| 비주얼 노드 에디터 | 플로우차트 방식 시나리오 편집 | ★★★☆☆ |
| 이미지 템플릿 매칭 | OpenCV 기반 UI 요소 인식 | ★★★★☆ |
| OCR 텍스트 인식 | Google Cloud Vision 연동 | ★★★☆☆ |
| 다중 디바이스 병렬 실행 | 50대+ 동시 테스트 | ★★★★★ |
| Suite 실행 | 여러 시나리오 묶어서 순차/병렬 실행 | ★★★★☆ |
| 디바이스 잠금 & 대기열 | 다중 사용자 리소스 충돌 방지 | ★★★★☆ |
| 실시간 디바이스 미리보기 | WebSocket 스트리밍 | ★★★★☆ |
| 테스트 리포트 & 비디오 | QA Recorder 앱 (시간 무제한 녹화) | ★★★★☆ |
| 메트릭 대시보드 | 실행 통계, 성공률 추이, 실패 분석 | ★★★☆☆ |
| 스케줄링 | Cron 기반 예약 실행 | ★★☆☆☆ |
| Slack 연동 | OAuth 로그인 + 결과 알림 | ★★★☆☆ |
| Server Manager | Electron 통합 관리 앱 | ★★★☆☆ |
| 외부 접근 (Cloudflare Tunnel) | 인터넷을 통한 원격 접근 | ★★★★☆ |
| R2 클라우드 저장소 | 리포트 파일 저장 및 공유 링크 | ★★★☆☆ |

### 1.3 운영 환경

이 도구는 **실제 현업에서 사용되는 QA 자동화 도구**입니다.

| 항목 | 규모 |
|------|------|
| 동시 접속 사용자 | 다중 사용자 |
| 연결 디바이스 | 50대 이상 |
| 동시 테스트 실행 | 50개 이상 |

---

## 2. 기술 스택 및 선택 이유

### 2.1 Frontend

| 기술 | 버전 | 선택 이유 |
|------|------|----------|
| **React** | 19.x | 컴포넌트 기반 UI, 대규모 커뮤니티 |
| **TypeScript** | 5.x | 타입 안정성, 런타임 에러 방지 |
| **Vite** | 7.x | 빠른 HMR, ESM 기반 빌드 |
| **Socket.IO Client** | 4.x | 실시간 양방향 통신 |
| **react-window** | 1.x | 대량 데이터 가상화 렌더링 |
| **Recharts** | 3.x | 대시보드 차트 |

**Context API vs Redux/Zustand 선택 이유:**
- 전역 상태가 7개 Context로 명확히 분리됨
- Redux의 보일러플레이트 오버헤드 불필요
- Context + useReducer로 충분한 복잡도

### 2.2 Backend

| 기술 | 버전 | 선택 이유 |
|------|------|----------|
| **Node.js** | 22.x | 비동기 I/O, Appium과 동일 생태계 |
| **Express** | 4.x | 경량 웹 프레임워크, 미들웨어 생태계 |
| **TypeScript** | 5.x | 타입 안정성 |
| **Socket.IO** | 4.x | 실시간 테스트 진행률 브로드캐스트 |
| **WebdriverIO** | 9.x | Appium 클라이언트, 타입 지원 |
| **Sharp** | 0.33.x | 고성능 이미지 처리 (libvips) |
| **node-cron** | 3.x | 스케줄링 |
| **Zod** | 3.x | 런타임 스키마 검증 |

**WebdriverIO vs Appium JS Client 선택 이유:**
- WebdriverIO가 더 나은 TypeScript 지원
- 재시도, 대기 등 유틸리티 내장
- 활발한 유지보수

### 2.3 자동화 & 이미지 처리

| 기술 | 용도 | 선택 이유 |
|------|------|----------|
| **Appium** | 모바일 자동화 | 업계 표준, Android/iOS 지원 |
| **UiAutomator2** | Android 드라이버 | 안정성, 성능 |
| **OpenCV** | 이미지 템플릿 매칭 | 정확도, 성능 |
| **Tesseract.js** | OCR (로컬) | 오프라인 지원 |
| **Google Cloud Vision** | OCR (클라우드) | 높은 정확도 |
| **FFmpeg** | 비디오 처리 | 업계 표준 |

### 2.4 인프라

| 기술 | 용도 |
|------|------|
| **Electron** | Server Manager 데스크톱 앱 |
| **Cloudflare Tunnel** | 외부 접근 (NAT 우회) |
| **Cloudflare R2** | 리포트 파일 저장/공유 |

---

## 3. 시스템 아키텍처

### 3.1 전체 구조

```
┌─────────────────────────────────────────────────────────────────┐
│                         사용자 (QA 담당자)                        │
└─────────────────────────────────────────────────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    ▼                       ▼
            ┌───────────────┐       ┌───────────────┐
            │   Frontend    │       │ Server Manager│
            │   (React)     │       │  (Electron)   │
            │  Port: 5173   │       │               │
            └───────┬───────┘       └───────────────┘
                    │
          HTTP/WebSocket
                    │
                    ▼
            ┌───────────────┐
            │   Backend     │
            │  (Express)    │
            │  Port: 3001   │
            └───────┬───────┘
                    │
                    ▼
            ┌───────────────┐
            │    Appium     │
            │    Server     │
            │  Port: 4900   │
            └───────┬───────┘
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
   ┌─────────┐ ┌─────────┐ ┌─────────┐
   │Device 1 │ │Device 2 │ │Device N │
   └─────────┘ └─────────┘ └─────────┘
```

### 3.2 테스트 실행 흐름

```
┌──────────┐     ┌───────────────────┐     ┌─────────────────┐
│  Client  │────▶│  testOrchestrator │────▶│  testQueueService│
│          │     │   (요청 수신)      │     │    (대기열)      │
└──────────┘     └───────────────────┘     └─────────────────┘
                          │                         │
                          │ 디스패치                │ 디바이스 가용 확인
                          ▼                         ▼
                 ┌───────────────────┐     ┌─────────────────┐
                 │   testExecutor    │◀────│  deviceManager  │
                 │   (실행 엔진)      │     │ (디바이스 상태) │
                 └───────────────────┘     └─────────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
   ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
   │   Actions   │ │ imageMatch  │ │ textMatcher │
   │(tap,swipe..)│ │ (이미지매칭)│ │   (OCR)     │
   └─────────────┘ └─────────────┘ └─────────────┘
          │
          ▼
   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
   │sessionManager│───▶│   Appium    │───▶│   Device    │
   │(Appium 세션) │     │   Server    │     │             │
   └─────────────┘     └─────────────┘     └─────────────┘
```

### 3.3 데이터 흐름

1. **시나리오 저장**: JSON 파일 (`scenarios/{id}.json`)
2. **실행 요청**: REST API → WebSocket으로 진행률 브로드캐스트
3. **리포트 저장**: JSON + 스크린샷 PNG + 비디오 MP4
4. **실시간 통신**: Socket.IO 이벤트 (`test:progress`, `test:step`, `test:complete`)

---

## 4. 핵심 기능 구현

### 4.1 비주얼 노드 에디터

**구현 위치**: `frontend/src/components/Canvas/`

게임 테스트 시나리오를 플로우차트 형태로 편집합니다.

```
┌─────────────────────────────────────────────────────────────┐
│ [Sidebar]  │           [Canvas]            │    [Panel]    │
│            │                               │               │
│  ○ tap     │  ┌───────┐    ┌───────┐      │  선택 노드    │
│  ○ swipe   │  │ Start │───▶│  Tap  │──┐   │  속성 편집    │
│  ○ wait    │  └───────┘    └───────┘  │   │               │
│  ○ image   │                          │   │  x: [  540 ]  │
│  ○ text    │       ┌──────────────────┘   │  y: [  960 ]  │
│  ○ condition│      ▼                      │               │
│  ...       │  ┌───────┐    ┌───────┐      │               │
│            │  │ Wait  │───▶│ Swipe │      │               │
│            │  └───────┘    └───────┘      │               │
└─────────────────────────────────────────────────────────────┘
```

**노드 타입**:
| 타입 | 설명 | 아이콘 |
|------|------|--------|
| `start` | 시작점 | ▶ |
| `tap` | 화면 탭 | 👆 |
| `longPress` | 길게 누르기 | 👇 |
| `swipe` | 스와이프 | ↔ |
| `wait` | 대기 | ⏱ |
| `tapImage` | 이미지 탭 | 🖼 |
| `tapOcrText` | 텍스트 탭 | 📝 |
| `condition` | 조건 분기 | ❓ |

**핵심 상태 관리**:
```typescript
// FlowEditorContext.tsx
interface FlowEditorContextType {
  // 상태
  nodes: FlowNode[];
  connections: Connection[];
  selectedNodeId: string | null;
  selectedNodeIds: Set<string>;  // 다중 선택

  // 노드 조작
  handleNodeAdd: (type: NodeType, x: number, y: number) => void;
  handleNodeAddAuto: (type: NodeType) => void;  // 자동 배치
  handleNodeUpdate: (nodeId: string, updates: Partial<FlowNode>) => void;
  handleNodeDelete: (nodeId: string) => void;
  handleNodesDelete: (nodeIds: string[]) => void;  // 다중 삭제
  handleNodeInsertAfter: (afterNodeId: string, nodeType: NodeType) => void;

  // 연결 조작
  handleConnectionAdd: (fromId: string, toId: string, branch?: string | null) => void;
  handleConnectionDelete: (index: number) => void;

  // 복사/붙여넣기
  handleCopy: () => void;
  handlePaste: () => void;
  handleDuplicate: () => void;

  // 플로우 관리
  loadFlow: (nodes: FlowNode[], connections: Connection[]) => void;
  clearFlow: () => void;
}
```

### 4.2 이미지 템플릿 매칭

**구현 위치**: `backend/src/services/imageMatch.ts`

게임 UI는 접근성 ID가 없어 **이미지 기반 인식**이 필수입니다.

**매칭 알고리즘**:
1. 현재 화면 스크린샷 캡처
2. 템플릿 이미지와 비교 (OpenCV Template Matching)
3. 유사도 임계값(threshold) 이상이면 매칭 성공
4. 매칭된 좌표 반환

```typescript
// imageMatch.ts - ImageMatchService 클래스
import { imageMatchService } from './services/imageMatch';

// 1. 스크린샷 캡처 (Actions 또는 ADB)
const screenshotBuffer = await actions.takeScreenshot();

// 2. 템플릿 매칭 실행
const result = await imageMatchService.matchTemplate(
  screenshotBuffer,
  templateId,         // 템플릿 ID (templates.json에서 관리)
  {
    threshold: 0.9,   // 유사도 임계값
    region: { ... },  // ROI (선택적)
    multiScale: { enabled: true, minScale: 0.8, maxScale: 1.2 }  // 멀티스케일 (선택적)
  }
);

// 3. 결과 사용
if (result.found) {
  console.log(`매칭 성공: (${result.centerX}, ${result.centerY})`);
  console.log(`유사도: ${(result.confidence * 100).toFixed(1)}%`);
  await actions.tap(result.centerX, result.centerY);
}
```

**ROI (Region of Interest) 지원**:
```typescript
// 전체 화면이 아닌 특정 영역만 검색 (성능 최적화)
// region은 상대 좌표(0~1) 또는 절대 좌표 지원
await imageMatchService.matchTemplate(screenshotBuffer, templateId, {
  threshold: 0.9,
  region: { x: 0.1, y: 0.2, width: 0.5, height: 0.3 }  // 상대 좌표
});

// 내부적으로 Sharp extract()로 ROI 적용 후 OpenCV 매칭
```

### 4.3 다중 디바이스 병렬 실행

**구현 위치**: `backend/src/services/sessionManager.ts`, `testOrchestrator.ts`

**세션 관리 아키텍처**:
```
┌─────────────────────────────────────────────────────────────┐
│                     sessionManager                          │
│                                                             │
│  sessions: Map<deviceId, ManagedSession>                    │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │ Device A    │  │ Device B    │  │ Device C    │          │
│  │ Session     │  │ Session     │  │ Session     │          │
│  │ Appium Port │  │ Appium Port │  │ Appium Port │          │
│  └─────────────┘  └─────────────┘  └─────────────┘          │
│                                                             │
│  Screen Streaming: WebSocket (/ws/screen?deviceId=xxx)      │
└─────────────────────────────────────────────────────────────┘
```

**테스트 제출 API**:
```typescript
// testOrchestrator.ts

interface SubmitTestResult {
  queueId: string;
  status: 'running' | 'queued' | 'partial';
  executionId?: string;
  position?: number;
  estimatedWaitTime?: number;
  message?: string;
  splitExecution?: {
    immediateDeviceIds: string[];
    queuedDeviceIds: string[];
  };
}

/**
 * 테스트 제출 (자동 분기 처리)
 * - 모든 디바이스 가용 → 즉시 실행
 * - 모든 디바이스 사용 중 → 대기열 추가
 * - 일부만 가용 → 분할 실행 (가용 디바이스 즉시 + 나머지 대기)
 */
async submitTest(
  request: TestExecutionRequest,
  userName: string,
  socketId: string,
  options?: { priority?: 0 | 1 | 2; testName?: string }
): Promise<SubmitTestResult> {
  // 사용 중인 디바이스와 가용 디바이스 분리
  const busyDeviceIds = deviceLockService.getBusyDevices(request.deviceIds);
  const availableDeviceIds = request.deviceIds.filter(
    id => !busyDeviceIds.includes(id)
  );

  // Case 1: 모든 디바이스 가용 → 즉시 실행
  if (busyDeviceIds.length === 0) {
    return this.startTestImmediately(request, userName, socketId, options);
  }

  // Case 2: 모든 디바이스 사용 중 → 대기열 추가
  if (availableDeviceIds.length === 0) {
    const queuedTest = testQueueService.addToQueue(request, userName, socketId);
    return {
      queueId: queuedTest.queueId,
      status: 'queued',
      position: testQueueService.getPosition(queuedTest.queueId),
      estimatedWaitTime: testQueueService.getEstimatedWaitTime(queuedTest.queueId),
    };
  }

  // Case 3: 분할 실행 (일부 즉시 + 나머지 대기)
  return this.startSplitExecution(
    request, userName, socketId,
    availableDeviceIds, busyDeviceIds, options
  );
}
```

**분할 실행 흐름**:
```
요청: Device A, B, C에서 시나리오 실행
     │
     ├── Device A: 가용 → 즉시 실행
     ├── Device B: 가용 → 즉시 실행
     └── Device C: 사용 중 (User X) → 대기열 추가
                                        │
                      User X 완료 시 ───┘
                                        │
                                        └── Device C: 자동 실행
```

### 4.4 실시간 디바이스 미리보기

**구현 위치**: `backend/src/services/screenStreamService.ts`

**WebSocket 스트리밍 구현**:
```typescript
// 디바이스 화면을 WebSocket으로 스트리밍
// 경로: /ws/screen?deviceId=xxx

class ScreenStreamService {
  private wss: WebSocketServer | null = null;
  private streams: Map<string, DeviceStream> = new Map();

  // HTTP 서버에 WebSocket 서버 연결
  initialize(server: http.Server): void {
    this.wss = new WebSocketServer({
      server,
      path: '/ws/screen',
    });

    this.wss.on('connection', (ws, req) => {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const deviceId = url.searchParams.get('deviceId');

      // deviceId 검증 (Command Injection 방지)
      if (!deviceId || !DEVICE_ID_REGEX.test(deviceId)) {
        ws.close(4001, 'Invalid deviceId');
        return;
      }

      this.addClient(deviceId, ws);

      ws.on('message', (data) => this.handleMessage(deviceId, ws, data));
      ws.on('close', () => this.removeClient(deviceId, ws));
    });
  }

  // ADB screencap으로 스크린 캡처 후 브로드캐스트
  private async captureAndBroadcast(deviceId: string, opts: StreamOptions) {
    const { stdout } = await execAsync(
      `adb -s ${deviceId} exec-out screencap -p`,
      { encoding: 'buffer', maxBuffer: 50 * 1024 * 1024 }
    );

    // Sharp로 리사이즈 + JPEG 변환 (대역폭 최적화)
    const frame = await sharp(stdout)
      .resize({ width: Math.floor(1080 * opts.scale) })
      .jpeg({ quality: opts.quality })
      .toBuffer();

    // 모든 클라이언트에 바이너리 프레임 전송
    for (const client of stream.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(frame, { binary: true });
      }
    }
  }
}
```

**프론트엔드 연결**:
```tsx
// useDeviceConnection.ts
const connectToStream = (deviceId: string) => {
  const ws = new WebSocket(`ws://${window.location.host}/ws/screen?deviceId=${deviceId}`);

  ws.binaryType = 'arraybuffer';  // 바이너리 데이터 수신

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'start', payload: { fps: 10, quality: 70 } }));
  };

  ws.onmessage = (event) => {
    // ArrayBuffer → Blob → Object URL
    const blob = new Blob([event.data], { type: 'image/jpeg' });
    const imageUrl = URL.createObjectURL(blob);
    setScreenshot(imageUrl);
  };

  return ws;
};

// DevicePreview.tsx
<img
  src={screenshot}  // WebSocket에서 수신한 이미지 URL
  alt="Device Screen"
  onClick={handleScreenClick}  // 클릭 시 좌표 캡처
/>
```

### 4.5 테스트 리포트 & 비디오 녹화

**구현 위치**: `backend/src/services/testReportService.ts`, `screenshotEventService.ts`

**리포트 구조**:
```typescript
interface TestReport {
  id: string;
  scenarioId: string;
  scenarioName: string;
  status: 'passed' | 'failed';
  duration: number;
  devices: DeviceReport[];
}

interface DeviceReport {
  deviceId: string;
  steps: StepResult[];
  screenshots: ScreenshotInfo[];
  video?: VideoInfo;
}

interface StepResult {
  nodeId: string;
  nodeType: string;
  status: 'passed' | 'failed' | 'waiting';
  duration: number;
  timestamp: string;
  error?: string;
}
```

**비디오 녹화 (QA Recorder 앱)**:

ADB screenrecord의 3분 제한을 해결하기 위해 별도의 Android 앱(QA Recorder)을 개발했습니다.

```
┌─────────────────────────────────────────────────────────────────┐
│  녹화 방식 비교                                                   │
├─────────────────────────────────────────────────────────────────┤
│  방식            │ 시간 제한 │ Appium 세션 │ 방향 감지          │
├─────────────────────────────────────────────────────────────────┤
│  ADB screenrecord│ 3분       │ 독립적      │ X                  │
│  Appium 녹화     │ 30분      │ 필요        │ X                  │
│  QA Recorder 앱  │ 무제한    │ 독립적      │ O (자동 감지)      │
└─────────────────────────────────────────────────────────────────┘
```

**QA Recorder 앱 구조** (`qa-recorder-app/`):
```kotlin
// RecorderService.kt - Android Foreground Service
class RecorderService : Service() {
  private var mediaProjection: MediaProjection? = null
  private var recordingManager: RecordingManager? = null

  // 녹화 시작 (ADB 브로드캐스트로 트리거)
  fun startRecording(filename: String, bitrate: Int, resolution: String) {
    val (width, height) = parseResolution(resolution)
    val outputPath = recordingManager!!.startRecording(filename, width, height, bitrate)
    writeResult("recording", true, outputPath)  // 결과를 파일로 기록
  }
}

// RecordingManager.kt - MediaRecorder 기반 화면 녹화
class RecordingManager(context: Context, mediaProjection: MediaProjection) {
  fun startRecording(filename: String, width: Int, height: Int, bitrate: Int): String {
    mediaRecorder = MediaRecorder().apply {
      setVideoSource(MediaRecorder.VideoSource.SURFACE)
      setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
      setVideoEncoder(MediaRecorder.VideoEncoder.H264)
      setVideoEncodingBitRate(bitrate)
      setVideoFrameRate(30)
      setVideoSize(width, height)
    }
    virtualDisplay = mediaProjection.createVirtualDisplay(...)
    mediaRecorder?.start()
  }
}
```

**Backend 연동** (`backend/src/services/videoAnalyzer/screenRecorder.ts`):
```typescript
class ScreenRecorder {
  // QA Recorder 앱으로 녹화 시작
  private async startDeviceAppRecording(deviceId: string, sessionId: string, options: RecordingOptions) {
    // ADB로 앱 서비스 호출
    const command = `adb -s ${deviceId} shell am startservice \
      -a com.qaautomation.recorder.START_RECORDING \
      --es filename ${filename} \
      --ei bitrate ${bitrate} \
      -n com.qaautomation.recorder/.RecorderService`;

    await execAsync(command);

    // 결과 파일 폴링 (앱이 결과를 파일로 기록)
    const resultPath = '/storage/emulated/0/Android/data/com.qaautomation.recorder/files/results/result.json';
    const result = await this.pollForResult(deviceId, resultPath, 'recording');

    return { success: result.success, sessionId };
  }

  // 녹화 중지 후 파일 가져오기
  async stopRecording(deviceId: string) {
    await execAsync(`adb -s ${deviceId} shell am startservice \
      -a com.qaautomation.recorder.STOP_RECORDING \
      -n com.qaautomation.recorder/.RecorderService`);

    // 디바이스에서 로컬로 파일 복사
    await execAsync(`adb -s ${deviceId} pull "${remotePath}" "${localPath}"`);
  }
}
```

**통신 흐름**:
```
Backend                      ADB                    QA Recorder App
   │                          │                           │
   │─── am startservice ─────►│──── Intent ──────────────►│
   │    (START_RECORDING)     │                           │
   │                          │                           │── 녹화 시작
   │                          │                           │
   │◄── poll result.json ─────│◄─── 파일 쓰기 ────────────│
   │                          │                           │
   │─── am startservice ─────►│──── Intent ──────────────►│
   │    (STOP_RECORDING)      │                           │
   │                          │                           │── 녹화 중지
   │◄── poll result.json ─────│◄─── 파일 쓰기 ────────────│
   │                          │                           │
   │─── adb pull ────────────►│◄─── video.mp4 ───────────│
```

### 4.6 Suite 실행 (다중 시나리오)

**구현 위치**: `backend/src/services/suiteExecutor.ts`, `suiteService.ts`

여러 시나리오를 묶어서 한 번에 실행하는 기능입니다.

**Suite 구조**:
```typescript
interface TestSuite {
  id: string;
  name: string;
  description?: string;
  scenarioIds: string[];     // 실행할 시나리오 목록
  deviceIds: string[];       // 실행할 디바이스 목록
  createdAt: string;
  updatedAt: string;
}
```

**실행 흐름**:
```
┌─────────────────────────────────────────────────────────────────┐
│                        Suite 실행 흐름                           │
│                                                                 │
│  Suite: [시나리오A, 시나리오B, 시나리오C]                          │
│  Devices: [Device1, Device2]                                    │
│                                                                 │
│  Device1 (병렬) ──┬── 시나리오A → 시나리오B → 시나리오C (순차)     │
│                   │                                             │
│  Device2 (병렬) ──┴── 시나리오A → 시나리오B → 시나리오C (순차)     │
│                                                                 │
│  ※ 디바이스 간: 병렬 실행                                        │
│  ※ 디바이스 내: 시나리오 순차 실행                                │
└─────────────────────────────────────────────────────────────────┘
```

**핵심 구현**:
```typescript
// suiteExecutor.ts
class SuiteExecutor {
  async execute(
    suiteId: string,
    options: SuiteExecutionOptions = {}
  ): Promise<SuiteExecutionResult> {
    const suite = await suiteService.getSuiteById(suiteId);

    // 디바이스 잠금 획득
    const lockResult = deviceLockService.lockDevices(
      suite.deviceIds,
      executionId,
      options.requesterName || 'system'
    );

    if (!lockResult.success) {
      throw new Error(`디바이스 사용 중: ${lockResult.busyDevices}`);
    }

    try {
      // 디바이스별 병렬 실행
      const deviceResults = await Promise.allSettled(
        suite.deviceIds.map(deviceId =>
          this.executeOnDevice(suite, deviceId, options)
        )
      );

      // Slack 알림 (설정된 경우)
      await slackNotificationService.sendSuiteResult(result);

      return result;
    } finally {
      // 디바이스 잠금 해제
      deviceLockService.unlockDevices(suite.deviceIds, executionId);
    }
  }

  // 단일 디바이스에서 시나리오 순차 실행
  private async executeOnDevice(
    suite: TestSuite,
    deviceId: string,
    options: SuiteExecutionOptions
  ): Promise<DeviceSuiteResult> {
    const results: ScenarioSuiteResult[] = [];

    for (const scenarioId of suite.scenarioIds) {
      // 시나리오 간격 대기
      if (options.scenarioInterval && results.length > 0) {
        await this.sleep(options.scenarioInterval);
      }

      const result = await this.executeScenario(scenarioId, deviceId);
      results.push(result);

      // 실시간 진행률 브로드캐스트
      eventEmitter.emit(SUITE_EVENTS.SCENARIO_COMPLETE, {
        suiteId: suite.id,
        deviceId,
        scenarioResult: result
      });
    }

    return { deviceId, scenarios: results };
  }
}
```

### 4.7 디바이스 잠금 & 대기열

**구현 위치**: `backend/src/services/deviceLockService.ts`, `testQueueService.ts`

다중 사용자 환경에서 디바이스 리소스 충돌을 방지합니다.

**디바이스 잠금 흐름**:
```
┌───────────────────────────────────────────────────────────────────┐
│  사용자 A                              사용자 B                    │
│     │                                     │                       │
│     │── 테스트 요청 (Device1) ──►         │                       │
│     │                                     │                       │
│     │◄── 잠금 획득, 실행 시작            │                       │
│     │                                     │                       │
│     │    [Device1: A가 사용 중]           │── 테스트 요청 (Device1)│
│     │                                     │                       │
│     │                                     │◄── 대기열 추가        │
│     │                                     │    (예상 대기: 3분)    │
│     │                                     │                       │
│     │── 테스트 완료 ──►                   │                       │
│     │                                     │                       │
│     │◄── 잠금 해제                        │◄── 자동 실행 시작     │
└───────────────────────────────────────────────────────────────────┘
```

**DeviceLockService**:
```typescript
class DeviceLockService {
  private locks: Map<string, DeviceLock> = new Map();

  // 디바이스 잠금 시도
  lockDevices(
    deviceIds: string[],
    executionId: string,
    userName: string
  ): { success: boolean; busyDevices?: string[] } {
    // 이미 잠긴 디바이스 확인
    const busyDevices = deviceIds.filter(id => this.locks.has(id));

    if (busyDevices.length > 0) {
      return { success: false, busyDevices };
    }

    // 모든 디바이스 잠금
    for (const deviceId of deviceIds) {
      this.locks.set(deviceId, {
        deviceId,
        executionId,
        lockedBy: userName,
        lockedAt: new Date()
      });
    }

    this.broadcastLockStatus();  // 실시간 UI 업데이트
    return { success: true };
  }

  // 잠금 해제
  unlockDevices(deviceIds: string[], executionId: string): void {
    for (const deviceId of deviceIds) {
      const lock = this.locks.get(deviceId);
      if (lock?.executionId === executionId) {
        this.locks.delete(deviceId);
      }
    }
    this.broadcastLockStatus();
  }
}
```

**TestQueueService** (대기열 관리):
```typescript
class TestQueueService {
  private queue: ExecutionRequest[] = [];

  // 대기열에 추가 (우선순위 기반)
  addToQueue(request: ExecutionRequest): number {
    const position = this.insertByPriority(request);
    this.broadcastQueueStatus();
    return position;
  }

  // 예상 대기 시간 계산
  getEstimatedWaitTime(position: number): number {
    const avgTime = this.avgScenarioTime || 60000; // 기본 1분
    return position * avgTime;
  }

  // 다음 실행 가능한 요청 가져오기
  getNextExecutable(availableDevices: string[]): ExecutionRequest | null {
    return this.queue.find(req =>
      req.deviceIds.every(id => availableDevices.includes(id))
    );
  }
}
```

### 4.8 메트릭 대시보드

**구현 위치**: `backend/src/services/metricsCollector.ts`, `metricsAggregator.ts`, `metricsDatabase.ts`

테스트 실행 데이터를 수집, 집계, 시각화합니다.

**메트릭 수집 파이프라인**:
```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ testExecutor │────►│metricsCollector│──►│metricsDatabase│──►│metricsAggregator│
│  (실행 완료)  │     │  (데이터 수집) │     │  (JSON 저장)  │     │  (통계 계산)  │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
                                                                       │
                                                                       ▼
                                                              ┌──────────────┐
                                                              │ MetricsDashboard │
                                                              │    (React)       │
                                                              └──────────────┘
```

**수집되는 메트릭**:
| 카테고리 | 메트릭 | 용도 |
|---------|--------|------|
| 실행 통계 | 총 실행 수, 성공/실패 수 | 전체 현황 파악 |
| 성공률 | 일별/주별 성공률 추이 | 품질 트렌드 분석 |
| 실행 시간 | 평균/최대/최소 실행 시간 | 성능 모니터링 |
| 실패 분석 | 실패 유형별 분류 (이미지/텍스트/타임아웃) | 문제 원인 파악 |
| 디바이스별 | 디바이스별 성공률, 실행 횟수 | 디바이스 건강 상태 |

**Frontend 대시보드** (`frontend/src/components/MetricsDashboard/`):
```tsx
// 성공률 추이 차트 (Recharts)
<LineChart data={dailyMetrics}>
  <Line dataKey="successRate" stroke="#00FF00" name="성공률 %" />
  <XAxis dataKey="date" />
  <YAxis domain={[0, 100]} />
</LineChart>

// 실패 유형 파이 차트
<PieChart>
  <Pie data={failureCategories} dataKey="count" nameKey="category" />
</PieChart>
```

---

## 5. 코드 구조

### 5.1 전체 디렉토리

```
game-automation-tool/
├── backend/                    # Express API 서버
│   ├── src/
│   │   ├── index.ts           # 앱 엔트리포인트
│   │   ├── appium/            # Appium 관련
│   │   │   ├── driver.ts      # 드라이버 설정
│   │   │   └── actions/       # 디바이스 액션
│   │   │       ├── tap.ts
│   │   │       ├── swipe.ts
│   │   │       ├── text.ts
│   │   │       └── ...
│   │   ├── services/          # 비즈니스 로직
│   │   │   ├── testExecutor.ts
│   │   │   ├── testOrchestrator.ts
│   │   │   ├── sessionManager.ts
│   │   │   ├── deviceManager.ts
│   │   │   ├── imageMatch.ts
│   │   │   ├── textMatcher/
│   │   │   └── execution/     # 실행 관련 모듈
│   │   ├── routes/            # API 라우트
│   │   ├── middleware/        # 미들웨어
│   │   ├── schemas/           # Zod 스키마
│   │   └── types/             # 타입 정의
│   ├── scenarios/             # 시나리오 JSON
│   ├── templates/             # 이미지 템플릿
│   └── reports/               # 테스트 리포트
│
├── frontend/                   # React 웹 클라이언트
│   ├── src/
│   │   ├── main.tsx           # 앱 엔트리포인트
│   │   ├── App.tsx            # 메인 컴포넌트
│   │   ├── components/        # UI 컴포넌트
│   │   │   ├── Canvas/        # 노드 에디터
│   │   │   ├── Panel/         # 속성 패널
│   │   │   ├── DevicePreview/ # 디바이스 미리보기
│   │   │   ├── ExecutionCenter/
│   │   │   ├── TestReports/
│   │   │   └── ...
│   │   ├── contexts/          # React Context
│   │   ├── hooks/             # 커스텀 훅
│   │   └── types/             # 타입 정의
│   └── vite.config.ts
│
├── server-manager/             # Electron 서버 관리 앱
│   ├── electron/              # 메인 프로세스
│   └── src/                   # React UI
│
├── qa-recorder-app/            # Android 녹화 앱 (Kotlin)
│   └── app/src/main/java/com/qaautomation/recorder/
│       ├── MainActivity.kt    # 권한 요청 UI
│       ├── RecorderService.kt # Foreground Service
│       ├── RecordingManager.kt# MediaRecorder 관리
│       ├── ScreenshotManager.kt# 스크린샷 캡처
│       └── OpenCVTemplateManager.kt # 온디바이스 템플릿 매칭
│
├── shared/                     # 공유 타입
│   └── types/
│
└── docs/                       # Wiki 문서
```

### 5.2 Backend 핵심 모듈

| 모듈 | 파일 | 역할 |
|------|------|------|
| **testOrchestrator** | `services/testOrchestrator.ts` | 테스트 요청 수신, 큐 관리, 디스패치 |
| **testExecutor** | `services/testExecutor.ts` | 시나리오 노드 순회 및 실행 |
| **suiteExecutor** | `services/suiteExecutor.ts` | Suite 실행 (다중 시나리오) |
| **sessionManager** | `services/sessionManager.ts` | Appium 세션 생명주기 관리 |
| **deviceManager** | `services/deviceManager.ts` | ADB 디바이스 탐색, 상태 모니터링 |
| **deviceLockService** | `services/deviceLockService.ts` | 디바이스 잠금 (다중 사용자) |
| **testQueueService** | `services/testQueueService.ts` | 테스트 대기열 관리 |
| **imageMatch** | `services/imageMatch.ts` | OpenCV 템플릿 매칭 |
| **textMatcher** | `services/textMatcher/` | OCR 텍스트 인식 |
| **metricsCollector** | `services/metricsCollector.ts` | 실행 메트릭 수집 |
| **r2Storage** | `services/r2Storage.ts` | Cloudflare R2 파일 저장 |
| **Actions** | `appium/actions/` | 디바이스 액션 (tap, swipe 등) |

### 5.3 Frontend Context 구조

```
App.tsx
├── AuthContext           # 인증 상태
│   └── user, isAuthenticated, login(), logout()
│
├── DeviceContext         # 디바이스 상태 (10초 폴링)
│   └── devices, sessions, startSession(), stopSession()
│
├── ExecutionContext      # 실행 상태 (3초 폴링)
│   └── queueStatus, executeTest(), stopExecution()
│
├── UIContext             # UI 상태
│   └── activeTab, modals
│
├── FlowEditorContext     # 노드 편집
│   └── nodes, connections, selectedNode, addNode()
│
├── ScenarioEditorContext # 시나리오 관리
│   └── scenarios, packages, templates, save(), load()
│
└── EditorPreviewContext  # 프리뷰 상태
    └── previewDevice, highlight
```

---

## 6. 주요 코드 설명

### 6.1 노드 실행 엔진 (testExecutor.ts)

시나리오의 노드를 순회하며 실행하는 핵심 로직입니다.
실행 로직은 `execution/` 모듈로 분리되어 있습니다.

```typescript
// backend/src/services/testExecutor.ts

class TestExecutor {
  private activeExecutions: Map<string, ExecutionState> = new Map();

  /**
   * 단일 노드 실행 (에디터 테스트용)
   */
  async executeSingleNode(
    deviceId: string,
    node: ExecutionNode,
    appPackage: string = 'com.example.app'
  ): Promise<{ success: boolean; error?: string; result?: ActionResult }> {
    const actions = sessionManager.getActions(deviceId);
    if (!actions) {
      return { success: false, error: '세션이 없습니다.' };
    }

    try {
      // start/end 노드는 스킵
      if (node.type === 'start' || node.type === 'end') {
        return { success: true, result: null };
      }

      // 액션 노드 실행 (ActionExecutionService로 위임)
      if (node.type === 'action') {
        const result = await this.executeActionNode(actions, node, appPackage);
        return { success: true, result };
      }

      // 조건 노드: ActionExecutionService로 위임
      if (node.type === 'condition') {
        const conditionResult = await actionExecutionService.evaluateCondition(
          actions,
          node
        );
        return {
          success: true,
          result: {
            success: true,
            conditionResult: conditionResult.passed,
            branch: conditionResult.passed ? 'yes' : 'no'
          }
        };
      }

      return { success: true, result: null };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  /**
   * 조건 노드 평가 (ActionExecutionService로 위임)
   */
  private async evaluateCondition(
    actions: Actions,
    node: ExecutionNode
  ): Promise<boolean> {
    const result = await actionExecutionService.evaluateCondition(actions, node);
    return result.passed;
  }
}

// backend/src/services/execution/ActionExecutionService.ts

class ActionExecutionService {
  /**
   * 조건 노드 평가
   */
  async evaluateCondition(
    actions: Actions,
    node: ExecutableNode
  ): Promise<ConditionEvaluationResult> {
    const params = node.params || node.data || {};
    const conditionType = params.conditionType as string;
    const deviceId = actions.getDeviceId();

    switch (conditionType) {
      case 'elementExists': {
        const result = await actions.elementExists(
          params.selector,
          params.selectorType
        );
        return { passed: result.exists };
      }

      case 'imageExists':
      case 'imageNotExists': {
        const result = await actions.imageExists(params.templateId, {
          threshold: params.threshold,
          region: params.region
        });
        const expectExists = conditionType === 'imageExists';
        return { passed: expectExists ? result.exists : !result.exists };
      }

      case 'ocrTextExists':
      case 'ocrTextNotExists': {
        const result = await actions.ocrTextExists(params.text, {
          matchType: params.matchType || 'contains',
          caseSensitive: params.caseSensitive,
          region: params.region
        });
        const expectExists = conditionType === 'ocrTextExists';
        return { passed: expectExists ? result.exists : !result.exists };
      }

      default:
        return { passed: true };
    }
  }
}
```

### 6.2 이미지 매칭 서비스 (imageMatch.ts)

```typescript
// backend/src/services/imageMatch.ts

class ImageMatchService {
  /**
   * 템플릿 이미지 매칭
   * @param screenshotBuffer - 현재 화면 스크린샷 (Buffer)
   * @param templateId - 템플릿 ID (templates.json에서 관리)
   * @param options - 매칭 옵션 (threshold, region, multiScale 등)
   */
  async matchTemplate(
    screenshotBuffer: Buffer,
    templateId: string,
    options: ImageMatchOptions = {}
  ): Promise<MatchResult> {
    const { threshold = 0.9, region, multiScale, grayscale = false } = options;

    // 1. 템플릿 정보 조회
    const template = this.getTemplate(templateId);
    if (!template) {
      throw new Error(`템플릿을 찾을 수 없습니다: ${templateId}`);
    }

    const templatePath = this.getTemplatePath(template);
    const templateBuffer = fs.readFileSync(templatePath);

    // 2. Sharp로 이미지 전처리
    let screenshotSharp = sharp(screenshotBuffer);
    const screenshotMetadata = await sharp(screenshotBuffer).metadata();
    const screenshotSize = {
      width: screenshotMetadata.width || 0,
      height: screenshotMetadata.height || 0,
    };

    // 3. ROI (Region of Interest) 처리
    let absoluteRegion: Region | undefined;
    if (region) {
      // 상대 좌표(0~1)를 절대 좌표로 변환
      absoluteRegion = this.convertRegionToAbsolute(
        region,
        screenshotSize.width,
        screenshotSize.height
      );

      screenshotSharp = screenshotSharp.extract({
        left: absoluteRegion.x,
        top: absoluteRegion.y,
        width: absoluteRegion.width,
        height: absoluteRegion.height,
      });
    }

    // 4. OpenCV 템플릿 매칭 (내부 메서드)
    let result: MatchResult;
    if (multiScale?.enabled) {
      result = await this.findBestMatchMultiScale(
        await screenshotSharp.png().toBuffer(),
        templateBuffer,
        threshold,
        absoluteRegion,
        multiScale
      );
    } else {
      result = await this.matchTemplateOpenCV(
        await screenshotSharp.png().toBuffer(),
        templateBuffer,
        threshold,
        absoluteRegion
      );
    }

    // 5. 성능 메트릭 추가
    result.metrics = {
      matchTime: Date.now() - startTime,
      templateId,
      templateName: template.name,
      threshold,
      roiUsed: !!region,
      screenshotSize,
    };

    return result;
  }

  /**
   * 하이라이트 스크린샷 생성
   */
  async createHighlightedScreenshot(
    screenshot: Buffer,
    matchResult: MatchResult,
    options: HighlightOptions = {}
  ): Promise<Buffer> {
    const { color = '#00FF00', strokeWidth = 4 } = options;

    if (!matchResult.found) {
      return screenshot;
    }

    const { x, y, width, height } = matchResult.location;

    // SVG 오버레이 생성
    const overlay = Buffer.from(`
      <svg width="${width + strokeWidth * 2}" height="${height + strokeWidth * 2}">
        <rect
          x="${strokeWidth / 2}"
          y="${strokeWidth / 2}"
          width="${width}"
          height="${height}"
          fill="none"
          stroke="${color}"
          stroke-width="${strokeWidth}"
        />
      </svg>
    `);

    // 스크린샷에 오버레이 합성
    return sharp(screenshot)
      .composite([{
        input: overlay,
        left: x - strokeWidth / 2,
        top: y - strokeWidth / 2
      }])
      .png()
      .toBuffer();
  }
}
```

### 6.3 세션 관리 (sessionManager.ts)

```typescript
// backend/src/services/sessionManager.ts

// 세션 정보 (types/index.ts)
interface SessionInfo {
  deviceId: string;
  sessionId: string;
  appiumPort: number;
  mjpegPort: number;
  createdAt: Date;
  status: 'active' | 'idle' | 'error';
}

// 관리되는 세션 (내부)
interface ManagedSession {
  driver: Browser;           // WebdriverIO Browser 인스턴스
  actions: Actions;          // 디바이스 액션 인스턴스
  info: SessionInfo;         // 세션 정보
}

class SessionManager {
  private sessions: Map<string, ManagedSession> = new Map();
  private nextAppiumPort = 4723;
  private nextMjpegPort = 9100;

  /**
   * Appium 세션 생성
   */
  async createSession(deviceId: string): Promise<ManagedSession> {
    // 이미 세션이 있으면 반환
    if (this.sessions.has(deviceId)) {
      return this.sessions.get(deviceId)!;
    }

    const appiumPort = this.nextAppiumPort++;
    const mjpegPort = this.nextMjpegPort++;

    // WebdriverIO Capabilities 설정
    const capabilities = {
      platformName: 'Android',
      'appium:deviceName': deviceId,
      'appium:udid': deviceId,
      'appium:automationName': 'UiAutomator2',
      'appium:noReset': true,
      'appium:mjpegServerPort': mjpegPort,
      'appium:newCommandTimeout': 300
    };

    // WebdriverIO 드라이버 생성
    const driver = await remote({
      hostname: 'localhost',
      port: 4900,  // Appium 서버 포트
      path: '/',
      capabilities
    });

    // Actions 인스턴스 생성 (드라이버 주입)
    const actions = new Actions(
      () => driver,  // DriverProvider
      deviceId
    );

    const session: ManagedSession = {
      driver,
      actions,
      info: {
        deviceId,
        sessionId: driver.sessionId,
        appiumPort,
        mjpegPort,
        status: 'active',
        createdAt: new Date()
      }
    };

    this.sessions.set(deviceId, session);

    console.log(`[SessionManager] Session created for ${deviceId}`);

    return session.info;  // SessionInfo 반환
  }

  /**
   * 세션 종료
   */
  async destroySession(deviceId: string): Promise<void> {
    const session = this.sessions.get(deviceId);
    if (!session) return;

    try {
      await session.driver.deleteSession();
    } catch (error) {
      console.warn(`[SessionManager] Error destroying session: ${error}`);
    }

    this.sessions.delete(deviceId);
    console.log(`[SessionManager] Session destroyed for ${deviceId}`);
  }

  /**
   * Actions 인스턴스 반환
   */
  getActions(deviceId: string): Actions | null {
    return this.sessions.get(deviceId)?.actions || null;
  }

  /**
   * 드라이버 반환
   */
  getDriver(deviceId: string): Browser | null {
    return this.sessions.get(deviceId)?.driver || null;
  }
}

export const sessionManager = new SessionManager();
```

### 6.4 디바이스 액션 (Actions 클래스)

Actions 클래스는 기능별로 분리된 서브 클래스에 위임합니다.

```typescript
// backend/src/appium/actions/index.ts

type DriverProvider = () => Promise<Browser>;

export class Actions {
  // 서브 클래스 (기능별 분리)
  private touchActions: TouchActions;
  private elementActions: ElementActions;
  private textActions: TextActions;
  private imageActions: ImageActions;
  private waitActions: WaitActions;
  private appActions: AppActions;
  private deviceActions: DeviceActions;

  constructor(
    private driverProvider: DriverProvider,
    private deviceId: string
  ) {
    // 각 서브 클래스에 드라이버 프로바이더 주입
    this.touchActions = new TouchActions(driverProvider, deviceId);
    this.elementActions = new ElementActions(driverProvider, deviceId);
    this.textActions = new TextActions(driverProvider, deviceId);
    this.imageActions = new ImageActions(driverProvider, deviceId);
    this.waitActions = new WaitActions(driverProvider, deviceId);
    this.appActions = new AppActions(driverProvider, deviceId);
    this.deviceActions = new DeviceActions(driverProvider, deviceId);
  }

  // 터치 액션 (TouchActions로 위임)
  async tap(x: number, y: number) {
    return this.touchActions.tap(x, y);
  }

  async longPress(x: number, y: number, duration?: number) {
    return this.touchActions.longPress(x, y, duration);
  }

  async swipe(startX: number, startY: number, endX: number, endY: number, duration?: number) {
    return this.touchActions.swipe(startX, startY, endX, endY, duration);
  }

  // 이미지 액션 (ImageActions로 위임)
  async tapImage(templateId: string, options?: ImageMatchOptions) {
    return this.imageActions.tapImage(templateId, options);
  }

  async imageExists(templateId: string, options?: ImageMatchOptions) {
    return this.imageActions.imageExists(templateId, options);
  }

  // 대기 액션 (WaitActions로 위임)
  async waitUntilImage(templateId: string, timeout?: number, options?: ImageMatchOptions) {
    return this.waitActions.waitUntilImage(templateId, timeout, options);
  }

  async waitUntilImageGone(templateId: string, timeout?: number, options?: ImageMatchOptions) {
    return this.waitActions.waitUntilImageGone(templateId, timeout, options);
  }

  // OCR 액션 (TextActions로 위임)
  async ocrTextExists(text: string, options?: OcrOptions) {
    return this.textActions.ocrTextExists(text, options);
  }

  async tapTextOcr(text: string, options?: OcrOptions) {
    return this.textActions.tapTextOcr(text, options);
  }

  // 앱 액션 (AppActions로 위임)
  async launchApp(packageName: string) {
    return this.appActions.launchApp(packageName);
  }

  async terminateApp(packageName: string) {
    return this.appActions.terminateApp(packageName);
  }

  // 유틸리티
  getDeviceId(): string {
    return this.deviceId;
  }

  reset(): void {
    this.touchActions.reset();
    this.waitActions.reset();
    // ... 각 서브 클래스 리셋
  }
}

// backend/src/appium/actions/touch.ts

export class TouchActions extends ActionsBase {
  async tap(x: number, y: number, options: RetryOptions = {}): Promise<ActionResult> {
    const tapX = Math.floor(x);
    const tapY = Math.floor(y);

    return this.withRetry(async () => {
      const driver = await this.getDriver();

      console.log(`[${this.deviceId}] 탭 실행: (${tapX}, ${tapY})`);

      await driver
        .action('pointer', { parameters: { pointerType: 'touch' } })
        .move({ x: tapX, y: tapY })
        .down()
        .up()
        .perform();

      return { success: true, action: 'tap', x: tapX, y: tapY };
    }, options);
  }

  async swipe(
    startX: number, startY: number,
    endX: number, endY: number,
    duration: number = 300
  ): Promise<ActionResult> {
    return this.withRetry(async () => {
      const driver = await this.getDriver();

      console.log(`[${this.deviceId}] 스와이프: (${startX},${startY}) → (${endX},${endY})`);

      await driver
        .action('pointer', { parameters: { pointerType: 'touch' } })
        .move({ x: startX, y: startY })
        .down()
        .move({ x: endX, y: endY, duration })
        .up()
        .perform();

      return { success: true, action: 'swipe' };
    });
  }
}
```

### 6.5 실시간 통신 (Socket.IO)

```typescript
// backend/src/index.ts

import { Server as SocketIOServer } from 'socket.io';

const io = new SocketIOServer(httpServer, {
  cors: { origin: '*' }
});

// 테스트 실행 서비스에 Socket.IO 인스턴스 전달
testOrchestrator.setSocketIO(io);

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // 디바이스 상태 구독
  socket.on('subscribe:device', (deviceId: string) => {
    socket.join(`device:${deviceId}`);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// 테스트 진행률 브로드캐스트 예시
// testExecutor.ts에서 호출
this.io.emit('test:progress', {
  executionId,
  deviceId,
  progress: (completedSteps / totalSteps) * 100,
  currentStep: completedSteps,
  totalSteps
});

this.io.emit('test:step', {
  executionId,
  deviceId,
  step: {
    nodeId: node.id,
    status: 'passed',
    duration: 1500
  }
});

this.io.emit('test:complete', {
  executionId,
  deviceId,
  status: 'passed',
  duration: totalDuration
});
```

---

## 7. 설치 및 실행

### 7.1 사전 요구사항

| 항목 | 버전 | 설치 명령 |
|------|------|----------|
| Node.js | 22.x LTS | https://nodejs.org |
| JDK | 17+ | `choco install openjdk17` |
| Android SDK | - | Android Studio 설치 |
| Appium | 2.x | `npm install -g appium` |
| UiAutomator2 | - | `appium driver install uiautomator2` |
| OpenCV | 4.x | `choco install opencv` |
| FFmpeg | - | `choco install ffmpeg` |

### 7.2 QA Recorder 앱 설치 (필수)

QA Recorder는 테스트 대상 디바이스에 **반드시 설치해야 하는 Android 앱**입니다.

#### 역할
| 기능 | 설명 |
|------|------|
| 비디오 녹화 | MediaProjection API로 화면 녹화 (시간 무제한) |
| 스크린샷 캡처 | ADB Broadcast로 스크린샷 촬영 |
| 템플릿 매칭 | 디바이스 내 OpenCV로 이미지 매칭 |

#### APK 빌드 및 설치
```bash
# APK 빌드 (최초 1회)
cd qa-recorder-app
./gradlew assembleDebug
# 결과: app/build/outputs/apk/debug/app-debug.apk

# 디바이스 설치
adb install -r app/build/outputs/apk/debug/app-debug.apk

# 여러 디바이스에 일괄 설치
for device in $(adb devices | grep -w device | cut -f1); do
  adb -s $device install -r app/build/outputs/apk/debug/app-debug.apk
done
```

#### 디바이스 설정 (디바이스별 최초 1회)
1. 디바이스에서 **QA Recorder** 앱 실행
2. **권한 허용** 버튼 클릭 → 저장소, 알림 권한 허용
3. **서비스 시작** 버튼 클릭
4. 화면 녹화 권한 팝업에서 **허용**
5. 상태가 **"준비 완료"**로 변경되면 설정 완료

> ⚠️ **주의**: QA Recorder 서비스가 시작되지 않으면 비디오 녹화 기능이 동작하지 않습니다.

#### 기술 스펙
| 항목 | 값 |
|------|------|
| 패키지명 | `com.qaautomation.recorder` |
| 최소 Android | 5.0 (API 21) |
| 타겟 Android | 14 (API 34) |
| 버전 | 1.1.0 |
| 언어 | Kotlin |

### 7.3 설치

```bash
# 1. 레포지토리 클론
git clone https://github.com/kws0109/QA_Automation.git
cd QA_Automation

# 2. Backend 의존성 설치
cd backend && npm install

# 3. Frontend 의존성 설치
cd ../frontend && npm install

# 4. 환경 변수 설정
cp backend/.env.example backend/.env
# .env 파일 편집
```

### 7.3.1 Google Cloud Vision API 설정 (OCR 사용 시 필수)

OCR 텍스트 인식 기능(`tapOcrText`, `waitUntilTextExists` 등)을 사용하려면 Google Cloud Vision API 설정이 필요합니다.

#### 설정 단계
1. [Google Cloud Console](https://console.cloud.google.com) 접속
2. 프로젝트 생성 또는 기존 프로젝트 선택
3. **APIs & Services** > **Library** > "Cloud Vision API" 검색 후 **Enable**
4. **APIs & Services** > **Credentials** > **Create Credentials** > **Service Account**
5. 서비스 계정 이름 입력 후 생성
6. 생성된 서비스 계정 클릭 > **Keys** 탭 > **Add Key** > **Create new key** > **JSON**
7. 다운로드된 JSON 파일을 `backend/` 폴더에 저장 (예: `google-vision-key.json`)
8. `backend/.env` 파일에 경로 설정:

```bash
GOOGLE_APPLICATION_CREDENTIALS=./google-vision-key.json
```

#### 요금 정보
| 항목 | 무료 티어 | 초과 시 |
|------|----------|--------|
| TEXT_DETECTION | 1,000회/월 | $1.50/1,000회 |

> ⚠️ **주의**: `google-vision-key.json` 파일은 `.gitignore`에 포함되어 있어 Git에 커밋되지 않습니다. 파일을 안전하게 관리하세요.

### 7.4 실행

```bash
# Terminal 1: Appium 서버
appium --port 4900 --allow-insecure=uiautomator2:adb_shell

# Terminal 2: Backend
cd backend && npm run dev

# Terminal 3: Frontend
cd frontend && npm run dev
```

**접속**: http://localhost:5173

### 7.5 Server Manager 사용 (권장)

**Server Manager**는 Backend, Frontend, Appium을 원클릭으로 관리하는 Electron 앱입니다.

```bash
# 개발 모드 실행
cd server-manager && npm install && npm run electron:dev

# Windows EXE 패키징
npm run build
# release/ 폴더에 portable exe 생성
```

**주요 기능:**
- 원클릭 Start All / Stop All
- 실시간 로그 뷰어
- 포트 설정 UI (.env 자동 동기화)
- 시스템 트레이 지원

```typescript
// electron/processManager.ts
export class ProcessManager {
  // 서버 시작 (순차 실행: Backend → Appium → Frontend)
  async startAll(): Promise<void> {
    await this.start('backend');
    await this.start('appium');
    await this.start('frontend');
  }

  // 포트 충돌 사전 체크
  private async isPortInUse(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.once('error', () => resolve(true));
      server.once('listening', () => {
        server.close();
        resolve(false);
      });
      server.listen(port, '127.0.0.1');
    });
  }
}
```

---

## 8. 외부 접근 및 배포

### 8.1 LAN 내부 접근

같은 네트워크의 다른 PC/모바일에서 접근하는 방법:

```
┌─────────────────────────────────────────────────────────────┐
│                      같은 네트워크 (LAN)                      │
│                                                             │
│  ┌─────────────────┐         ┌─────────────────┐           │
│  │   서버 PC       │         │   클라이언트     │           │
│  │  192.168.1.100  │◄───────►│  (다른 PC/모바일) │           │
│  │  Backend :3001  │   HTTP  │  브라우저 접속    │           │
│  │  Frontend:5173  │         │                 │           │
│  └─────────────────┘         └─────────────────┘           │
└─────────────────────────────────────────────────────────────┘
```

**환경변수 설정:**

```bash
# backend/.env
PORT=3001
HOST=0.0.0.0  # 외부 접근 허용 (중요!)

# frontend/.env
VITE_SERVER_HOST=192.168.1.100  # 서버 PC IP
VITE_BACKEND_PORT=3001
```

**방화벽 설정 (Windows):**
```powershell
# PowerShell (관리자 권한)
netsh advfirewall firewall add rule name="QA Backend" dir=in action=allow protocol=TCP localport=3001
netsh advfirewall firewall add rule name="QA Frontend" dir=in action=allow protocol=TCP localport=5173
```

### 8.2 Cloudflare Tunnel (인터넷 접근)

외부 네트워크(인터넷)에서 접근하려면 **Cloudflare Tunnel**을 사용합니다.

```
┌──────────────────────────────────────────────────────────────────┐
│                         인터넷                                    │
│                                                                  │
│  ┌────────────────┐   ┌──────────────┐   ┌─────────────────┐    │
│  │  외부 사용자    │   │  Cloudflare  │   │    서버 PC      │    │
│  │  (어디서든)     │──►│   Edge       │◄──│  cloudflared    │    │
│  │                │   │              │   │  (터널 클라이언트)│    │
│  └────────────────┘   └──────────────┘   └─────────────────┘    │
│        ▲                                          │              │
│        │  HTTPS                                   │ HTTP         │
│        └──────────────────────────────────────────┘              │
│                                                                  │
│   https://qa-automation-tool.dev → localhost:5173                │
│   https://api.qa-automation-tool.dev → localhost:3001            │
└──────────────────────────────────────────────────────────────────┘
```

**Cloudflare Tunnel 설정:**

```bash
# 1. cloudflared 설치 (Windows)
choco install cloudflared

# 2. Cloudflare 로그인
cloudflared tunnel login

# 3. 터널 생성
cloudflared tunnel create qa-automation

# 4. DNS 레코드 추가
cloudflared tunnel route dns qa-automation qa-automation-tool.dev
cloudflared tunnel route dns qa-automation api.qa-automation-tool.dev

# 5. 터널 실행
cloudflared tunnel run qa-automation
```

**config.yml (Cloudflare 설정 파일):**
```yaml
# ~/.cloudflared/config.yml
tunnel: qa-automation
credentials-file: ~/.cloudflared/{tunnel-id}.json

ingress:
  # Frontend
  - hostname: qa-automation-tool.dev
    service: http://localhost:5173
  # Backend API + WebSocket
  - hostname: api.qa-automation-tool.dev
    service: http://localhost:3001
  # Catch-all
  - service: http_status:404
```

**환경변수 설정 (Cloudflare 모드):**
```bash
# frontend/.env
VITE_SERVER_HOST=api.qa-automation-tool.dev
VITE_BACKEND_PORT=443
VITE_API_URL=https://api.qa-automation-tool.dev
VITE_WS_STREAM_URL=wss://api.qa-automation-tool.dev

# backend/.env
SLACK_REDIRECT_URI=https://api.qa-automation-tool.dev/auth/slack/callback
FRONTEND_URL=https://qa-automation-tool.dev
```

**비용:**
| 항목 | 비용 |
|------|------|
| 도메인 (.dev) | ~$12/년 |
| Cloudflare DNS | 무료 |
| Cloudflare Tunnel | 무료 |
| **총합** | **~$12/년** |

### 8.3 동적 API URL 처리

Frontend는 환경에 따라 자동으로 API URL을 결정합니다:

```typescript
// frontend/src/config/api.ts
export const SERVER_HOST =
  import.meta.env.VITE_SERVER_HOST ||   // 환경변수 우선
  window.location.hostname ||            // 브라우저 접속 호스트
  '127.0.0.1';                          // 기본값

export const API_URL =
  import.meta.env.VITE_API_URL ||
  `http://${SERVER_HOST}:${BACKEND_PORT}`;

export const WS_STREAM_URL =
  import.meta.env.VITE_WS_STREAM_URL ||
  `ws://${SERVER_HOST}:${BACKEND_PORT}`;
```

**URL 결정 우선순위:**
```
1. VITE_API_URL (직접 지정)
2. VITE_SERVER_HOST + VITE_BACKEND_PORT (조합)
3. window.location.hostname (브라우저 접속 호스트)
4. 127.0.0.1 (기본값)
```

### 8.4 R2 클라우드 저장소 (리포트 공유)

**구현 위치**: `backend/src/services/r2Storage.ts`, `r2Uploader.ts`

Cloudflare R2를 사용해 테스트 리포트를 클라우드에 저장하고 공유 링크를 생성합니다.

```
┌─────────────────────────────────────────────────────────────────┐
│                       리포트 공유 흐름                            │
│                                                                 │
│  테스트 완료 ──► 리포트 생성 ──► R2 업로드 ──► 공유 URL 생성      │
│                 (HTML/PDF)       (선택적)      https://...       │
│                                                                 │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐    │
│  │ reportExporter│────►│  r2Storage   │────►│ 공개 URL     │    │
│  │ (PDF 생성)    │     │ (R2 업로드)   │     │ qa.r2.dev/..│    │
│  └──────────────┘     └──────────────┘     └──────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

**R2 설정:**
```bash
# backend/.env
R2_ENABLED=true
R2_ACCOUNT_ID=your-account-id
R2_ACCESS_KEY_ID=your-access-key
R2_SECRET_ACCESS_KEY=your-secret-key
R2_BUCKET_NAME=qa-reports
R2_PUBLIC_URL=https://qa-reports.r2.dev
```

**핵심 구현:**
```typescript
// r2Storage.ts
class R2StorageService {
  private client: S3Client;

  async uploadHTML(reportId: string, html: string): Promise<string> {
    const key = `reports/${reportId}/report.html`;

    await this.client.send(new PutObjectCommand({
      Bucket: this.config.bucketName,
      Key: key,
      Body: html,
      ContentType: 'text/html'
    }));

    return this.getPublicUrl(key);
  }

  async uploadVideo(reportId: string, deviceId: string, buffer: Buffer): Promise<string> {
    const key = `reports/${reportId}/videos/${deviceId}.mp4`;

    await this.client.send(new PutObjectCommand({
      Bucket: this.config.bucketName,
      Key: key,
      Body: buffer,
      ContentType: 'video/mp4'
    }));

    return this.getPublicUrl(key);
  }

  getPublicUrl(key: string): string {
    return `${this.config.publicUrl}/${key}`;
  }
}
```

**비용:**
| 항목 | Cloudflare R2 |
|------|--------------|
| 저장소 | 10GB 무료, 이후 $0.015/GB/월 |
| 읽기 | 무료 (egress 무료) |
| 쓰기 | 100만 요청 무료 |

---

## 9. 테스트 방법

### 9.1 단위 테스트

```bash
# Frontend
cd frontend && npm run test

# 커버리지
npm run test:coverage
```

### 9.2 빌드 검증

```bash
# Backend 타입 체크 + 빌드
cd backend && npm run typecheck && npm run build

# Frontend 린트 + 빌드
cd frontend && npm run lint && npm run build
```

### 9.3 E2E 테스트 시나리오

1. **디바이스 연결 확인**
   - ADB 연결된 디바이스가 목록에 표시되는지
   - 세션 시작/종료 동작

2. **시나리오 편집**
   - 노드 추가, 연결, 삭제
   - 속성 편집
   - 저장/불러오기

3. **테스트 실행**
   - 단일 디바이스 실행
   - 다중 디바이스 병렬 실행
   - 실시간 진행률 표시

4. **리포트 확인**
   - 스크린샷 표시
   - 비디오 재생
   - HTML/PDF 내보내기

---

## 10. 성능 최적화

### 10.1 Frontend 최적화

| 기법 | 적용 위치 | 효과 |
|------|----------|------|
| **Context 분리** | 7개 Context | 불필요한 리렌더링 방지 |
| **폴링 통합** | DeviceContext, useQueueStatus | API 호출 76% 감소 |
| **가상화 렌더링** | react-window (스크린샷 그리드) | DOM 노드 85% 감소 |
| **썸네일** | WebP 300px | 이미지 용량 90% 감소 |
| **탭 캐싱** | CSS display:none | 탭 전환 즉시 반응 |

### 10.2 Backend 최적화

| 기법 | 적용 위치 | 효과 |
|------|----------|------|
| **Rate Limiting** | 5가지 리미터 | 서버 과부하 방지 |
| **ROI 적용** | 이미지 매칭 | 검색 영역 제한으로 속도 향상 |
| **Fire-and-forget** | 썸네일 생성 | 메인 플로우 블로킹 방지 |
| **세션 재사용** | sessionManager | Appium 세션 생성 오버헤드 제거 |

### 10.3 성능 측정 결과

| 지표 | Before | After |
|------|--------|-------|
| 스크린샷 100장 로드 | 50MB, 5초 | 225KB, 0.3초 |
| DOM 노드 (100장 그리드) | 100개 | 15개 |
| API 폴링 (5명 접속) | 150회/분 | 36회/분 |
| 탭 전환 | 0.5초 | 즉시 |

---

## 11. 향후 개선 계획

### 11.1 단기 계획

| 항목 | 설명 | 우선순위 |
|------|------|----------|
| iOS 지원 | XCUITest 드라이버 연동 | 높음 |
| 스크린샷 비교 | 이전 실행과 diff 이미지 생성 | 중간 |
| AI 시나리오 생성 | 자연어로 테스트 케이스 생성 | 낮음 |

### 11.2 기술 부채

| 항목 | 현재 상태 | 개선 방안 |
|------|----------|----------|
| React Query | Context API 사용 | API 10개 이상 시 마이그레이션 |
| 테스트 커버리지 | 일부 컴포넌트만 | 핵심 로직 테스트 추가 |
| 에러 핸들링 | 기본 수준 | 체계적인 에러 분류 |

---

## 부록: 주요 타입 정의

```typescript
// 시나리오
interface Scenario {
  id: string;
  name: string;
  packageId: string;
  nodes: Node[];
  connections: Connection[];
}

// 노드
interface Node {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  data: NodeData;
  label?: string;
}

// 디바이스
interface DeviceInfo {
  id: string;
  name: string;
  model: string;
  brand: string;
  androidVersion: string;
  status: 'connected' | 'offline';
  sessionActive: boolean;
}

// 테스트 결과
interface ExecutionResult {
  executionId: string;
  scenarioId: string;
  deviceId: string;
  status: 'passed' | 'failed';
  duration: number;
  steps: StepResult[];
}

// 이미지 매칭 결과
interface MatchResult {
  found: boolean;
  confidence: number;
  location?: { x: number; y: number; width: number; height: number };
  centerX?: number;
  centerY?: number;
}
```

---

## 문의

- **GitHub**: https://github.com/kws0109/QA_Automation
- **Wiki**: https://github.com/kws0109/QA_Automation/wiki

---

*작성일: 2026-01-30*
