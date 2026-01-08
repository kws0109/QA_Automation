# Phase 3 회고록: 병렬 실행 통합 리포트 및 비디오 녹화

## 개요

**기간**: 2026년 1월 9일
**목표**: 병렬 실행 결과를 통합 리포트로 저장하고, 디바이스별 스크린샷/비디오 녹화 기능 구현

---

## 구현 내용

### Backend

#### 1. ParallelReportService (`backend/src/services/parallelReport.ts`)
- 통합 리포트 CRUD 기능
  - `create()`: 병렬 실행 결과를 통합 리포트로 저장
  - `getAll()`: 리포트 목록 조회
  - `getById()`: 리포트 상세 조회
  - `delete()`: 리포트 삭제
  - `deleteAll()`: 전체 리포트 삭제
- 스크린샷 캡처 및 저장
  - `captureScreenshot()`: 디바이스별 스크린샷 캡처
  - `getScreenshot()`: 스크린샷 파일 조회
  - 저장 경로: `reports/screenshots/{reportId}/{deviceId}/{filename}.png`
- 비디오 녹화 저장
  - `saveVideo()`: Base64 비디오 데이터를 파일로 저장
  - `getVideo()`: 비디오 파일 조회
  - 저장 경로: `reports/videos/{reportId}/{deviceId}.mp4`

#### 2. ParallelExecutor 개선 (`backend/src/services/parallelExecutor.ts`)
- 비디오 녹화 시작/종료
  - `startRecordingScreen()`: 시나리오 시작 시 녹화 시작
  - `stopRecordingScreen()`: 시나리오 종료 시 녹화 종료 및 저장
  - `forceRestart: true` 옵션으로 병렬 녹화 충돌 방지
- 스크린샷 캡처 타이밍
  - 에러 발생 시 (`captureOnError`)
  - 시나리오 완료 시 (`captureOnComplete`)
  - 스크린샷은 비디오 종료 전에 캡처 (UIAutomator2 안정성)
- 통합 리포트 자동 생성
  - 병렬 실행 완료 시 `parallelReportService.create()` 호출

#### 3. Session API 확장 (`backend/src/routes/session.ts`)
- 리포트 API
  - `GET /api/session/parallel/reports`: 리포트 목록
  - `GET /api/session/parallel/reports/:id`: 리포트 상세
  - `DELETE /api/session/parallel/reports/:id`: 리포트 삭제
  - `DELETE /api/session/parallel/reports`: 전체 삭제
- 미디어 파일 서빙
  - `GET /api/session/parallel/screenshots/:reportId/:deviceId/:filename`
  - `GET /api/session/parallel/videos/:reportId/:filename`

#### 4. 타입 정의 (`backend/src/types/index.ts`)
```typescript
interface ScreenshotInfo {
  nodeId: string;
  timestamp: string;
  path: string;
  type: 'step' | 'error' | 'final';
}

interface VideoInfo {
  path: string;
  duration: number;
  size: number;
}

interface DeviceReportResult {
  deviceId: string;
  deviceName: string;
  success: boolean;
  duration: number;
  steps: StepResult[];
  screenshots: ScreenshotInfo[];
  video?: VideoInfo;
}

interface ParallelReport {
  id: string;
  scenarioId: string;
  scenarioName: string;
  deviceResults: DeviceReportResult[];
  stats: ParallelReportStats;
  startedAt: string;
  completedAt: string;
}
```

---

### Frontend

#### 1. ParallelReports 컴포넌트 (`frontend/src/components/ParallelReports/`)
- 리포트 목록 뷰
  - 시나리오명, 실행일시, 성공률 표시
  - 삭제 버튼 (개별/전체)
  - 새로고침 버튼
- 리포트 상세 뷰
  - 통계 요약 (디바이스 수, 단계 수, 소요시간)
  - 디바이스별 탭 전환
  - 단계별 실행 결과 테이블
- 비디오 플레이어
  - 디바이스별 녹화 영상 재생
  - 재생시간, 파일크기 표시
  - `key` prop으로 디바이스 전환 시 리로드 보장
- 스크린샷 갤러리
  - 그리드 레이아웃
  - 클릭 시 새 탭에서 원본 보기
  - 타입별 배지 (단계/에러/최종)

#### 2. App.tsx 수정
- 세 번째 탭 "실행 리포트" 추가
- ParallelReports 컴포넌트 연동

---

## 해결한 문제들

### 1. 리포트 ID 불일치 문제
**증상**: 스크린샷/비디오 경로와 리포트 ID가 다름
**원인**: `currentReportId`(타임스탬프)와 `create()`에서 생성하는 ID(순차번호)가 다름
**해결**: 파일 경로에 타임스탬프 기반 ID 사용, 리포트 JSON에 해당 경로 그대로 저장

### 2. Express 라우트 와일드카드 오류
**증상**: `'/parallel/screenshots/*'` 라우트에서 앱 크래시
**원인**: Express에서 `*` 와일드카드는 특정 조건에서만 동작
**해결**: 명시적 파라미터 사용 `'/parallel/screenshots/:reportId/:deviceId/:filename'`

### 3. 병렬 비디오 녹화 중복
**증상**: 두 디바이스에서 같은 비디오가 저장됨
**원인**: Appium 병렬 녹화 시 경쟁 조건 발생
**해결**:
- `forceRestart: true` 옵션 추가
- 디버그 로깅으로 Base64 데이터 크기/해시 비교

### 4. 비디오 요소 캐싱 문제
**증상**: 디바이스 탭 전환 시 이전 비디오가 계속 재생
**원인**: React에서 `<video>` 요소의 `<source>` URL 변경만으로는 리로드 안됨
**해결**: `<video>` 요소에 `key` prop 추가하여 강제 리마운트
```jsx
<video key={`video-${deviceResult.deviceId}-${deviceResult.video.path}`}>
```

### 5. UIAutomator2 크래시
**증상**: 비디오 녹화 종료 후 스크린샷 캡처 시 오류
**원인**: `stopRecordingScreen()` 직후 드라이버 불안정
**해결**: 스크린샷을 비디오 종료 전에 먼저 캡처

### 6. 전역 CSS 클래스 충돌
**증상**: 통계 카드에 연두색 배경/테두리가 표시됨
**원인**: `App.css`의 전역 `.success` 클래스가 적용됨
**해결**: 클래스명을 구체적으로 변경
- `success` → `stat-success`, `tab-success`, `status-success`
- `failed` → `tab-failed`, `status-failed`

### 7. 스크린샷 URL 경로 문제
**증상**: 스크린샷 404 오류, URL에 "screenshots" 중복
**원인**: Windows `path.join()`이 백슬래시 사용
**해결**: 템플릿 리터럴로 forward slash 직접 사용
```typescript
const relativePath = `screenshots/${reportId}/${deviceId}/${filename}`;
```

---

## 기술적 결정사항

### 1. 스크린샷 캡처 타이밍
- **결정**: 에러 시 + 완료 시만 캡처 (매 스텝 캡처 안함)
- **이유**: 스크린샷당 300-600ms 소요, 실행 속도 우선
- **대안**: 필요 시 옵션으로 매 스텝 캡처 가능

### 2. 비디오 녹화 설정
```typescript
{
  videoSize: '720x1280',  // 세로 모드 기준
  timeLimit: 300,         // 최대 5분
  bitRate: 4000000,       // 4Mbps
  forceRestart: true,     // 병렬 녹화 충돌 방지
}
```
- **이유**: 품질과 파일 크기 균형, 병렬 실행 안정성

### 3. 파일 저장 구조
```
reports/
├── parallel/           # 리포트 JSON
│   └── pr-{id}.json
├── screenshots/        # 스크린샷
│   └── pr-{timestamp}/
│       └── {deviceId}/
│           └── {nodeId}_{type}_{timestamp}.png
└── videos/             # 비디오
    └── pr-{timestamp}/
        └── {deviceId}.mp4
```
- **이유**: 리포트별/디바이스별 분리로 관리 용이

---

## 성능 고려사항

| 항목 | 측정값 | 비고 |
|------|--------|------|
| 스크린샷 캡처 | 300-600ms | 해상도에 따라 다름 |
| 비디오 녹화 오버헤드 | 거의 없음 | 백그라운드 녹화 |
| 비디오 파일 크기 | 1-5MB/분 | 4Mbps 비트레이트 |
| 스크린샷 파일 크기 | 200-500KB | PNG 포맷 |

---

## 남은 작업 (Phase 4 예정)

### 1. 리포트 기능 고도화
- [ ] 리포트 비교 기능 (이전 실행과 비교)
- [ ] 리포트 내보내기 (PDF, HTML)
- [ ] 리포트 공유 링크 생성

### 2. 스크린샷 기능 확장
- [ ] 스크린샷 비교 (diff 이미지 생성)
- [ ] 스크린샷 주석 추가
- [ ] 실패 스크린샷 하이라이트

### 3. 비디오 기능 확장
- [ ] 비디오 타임라인에 스텝 마커 표시
- [ ] 비디오 다운로드 버튼
- [ ] 비디오 썸네일 생성

### 4. iOS 지원
- [ ] XCUITest 드라이버 연동
- [ ] iOS 디바이스 스캔
- [ ] iOS 비디오 녹화 (다른 API 사용)

### 5. 스케줄링
- [ ] 예약 실행 기능
- [ ] 반복 실행 설정 (cron 표현식)
- [ ] 실행 이력 관리

### 6. 알림
- [ ] 실행 완료/실패 알림
- [ ] Slack/Discord 웹훅 연동
- [ ] 이메일 알림

### 7. 대시보드
- [ ] 실행 통계 차트
- [ ] 성공률 추이 그래프
- [ ] 디바이스별 성능 비교

---

## 배운 점

### 1. Appium 비디오 녹화
- `startRecordingScreen`/`stopRecordingScreen`은 Base64로 비디오 반환
- 병렬 실행 시 `forceRestart: true` 필수
- 녹화 종료 직후 드라이버 불안정할 수 있음

### 2. React 비디오 요소
- `<source>` URL만 변경하면 브라우저가 캐시된 비디오 사용
- `key` prop으로 강제 리마운트 필요

### 3. CSS 클래스 네이밍
- 전역 스타일과 충돌 방지를 위해 컴포넌트별 접두사 사용
- BEM 또는 CSS Modules 고려 필요

### 4. Express 라우트 패턴
- 와일드카드 `*` 대신 명시적 파라미터 사용
- 경로 파라미터는 URL-safe 해야 함

---

## 파일 구조

```
backend/src/
├── services/
│   ├── parallelReport.ts   # 통합 리포트 서비스 (NEW)
│   ├── parallelExecutor.ts # 병렬 실행 (비디오/스크린샷 추가)
│   └── ...
├── routes/
│   └── session.ts          # 리포트 API 추가
└── types/index.ts          # 타입 정의 추가

backend/reports/
├── parallel/               # 리포트 JSON
├── screenshots/            # 스크린샷 파일
└── videos/                 # 비디오 파일

frontend/src/
├── components/
│   └── ParallelReports/    # 리포트 뷰어 (NEW)
│       ├── ParallelReports.tsx
│       ├── ParallelReports.css
│       └── index.ts
├── types/index.ts          # 타입 정의 추가
└── App.tsx                 # 탭 추가
```

---

## 관련 커밋

- `fd82a7f` feat: Phase 3 - 병렬 실행 통합 리포트 및 비디오 녹화 기능

---

*최종 수정일: 2026-01-09*
