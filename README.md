# 🎮 Game QA Automation Tool

> 플로우차트 기반 모바일 게임 테스트 자동화 도구

비개발자도 쉽게 사용할 수 있는 **시각적 노드 에디터**로 모바일 게임 테스트 시나리오를 작성하고 실행할 수 있습니다.

![Node Editor Screenshot](./docs/images/screenshot-main.png)

---

## ✨ 주요 기능

### 🔲 비주얼 노드 에디터
- 드래그 앤 드롭으로 테스트 시나리오 구성
- 직관적인 플로우차트 방식
- 실시간 연결선 편집

### 📱 디바이스 제어
- 탭, 스와이프, 롱프레스 등 터치 액션
- 스크린샷 기반 좌표 선택
- 앱 재시작, 데이터 삭제 등 시스템 액션

### ⏳ 로딩 대기
- 요소/텍스트 사라짐 대기
- 요소/텍스트 나타남 대기
- 커스텀 타임아웃 설정

### 🔀 조건 분기
- 요소 존재 여부 검사
- 화면 텍스트 포함 검사
- Yes/No 분기 처리

### 📊 실행 리포트
- 실행 결과 자동 저장
- 단계별 로그 기록
- 성공/실패 통계

---

## 🛠️ 기술 스택

| 분류 | 기술 |
|------|------|
| **Frontend** | React, Vite |
| **Backend** | Node.js, Express |
| **Automation** | Appium, WebDriverIO |
| **Communication** | WebSocket (Socket.IO) |
| **Target Platform** | Android |

---

## 📋 시스템 요구사항

- Node.js 18.x 이상
- Java JDK 17
- Android SDK
- Appium 2.x
- Android 기기 또는 에뮬레이터

---

## 🚀 설치 방법

### 1. 저장소 클론
```bash
git clone https://github.com/yourusername/game-automation-tool.git
cd game-automation-tool
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
```bash
# Windows (시스템 환경 변수)
ANDROID_HOME=C:\Users\{사용자}\AppData\Local\Android\Sdk
JAVA_HOME=C:\Program Files\Java\jdk-17
```

### 5. 환경 검증
```bash
appium-doctor --android
```

---

## ▶️ 실행 방법

### 1. Appium 서버 시작
```bash
appium
```

### 2. 백엔드 서버 시작
```bash
cd backend
npm start
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

## 📖 사용 가이드

### 1. 디바이스 연결

1. Android 기기의 **개발자 옵션 → USB 디버깅** 활성화
2. USB 케이블로 PC와 연결
3. `adb devices`로 연결 확인
4. 툴에서 **연결** 버튼 클릭

### 2. 시나리오 작성

1. 좌측 사이드바에서 노드를 캔버스로 드래그
2. 노드 선택 후 우측 패널에서 속성 설정
3. 노드 간 연결선으로 흐름 구성

### 3. 시나리오 실행

1. 상단 **실행** 버튼 클릭
2. 하단 콘솔에서 실시간 로그 확인
3. 실행 완료 후 리포트 확인

---

## 📂 프로젝트 구조
```
game-automation-tool/
├── frontend/                 # React 프론트엔드
│   ├── src/
│   │   ├── components/       # UI 컴포넌트
│   │   │   ├── Canvas/       # 노드 에디터 캔버스
│   │   │   ├── Sidebar/      # 노드 팔레트
│   │   │   ├── Panel/        # 속성 패널
│   │   │   ├── Header/       # 상단 메뉴
│   │   │   └── Console/      # 실행 로그
│   │   ├── App.jsx
│   │   └── main.jsx
│   └── package.json
│
├── backend/                  # Node.js 백엔드
│   ├── src/
│   │   ├── appium/          # Appium 연동
│   │   │   ├── driver.js    # 드라이버 관리
│   │   │   └── actions.js   # 액션 구현
│   │   ├── services/        # 비즈니스 로직
│   │   │   ├── scenario.js  # 시나리오 CRUD
│   │   │   ├── executor.js  # 시나리오 실행
│   │   │   └── report.js    # 리포트 관리
│   │   ├── routes/          # API 라우트
│   │   └── index.js         # 서버 진입점
│   ├── scenarios/           # 시나리오 저장
│   ├── reports/             # 리포트 저장
│   └── package.json
│
└── README.md
```

---

## 🔌 API 엔드포인트

### 디바이스

| Method | Endpoint | 설명 |
|--------|----------|------|
| POST | `/api/device/connect` | 디바이스 연결 |
| POST | `/api/device/disconnect` | 연결 해제 |
| GET | `/api/device/status` | 연결 상태 |
| GET | `/api/device/screenshot` | 스크린샷 |

### 액션

| Method | Endpoint | 설명 |
|--------|----------|------|
| POST | `/api/action/tap` | 탭 |
| POST | `/api/action/swipe` | 스와이프 |
| POST | `/api/action/longPress` | 롱프레스 |

### 시나리오

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/scenarios` | 목록 조회 |
| GET | `/api/scenarios/:id` | 상세 조회 |
| POST | `/api/scenarios` | 저장 |
| PUT | `/api/scenarios/:id` | 수정 |
| DELETE | `/api/scenarios/:id` | 삭제 |
| POST | `/api/scenarios/:id/run` | 실행 |

### 리포트

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/reports` | 목록 조회 |
| GET | `/api/reports/:id` | 상세 조회 |
| DELETE | `/api/reports/:id` | 삭제 |

---

## 🎯 노드 타입

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
| `clearData` | 앱 데이터 삭제 | - |

---

## 🐛 트러블슈팅

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

### 요소를 찾을 수 없음

- Appium Inspector로 올바른 selector 확인
- 대기 시간(timeout) 증가

---

## 📝 개발 로드맵

- [x] 환경 구축 및 프로젝트 초기화
- [x] Appium 연결 및 기본 액션
- [x] 시나리오 CRUD API
- [x] 시나리오 실행 엔진
- [x] WebSocket 실시간 통신
- [x] 노드 에디터 UI
- [x] 조건/루프 노드
- [x] 로딩 대기 액션
- [x] 실행 리포트
- [ ] 이미지 인식 기능
- [ ] iOS 지원

---

## 📄 라이선스

MIT License

---

## 👨‍💻 개발자

- **이름**: [Your Name]
- **이메일**: your.email@example.com
- **GitHub**: https://github.com/yourusername