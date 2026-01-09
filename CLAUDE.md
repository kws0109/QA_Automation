# Game QA Automation Tool - Project Context

## 프로젝트 개요
비개발자가 시각적 플로우차트 인터페이스로 모바일 게임 자동화 테스트 시나리오를 만들 수 있는 도구

## 기술 스택
- **Frontend**: React 18, TypeScript, Vite
- **Backend**: Node.js, Express, TypeScript, Socket.IO
- **자동화**: Appium, UiAutomator2, WebdriverIO
- **이미지 처리**: sharp, pixelmatch, pngjs

## 프로젝트 구조
```
game-automation-tool/
├── backend/
│   ├── src/
│   │   ├── appium/
│   │   │   ├── driver.ts      # Appium 드라이버 (싱글톤)
│   │   │   └── actions.ts     # 액션 클래스 (DriverProvider 주입 방식)
│   │   ├── services/
│   │   │   ├── executor.ts    # 시나리오 실행
│   │   │   ├── scenario.ts    # 시나리오 CRUD
│   │   │   ├── report.ts      # 리포트 저장
│   │   │   ├── imageMatch.ts  # 이미지 매칭
│   │   │   ├── deviceManager.ts  # 디바이스 탐색 (NEW)
│   │   │   └── sessionManager.ts # 멀티 세션 관리 (NEW)
│   │   ├── routes/
│   │   │   ├── device.ts
│   │   │   ├── action.ts
│   │   │   ├── scenario.ts
│   │   │   ├── image.ts
│   │   │   └── session.ts     # 세션 API (NEW)
│   │   ├── types/
│   │   │   ├── index.ts
│   │   │   ├── device.ts
│   │   │   ├── action.ts
│   │   │   ├── scenario.ts
│   │   │   ├── execution.ts
│   │   │   └── image.ts
│   │   └── index.ts
│   ├── templates/             # 이미지 템플릿 저장
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Canvas/
│   │   │   ├── Panel/
│   │   │   ├── DevicePreview/
│   │   │   ├── TemplateModal/
│   │   │   └── ...
│   │   ├── types/
│   │   ├── App.tsx
│   │   └── main.tsx
│   └── vite.config.ts
└── README.md
```

## 완료된 Phase

### Phase 0: TypeScript 마이그레이션 ✅
- Backend 전체 .js → .ts 변환
- Frontend 전체 .jsx → .tsx 변환
- 타입 정의 완료

### Phase 1: 이미지 인식 기능 ✅
- 템플릿 매칭 (sharp, pixelmatch)
- MJPEG 실시간 스트리밍
- 이미지 기반 액션 (tapImage, waitUntilImage, waitUntilImageGone)

### Phase 2: 다중 디바이스 지원 ✅

**목표:**
1. 연결된 디바이스 목록 조회 (ADB) ✅
2. 디바이스별 세션 관리 ✅
3. 병렬 시나리오 실행 ✅
4. Frontend UI ✅

### 완료된 작업 (Day 1-2)

#### 1. DeviceManager 서비스 (`backend/src/services/deviceManager.ts`)
- `scanDevices()`: ADB로 연결된 디바이스 목록 조회
- `getDeviceDetails()`: 단일 디바이스 상세 정보
- `parseDeviceLine()`: ADB 출력 파싱
- `getAndroidVersion()`: Android 버전 조회

#### 2. SessionManager 서비스 (`backend/src/services/sessionManager.ts`)
- `sessions: Map<deviceId, ManagedSession>`: 디바이스별 세션 관리
- `createSession(device)`: 새 Appium 세션 생성 + Actions 인스턴스
- `destroySession(deviceId)`: 세션 종료
- `getDriver(deviceId)`: 드라이버 반환
- `getActions(deviceId)`: Actions 인스턴스 반환
- 포트 자동 할당 (Appium: 4723+, MJPEG: 9100+)

#### 3. Actions 클래스 리팩토링 (`backend/src/appium/actions.ts`)
- `class Actions` → `export class Actions` (인스턴스화 가능)
- `DriverProvider` 주입 방식으로 변경
- 생성자: `constructor(driverProvider: DriverProvider, deviceId: string)`
- 모든 로그에 `[deviceId]` 추가
- 하위 호환성 유지: `export default defaultActions` (기존 싱글톤)

#### 4. 타입 정의 (`backend/src/types/index.ts`)
```typescript
interface DeviceInfo {
  id: string;
  name: string;
  model: string;
  androidVersion: string;
  status: 'connected' | 'offline' | 'unauthorized';
  sessionActive: boolean;
  mjpegPort?: number;
}

interface SessionInfo {
  deviceId: string;
  sessionId: string;
  appiumPort: number;
  mjpegPort: number;
  createdAt: Date;
  status: 'active' | 'idle' | 'error';
}

interface ParallelExecutionResult {
  scenarioId: string;
  results: { deviceId, success, duration, error?, steps }[];
  totalDuration: number;
  startedAt: Date;
  completedAt: Date;
}
```

#### 5. API 라우트
- `GET /api/device/list`: 연결된 디바이스 목록
- `GET /api/device/:deviceId`: 단일 디바이스 정보
- `POST /api/session/create`: 세션 생성 (body: { deviceId })
- `POST /api/session/destroy`: 세션 종료
- `POST /api/session/destroy-all`: 모든 세션 종료
- `GET /api/session/list`: 활성 세션 목록
- `GET /api/session/:deviceId`: 특정 세션 정보

### 완료된 작업 (Day 3): ParallelExecutor

#### 1. ParallelExecutor 서비스 (`backend/src/services/parallelExecutor.ts`)
병렬 실행 엔진 구현 완료:
```typescript
class ParallelExecutor {
  // Socket.IO 설정
  setSocketIO(io: SocketIOServer): void

  // 병렬 실행 상태 조회
  getStatus(): { isRunning: boolean; activeDevices: string[] }

  // 병렬 시나리오 실행 (핵심 메서드)
  async executeParallel(
    scenarioId: string,
    deviceIds: string[]
  ): Promise<ParallelExecutionResult>

  // 특정 디바이스 실행 중지
  stopDevice(deviceId: string): void

  // 모든 실행 중지
  stopAll(): void
}
```

**주요 기능:**
- `Promise.allSettled`로 각 디바이스 독립 실행 (한 디바이스 실패해도 다른 디바이스 계속)
- WebSocket 이벤트로 실시간 진행 상황 전송:
  - `parallel:start` - 병렬 실행 시작
  - `parallel:complete` - 병렬 실행 완료
  - `device:scenario:start` - 디바이스별 시나리오 시작
  - `device:scenario:complete` - 디바이스별 시나리오 완료
  - `device:node` - 디바이스별 노드 실행 상태
- 디바이스별 리포트 자동 저장

#### 2. 병렬 실행 API (`backend/src/routes/session.ts`)
```
POST /api/session/execute-parallel  - 병렬 시나리오 실행
  body: { scenarioId: string, deviceIds: string[] }

GET  /api/session/parallel/status   - 병렬 실행 상태 조회

POST /api/session/parallel/stop/:deviceId - 특정 디바이스 실행 중지

POST /api/session/parallel/stop-all - 모든 병렬 실행 중지
```

### 완료된 작업 (Day 4): Frontend UI

#### 1. 타입 정의 (`frontend/src/types/index.ts`)
```typescript
// Multi-Device 관련 타입 추가
interface DeviceInfo { id, name, model, androidVersion, status, sessionActive, mjpegPort? }
interface SessionInfo { deviceId, sessionId, appiumPort, mjpegPort, createdAt, status }
interface DeviceExecutionResult { deviceId, success, duration, error? }
interface ParallelExecutionResult { scenarioId, results[], totalDuration, startedAt, completedAt }
interface ParallelLog { deviceId, timestamp, nodeId, status, message }
interface ParallelSocketEvents { 'parallel:start', 'parallel:complete', 'device:*' }
```

#### 2. DeviceList 컴포넌트 (`frontend/src/components/DeviceList/`)
- ADB 연결된 디바이스 목록 표시
- 세션 생성/종료 버튼
- 체크박스로 디바이스 선택
- 전체 선택/해제 기능
- 5초 간격 자동 갱신

#### 3. ParallelControl 컴포넌트 (`frontend/src/components/ParallelControl/`)
- 시나리오 드롭다운 선택
- 선택된 디바이스 수 표시
- 병렬 실행 버튼 (실행/중지)
- 실행 중 스피너 표시

#### 4. ParallelLogs 컴포넌트 (`frontend/src/components/ParallelLogs/`)
- 디바이스별 탭 필터링 (전체 / 개별 디바이스)
- 실시간 로그 스트리밍 (Socket.IO)
- 상태별 아이콘/색상 구분 (시작/성공/에러)
- 자동 스크롤 옵션
- 실행 결과 요약 (성공/실패 수, 소요시간)

#### 5. DeviceDashboard (Day 4 개선)
**파일:** `frontend/src/components/DeviceDashboard/`

디바이스 관리 대시보드를 별도 탭으로 분리:
- **탭 네비게이션**: "시나리오 편집" / "디바이스 관리" 탭
- **디바이스 카드 그리드**: 연결된 디바이스를 카드 형태로 표시
- **상세 정보 표시**:
  - 브랜드/모델명
  - Android 버전 (SDK 버전)
  - 화면 해상도
  - CPU 아키텍처 (arm64 등)
  - 배터리 레벨/상태 (프로그레스 바)
  - 메모리 사용량 (프로그레스 바)
  - 스토리지 사용량 (프로그레스 바)
- **세션 관리**: 세션 시작/종료 버튼
- **디바이스 선택**: 체크박스로 멀티 디바이스 선택
- **병렬 실행**: 시나리오 선택 후 병렬 실행
- **실시간 로그**: 실행 로그 및 결과 표시

#### 6. Backend API 확장
**파일:** `backend/src/services/deviceManager.ts`

```typescript
interface DeviceDetailedInfo extends DeviceInfo {
  brand, manufacturer, screenResolution, screenDensity,
  cpuAbi, sdkVersion, buildNumber,
  batteryLevel, batteryStatus, memoryTotal, memoryAvailable,
  storageTotal, storageAvailable
}

// 새 API
GET /api/device/list/detailed - 모든 디바이스 상세 정보 조회
```

### Phase 2 완료

### Phase 3: 병렬 실행 통합 리포트 ✅

**목표:**
1. 병렬 실행 결과 통합 리포트 저장 ✅
2. 디바이스별 스크린샷 캡처 ✅
3. 디바이스별 비디오 녹화 ✅
4. 리포트 뷰어 UI ✅

#### 1. ParallelReportService (`backend/src/services/parallelReport.ts`)
- 통합 리포트 CRUD (create, getAll, getById, delete, deleteAll)
- 스크린샷 캡처/저장 (`captureScreenshot`, `getScreenshot`)
- 비디오 저장/조회 (`saveVideo`, `getVideo`)
- 저장 경로: `reports/parallel/`, `reports/screenshots/`, `reports/videos/`

#### 2. ParallelExecutor 개선 (`backend/src/services/parallelExecutor.ts`)
- 비디오 녹화: `startRecordingScreen`/`stopRecordingScreen`
- 스크린샷: 에러 시 + 완료 시 캡처
- 통합 리포트 자동 생성

#### 3. 리포트 API (`backend/src/routes/session.ts`)
```
GET    /api/session/parallel/reports          - 리포트 목록
GET    /api/session/parallel/reports/:id      - 리포트 상세
DELETE /api/session/parallel/reports/:id      - 리포트 삭제
DELETE /api/session/parallel/reports          - 전체 삭제
GET    /api/session/parallel/screenshots/...  - 스크린샷 파일
GET    /api/session/parallel/videos/...       - 비디오 파일
```

#### 4. ParallelReports 컴포넌트 (`frontend/src/components/ParallelReports/`)
- 리포트 목록/상세 조회
- 디바이스별 탭 전환
- 단계별 실행 결과 테이블
- 비디오 플레이어 (디바이스별 녹화 영상)
- 스크린샷 갤러리

#### 5. 타입 정의 추가
```typescript
interface ScreenshotInfo { nodeId, timestamp, path, type }
interface VideoInfo { path, duration, size }
interface DeviceReportResult { deviceId, deviceName, success, duration, steps, screenshots, video? }
interface ParallelReport { id, scenarioId, scenarioName, deviceResults, stats, startedAt, completedAt }
```

### Phase 3 완료

### Phase 4: 리포트 내보내기 (진행중)

#### 1. 리포트 내보내기 기능 ✅
- **ReportExporter 서비스** (`backend/src/services/reportExporter.ts`)
  - `generateHTML()`: 자체 완결형 HTML 생성 (스크린샷 Base64 임베딩)
  - `generatePDF()`: Puppeteer를 이용한 PDF 생성
  - Catppuccin Mocha 테마 스타일 적용
- **API 엔드포인트**
  - `GET /api/session/parallel/reports/:id/export/html`
  - `GET /api/session/parallel/reports/:id/export/pdf`
- **Frontend UI**
  - 리포트 상세 화면에 HTML/PDF 내보내기 버튼 추가
  - 다운로드 트리거 구현

---

## 다음 개발 예정 (Phase 4 남은 항목)

### 우선순위 높음
1. ~~**리포트 내보내기**: PDF/HTML 형식 내보내기~~ ✅
2. **스크린샷 비교**: 이전 실행과 diff 이미지 생성
3. **비디오 타임라인**: 스텝 마커 표시

### 우선순위 중간
4. **스케줄링**: 예약/반복 실행 기능
5. **알림**: Slack/Discord 웹훅, 이메일 알림
6. **대시보드**: 실행 통계 차트, 성공률 추이

### 우선순위 낮음
7. **iOS 지원**: XCUITest 드라이버 연동
8. **리포트 공유**: 공유 링크 생성

---

## 사용 패턴 예시

```typescript
// 단일 디바이스 (기존 방식 - 하위 호환)
import actions from './appium/actions';
await actions.tap(100, 200);

// 다중 디바이스 (새 방식)
import { sessionManager } from './services/sessionManager';

const actions1 = sessionManager.getActions('emulator-5554');
const actions2 = sessionManager.getActions('emulator-5556');

await Promise.all([
  actions1?.tap(100, 200),
  actions2?.tap(100, 200)
]);

// 병렬 시나리오 실행 (ParallelExecutor 사용)
import { parallelExecutor } from './services/parallelExecutor';

const result = await parallelExecutor.executeParallel(
  'scenario-1',                    // 시나리오 ID
  ['emulator-5554', 'emulator-5556']  // 디바이스 IDs
);

console.log(result.totalDuration);  // 전체 소요 시간
result.results.forEach(r => {
  console.log(`${r.deviceId}: ${r.success ? '성공' : '실패'} (${r.duration}ms)`);
});
```

## 개발 환경
- Windows + Git Bash
- Node.js LTS 22.x
- JDK 17
- Android SDK

## 실행 명령어
```bash
# Backend
cd backend && npm run dev

# Frontend
cd frontend && npm run dev

# Appium 서버 (각 디바이스별로 다른 포트)
appium -p 4723  # 디바이스 1
appium -p 4724  # 디바이스 2
```
