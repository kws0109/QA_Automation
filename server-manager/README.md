# QA Server Manager

Backend, Frontend, Appium 3개 서버를 통합 관리하는 Electron 데스크톱 앱

## 기능

- **서버 관리**: 각 서버 개별 시작/종료/재시작
- **일괄 제어**: Start All / Stop All 버튼
- **실시간 로그**: 각 서버의 stdout/stderr 실시간 표시
- **시스템 트레이**: 최소화 시 트레이로 이동, 백그라운드 실행

## 관리 대상 서버

| 서버 | 포트 | 설명 |
|------|------|------|
| Backend | 3001 | Express API 서버 |
| Frontend | 5173 | Vite 개발 서버 |
| Appium | 4900 | Appium 자동화 서버 |

## 설치

```bash
cd server-manager
npm install
```

## 개발 모드 실행

```bash
npm run electron:dev
```

## 프로덕션 빌드

```bash
npm run build
```

빌드된 설치 파일은 `release/` 폴더에 생성됩니다.

## 사용법

### 개별 서버 제어
- **Start**: 서버 시작
- **Stop**: 서버 종료 (Windows: taskkill /T /F)
- **Restart**: 서버 재시작

### 전체 서버 제어
- **Start All**: Backend → Appium → Frontend 순서로 시작
- **Stop All**: 모든 서버 동시 종료

### 로그 뷰어
- 드롭다운으로 서버 선택
- Auto-scroll 체크박스로 자동 스크롤 토글
- Clear 버튼으로 로그 초기화

### 시스템 트레이
- 창 닫기 시 트레이로 최소화
- 트레이 아이콘 더블클릭: 창 표시
- 트레이 우클릭 메뉴:
  - Show: 창 표시
  - Start All / Stop All
  - Quit: 앱 종료 (모든 서버도 종료)

## 기술 스택

- **Electron** 28.x
- **React** 18.x
- **Vite** 5.x
- **TypeScript** 5.x

## 프로젝트 구조

```
server-manager/
├── electron/
│   ├── main.ts           # Electron 메인 프로세스
│   ├── preload.ts        # 보안 브릿지 (contextBridge)
│   └── processManager.ts # 프로세스 관리 로직
├── src/
│   ├── App.tsx           # 메인 React 컴포넌트
│   ├── main.tsx          # React 엔트리포인트
│   ├── types.ts          # TypeScript 타입 정의
│   ├── components/
│   │   ├── ServerCard.tsx     # 서버 카드 UI
│   │   ├── LogViewer.tsx      # 로그 뷰어
│   │   └── StatusIndicator.tsx # 상태 표시
│   └── styles/
│       └── App.css       # Catppuccin Mocha 테마 스타일
├── public/
│   └── (아이콘 파일들)
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## 아이콘 설정

`public/` 폴더에 다음 아이콘 파일을 추가하세요:

- `icon.png`: 앱 아이콘 (256x256)
- `icon.ico`: Windows 앱 아이콘
- `tray-icon.png`: 시스템 트레이 아이콘 (16x16 또는 32x32)

## 주의사항

- Windows 환경에서 테스트됨
- Appium이 시스템 PATH에 설치되어 있어야 함
- 프로젝트 경로는 `game-automation-tool/` 기준
