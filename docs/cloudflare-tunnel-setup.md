# Cloudflare Tunnel 설정 가이드

## 개요

**도메인**: `qa-automation-tool.dev`

| 서브도메인 | 용도 | 로컬 포트 |
|------------|------|-----------|
| `qa-automation-tool.dev` | Frontend | 5173 |
| `api.qa-automation-tool.dev` | Backend (API, WebSocket, Slack OAuth) | 3001 |

---

## 사전 준비

1. Cloudflare 계정 (무료)
2. 도메인이 Cloudflare DNS에 등록됨
3. cloudflared CLI 설치

---

## Step 1: cloudflared 설치

### Windows (Chocolatey)
```bash
choco install cloudflared
```

### Windows (직접 설치)
1. https://github.com/cloudflare/cloudflared/releases/latest
2. `cloudflared-windows-amd64.msi` 다운로드
3. 설치 실행

### 설치 확인
```bash
cloudflared --version
```

---

## Step 2: Cloudflare 로그인

```bash
cloudflared tunnel login
```

브라우저가 열리면:
1. Cloudflare 계정으로 로그인
2. `qa-automation-tool.dev` 도메인 선택
3. **Authorize** 클릭

인증 완료 후 `~/.cloudflared/cert.pem` 파일이 생성됩니다.

---

## Step 3: 터널 생성

```bash
cloudflared tunnel create qa-automation
```

출력 예시:
```
Created tunnel qa-automation with id a1b2c3d4-e5f6-7890-abcd-1234567890ab
```

터널 ID를 메모해두세요.

### 터널 확인
```bash
cloudflared tunnel list
```

---

## Step 4: DNS 레코드 추가

```bash
# Frontend (루트 도메인)
cloudflared tunnel route dns qa-automation qa-automation-tool.dev

# Backend API
cloudflared tunnel route dns qa-automation api.qa-automation-tool.dev
```

Cloudflare 대시보드 > DNS에서 CNAME 레코드가 추가된 것을 확인할 수 있습니다.

---

## Step 5: 설정 파일 생성

`C:\Users\{username}\.cloudflared\config.yml` 파일 생성:

```yaml
tunnel: qa-automation
credentials-file: C:\Users\{username}\.cloudflared\{tunnel-id}.json

ingress:
  # Frontend
  - hostname: qa-automation-tool.dev
    service: http://localhost:5173
    originRequest:
      noTLSVerify: true

  # Backend API (REST + WebSocket + Slack OAuth)
  - hostname: api.qa-automation-tool.dev
    service: http://localhost:3001
    originRequest:
      noTLSVerify: true

  # Catch-all (필수)
  - service: http_status:404
```

**주의**: `{username}`과 `{tunnel-id}`를 실제 값으로 변경하세요.

---

## Step 6: 터널 실행

```bash
cloudflared tunnel run qa-automation
```

정상 실행 시:
```
INF Starting tunnel tunnelID=a1b2c3d4-...
INF Connection established connIndex=0 ...
```

---

## Step 7: 환경변수 수정

### backend/.env
```bash
PORT=3001
HOST=0.0.0.0

# Slack OAuth (Cloudflare 도메인)
SLACK_CLIENT_ID=your_client_id
SLACK_CLIENT_SECRET=your_client_secret
SLACK_REDIRECT_URI=https://api.qa-automation-tool.dev/auth/slack/callback
JWT_SECRET=your_jwt_secret

# Frontend URL
FRONTEND_URL=https://qa-automation-tool.dev
```

### frontend/.env
```bash
# Cloudflare Tunnel 사용 시
VITE_SERVER_HOST=api.qa-automation-tool.dev
VITE_BACKEND_PORT=443
VITE_API_URL=https://api.qa-automation-tool.dev
VITE_WS_URL=https://api.qa-automation-tool.dev
VITE_WS_STREAM_URL=wss://api.qa-automation-tool.dev
```

---

## Step 8: Slack App 설정 변경

1. https://api.slack.com/apps 접속
2. 앱 선택
3. **OAuth & Permissions** 메뉴
4. **Redirect URLs** 수정:
   ```
   https://api.qa-automation-tool.dev/auth/slack/callback
   ```
5. **Save URLs** 클릭

---

## Step 9: 서비스 실행 순서

```bash
# 1. Cloudflare Tunnel (별도 터미널 또는 서비스)
cloudflared tunnel run qa-automation

# 2. Server Manager 실행
cd server-manager && npm run dev
# 또는 QA Server Manager 1.0.0.exe 실행

# 3. Start All 클릭
```

---

## Windows 서비스로 자동 실행 (선택)

터널을 Windows 서비스로 등록하면 PC 시작 시 자동 실행됩니다.

```powershell
# PowerShell (관리자 권한)
cloudflared service install
net start cloudflared
```

서비스 상태 확인:
```powershell
Get-Service cloudflared
```

서비스 제거:
```powershell
net stop cloudflared
cloudflared service uninstall
```

---

## 접속 URL

| 용도 | URL |
|------|-----|
| **Frontend** | https://qa-automation-tool.dev |
| **Backend API** | https://api.qa-automation-tool.dev |
| **Slack OAuth** | https://api.qa-automation-tool.dev/auth/slack/callback |

---

## 트러블슈팅

### 1. 터널 연결 안됨

```bash
# 터널 상태 확인
cloudflared tunnel info qa-automation

# 로그 확인
cloudflared tunnel run qa-automation --loglevel debug
```

### 2. DNS 전파 안됨

```bash
# DNS 확인
nslookup qa-automation-tool.dev
nslookup api.qa-automation-tool.dev
```

전파에 최대 24시간 걸릴 수 있습니다 (보통 몇 분).

### 3. WebSocket 연결 실패

`config.yml`에서 WebSocket 지원 확인:
```yaml
originRequest:
  noTLSVerify: true
```

### 4. Slack OAuth 실패

- Redirect URL이 정확히 일치하는지 확인
- `https://` 프로토콜 사용 필수
- backend/.env의 `SLACK_REDIRECT_URI` 확인

---

## 비용

| 항목 | 비용 |
|------|------|
| 도메인 (.dev) | ~$12/년 |
| Cloudflare DNS | 무료 |
| Cloudflare Tunnel | 무료 |
| **총합** | **~$12/년** |

---

*최종 수정일: 2026-01-30*
