# Game QA Automation Tool

> 플로우차트 기반 모바일 게임 테스트 자동화 도구

비개발자도 쉽게 사용할 수 있는 **시각적 노드 에디터**로 모바일 게임 테스트 시나리오를 작성하고 실행할 수 있습니다.

---

## 주요 기능

### 비주얼 노드 에디터
- 드래그 앤 드롭으로 테스트 시나리오 구성
- 직관적인 플로우차트 방식
- 실시간 연결선 편집
- 노드별 사용자 정의 라벨 지원

### 디바이스 제어
- 탭, 스와이프, 롱프레스 등 터치 액션
- 스크린샷 기반 좌표 선택
- 앱 재시작, 강제 종료, 데이터 삭제 등 시스템 액션
- MJPEG 실시간 화면 스트리밍

### 이미지 인식 (Phase 1)
- 템플릿 매칭 기반 이미지 인식
- 이미지 탭 (tapImage) - 화면에서 이미지 찾아 탭
- 이미지 대기 (waitUntilImage) - 이미지 나타날 때까지 대기
- 이미지 사라짐 대기 (waitUntilImageGone)
- 템플릿 이미지 관리 UI

### 다중 디바이스 지원 (Phase 2)
- ADB 연결된 모든 디바이스 자동 탐색
- 디바이스별 세션 관리 (자동 포트 할당)
- 디바이스 상세 정보 조회 (배터리, 메모리, 스토리지 등)
- 디바이스 대시보드 UI

### 병렬 실행 (Phase 2)
- 여러 디바이스에서 동시에 시나리오 실행
- 디바이스별 독립 실행 (한 디바이스 실패해도 다른 디바이스 계속)
- WebSocket으로 실시간 진행 상황 전송
- 디바이스별 실행 중지 기능

### 통합 리포트 및 비디오 녹화 (Phase 3)
- 병렬 실행 결과 통합 리포트
- 디바이스별 비디오 녹화
- 에러/완료 시 스크린샷 자동 캡처
- 디바이스별 탭 필터링
- 리포트 뷰어 UI (비디오 플레이어, 스크린샷 갤러리)

### 리포트 내보내기 (Phase 4)
- HTML 내보내기 (스크린샷 Base64 임베딩, 자체 완결형)
- PDF 내보내기 (Puppeteer 기반)

### 조건 분기
- 요소 존재 여부 검사
- 화면 텍스트 포함 검사
- 이미지 존재 여부 검사
- Yes/No 분기 처리

---

## 기술 스택

| 분류 | 기술 |
|------|------|
| **Frontend** | React 18, TypeScript, Vite |
| **Backend** | Node.js, Express, TypeScript |
| **Automation** | Appium 2.x, UiAutomator2, WebDriverIO |
| **이미지 처리** | sharp, pixelmatch, pngjs |
| **Communication** | WebSocket (Socket.IO) |
| **스토리지** | Cloudflare R2 (선택) |
| **Target Platform** | Android |

---

## 시스템 요구사항

- Node.js 22.x LTS
- Java JDK 17
- Android SDK
- Appium 2.x
- Android 기기 또는 에뮬레이터

---

## 설치 방법

### 1. 저장소 클론
```bash
git clone https://github.com/kws0109/QA_Automation.git
cd QA_Automation
```

### 2. 의존성 설치
```bash
# 백엔드
cd backend
npm install

# 프론트엔드
cd ../frontend
npm install
```

### 3. Appium 설치 (글로벌)
```bash
npm install -g appium
appium driver install uiautomator2
```

### 4. 환경 변수 설정

#### Windows (시스템 환경 변수)
```
ANDROID_HOME=C:\Users\{사용자}\AppData\Local\Android\Sdk
JAVA_HOME=C:\Program Files\Java\jdk-17
```

#### R2 스토리지 설정 (선택)
```bash
# backend/.env 파일 생성 (backend/.env.example 참조)
cp backend/.env.example backend/.env
# .env 파일에 R2 credential 입력
```

### 5. 환경 검증
```bash
appium-doctor --android
```

---

## 실행 방법

### 1. Appium 서버 시작
```bash
appium
# 또는 여러 디바이스 사용 시 포트 지정
appium -p 4723
```

### 2. 백엔드 서버 시작
```bash
cd backend
npm run dev
```

### 3. 프론트엔드 개발 서버 시작
```bash
cd frontend
npm run dev
```

### 4. 브라우저에서 접속
```
http://localhost:5173
```

---

## 사용 가이드

### 1. 디바이스 연결

1. Android 기기의 **개발자 옵션 > USB 디버깅** 활성화
2. USB 케이블로 PC와 연결
3. `adb devices`로 연결 확인
4. 툴에서 **디바이스 관리** 탭으로 이동
5. 연결된 디바이스 목록에서 **세션 시작** 클릭

### 2. 시나리오 작성

1. 좌측 사이드바에서 노드를 캔버스로 드래그
2. 노드 선택 후 우측 패널에서 속성 설정
3. 노드 간 연결선으로 흐름 구성
4. 이미지 인식이 필요하면 템플릿 등록 후 사용

### 3. 시나리오 실행

#### 단일 디바이스
1. 상단 **실행** 버튼 클릭
2. 하단 콘솔에서 실시간 로그 확인

#### 병렬 실행 (다중 디바이스)
1. **디바이스 관리** 탭에서 디바이스 체크박스 선택
2. 시나리오 선택 후 **병렬 실행** 클릭
3. 실시간 로그에서 디바이스별 진행 상황 확인

### 4. 리포트 확인

1. **리포트** 탭에서 실행 이력 조회
2. 디바이스별 결과, 스크린샷, 비디오 확인
3. 필요 시 HTML/PDF로 내보내기

---

## 프로젝트 구조

```
game-automation-tool/
├── frontend/                 # React 프론트엔드
│   ├── src/
│   │   ├── components/
│   │   │   ├── Canvas/           # 노드 에디터 캔버스
│   │   │   ├── Sidebar/          # 노드 팔레트
│   │   │   ├── Panel/            # 속성 패널
│   │   │   ├── Header/           # 상단 메뉴
│   │   │   ├── Console/          # 실행 로그
│   │   │   ├── DevicePreview/    # 디바이스 실시간 화면
│   │   │   ├── DeviceDashboard/  # 디바이스 관리 대시보드
│   │   │   ├── ParallelLogs/     # 병렬 실행 로그
│   │   │   ├── ParallelReports/  # 통합 리포트 뷰어
│   │   │   └── TemplateModal/    # 이미지 템플릿 관리
│   │   ├── types/
│   │   ├── App.tsx
│   │   └── main.tsx
│   └── package.json
│
├── backend/                  # Node.js 백엔드
│   ├── src/
│   │   ├── appium/
│   │   │   ├── driver.ts         # Appium 드라이버 (싱글톤)
│   │   │   └── actions.ts        # 액션 클래스
│   │   ├── services/
│   │   │   ├── scenario.ts       # 시나리오 CRUD
│   │   │   ├── executor.ts       # 시나리오 실행
│   │   │   ├── report.ts         # 리포트 관리
│   │   │   ├── imageMatch.ts     # 이미지 매칭
│   │   │   ├── deviceManager.ts  # 디바이스 탐색
│   │   │   ├── sessionManager.ts # 멀티 세션 관리
│   │   │   ├── parallelExecutor.ts   # 병렬 실행
│   │   │   ├── parallelReport.ts     # 통합 리포트
│   │   │   └── reportExporter.ts     # 리포트 내보내기
│   │   ├── routes/
│   │   │   ├── device.ts
│   │   │   ├── action.ts
│   │   │   ├── scenario.ts
│   │   │   ├── image.ts
│   │   │   ├── session.ts
│   │   │   └── report.ts
│   │   ├── types/
│   │   └── index.ts
│   ├── templates/            # 이미지 템플릿 저장
│   ├── scenarios/            # 시나리오 저장 (gitignore)
│   ├── reports/              # 리포트 저장 (gitignore)
│   └── package.json
│
├── docs/                     # 기능 회고록
└── README.md
```

---

## API 엔드포인트

### 디바이스

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/device/list` | 연결된 디바이스 목록 |
| GET | `/api/device/list/detailed` | 디바이스 상세 정보 (배터리, 메모리 등) |
| GET | `/api/device/:deviceId` | 단일 디바이스 정보 |
| POST | `/api/device/connect` | 디바이스 연결 |
| POST | `/api/device/disconnect` | 연결 해제 |
| GET | `/api/device/screenshot` | 스크린샷 |

### 세션

| Method | Endpoint | 설명 |
|--------|----------|------|
| POST | `/api/session/create` | 세션 생성 |
| POST | `/api/session/destroy` | 세션 종료 |
| POST | `/api/session/destroy-all` | 모든 세션 종료 |
| GET | `/api/session/list` | 활성 세션 목록 |
| GET | `/api/session/:deviceId` | 특정 세션 정보 |

### 병렬 실행

| Method | Endpoint | 설명 |
|--------|----------|------|
| POST | `/api/session/execute-parallel` | 병렬 시나리오 실행 |
| GET | `/api/session/parallel/status` | 병렬 실행 상태 |
| POST | `/api/session/parallel/stop/:deviceId` | 디바이스 실행 중지 |
| POST | `/api/session/parallel/stop-all` | 전체 실행 중지 |

### 병렬 실행 리포트

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/session/parallel/reports` | 리포트 목록 |
| GET | `/api/session/parallel/reports/:id` | 리포트 상세 |
| DELETE | `/api/session/parallel/reports/:id` | 리포트 삭제 |
| GET | `/api/session/parallel/reports/:id/export/html` | HTML 내보내기 |
| GET | `/api/session/parallel/reports/:id/export/pdf` | PDF 내보내기 |

### 액션

| Method | Endpoint | 설명 |
|--------|----------|------|
| POST | `/api/action/tap` | 탭 |
| POST | `/api/action/swipe` | 스와이프 |
| POST | `/api/action/longPress` | 롱프레스 |

### 이미지

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/image/templates` | 템플릿 목록 |
| POST | `/api/image/templates` | 템플릿 등록 |
| DELETE | `/api/image/templates/:id` | 템플릿 삭제 |
| POST | `/api/image/match` | 이미지 매칭 테스트 |

### 시나리오

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/scenarios` | 목록 조회 |
| GET | `/api/scenarios/:id` | 상세 조회 |
| POST | `/api/scenarios` | 저장 |
| PUT | `/api/scenarios/:id` | 수정 |
| DELETE | `/api/scenarios/:id` | 삭제 |
| POST | `/api/scenarios/:id/run` | 실행 |

---

## 노드 타입

### 기본 노드

| 노드 | 설명 |
|------|------|
| **Start** | 시나리오 시작점 |
| **End** | 시나리오 종료점 |
| **Action** | 디바이스 액션 실행 |
| **Condition** | 조건 분기 (Y/N) |
| **Loop** | 반복 실행 |

### 액션 타입

| 타입 | 설명 | 파라미터 |
|------|------|----------|
| `tap` | 화면 탭 | x, y |
| `longPress` | 길게 누르기 | x, y, duration |
| `swipe` | 스와이프 | startX, startY, endX, endY |
| `wait` | 대기 | duration |
| `waitUntilGone` | 요소 사라짐 대기 | selector, timeout |
| `waitUntilExists` | 요소 나타남 대기 | selector, timeout |
| `back` | 뒤로가기 | - |
| `home` | 홈 버튼 | - |
| `restart` | 앱 재시작 | - |
| `terminateApp` | 앱 강제 종료 | - |
| `clearData` | 앱 데이터 삭제 | - |

### 이미지 액션 타입

| 타입 | 설명 | 파라미터 |
|------|------|----------|
| `tapImage` | 이미지 찾아서 탭 | templateId, timeout, threshold |
| `waitUntilImage` | 이미지 나타남 대기 | templateId, timeout, threshold |
| `waitUntilImageGone` | 이미지 사라짐 대기 | templateId, timeout, threshold |

---

## WebSocket 이벤트

### 실행 상태

| 이벤트 | 설명 |
|--------|------|
| `scenario:start` | 시나리오 실행 시작 |
| `scenario:complete` | 시나리오 실행 완료 |
| `node:start` | 노드 실행 시작 |
| `node:complete` | 노드 실행 완료 |
| `node:error` | 노드 실행 에러 |

### 병렬 실행

| 이벤트 | 설명 |
|--------|------|
| `parallel:start` | 병렬 실행 시작 |
| `parallel:complete` | 병렬 실행 완료 |
| `device:scenario:start` | 디바이스별 시나리오 시작 |
| `device:scenario:complete` | 디바이스별 시나리오 완료 |
| `device:node` | 디바이스별 노드 실행 상태 |

---

## 트러블슈팅

### Appium 연결 실패
```bash
# 환경 확인
appium-doctor --android

# ADB 서버 재시작
adb kill-server
adb start-server
adb devices
```

### 세션 타임아웃

- Appium 서버의 `newCommandTimeout` 설정 확인
- 기본값: 600초 (10분)

### 이미지 인식 실패

- 템플릿 이미지 해상도 확인 (디바이스 해상도와 일치해야 함)
- threshold 값 조정 (기본 0.8, 낮출수록 허용 범위 증가)
- 화면이 완전히 로드된 후 매칭 시도

### 병렬 실행 시 포트 충돌

- 각 디바이스별로 다른 Appium 포트 사용
- SessionManager가 자동으로 포트 할당 (4723+, 9100+)

---

## 개발 로드맵

- [x] Phase 0: TypeScript 마이그레이션
- [x] Phase 1: 이미지 인식 기능
- [x] Phase 2: 다중 디바이스 지원 및 병렬 실행
- [x] Phase 3: 통합 리포트 및 비디오 녹화
- [x] Phase 4: 리포트 내보내기 (PDF/HTML)
- [ ] 스케줄링: 예약/반복 실행 기능
- [ ] 알림: Slack/Discord 웹훅
- [ ] iOS 지원

---

## 문서

- [GitHub Wiki](https://github.com/kws0109/QA_Automation/wiki) - 기능별 회고록 및 상세 문서

---

## 라이선스

MIT License

---

## 개발자

- **이름**: KIM WOOSUNG
- **이메일**: kws0553@gmail.com
- **GitHub**: https://github.com/kws0109
