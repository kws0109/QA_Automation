# 외부 접근 설정 가이드

## 개요

QA Automation Tool을 같은 네트워크의 다른 PC나 모바일 기기에서 접근하는 방법을 설명합니다.

---

## 네트워크 구성도

```
┌─────────────────────────────────────────────────────────────┐
│                       같은 네트워크 (LAN)                      │
│                                                             │
│  ┌─────────────────┐         ┌─────────────────┐           │
│  │   서버 PC       │         │   클라이언트     │           │
│  │  192.168.1.100  │◄───────►│  (다른 PC/모바일) │           │
│  │                 │   HTTP  │                 │           │
│  │ ┌─────────────┐ │         │  브라우저에서    │           │
│  │ │ Backend     │ │         │  접속:          │           │
│  │ │ :3001       │ │         │  http://192...  │           │
│  │ ├─────────────┤ │         └─────────────────┘           │
│  │ │ Frontend    │ │                                       │
│  │ │ :5173       │ │         ┌─────────────────┐           │
│  │ ├─────────────┤ │         │   Android 기기   │           │
│  │ │ Appium      │ │◄────────│  (USB 연결)      │           │
│  │ │ :4900       │ │   ADB   │                 │           │
│  │ └─────────────┘ │         └─────────────────┘           │
│  └─────────────────┘                                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 서버 PC 설정

### Step 1: 서버 PC IP 주소 확인

```bash
# Windows
ipconfig
# IPv4 주소 확인 (예: 192.168.1.100)

# Linux/Mac
ip addr
# 또는
ifconfig
```

### Step 2: Backend 환경변수 설정

`backend/.env` 파일을 수정합니다:

```bash
# 서버 포트
PORT=3001

# 외부 접근 허용 (중요!)
# 0.0.0.0 = 모든 네트워크 인터페이스에서 접근 허용
# 127.0.0.1 = 로컬에서만 접근 가능
HOST=0.0.0.0

# Appium 설정
APPIUM_PORT=4900
APPIUM_HOST=127.0.0.1

# Frontend URL (리포트 링크에 사용)
FRONTEND_URL=http://192.168.1.100:5173
```

### Step 3: Frontend 환경변수 설정

`frontend/.env` 파일을 수정합니다:

```bash
# 서버 호스트 (서버 PC의 IP 주소)
VITE_SERVER_HOST=192.168.1.100

# Backend 포트
VITE_BACKEND_PORT=3001

# 또는 전체 URL 직접 지정 (선택사항)
# VITE_API_URL=http://192.168.1.100:3001
# VITE_WS_URL=http://192.168.1.100:3001
# VITE_WS_STREAM_URL=ws://192.168.1.100:3001
```

### Step 4: Frontend 빌드 모드로 실행 (권장)

개발 모드(`npm run dev`)는 기본적으로 localhost만 허용합니다.
외부 접근을 위해 두 가지 방법 중 선택:

#### 방법 A: 개발 모드에서 호스트 바인딩

```bash
cd frontend
npm run dev -- --host 0.0.0.0
```

#### 방법 B: 프로덕션 빌드 후 서빙 (권장)

```bash
cd frontend
npm run build
npm run preview -- --host 0.0.0.0
```

### Step 5: 방화벽 설정

Windows 방화벽에서 포트를 열어야 합니다:

```powershell
# PowerShell (관리자 권한)

# Backend 포트 열기
netsh advfirewall firewall add rule name="QA Tool Backend" dir=in action=allow protocol=TCP localport=3001

# Frontend 포트 열기
netsh advfirewall firewall add rule name="QA Tool Frontend" dir=in action=allow protocol=TCP localport=5173

# 확인
netsh advfirewall firewall show rule name="QA Tool Backend"
netsh advfirewall firewall show rule name="QA Tool Frontend"
```

또는 Windows 설정 > 방화벽 > 인바운드 규칙에서 수동으로 추가합니다.

---

## Server Manager 사용 시 설정

Server Manager를 사용하면 **외부 접근이 자동으로 지원**됩니다:
- Frontend: `--host 0.0.0.0` 옵션이 자동 적용됨
- 설정(⚙) 버튼에서 포트 변경 가능
- 포트 변경 시 `.env` 파일이 자동으로 업데이트됨

**수동 설정 필요 항목:**
- `backend/.env`의 `HOST=0.0.0.0` (외부 API 접근용)
- `frontend/.env`의 `VITE_SERVER_HOST` (WebSocket URL용)

---

## 클라이언트 접속 방법

### 같은 네트워크의 다른 PC에서

브라우저를 열고 다음 주소로 접속:

```
http://192.168.1.100:5173
```

### 모바일 기기에서

1. 모바일 기기가 같은 Wi-Fi에 연결되어 있는지 확인
2. 모바일 브라우저에서 `http://192.168.1.100:5173` 접속

---

## 환경변수 우선순위

Frontend는 다음 순서로 URL을 결정합니다:

```
1. VITE_API_URL (직접 지정)
2. VITE_SERVER_HOST + VITE_BACKEND_PORT (조합)
3. window.location.hostname (브라우저 접속 호스트)
4. 127.0.0.1 (기본값)
```

**권장:** 외부 접근 시에는 `VITE_SERVER_HOST`를 명시적으로 설정하세요.

---

## 트러블슈팅

### 1. 접속이 안 됨

| 확인 사항 | 해결 방법 |
|-----------|-----------|
| 방화벽 | 포트 3001, 5173 인바운드 규칙 추가 |
| IP 주소 | `ipconfig`로 정확한 IP 확인 |
| 같은 네트워크 | 클라이언트가 같은 Wi-Fi/LAN에 있는지 확인 |
| HOST 설정 | `backend/.env`에 `HOST=0.0.0.0` 설정 |

### 2. API 호출 실패 (CORS 에러)

```
Access to fetch at 'http://192.168.1.100:3001' from origin 'http://192.168.1.100:5173' has been blocked by CORS
```

Backend는 이미 CORS를 허용하고 있습니다. 다음을 확인:
- Frontend `.env`의 `VITE_SERVER_HOST`가 올바른지
- 브라우저 캐시 삭제 후 재시도

### 3. WebSocket 연결 실패

```
WebSocket connection to 'ws://192.168.1.100:3001/...' failed
```

- `VITE_WS_STREAM_URL` 환경변수 확인
- Backend가 `HOST=0.0.0.0`으로 실행 중인지 확인

### 4. 디바이스 스트림이 안 보임

디바이스 스트리밍은 WebSocket을 사용합니다:
- 방화벽에서 WebSocket 연결 허용 확인
- `VITE_WS_STREAM_URL=ws://192.168.1.100:3001` 설정

---

## 완전한 설정 예시

### 서버 PC (192.168.1.100)

**backend/.env:**
```bash
PORT=3001
HOST=0.0.0.0
APPIUM_PORT=4900
APPIUM_HOST=127.0.0.1
FRONTEND_URL=http://192.168.1.100:5173
```

**frontend/.env:**
```bash
VITE_SERVER_HOST=192.168.1.100
VITE_BACKEND_PORT=3001
```

**실행 명령어:**
```bash
# 터미널 1: Appium
appium --port 4900 --allow-insecure=uiautomator2:adb_shell

# 터미널 2: Backend
cd backend && npm run dev

# 터미널 3: Frontend (외부 접근 허용)
cd frontend && npm run dev -- --host 0.0.0.0
```

**또는 Server Manager 사용 (권장):**
```bash
cd server-manager && npm run dev
# Frontend가 자동으로 --host 0.0.0.0으로 실행됨
```

### 클라이언트 PC

브라우저에서 접속:
```
http://192.168.1.100:5173
```

---

## VPN / 원격 네트워크 접근

같은 LAN이 아닌 외부 네트워크에서 접근하려면:

| 방법 | 설명 |
|------|------|
| **VPN** | 회사 VPN 연결 후 내부 IP로 접근 |
| **ngrok** | `ngrok http 5173`로 임시 공개 URL 생성 |
| **포트 포워딩** | 라우터에서 5173, 3001 포트 포워딩 (보안 주의) |
| **Cloudflare Tunnel** | Zero Trust 터널로 안전하게 노출 |

---

## 보안 고려사항

| 항목 | 권장 사항 |
|------|-----------|
| **인증** | Slack OAuth 또는 닉네임 로그인 활성화 |
| **네트워크** | 신뢰할 수 있는 내부 네트워크에서만 사용 |
| **방화벽** | 필요한 포트만 열기 |
| **HTTPS** | 프로덕션 환경에서는 HTTPS 적용 권장 |

---

*최종 수정일: 2026-01-30*
