# Server Manager 회고록

## 개요

**날짜**: 2026년 01월 30일
**목표**: Backend, Frontend, Appium 3개 서버를 통합 관리하는 Electron 데스크톱 앱 개발

---

## 배경

QA 자동화 도구를 실행하려면 3개의 서버를 각각 터미널에서 실행해야 했습니다:
- Backend: `cd backend && npm run dev`
- Frontend: `cd frontend && npm run dev`
- Appium: `appium --port 4900 --allow-insecure=uiautomator2:adb_shell`

매번 3개의 터미널을 열고 명령어를 입력하는 것은 번거로웠고, 특히 비개발자 QA 담당자에게는 진입 장벽이 되었습니다. 이를 해결하기 위해 원클릭으로 모든 서버를 관리할 수 있는 Electron 앱을 개발했습니다.

---

## 구현 내용

### 1. 프로젝트 구조

```
server-manager/
├── electron/
│   ├── main.ts           # Electron 메인 프로세스
│   ├── preload.ts        # 보안 브릿지 (contextBridge)
│   └── processManager.ts # 프로세스 관리 로직
├── src/
│   ├── App.tsx           # 메인 UI
│   ├── components/
│   │   ├── ServerCard.tsx      # 서버별 카드 UI
│   │   ├── LogViewer.tsx       # 로그 뷰어
│   │   ├── Settings.tsx        # 포트 설정 모달
│   │   └── StatusIndicator.tsx # 상태 표시
│   └── styles/App.css    # VS Code 다크 테마
├── vite.config.ts
└── package.json
```

### 2. 핵심 기능

#### 서버 관리
- **Start/Stop/Restart**: 각 서버 개별 제어
- **Start All**: Backend → Appium → Frontend 순차 시작
- **Stop All**: 모든 서버 동시 종료

#### 상태 모니터링
- 실시간 상태 표시 (Running/Stopped/Starting/Error)
- 포트 사용 여부 사전 체크
- PID 표시

#### 로그 뷰어
- 서버별 stdout/stderr 실시간 표시
- ANSI 이스케이프 코드 자동 제거
- 500개 로그 제한 (메모리 관리)
- 자동 스크롤

#### 시스템 트레이
- 최소화 시 트레이로 이동
- 트레이 메뉴: Start All / Stop All / Show / Quit

#### 포트 설정
- UI에서 Backend/Frontend/Appium 포트 변경 가능
- 설정 영구 저장 (`settings.json`)
- `.env` 파일 자동 동기화

### 3. ProcessManager 핵심 로직

```typescript
export class ProcessManager extends EventEmitter {
  // ANSI 이스케이프 코드 제거
  private static ANSI_REGEX = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

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

  // Windows 프로세스 트리 종료
  if (process.platform === 'win32') {
    execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' });
  }
}
```

### 4. 외부 접근 지원

동시에 `game-automation-tool`의 하드코딩된 포트들을 환경변수로 변경하여 외부 접근을 지원합니다:

**backend/src/index.ts**:
```typescript
const PORT = parseInt(process.env.PORT || '3001', 10);
const HOST = process.env.HOST || '0.0.0.0';  // 외부 접근 허용
server.listen(PORT, HOST, ...);
```

**frontend/src/config/api.ts**:
```typescript
export const SERVER_HOST = import.meta.env.VITE_SERVER_HOST
  || window.location.hostname
  || '127.0.0.1';
export const WS_STREAM_URL = `ws://${SERVER_HOST}:${BACKEND_PORT}`;
```

---

## 영향 받는 파일

```
# 신규 생성
server-manager/               # Electron 앱 전체
backend/.env.example          # 환경변수 문서
frontend/.env.example         # 환경변수 문서

# 수정
backend/src/index.ts          # PORT, HOST 환경변수 지원
frontend/src/config/api.ts    # 외부 접근 URL 지원
frontend/src/.../useScreenStream.ts  # WS_STREAM_URL 사용
.gitignore                    # server-manager 빌드 폴더 제외
```

---

## 사용 방법

### 개발 모드 실행
```bash
cd server-manager
npm install
npm run dev
```

### EXE 패키징
```bash
npm run build
# release/ 폴더에 portable exe 생성
```

### 포트 변경
1. 앱 우측 상단 설정(⚙) 버튼 클릭
2. 원하는 포트 입력
3. 저장 → `.env` 파일 자동 업데이트

---

## 기술적 결정

### 1. electron-builder 코드 서명 비활성화
Windows에서 심볼릭 링크 권한 문제로 코드 서명 실패. 내부 도구이므로 서명 없이 portable 빌드로 배포.

### 2. ANSI 코드 제거
`FORCE_COLOR=0`, `NO_COLOR=1` 환경변수 설정 + 정규식 후처리로 이중 방어.

### 3. contextIsolation
Electron 보안 모범 사례에 따라 `contextIsolation: true`로 렌더러 프로세스 격리.

---

## 향후 개선 가능 사항

1. **자동 업데이트**: electron-updater 연동
2. **다국어 지원**: i18n
3. **서버 헬스체크**: HTTP 핑으로 실제 응답 확인
4. **원격 서버 관리**: SSH 연동

---

*최종 수정일: 2026-01-30*
