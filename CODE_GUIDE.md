# 게임 자동화 도구 - 코드 가이드

## 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [기술 스택 및 선택 이유](#2-기술-스택-및-선택-이유)
3. [시스템 아키텍처](#3-시스템-아키텍처)
4. [핵심 기능 구현](#4-핵심-기능-구현)
5. [코드 구조](#5-코드-구조)
6. [주요 코드 설명](#6-주요-코드-설명)
7. [설치 및 실행](#7-설치-및-실행)
8. [테스트 방법](#8-테스트-방법)
9. [성능 최적화](#9-성능-최적화)
10. [향후 개선 계획](#10-향후-개선-계획)

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
| 실시간 디바이스 미리보기 | MJPEG 스트리밍 | ★★★★☆ |
| 테스트 리포트 & 비디오 | 스크린샷/녹화 자동화 | ★★★☆☆ |
| 스케줄링 | Cron 기반 예약 실행 | ★★☆☆☆ |
| Slack 연동 | OAuth 로그인 + 결과 알림 | ★★★☆☆ |

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
interface FlowEditorState {
  nodes: Node[];           // 노드 목록
  connections: Connection[]; // 연결 목록
  selectedNodeId: string | null;

  // 액션
  addNode: (type: NodeType, position: Position) => void;
  updateNode: (id: string, data: Partial<Node>) => void;
  deleteNode: (id: string) => void;
  addConnection: (source: string, target: string) => void;
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
// imageMatch.ts 핵심 로직
async function matchTemplate(
  screenshot: Buffer,
  template: Buffer,
  options: MatchOptions
): Promise<MatchResult> {
  // 1. 이미지를 OpenCV Mat으로 변환
  const screenMat = cv.imdecode(screenshot);
  const templateMat = cv.imdecode(template);

  // 2. 템플릿 매칭 실행
  const result = screenMat.matchTemplate(
    templateMat,
    cv.TM_CCOEFF_NORMED  // 정규화된 상관계수
  );

  // 3. 최대값(유사도) 및 위치 찾기
  const minMax = result.minMaxLoc();
  const confidence = minMax.maxVal;
  const location = minMax.maxLoc;

  // 4. 임계값 비교
  if (confidence >= options.threshold) {
    return {
      found: true,
      confidence,
      centerX: location.x + templateMat.cols / 2,
      centerY: location.y + templateMat.rows / 2
    };
  }

  return { found: false, confidence };
}
```

**ROI (Region of Interest) 지원**:
```typescript
// 전체 화면이 아닌 특정 영역만 검색 (성능 최적화)
if (options.roi) {
  const { x, y, width, height } = options.roi;
  screenMat = screenMat.getRegion(new cv.Rect(x, y, width, height));
}
```

### 4.3 다중 디바이스 병렬 실행

**구현 위치**: `backend/src/services/sessionManager.ts`, `testOrchestrator.ts`

**세션 관리 아키텍처**:
```
┌─────────────────────────────────────────────────────────────┐
│                     sessionManager                           │
│                                                              │
│  sessions: Map<deviceId, ManagedSession>                    │
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ Device A    │  │ Device B    │  │ Device C    │         │
│  │ Port: 4723  │  │ Port: 4724  │  │ Port: 4725  │         │
│  │ MJPEG: 9100 │  │ MJPEG: 9101 │  │ MJPEG: 9102 │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────┘
```

**병렬 실행 구현**:
```typescript
// testOrchestrator.ts
async executeParallel(
  scenarioId: string,
  deviceIds: string[]
): Promise<ParallelResult> {
  // 각 디바이스별 독립 실행 (Promise.allSettled)
  const results = await Promise.allSettled(
    deviceIds.map(deviceId =>
      this.executeOnDevice(scenarioId, deviceId)
    )
  );

  // 한 디바이스 실패해도 다른 디바이스는 계속 실행
  return {
    results: results.map((r, i) => ({
      deviceId: deviceIds[i],
      success: r.status === 'fulfilled',
      error: r.status === 'rejected' ? r.reason : undefined
    }))
  };
}
```

**디바이스 큐 시스템**:
```typescript
// 디바이스가 사용 중이면 대기열에 추가
interface DeviceQueue {
  deviceId: string;
  queue: ExecutionRequest[];
  currentExecution: string | null;
}

// 실행 완료 시 다음 대기 항목 자동 실행
onExecutionComplete(deviceId: string) {
  const nextRequest = this.queues[deviceId].shift();
  if (nextRequest) {
    this.dispatch(nextRequest);
  }
}
```

### 4.4 실시간 디바이스 미리보기

**구현 위치**: `backend/src/services/screenStreamService.ts`

**MJPEG 스트리밍 구현**:
```typescript
// 디바이스 화면을 MJPEG 스트림으로 전송
class ScreenStreamService {
  async startStream(deviceId: string, res: Response) {
    // HTTP multipart 헤더 설정
    res.writeHead(200, {
      'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    // 주기적으로 스크린샷 캡처 및 전송
    const interval = setInterval(async () => {
      const screenshot = await this.captureScreen(deviceId);

      res.write('--frame\r\n');
      res.write('Content-Type: image/jpeg\r\n\r\n');
      res.write(screenshot);
      res.write('\r\n');
    }, 100); // 10fps

    res.on('close', () => clearInterval(interval));
  }
}
```

**프론트엔드 렌더링**:
```tsx
// DevicePreview.tsx
<img
  src={`/api/sessions/${deviceId}/stream`}
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

**비디오 녹화**:
```typescript
// Appium의 startRecordingScreen 활용
async startRecording(deviceId: string) {
  const driver = sessionManager.getDriver(deviceId);
  await driver.startRecordingScreen({
    videoType: 'mp4',
    videoQuality: 'medium',
    timeLimit: 1800  // 30분 제한
  });
}

async stopRecording(deviceId: string): Promise<string> {
  const driver = sessionManager.getDriver(deviceId);
  const base64Video = await driver.stopRecordingScreen();

  // Base64 → 파일 저장
  const videoPath = `reports/videos/${reportId}/${deviceId}.mp4`;
  await fs.writeFile(videoPath, Buffer.from(base64Video, 'base64'));

  return videoPath;
}
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
| **sessionManager** | `services/sessionManager.ts` | Appium 세션 생명주기 관리 |
| **deviceManager** | `services/deviceManager.ts` | ADB 디바이스 탐색, 상태 모니터링 |
| **imageMatch** | `services/imageMatch.ts` | OpenCV 템플릿 매칭 |
| **textMatcher** | `services/textMatcher/` | OCR 텍스트 인식 |
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

```typescript
// backend/src/services/testExecutor.ts

class TestExecutor {
  /**
   * 시나리오 실행 메인 함수
   */
  async execute(
    scenarioId: string,
    deviceId: string,
    options: ExecutionOptions
  ): Promise<ExecutionResult> {
    const scenario = await this.loadScenario(scenarioId);
    const session = sessionManager.getSession(deviceId);

    // 비디오 녹화 시작
    if (options.recordVideo) {
      await this.startRecording(deviceId);
    }

    // Start 노드 찾기
    const startNode = scenario.nodes.find(n => n.type === 'start');
    let currentNode = this.getNextNode(scenario, startNode.id);

    const results: StepResult[] = [];

    // 노드 순회 실행
    while (currentNode) {
      const stepResult = await this.executeNode(
        currentNode,
        deviceId,
        scenario
      );

      results.push(stepResult);

      // 실시간 진행률 브로드캐스트
      this.io.emit('test:step', {
        executionId: this.executionId,
        deviceId,
        step: stepResult
      });

      // 실패 시 중단
      if (stepResult.status === 'failed') {
        break;
      }

      // 다음 노드로 이동 (조건 분기 처리)
      currentNode = this.getNextNode(
        scenario,
        currentNode.id,
        stepResult.branchResult  // 'yes' | 'no' for condition nodes
      );
    }

    // 비디오 녹화 중지 및 저장
    if (options.recordVideo) {
      await this.stopRecording(deviceId);
    }

    return {
      scenarioId,
      deviceId,
      status: results.every(r => r.status === 'passed') ? 'passed' : 'failed',
      steps: results
    };
  }

  /**
   * 단일 노드 실행
   */
  private async executeNode(
    node: Node,
    deviceId: string,
    scenario: Scenario
  ): Promise<StepResult> {
    const startTime = Date.now();

    try {
      const actions = sessionManager.getActions(deviceId);

      switch (node.type) {
        case 'tap':
          await actions.tap(node.data.x, node.data.y);
          break;

        case 'swipe':
          await actions.swipe(
            node.data.startX, node.data.startY,
            node.data.endX, node.data.endY,
            node.data.duration
          );
          break;

        case 'tapImage':
          const matchResult = await imageMatch.findAndTap(
            deviceId,
            node.data.templateId,
            { threshold: node.data.threshold }
          );
          if (!matchResult.found) {
            throw new Error('Image not found');
          }
          break;

        case 'wait':
          await this.sleep(node.data.duration);
          break;

        case 'waitUntilImage':
          await this.waitForCondition(
            () => imageMatch.exists(deviceId, node.data.templateId),
            node.data.timeout
          );
          break;

        case 'condition':
          return await this.executeCondition(node, deviceId);

        // ... 기타 노드 타입
      }

      // 스크린샷 캡처
      await this.captureScreenshot(deviceId, node.id);

      return {
        nodeId: node.id,
        status: 'passed',
        duration: Date.now() - startTime
      };

    } catch (error) {
      // 에러 스크린샷 캡처
      await this.captureScreenshot(deviceId, node.id, 'error');

      return {
        nodeId: node.id,
        status: 'failed',
        duration: Date.now() - startTime,
        error: error.message
      };
    }
  }

  /**
   * 조건 노드 실행 (분기 처리)
   */
  private async executeCondition(
    node: Node,
    deviceId: string
  ): Promise<StepResult> {
    let conditionMet = false;

    switch (node.data.conditionType) {
      case 'imageExists':
        const result = await imageMatch.match(
          deviceId,
          node.data.templateId
        );
        conditionMet = result.found;
        break;

      case 'textExists':
        const ocrResult = await textMatcher.find(
          deviceId,
          node.data.text
        );
        conditionMet = ocrResult.found;
        break;
    }

    return {
      nodeId: node.id,
      status: 'passed',
      branchResult: conditionMet ? 'yes' : 'no'
    };
  }
}
```

### 6.2 이미지 매칭 서비스 (imageMatch.ts)

```typescript
// backend/src/services/imageMatch.ts

class ImageMatchService {
  /**
   * 템플릿 이미지 매칭
   */
  async match(
    screenshot: Buffer,
    templateId: string,
    options: MatchOptions = {}
  ): Promise<MatchResult> {
    const { threshold = 0.8, roi } = options;

    // 템플릿 이미지 로드
    const templatePath = this.getTemplatePath(templateId);
    const templateBuffer = await fs.readFile(templatePath);

    // Sharp로 이미지 전처리
    let processedScreenshot = sharp(screenshot);
    let processedTemplate = sharp(templateBuffer);

    // ROI 적용 (검색 영역 제한)
    if (roi) {
      processedScreenshot = processedScreenshot.extract({
        left: roi.x,
        top: roi.y,
        width: roi.width,
        height: roi.height
      });
    }

    // Grayscale 변환 (매칭 정확도 향상)
    const screenGray = await processedScreenshot.grayscale().raw().toBuffer();
    const templateGray = await processedTemplate.grayscale().raw().toBuffer();

    // OpenCV 템플릿 매칭
    const screenMat = new cv.Mat(screenGray, screenHeight, screenWidth, cv.CV_8UC1);
    const templateMat = new cv.Mat(templateGray, templateHeight, templateWidth, cv.CV_8UC1);

    const result = new cv.Mat();
    cv.matchTemplate(screenMat, templateMat, result, cv.TM_CCOEFF_NORMED);

    // 최대 유사도 위치 찾기
    const minMax = cv.minMaxLoc(result);
    const confidence = minMax.maxVal;

    if (confidence >= threshold) {
      // 중심 좌표 계산
      const centerX = minMax.maxLoc.x + templateWidth / 2;
      const centerY = minMax.maxLoc.y + templateHeight / 2;

      // ROI 오프셋 적용
      const absoluteX = roi ? centerX + roi.x : centerX;
      const absoluteY = roi ? centerY + roi.y : centerY;

      return {
        found: true,
        confidence,
        location: {
          x: minMax.maxLoc.x + (roi?.x || 0),
          y: minMax.maxLoc.y + (roi?.y || 0),
          width: templateWidth,
          height: templateHeight
        },
        centerX: absoluteX,
        centerY: absoluteY
      };
    }

    return { found: false, confidence };
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

interface ManagedSession {
  deviceId: string;
  driver: Browser;           // WebdriverIO Browser 인스턴스
  actions: Actions;          // 디바이스 액션 인스턴스
  appiumPort: number;
  mjpegPort: number;
  status: 'active' | 'idle' | 'error';
  createdAt: Date;
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
      deviceId,
      driver,
      actions,
      appiumPort,
      mjpegPort,
      status: 'active',
      createdAt: new Date()
    };

    this.sessions.set(deviceId, session);

    console.log(`[SessionManager] Session created for ${deviceId}`);

    return session;
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

```typescript
// backend/src/appium/actions/index.ts

type DriverProvider = () => Browser;

export class Actions {
  constructor(
    private driverProvider: DriverProvider,
    private deviceId: string
  ) {}

  private get driver(): Browser {
    return this.driverProvider();
  }

  /**
   * 화면 탭
   */
  async tap(x: number, y: number): Promise<void> {
    console.log(`[${this.deviceId}] tap(${x}, ${y})`);

    await this.driver.action('pointer')
      .move({ x, y, origin: 'viewport' })
      .down()
      .up()
      .perform();
  }

  /**
   * 길게 누르기
   */
  async longPress(x: number, y: number, duration: number = 1000): Promise<void> {
    console.log(`[${this.deviceId}] longPress(${x}, ${y}, ${duration}ms)`);

    await this.driver.action('pointer')
      .move({ x, y, origin: 'viewport' })
      .down()
      .pause(duration)
      .up()
      .perform();
  }

  /**
   * 스와이프
   */
  async swipe(
    startX: number, startY: number,
    endX: number, endY: number,
    duration: number = 300
  ): Promise<void> {
    console.log(`[${this.deviceId}] swipe(${startX},${startY} → ${endX},${endY})`);

    await this.driver.action('pointer')
      .move({ x: startX, y: startY, origin: 'viewport' })
      .down()
      .move({ x: endX, y: endY, origin: 'viewport', duration })
      .up()
      .perform();
  }

  /**
   * 텍스트 입력
   */
  async inputText(text: string, options: InputOptions = {}): Promise<void> {
    console.log(`[${this.deviceId}] inputText("${text}")`);

    // 포커스된 요소에 텍스트 입력
    const activeElement = await this.driver.$('*:focus');

    if (options.clearFirst) {
      await activeElement.clearValue();
    }

    if (options.useAdb) {
      // ADB를 통한 직접 입력 (키보드 언어 무관)
      await this.driver.execute('mobile: shell', {
        command: 'input',
        args: ['text', text]
      });
    } else {
      await activeElement.setValue(text);
    }
  }

  /**
   * 스크린샷 캡처
   */
  async screenshot(): Promise<Buffer> {
    const base64 = await this.driver.takeScreenshot();
    return Buffer.from(base64, 'base64');
  }

  /**
   * 앱 실행
   */
  async launchApp(packageName: string, activityName?: string): Promise<void> {
    console.log(`[${this.deviceId}] launchApp(${packageName})`);

    await this.driver.execute('mobile: activateApp', {
      appId: packageName
    });
  }

  /**
   * 앱 종료
   */
  async terminateApp(packageName: string): Promise<void> {
    console.log(`[${this.deviceId}] terminateApp(${packageName})`);

    await this.driver.execute('mobile: terminateApp', {
      appId: packageName
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

### 7.2 설치

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

### 7.3 실행

```bash
# Terminal 1: Appium 서버
appium --port 4900 --allow-insecure=uiautomator2:adb_shell

# Terminal 2: Backend
cd backend && npm run dev

# Terminal 3: Frontend
cd frontend && npm run dev
```

**접속**: http://localhost:5173

### 7.4 Server Manager 사용 (권장)

```bash
cd server-manager && npm install && npm run electron:dev
```

---

## 8. 테스트 방법

### 8.1 단위 테스트

```bash
# Frontend
cd frontend && npm run test

# 커버리지
npm run test:coverage
```

### 8.2 빌드 검증

```bash
# Backend 타입 체크 + 빌드
cd backend && npm run typecheck && npm run build

# Frontend 린트 + 빌드
cd frontend && npm run lint && npm run build
```

### 8.3 E2E 테스트 시나리오

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

## 9. 성능 최적화

### 9.1 Frontend 최적화

| 기법 | 적용 위치 | 효과 |
|------|----------|------|
| **Context 분리** | 7개 Context | 불필요한 리렌더링 방지 |
| **폴링 통합** | DeviceContext, useQueueStatus | API 호출 76% 감소 |
| **가상화 렌더링** | react-window (스크린샷 그리드) | DOM 노드 85% 감소 |
| **썸네일** | WebP 300px | 이미지 용량 90% 감소 |
| **탭 캐싱** | CSS display:none | 탭 전환 즉시 반응 |

### 9.2 Backend 최적화

| 기법 | 적용 위치 | 효과 |
|------|----------|------|
| **Rate Limiting** | 5가지 리미터 | 서버 과부하 방지 |
| **ROI 적용** | 이미지 매칭 | 검색 영역 제한으로 속도 향상 |
| **Fire-and-forget** | 썸네일 생성 | 메인 플로우 블로킹 방지 |
| **세션 재사용** | sessionManager | Appium 세션 생성 오버헤드 제거 |

### 9.3 성능 측정 결과

| 지표 | Before | After |
|------|--------|-------|
| 스크린샷 100장 로드 | 50MB, 5초 | 225KB, 0.3초 |
| DOM 노드 (100장 그리드) | 100개 | 15개 |
| API 폴링 (5명 접속) | 150회/분 | 36회/분 |
| 탭 전환 | 0.5초 | 즉시 |

---

## 10. 향후 개선 계획

### 10.1 단기 계획

| 항목 | 설명 | 우선순위 |
|------|------|----------|
| iOS 지원 | XCUITest 드라이버 연동 | 높음 |
| 스크린샷 비교 | 이전 실행과 diff 이미지 생성 | 중간 |
| AI 시나리오 생성 | 자연어로 테스트 케이스 생성 | 낮음 |

### 10.2 기술 부채

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
