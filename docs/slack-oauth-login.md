# Slack OAuth 로그인 기능 회고록

## 개요

**날짜**: 2026년 01월 27일
**목표**: 기존 닉네임 기반 사용자 식별을 Slack OAuth 로그인으로 대체하여 워크스페이스 기반 접근 제어 구현

---

## 배경

기존 시스템은 localStorage에 닉네임을 저장하는 방식으로 사용자를 식별했습니다. 이 방식의 문제점:

1. **인증 부재**: 누구나 임의의 닉네임으로 접근 가능
2. **사용자 관리 불가**: 실제 사용자 파악 어려움
3. **보안 취약**: 워크스페이스 외부 접근 차단 불가

Slack OAuth를 도입하면:
- 워크스페이스 멤버만 접근 가능
- 실제 사용자 정보(이름, 이메일, 프로필 사진) 자동 획득
- 추후 알림 기능 연동 용이

---

## 구현 내용

### 1. Backend 인증 라우트 (`backend/src/routes/auth.ts`)

Slack OAuth 2.0 플로우 구현:

```
사용자 → /auth/slack → Slack 로그인 페이지 →
Slack 콜백 → /auth/slack/callback → JWT 발급 → Frontend 리다이렉트
```

**주요 엔드포인트:**
| 엔드포인트 | 메서드 | 설명 |
|-----------|--------|------|
| `/auth/slack` | GET | Slack OAuth 시작 (리다이렉트) |
| `/auth/slack/callback` | GET | OAuth 콜백, JWT 발급 |
| `/auth/me` | GET | 현재 사용자 정보 조회 |
| `/auth/logout` | POST | 로그아웃 |
| `/auth/status` | GET | 인증 설정 상태 확인 |

**Slack API 호출:**
1. `oauth.v2.access`: Authorization Code → Access Token 교환
2. `users.identity`: 사용자 프로필 정보 조회

### 2. Cross-Origin 인증 문제 해결

**문제**: Backend(localhost:3001)에서 설정한 httpOnly 쿠키가 Frontend(localhost:5173)에서 접근 불가

**해결책**: 쿠키 대신 URL 파라미터 + localStorage 방식 채택

```
// 기존 (실패)
Backend: res.cookie('auth_token', token)
Frontend: fetch(..., { credentials: 'include' })

// 변경 (성공)
Backend: res.redirect(`${FRONTEND_URL}/?login=success&token=${token}`)
Frontend: localStorage.setItem('qa_tool_auth_token', token)
         fetch(..., { headers: { Authorization: `Bearer ${token}` } })
```

### 3. Frontend 로그인 페이지 (`frontend/src/components/LoginPage/`)

**LoginPage.tsx 주요 기능:**
- URL 파라미터에서 토큰 추출 후 localStorage 저장
- 저장된 토큰으로 자동 로그인 시도
- Slack 로그인 버튼 UI

**토큰 관리 함수 (export):**
```typescript
getAuthToken(): string | null    // localStorage에서 토큰 조회
setAuthToken(token: string): void // 토큰 저장
clearAuthToken(): void           // 토큰 삭제
```

### 4. Header 컴포넌트 개선

- Slack 프로필 아바타 표시
- 로그아웃 버튼 추가
- 기존 닉네임 변경 버튼 (Slack 미설정 시만 표시)

### 5. 폴백 시스템

Slack OAuth가 설정되지 않은 환경에서는 기존 닉네임 방식으로 자동 폴백:

```typescript
// App.tsx 인증 초기화 로직
1. 저장된 토큰으로 Slack 인증 확인
2. Slack 설정 여부 확인 (/auth/status)
3. Slack 설정됨 → 로그인 페이지 표시
4. Slack 미설정 → 기존 닉네임 모달 표시
```

---

## 영향 받는 파일

```
backend/
├── src/
│   ├── routes/auth.ts       # 신규: Slack OAuth 라우트
│   └── index.ts             # 수정: auth 라우트 등록
├── package.json             # 수정: jsonwebtoken, cookie-parser 추가
└── .env.example             # 수정: Slack 환경변수 예시 추가

frontend/
├── src/
│   ├── components/
│   │   ├── LoginPage/       # 신규: Slack 로그인 페이지
│   │   │   ├── LoginPage.tsx
│   │   │   ├── LoginPage.css
│   │   │   └── index.ts
│   │   └── Header/
│   │       ├── Header.tsx   # 수정: 아바타, 로그아웃 추가
│   │       └── Header.css   # 수정: 스타일 추가
│   ├── App.tsx              # 수정: 인증 상태 관리
│   └── App.css              # 수정: 로딩 스타일 추가
```

---

## 환경 설정

### 필수 환경 변수 (backend/.env)

```bash
# Slack OAuth 설정
SLACK_CLIENT_ID=your_client_id
SLACK_CLIENT_SECRET=your_client_secret
SLACK_REDIRECT_URI=https://your-domain/auth/slack/callback
JWT_SECRET=your_random_secret_key

# Frontend URL (CORS, 리다이렉트용)
FRONTEND_URL=http://localhost:5173
```

### Slack App 설정

1. https://api.slack.com/apps 에서 앱 생성
2. **OAuth & Permissions** 메뉴에서:
   - Redirect URL 추가 (HTTPS 필수, ngrok 사용 가능)
   - User Token Scopes 추가:
     - `identity.basic`
     - `identity.email`
     - `identity.avatar`
     - `identity.team`
3. **Client ID**와 **Client Secret** 복사

### ngrok 설정 (로컬 개발용)

```bash
ngrok http 3001
# 생성된 HTTPS URL을 SLACK_REDIRECT_URI에 사용
# 예: https://abc123.ngrok.io/auth/slack/callback
```

---

## 사용 방법

### 사용자 플로우

1. `http://localhost:5173` 접속
2. "Slack으로 로그인" 버튼 클릭
3. Slack 워크스페이스 선택 및 권한 승인
4. 자동으로 메인 화면 이동
5. 우측 상단에 프로필 아바타 표시
6. 로그아웃 시 아바타 클릭 → "로그아웃" 버튼

### API 사용 (인증 필요 요청)

```typescript
const token = localStorage.getItem('qa_tool_auth_token');
const response = await fetch('/api/some-endpoint', {
  headers: {
    'Authorization': `Bearer ${token}`,
  },
});
```

---

## 향후 개선 가능 사항

1. **워크스페이스 제한**: `ALLOWED_TEAM_IDS` 환경변수로 특정 워크스페이스만 허용
2. **역할 기반 접근 제어 (RBAC)**: 관리자/일반 사용자 권한 분리
3. **Slack 알림 연동**: 테스트 완료 시 Slack 채널에 결과 알림
4. **세션 갱신**: 토큰 만료 전 자동 갱신 (현재 7일 고정)
5. **다중 인증 지원**: Google OAuth, GitHub OAuth 추가

---

*최종 수정일: 2026-01-27*
