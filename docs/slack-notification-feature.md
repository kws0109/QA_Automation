# Slack 테스트 결과 알림 기능 회고록

## 개요

**날짜**: 2026년 01월 27일
**목표**: 테스트 실행 완료 시 Slack으로 결과 알림 전송

---

## 배경

QA 팀에서 테스트 실행 결과를 실시간으로 확인하고 싶다는 요구가 있었습니다. 특히:
- 테스트 완료 시 즉시 알림 받기
- 실패한 테스트에 대해 팀 전체에 알림
- 별도의 모니터링 없이 결과 확인

기존 Slack OAuth 로그인 기능과 별개로, **테스트 결과 알림**을 위한 기능을 추가했습니다.

---

## 구현 내용

### 1. SlackNotificationService (Backend)

**파일**: `backend/src/services/slackNotificationService.ts`

환경변수 기반으로 Slack 알림을 전송하는 서비스:

```typescript
class SlackNotificationService {
  // 환경변수에서 설정 읽기
  private get webhookUrl(): string | undefined {
    return process.env.SLACK_WEBHOOK_URL;
  }

  // 테스트 결과 알림 전송
  async sendTestResultNotification(result: TestResult): Promise<void>

  // 연결 테스트
  async testConnection(): Promise<{ success: boolean; message: string }>

  // 현재 설정 조회
  getSettings(): SlackSettingsData
}
```

**지원하는 환경변수**:
| 변수 | 설명 | 기본값 |
|------|------|--------|
| `SLACK_WEBHOOK_URL` | Incoming Webhook URL | - |
| `SLACK_BOT_TOKEN` | Bot OAuth Token (대안) | - |
| `SLACK_DEFAULT_CHANNEL_ID` | Bot Token 사용 시 채널 | - |
| `SLACK_NOTIFY_ON_SUCCESS` | 성공 시 알림 | true |
| `SLACK_NOTIFY_ON_FAILURE` | 실패 시 알림 | true |
| `SLACK_NOTIFY_ON_PARTIAL` | 부분 성공 시 알림 | true |
| `SLACK_MENTION_ON_FAILURE` | 실패 시 @channel | true |

### 2. Slack API 라우트 (Backend)

**파일**: `backend/src/routes/slack.ts`

읽기 전용 API (설정은 .env에서만 가능):

| 엔드포인트 | 메서드 | 설명 |
|-----------|--------|------|
| `/api/slack/settings` | GET | 현재 설정 상태 조회 |
| `/api/slack/test` | POST | 연결 테스트 메시지 전송 |

### 3. SlackSettings 컴포넌트 (Frontend)

**파일**: `frontend/src/components/SlackSettings/`

읽기 전용 설정 화면:
- 연결 상태 표시 (연결됨/미설정)
- Webhook/Bot Token 설정 여부 표시
- 알림 조건 상태 표시 (성공/실패/부분성공/멘션)
- 연결 테스트 버튼
- `.env` 설정 방법 가이드

### 4. 테스트 실행기 연동

**파일**:
- `backend/src/services/testExecutor.ts`
- `backend/src/services/suiteExecutor.ts`

테스트 완료 시 자동으로 Slack 알림 전송:
```typescript
// testExecutor.ts
if (slackNotificationService.isConfigured()) {
  await slackNotificationService.sendTestResultNotification({
    testName: scenario.name,
    status: overallStatus,
    // ...
  });
}
```

### 5. 알림 메시지 형식

```
✅ 테스트 성공: 로그인 테스트

📊 시나리오: 5/5 성공
📱 디바이스: 3/3 성공
⏱️ 소요 시간: 2분 34초

🔗 리포트 보기
```

실패 시 `@channel` 멘션 포함 (설정에 따라).

---

## 설계 결정

### 환경변수 기반 설정 (vs 앱 내 설정)

**결정**: `.env` 파일에서만 설정 가능하도록 구현

**이유**:
1. **보안**: Webhook URL이 노출되면 악용 가능
2. **안정성**: 앱에서 설정 변경 시 오류 가능성
3. **운영 편의**: 서버 관리자만 설정 변경 가능
4. **단순성**: 설정 저장/동기화 로직 불필요

### apiClient 사용 (vs 일반 axios)

**문제**: 일반 axios로 API 호출 시 인증 토큰이 전달되지 않음

**해결**: `apiClient` (인터셉터로 토큰 자동 추가) 사용
```typescript
// Before
axios.get(`${API_BASE}/api/slack/settings`)

// After
apiClient.get(`${API_BASE_URL}/api/slack/settings`)
```

---

## 영향 받는 파일

```
backend/
├── src/
│   ├── routes/slack.ts              # 새 파일
│   ├── services/slackNotificationService.ts  # 새 파일
│   ├── services/testExecutor.ts     # 알림 연동 추가
│   ├── services/suiteExecutor.ts    # 알림 연동 추가
│   ├── appium/actions.ts            # TypeScript 오류 수정
│   └── index.ts                     # 라우트 등록
└── .env.example                     # 환경변수 예시

frontend/
├── src/
│   ├── components/SlackSettings/    # 새 폴더
│   │   ├── SlackSettings.tsx
│   │   └── SlackSettings.css
│   ├── App.tsx                      # Slack 설정 탭 추가
│   └── config/api.ts                # apiClient 추가
```

---

## 사용 방법

### 1. Webhook URL 생성

1. https://api.slack.com/apps 접속
2. "Create New App" → "From scratch"
3. "Incoming Webhooks" 활성화
4. "Add New Webhook to Workspace" 클릭
5. 채널 선택 후 Webhook URL 복사

### 2. 환경변수 설정

```bash
# backend/.env
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx/yyy/zzz

# 선택 옵션
SLACK_NOTIFY_ON_SUCCESS=true
SLACK_NOTIFY_ON_FAILURE=true
SLACK_MENTION_ON_FAILURE=true
```

### 3. 서버 재시작

```bash
cd backend && npm run dev
```

### 4. 연결 테스트

Frontend에서 "설정" → "Slack 알림" → "연결 테스트" 클릭

---

## TypeScript 오류 수정 (부수적)

### actions.ts - getActiveElement 타입 문제

**문제**: `driver.getActiveElement()`가 `string | Element` 반환
```typescript
// Error: clearValue does not exist on type 'string'
const el = await driver.getActiveElement();
await el.clearValue();
```

**해결**: `driver.$('*:focus')` 사용
```typescript
const focusedElement = await driver.$('*:focus');
if (await focusedElement.isExisting()) {
  await focusedElement.clearValue();
}
```

### suiteExecutor.ts - node.params 타입

**문제**: `node.params`가 `Record<string, unknown>`
```typescript
// Error: unknown is not assignable to string
const actionType = node.params?.actionType;
```

**해결**: 명시적 타입 캐스팅
```typescript
const actionType = (node.params?.actionType as string | undefined) || '';
```

---

## Cloudflare R2 연동 (2026-01-27 추가)

### 배경

Slack 알림에 포함된 리포트 링크가 내부 URL(`localhost`)이라서 외부에서 접근 불가능했습니다.
Cloudflare R2를 활용하여 HTML 리포트를 공개 URL로 제공하도록 개선했습니다.

### R2Uploader 서비스

**파일**: `backend/src/services/r2Uploader.ts`

```typescript
class R2Uploader {
  // R2 활성화 여부
  isEnabled(): boolean

  // HTML 리포트 업로드 → 공개 URL 반환
  async uploadReport(reportId: string, htmlContent: string, type: 'test' | 'suite'): Promise<string | null>

  // 리포트 삭제
  async deleteReport(reportId: string, type: 'test' | 'suite'): Promise<boolean>
}
```

### 흐름

```
테스트 완료
    ↓
reportExporter.generateHTML() → HTML 생성
    ↓
r2Uploader.uploadReport() → R2 업로드
    ↓
공개 URL 획득 (https://reports.domain.com/reports/test/{id}.html)
    ↓
Slack 알림에 "상세 리포트 보기" 버튼 포함
```

### R2 설정 방법

```bash
# .env
R2_ENABLED=true
R2_ACCOUNT_ID=your_cloudflare_account_id
R2_ACCESS_KEY_ID=your_r2_access_key
R2_SECRET_ACCESS_KEY=your_r2_secret_key
R2_BUCKET_NAME=qa-reports
R2_PUBLIC_URL=https://reports.your-domain.com
```

**Cloudflare 대시보드 설정**:
1. R2 → 버킷 생성
2. 설정 → 공개 액세스 활성화
3. 커스텀 도메인 연결 (선택)

### 요청자 멘션 기능

Slack 알림에 테스트 요청자를 자동으로 멘션합니다.

**구현:**
```typescript
// Slack ID가 있으면 멘션 형식으로 표시
const requesterDisplay = options?.requesterSlackId
  ? `<@${options.requesterSlackId}>`
  : requesterName;
```

**알림 메시지 예시:**
```
✅ 테스트 성공: 로그인 테스트

시나리오: 5/5 성공
디바이스: 3/3 성공
소요 시간: 2분 34초
요청자: @홍길동    ← 클릭하면 프로필로 이동
```

---

### apiClient 마이그레이션

R2 연동 과정에서 발견된 인증 문제도 함께 수정했습니다.

**문제**: 일부 컴포넌트에서 `axios`를 직접 사용하여 인증 토큰이 전달되지 않음

**해결**: `apiClient` (인터셉터로 토큰 자동 추가) 사용으로 통일

| 파일 | 변경 |
|------|------|
| App.tsx | `axios` → `apiClient` |
| DevicePreview.tsx | `axios.get` → `apiClient.get` |
| VideoConverter.tsx | `axios.delete` → `apiClient.delete` |

---

## 성능 최적화: 이미지/OCR 로그 레벨

50대 동시 실행 시 로그 부하를 줄이기 위해 이미지 인식/OCR 로그를 `logger.debug`로 변경했습니다.

**변경 파일:**
- `backend/src/services/imageMatch.ts`
- `backend/src/services/textMatcher/textMatcher.ts`

**설정 방법:**
```bash
# .env
LOG_LEVEL=INFO      # 프로덕션 (상세 로그 출력 안 함)
LOG_LEVEL=DEBUG     # 디버깅 시 (모든 로그 출력)

# 특정 모듈만 비활성화
LOG_DISABLED_MODULES=ImageMatch,TextMatcher
```

---

## 향후 개선 가능 사항

1. **알림 템플릿 커스터마이징**: 메시지 형식을 사용자가 설정
2. **채널 선택**: 테스트별로 다른 채널에 알림
3. **Discord/Teams 지원**: 다른 메신저 연동
4. **알림 히스토리**: 전송된 알림 로그 저장
5. **리포트 자동 삭제**: 오래된 R2 리포트 정리 정책

---

*최종 수정일: 2026-01-27*
