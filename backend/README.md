# Backend

QA Automation Tool의 Express.js 기반 API 서버

---

## 개요

- **프레임워크**: Express.js + TypeScript
- **실시간 통신**: Socket.IO
- **자동화**: Appium + WebdriverIO
- **포트**: 3001 (기본)

---

## 디렉토리 구조

```
backend/src/
├── index.ts                 # 앱 엔트리포인트
├── appium/
│   ├── driver.ts            # Appium 드라이버 (싱글톤)
│   └── actions/             # 디바이스 액션 (tap, swipe 등)
├── services/
│   ├── testExecutor.ts      # 테스트 실행 엔진
│   ├── testOrchestrator.ts  # 실행 조율 (큐/디스패치)
│   ├── suiteExecutor.ts     # Suite 실행
│   ├── deviceManager.ts     # ADB 디바이스 관리
│   ├── sessionManager.ts    # Appium 세션 관리
│   ├── imageMatch.ts        # 이미지 템플릿 매칭
│   ├── textMatcher/         # OCR 텍스트 매칭
│   ├── reportExporter.ts    # HTML/PDF 리포트 생성
│   ├── slackNotificationService.ts  # Slack 알림
│   ├── r2Uploader.ts        # Cloudflare R2 업로드
│   ├── scheduleManager.ts   # Cron 스케줄 관리
│   ├── thumbnailService.ts  # 스크린샷 썸네일 생성
│   └── execution/           # 실행 관련 모듈 (분리됨)
├── routes/
│   ├── auth.ts              # 인증 (Slack OAuth, JWT)
│   ├── test.ts              # 테스트 실행 API
│   ├── suite.ts             # Suite CRUD
│   ├── device.ts            # 디바이스 API
│   ├── scenario.ts          # 시나리오 CRUD
│   ├── testReport.ts        # 리포트 API
│   ├── schedule.ts          # 스케줄 API
│   └── slack.ts             # Slack 설정 API
├── middleware/
│   ├── auth.ts              # JWT 인증 미들웨어
│   ├── rateLimiter.ts       # Rate Limiting
│   └── validateSchema.ts    # Zod 검증
├── schemas/                 # Zod 스키마
├── types/                   # TypeScript 타입 정의
├── events/                  # Socket.IO 이벤트 핸들러
└── utils/                   # 유틸리티 함수
```

---

## 서비스 아키텍처

### 테스트 실행 흐름

```
┌─────────────┐    ┌──────────────────┐    ┌────────────────┐
│   Client    │───▶│ testOrchestrator │───▶│  testExecutor  │
│  (Frontend) │    │   (큐/디스패치)   │    │   (실행 엔진)   │
└─────────────┘    └──────────────────┘    └────────────────┘
                            │                       │
                            ▼                       ▼
                   ┌────────────────┐     ┌─────────────────┐
                   │ testQueueService│    │  sessionManager │
                   │  (대기열 관리)   │    │  (Appium 세션)  │
                   └────────────────┘     └─────────────────┘
                                                   │
                                                   ▼
                                          ┌─────────────────┐
                                          │    Actions      │
                                          │ (tap, swipe 등) │
                                          └─────────────────┘
```

### 주요 서비스

| 서비스 | 역할 |
|--------|------|
| `testOrchestrator` | 테스트 요청 수신, 큐 관리, 실행 디스패치 |
| `testExecutor` | 시나리오 노드 순회 및 실행, 상태 브로드캐스트 |
| `suiteExecutor` | Suite 단위 순차 실행 |
| `sessionManager` | 디바이스별 Appium 세션 관리 |
| `deviceManager` | ADB 디바이스 탐색, 상태 모니터링 |
| `imageMatch` | OpenCV 기반 템플릿 매칭 |
| `textMatcher` | Google Cloud Vision OCR |
| `scheduleManager` | node-cron 기반 예약 실행 |

---

## API 엔드포인트

### 인증 (`/auth`)

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/auth/slack` | Slack OAuth 시작 |
| GET | `/auth/slack/callback` | OAuth 콜백 |
| GET | `/auth/status` | 인증 상태 |
| POST | `/auth/nickname` | 닉네임 로그인 |
| POST | `/auth/logout` | 로그아웃 |

### 디바이스 (`/api/devices`)

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/devices` | 디바이스 목록 |
| GET | `/api/devices/:id` | 디바이스 상세 |
| PUT | `/api/devices/:id/alias` | 별칭 수정 |
| DELETE | `/api/devices/:id` | 저장된 디바이스 삭제 |

### 세션 (`/api/sessions`)

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/sessions` | 세션 목록 |
| POST | `/api/sessions/:deviceId/start` | 세션 시작 |
| POST | `/api/sessions/:deviceId/stop` | 세션 종료 |
| GET | `/api/sessions/:deviceId/stream` | MJPEG 스트림 |

### 시나리오 (`/api/scenarios`)

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/scenarios` | 시나리오 목록 |
| GET | `/api/scenarios/:id` | 시나리오 상세 |
| POST | `/api/scenarios` | 시나리오 생성 |
| PUT | `/api/scenarios/:id` | 시나리오 수정 |
| DELETE | `/api/scenarios/:id` | 시나리오 삭제 |

### Suite (`/api/suites`)

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/suites` | Suite 목록 |
| POST | `/api/suites` | Suite 생성 |
| PUT | `/api/suites/:id` | Suite 수정 |
| DELETE | `/api/suites/:id` | Suite 삭제 |
| POST | `/api/suites/:id/execute` | Suite 실행 |

### 테스트 실행 (`/api/test`)

| Method | Endpoint | 설명 |
|--------|----------|------|
| POST | `/api/test/execute` | 테스트 실행 요청 |
| GET | `/api/test/queue/status` | 큐 상태 조회 |
| POST | `/api/test/stop/:executionId` | 실행 중지 |
| GET | `/api/test/progress/:executionId` | 진행률 조회 |

### 리포트 (`/api/test-reports`)

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/test-reports` | 리포트 목록 |
| GET | `/api/test-reports/:id` | 리포트 상세 |
| DELETE | `/api/test-reports/:id` | 리포트 삭제 |
| GET | `/api/test-reports/:id/export/html` | HTML 내보내기 |
| GET | `/api/test-reports/:id/export/pdf` | PDF 내보내기 |

### 스케줄 (`/api/schedules`)

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/schedules` | 스케줄 목록 |
| POST | `/api/schedules` | 스케줄 생성 |
| PUT | `/api/schedules/:id` | 스케줄 수정 |
| DELETE | `/api/schedules/:id` | 스케줄 삭제 |
| POST | `/api/schedules/:id/enable` | 활성화 |
| POST | `/api/schedules/:id/disable` | 비활성화 |
| POST | `/api/schedules/:id/run` | 즉시 실행 |

### 이미지 (`/api/images`)

| Method | Endpoint | 설명 |
|--------|----------|------|
| POST | `/api/images/match` | 이미지 매칭 테스트 |
| POST | `/api/images/highlight` | 하이라이트 스크린샷 |

### OCR (`/api/ocr`)

| Method | Endpoint | 설명 |
|--------|----------|------|
| POST | `/api/ocr/recognize` | OCR 텍스트 인식 |
| POST | `/api/ocr/find` | 텍스트 위치 찾기 |

### Slack (`/api/slack`)

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/slack/channels` | 채널 목록 |
| PUT | `/api/slack/settings` | 알림 설정 |
| POST | `/api/slack/test` | 테스트 메시지 전송 |

---

## WebSocket 이벤트

### 클라이언트 → 서버

| 이벤트 | 설명 |
|--------|------|
| `subscribe:device` | 디바이스 상태 구독 |
| `unsubscribe:device` | 구독 해제 |

### 서버 → 클라이언트

| 이벤트 | 설명 |
|--------|------|
| `test:progress` | 테스트 진행률 |
| `test:step` | 스텝 실행 결과 |
| `test:complete` | 테스트 완료 |
| `test:error` | 에러 발생 |
| `device:status` | 디바이스 상태 변경 |
| `queue:update` | 대기열 상태 변경 |
| `schedule:executed` | 스케줄 실행됨 |

---

## 환경 변수

### 필수

```bash
PORT=3001
HOST=0.0.0.0

# Appium
APPIUM_PORT=4900
APPIUM_HOST=127.0.0.1
```

### 인증

```bash
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d

# Slack OAuth
SLACK_CLIENT_ID=...
SLACK_CLIENT_SECRET=...
SLACK_REDIRECT_URI=http://localhost:3001/auth/slack/callback
```

### 외부 서비스

```bash
# Slack 알림
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...

# Cloudflare R2
R2_ENABLED=true
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=qa-reports
R2_PUBLIC_URL=https://...

# Google Cloud Vision (OCR)
GOOGLE_APPLICATION_CREDENTIALS=./google_key.json
```

---

## 스크립트

```bash
# 개발 서버 (ts-node-dev)
npm run dev

# 타입 체크
npm run typecheck

# 프로덕션 빌드
npm run build

# 프로덕션 실행
npm start
```

---

## 미들웨어

### Rate Limiting

| 리미터 | 제한 | 대상 |
|--------|------|------|
| `generalLimiter` | 15분당 1000회 | 일반 API |
| `authLimiter` | 15분당 20회 | 인증 API |
| `executionLimiter` | 1분당 10회 | 테스트 실행 |
| `uploadLimiter` | 1분당 30회 | 파일 업로드 |
| `streamingLimiter` | 1분당 100회 | MJPEG 스트림 |

### Zod 스키마 검증

```typescript
import { validateBody } from '../middleware/validateSchema';
import { executeTestSchema } from '../schemas/execution.schema';

router.post('/execute', validateBody(executeTestSchema), controller.execute);
```

---

## 데이터 저장

| 데이터 | 저장 위치 |
|--------|----------|
| 시나리오 | `scenarios/` |
| 패키지 | `packages/` |
| Suite | `suites/` |
| 리포트 | `reports/` |
| 스크린샷 | `reports/screenshots/` |
| 비디오 | `reports/videos/` |
| 썸네일 | `reports/screenshots/*.webp` |
| 템플릿 이미지 | `templates/` |
| 디바이스 정보 | `devices/` |
| 스케줄 | `schedules/` |

---

## 의존성

### 핵심

| 패키지 | 용도 |
|--------|------|
| `express` | 웹 프레임워크 |
| `socket.io` | 실시간 통신 |
| `webdriverio` | Appium 클라이언트 |
| `sharp` | 이미지 처리 |
| `node-cron` | 스케줄링 |

### 인증

| 패키지 | 용도 |
|--------|------|
| `jsonwebtoken` | JWT 생성/검증 |
| `@slack/oauth` | Slack OAuth |
| `@slack/web-api` | Slack API |

### 유틸리티

| 패키지 | 용도 |
|--------|------|
| `zod` | 스키마 검증 |
| `uuid` | UUID 생성 |
| `puppeteer` | PDF 생성 |
| `fluent-ffmpeg` | 비디오 처리 |

---

*최종 수정일: 2026-01-30*
