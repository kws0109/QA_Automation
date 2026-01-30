# QA Automation Tool

> 다중 사용자 환경을 위한 모바일 게임 QA 자동화 플랫폼

비개발자도 쉽게 사용할 수 있는 **시각적 노드 에디터**로 모바일 게임 테스트 시나리오를 작성하고, **50대 이상의 디바이스**에서 동시에 실행할 수 있습니다.

---

## 핵심 특징

| 특징 | 설명 |
|------|------|
| **다중 사용자** | 여러 QA 담당자가 동시 접속, 테스트 실행 |
| **디바이스 공유** | 연결된 디바이스를 모든 사용자가 공유 |
| **대기열 시스템** | 디바이스 사용 중일 때 자동 대기열 처리 |
| **실시간 동기화** | WebSocket으로 모든 상태 실시간 공유 |
| **50대+ 지원** | 대규모 병렬 테스트 실행 최적화 |

---

## 주요 기능

### 비주얼 노드 에디터
- 드래그 앤 드롭으로 테스트 시나리오 구성
- 수평 플로우차트 방식 (좌 → 우)
- 노드별 사용자 정의 라벨
- 조건 분기 (Yes/No)

### 테스트 Suite
- 여러 시나리오를 하나의 Suite로 묶어 관리
- 디바이스 + 시나리오 조합 설정
- Suite 단위 실행 및 스케줄링

### 통합 실행 센터
- 시나리오/Suite 선택하여 즉시 실행
- 반복 횟수, 시나리오 간격 설정
- 디바이스 선택 및 병렬 실행
- 실시간 진행 상황 모니터링

### 디바이스 관리
- ADB 연결된 모든 디바이스 자동 탐색
- 디바이스별 세션 관리 (자동 포트 할당)
- 실시간 상태 모니터링 (배터리, 메모리, 온도)
- 디바이스 별칭 지정
- 오프라인 디바이스 정보 유지

### 이미지/텍스트 인식
- **이미지 매칭**: OpenCV 기반 템플릿 매칭
- **OCR**: Google Cloud Vision API 연동
- 하이라이트 스크린샷 (매칭 영역 표시)
- ROI(관심 영역) 설정 지원

### 비디오 녹화 및 타임라인
- 시나리오별 자동 녹화
- 타임라인 마커 (스텝별 시점 표시)
- 마커 클릭으로 해당 시점 이동
- 대기 액션 시작/완료 이원화

### 리포트
- 통합 리포트 (시나리오 + Suite)
- 디바이스별 결과 필터링
- 스크린샷 갤러리
- HTML/PDF 내보내기
- 메트릭 대시보드

### Slack 연동
- **OAuth 로그인**: Slack 워크스페이스 기반 인증
- **테스트 결과 알림**: 완료/실패 시 Slack 채널 알림
- **요청자 멘션**: 테스트 요청자 자동 태그
- **R2 리포트 링크**: 공개 URL로 상세 리포트 공유

### 스케줄링
- Cron 표현식 기반 예약 실행
- Suite 단위 스케줄 등록
- 프리셋 제공 (매일 10시, 매시간 등)
- 실행 이력 조회

---

## 기술 스택

| 분류 | 기술 |
|------|------|
| **Frontend** | React 18, TypeScript, Vite |
| **Backend** | Node.js, Express, TypeScript, Socket.IO |
| **Automation** | Appium 2.x, UiAutomator2 |
| **이미지 처리** | OpenCV (Native), sharp, pixelmatch |
| **OCR** | Google Cloud Vision API |
| **스토리지** | Cloudflare R2 (선택) |
| **인증** | Slack OAuth 2.0, JWT |
| **스케줄링** | node-cron |

---

## 시스템 요구사항

- Node.js 22.x LTS
- Java JDK 17
- Android SDK (Platform Tools)
- Appium 2.x
- OpenCV 4.x (Windows: `choco install opencv`)
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

### 3. Appium 설치
```bash
npm install -g appium
appium driver install uiautomator2
```

### 4. 환경 변수 설정

```bash
# backend/.env 파일 생성
cp backend/.env.example backend/.env

# frontend/.env 파일 생성
cp frontend/.env.example frontend/.env
```

#### 필수 환경 변수 (backend/.env)
```bash
# 서버 포트
PORT=3001
HOST=0.0.0.0  # 외부 접근 허용 (로컬 전용: 127.0.0.1)

# Appium
APPIUM_PORT=4900
APPIUM_HOST=127.0.0.1

# Frontend URL (리포트 링크용)
FRONTEND_URL=http://localhost:5173
```

#### 외부 접근 설정 (frontend/.env)
다른 PC나 모바일에서 접근하려면:
```bash
# 서버 호스트 IP (예: 192.168.1.100)
VITE_SERVER_HOST=192.168.1.100

# Backend 포트
VITE_BACKEND_PORT=3001

# 또는 전체 URL 직접 지정
VITE_API_URL=http://192.168.1.100:3001
VITE_WS_URL=http://192.168.1.100:3001
VITE_WS_STREAM_URL=ws://192.168.1.100:3001
```

#### 선택 환경 변수
```bash
# Slack OAuth (로그인용)
SLACK_CLIENT_ID=your_client_id
SLACK_CLIENT_SECRET=your_client_secret
SLACK_REDIRECT_URI=http://localhost:3001/auth/slack/callback
JWT_SECRET=your_jwt_secret

# Slack 알림 (테스트 결과 알림용)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx/yyy/zzz

# Cloudflare R2 (리포트 공유용)
R2_ENABLED=true
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_BUCKET_NAME=qa-reports
R2_PUBLIC_URL=https://reports.your-domain.com

# Google Cloud Vision (OCR용)
GOOGLE_APPLICATION_CREDENTIALS=./google_key.json
```

### 5. 환경 검증
```bash
appium-doctor --android
```

---

## 실행 방법

### 방법 1: Server Manager 사용 (권장)

Electron 기반 Server Manager로 모든 서버를 한 번에 관리할 수 있습니다.

```bash
cd server-manager
npm install
npm run dev
```

**Server Manager 기능:**
- Backend, Frontend, Appium 서버 원클릭 시작/중지
- 실시간 로그 뷰어
- 포트 설정 UI
- 시스템 트레이 지원

**EXE 패키징 (Windows):**
```bash
cd server-manager
npm run build
# release/ 폴더에 portable exe 생성
```

---

### 방법 2: 개별 터미널 실행

각 서버를 별도 터미널에서 실행합니다.

#### 1. Appium 서버 시작
```bash
appium --port 4900 --allow-insecure=uiautomator2:adb_shell
```

#### 2. 백엔드 서버 시작
```bash
cd backend
npm run dev
```

#### 3. 프론트엔드 시작
```bash
cd frontend
npm run dev
```

#### 4. 브라우저 접속
```
http://localhost:5173
```

---

## 사용 가이드

### 1. 로그인
- **Slack 로그인**: 워크스페이스 연동 (권장)
- **닉네임 로그인**: 간단한 닉네임 입력

### 2. 디바이스 연결
1. Android 기기 USB 디버깅 활성화
2. USB 케이블로 PC 연결
3. **디바이스 관리** 탭에서 **세션 시작**

### 3. 시나리오 작성
1. **시나리오 편집** 탭 이동
2. 사이드바에서 노드 드래그
3. 노드 선택 후 속성 패널에서 설정
4. 노드 연결하여 흐름 구성

### 4. Suite 생성
1. **Suite 관리** 탭 이동
2. Suite 이름 입력
3. 디바이스 선택
4. 시나리오 선택
5. 저장

### 5. 테스트 실행
1. **실행 센터** 탭 이동
2. Suite 또는 시나리오 선택
3. 디바이스 선택
4. 반복 횟수/간격 설정
5. **실행** 버튼 클릭

### 6. 리포트 확인
1. **리포트** 탭에서 실행 이력 조회
2. 상세 결과, 스크린샷, 비디오 확인
3. HTML/PDF 내보내기

---

## 프로젝트 구조

```
game-automation-tool/
├── server-manager/           # Electron 서버 관리 앱
│   ├── electron/             # 메인 프로세스
│   │   ├── main.ts
│   │   ├── preload.ts
│   │   └── processManager.ts
│   └── src/                  # React UI
│       ├── App.tsx
│       └── components/
│
├── frontend/                 # React 프론트엔드
│   └── src/
│       ├── components/
│       │   ├── Canvas/              # 노드 에디터
│       │   ├── Panel/               # 속성 패널
│       │   ├── DeviceDashboard/     # 디바이스 관리
│       │   ├── ExecutionCenter/     # 통합 실행 센터
│       │   ├── SuiteManager/        # Suite 관리
│       │   ├── TestReports/         # 통합 리포트
│       │   ├── MetricsDashboard/    # 메트릭 대시보드
│       │   ├── ScheduleManager/     # 스케줄 관리
│       │   └── SlackSettings/       # Slack 설정
│       └── types/
│
├── backend/                  # Node.js 백엔드
│   └── src/
│       ├── appium/
│       │   ├── driver.ts            # Appium 드라이버
│       │   └── actions.ts           # 디바이스 액션
│       ├── services/
│       │   ├── testExecutor.ts      # 테스트 실행 엔진
│       │   ├── testOrchestrator.ts  # 실행 조율 (큐/디스패치)
│       │   ├── suiteExecutor.ts     # Suite 실행
│       │   ├── deviceManager.ts     # 디바이스 관리
│       │   ├── sessionManager.ts    # 세션 관리
│       │   ├── imageMatch.ts        # 이미지 매칭
│       │   ├── textMatcher/         # OCR 텍스트 매칭
│       │   ├── reportExporter.ts    # 리포트 내보내기
│       │   ├── slackNotificationService.ts  # Slack 알림
│       │   ├── r2Uploader.ts        # R2 업로드
│       │   └── scheduleManager.ts   # 스케줄 관리
│       ├── routes/
│       │   ├── test.ts              # 테스트 실행 API
│       │   ├── suite.ts             # Suite API
│       │   ├── device.ts            # 디바이스 API
│       │   ├── auth.ts              # 인증 API
│       │   └── slack.ts             # Slack API
│       └── middleware/
│           └── auth.ts              # JWT 인증
│
├── docs/                     # 기능 회고록
└── README.md
```

---

## API 엔드포인트

### 인증
| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/auth/slack` | Slack OAuth 시작 |
| GET | `/auth/slack/callback` | OAuth 콜백 |
| GET | `/auth/status` | 인증 상태 확인 |
| POST | `/auth/nickname` | 닉네임 로그인 |
| POST | `/auth/logout` | 로그아웃 |

### 테스트 실행
| Method | Endpoint | 설명 |
|--------|----------|------|
| POST | `/api/test/execute` | 테스트 실행 |
| GET | `/api/test/queue/status` | 큐 상태 조회 |
| POST | `/api/test/stop/:executionId` | 실행 중지 |

### Suite
| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/suites` | Suite 목록 |
| POST | `/api/suites` | Suite 생성 |
| POST | `/api/suites/:id/execute` | Suite 실행 |
| DELETE | `/api/suites/:id` | Suite 삭제 |

### 리포트
| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/reports` | 리포트 목록 |
| GET | `/api/reports/:id` | 리포트 상세 |
| GET | `/api/reports/:id/export/html` | HTML 내보내기 |
| GET | `/api/reports/:id/export/pdf` | PDF 내보내기 |

### 스케줄
| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/schedules` | 스케줄 목록 |
| POST | `/api/schedules` | 스케줄 생성 |
| POST | `/api/schedules/:id/run` | 즉시 실행 |

---

## 액션 타입

### 기본 액션
| 타입 | 설명 |
|------|------|
| `tap` | 화면 탭 |
| `longPress` | 길게 누르기 |
| `swipe` | 스와이프 |
| `wait` | 대기 |
| `back` | 뒤로가기 |
| `home` | 홈 버튼 |
| `launchApp` | 앱 실행 |
| `terminateApp` | 앱 종료 |
| `clearData` | 앱 데이터 삭제 |

### 이미지 액션
| 타입 | 설명 |
|------|------|
| `tapImage` | 이미지 찾아서 탭 |
| `waitUntilImage` | 이미지 나타남 대기 |
| `waitUntilImageGone` | 이미지 사라짐 대기 |

### 텍스트 액션 (OCR)
| 타입 | 설명 |
|------|------|
| `tapOcrText` | OCR로 텍스트 찾아서 탭 |
| `waitUntilTextExists` | 텍스트 나타남 대기 |
| `waitUntilTextGone` | 텍스트 사라짐 대기 |

### 조건 액션
| 타입 | 설명 |
|------|------|
| `checkElementExists` | 요소 존재 여부 |
| `checkTextContains` | 텍스트 포함 여부 |
| `checkImageExists` | 이미지 존재 여부 |

---

## 트러블슈팅

### Appium 연결 실패
```bash
appium-doctor --android
adb kill-server && adb start-server
```

### OpenCV 로드 실패
```bash
# Windows
choco install opencv
# 환경변수 OPENCV4NODEJS_DISABLE_AUTOBUILD=1 설정
```

### Slack 연결 안됨
- Webhook URL 확인
- Bot Token 권한 확인 (chat:write)

---

## ngrok을 이용한 Slack OAuth 설정

Slack OAuth는 외부에서 접근 가능한 Redirect URI가 필요합니다. 로컬 개발 환경에서는 **ngrok**을 사용하여 백엔드 서버를 외부에 노출합니다.

### 1. ngrok 설치

```bash
# Windows (Chocolatey)
choco install ngrok

# macOS (Homebrew)
brew install ngrok

# 또는 https://ngrok.com/download 에서 직접 다운로드
```

### 2. ngrok 계정 설정

```bash
# ngrok 계정 가입 후 authtoken 설정
ngrok config add-authtoken your_auth_token
```

### 3. ngrok 터널 시작

```bash
# 백엔드 서버(3001)를 외부에 노출
ngrok http 3001
```

실행 후 표시되는 URL을 확인합니다:
```
Forwarding    https://xxxx-xxx-xxx.ngrok-free.app -> http://localhost:3001
```

### 4. Slack App 설정

1. [Slack API](https://api.slack.com/apps) 접속
2. **Create New App** → **From scratch**
3. App 이름 입력 및 워크스페이스 선택
4. **OAuth & Permissions** 메뉴 이동
5. **Redirect URLs**에 ngrok URL 추가:
   ```
   https://xxxx-xxx-xxx.ngrok-free.app/auth/slack/callback
   ```
6. **User Token Scopes**에 권한 추가:
   - `identity.basic`
   - `identity.email`
   - `identity.avatar`
   - `identity.team`
7. 좌측 **Basic Information**에서 **Client ID**와 **Client Secret** 복사

### 5. 환경 변수 설정

```bash
# backend/.env
SLACK_CLIENT_ID=your_client_id
SLACK_CLIENT_SECRET=your_client_secret
SLACK_REDIRECT_URI=https://xxxx-xxx-xxx.ngrok-free.app/auth/slack/callback
JWT_SECRET=your_secure_random_string
```

### 6. ngrok 고정 도메인 (선택)

무료 플랜에서는 ngrok 재시작 시 URL이 변경됩니다. 고정 도메인을 원하면:

```bash
# ngrok 유료 플랜 또는 무료 고정 도메인 사용
ngrok http 3001 --domain=your-fixed-domain.ngrok-free.app
```

고정 도메인 사용 시 Slack App의 Redirect URL을 한 번만 설정하면 됩니다.

### 7. 주의사항

| 항목 | 설명 |
|------|------|
| **ngrok 재시작** | URL 변경 시 Slack App Redirect URL도 업데이트 필요 |
| **HTTPS 필수** | Slack OAuth는 HTTPS만 허용 (ngrok은 자동 HTTPS 제공) |
| **환경 변수 동기화** | `.env`의 `SLACK_REDIRECT_URI`와 Slack App 설정 일치 필요 |
| **프론트엔드 URL** | `FRONTEND_URL`은 브라우저 접근 URL (보통 localhost 유지) |

### 실행 순서

```bash
# 1. ngrok 시작 (별도 터미널)
ngrok http 3001

# 2. .env에 ngrok URL 반영

# 3. 백엔드 시작
cd backend && npm run dev

# 4. 프론트엔드 시작
cd frontend && npm run dev

# 5. 브라우저에서 http://localhost:5173 접속 후 Slack 로그인
```

---

## 개발 로드맵

- [x] Phase 0: TypeScript 마이그레이션
- [x] Phase 1: 이미지 인식
- [x] Phase 2: 다중 디바이스 지원
- [x] Phase 3: 통합 리포트 및 비디오 녹화
- [x] Phase 4: 스케줄링, 리포트 내보내기
- [x] 다중 사용자 테스트 큐 시스템
- [x] Slack OAuth 로그인
- [x] Slack 테스트 결과 알림
- [x] OCR 텍스트 인식
- [x] 메트릭 대시보드
- [x] **Server Manager** (Electron 서버 관리 앱)
- [ ] iOS 지원
- [ ] 스크린샷 비교 (diff)
- [ ] AI 기반 자동 시나리오 생성

---

## 문서

- [GitHub Wiki](https://github.com/kws0109/QA_Automation/wiki) - 기능별 상세 문서

---

## 라이선스

MIT License

---

## 개발자

- **이름**: KIM WOOSUNG
- **이메일**: kws0553@gmail.com
- **GitHub**: https://github.com/kws0109
