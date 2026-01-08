# Phase 2 회고록: 멀티 디바이스 관리 및 병렬 실행

## 개요

**기간**: 2026년 1월 8일
**목표**: 다중 디바이스 동시 관리 및 병렬 시나리오 실행 기능 구현

---

## 구현 내용

### Backend

#### 1. SessionManager (`backend/src/services/sessionManager.ts`)
- 다중 디바이스 Appium 세션 관리
- 단일 Appium 서버(4723)에서 모든 세션 처리
- 디바이스별 고유 MJPEG 포트 할당 (9100, 9101, ...)
- 세션 헬스체크 및 자동 복구 기능
  - `checkSessionHealth()`: 세션 실제 동작 여부 확인
  - `ensureSession()`: 죽은 세션 감지 시 자동 재생성

#### 2. DeviceManager (`backend/src/services/deviceManager.ts`)
- ADB 기반 연결된 디바이스 스캔
- 디바이스 상세 정보 조회
  - 하드웨어: 브랜드, 제조사, 화면 해상도, 밀도
  - 시스템: CPU 모델명, ABI, SDK 버전, 빌드 번호
  - 실시간: 배터리, 메모리, 스토리지

#### 3. ParallelExecutor (`backend/src/services/parallelExecutor.ts`)
- 다중 디바이스 동시 시나리오 실행
- Socket.IO 기반 실시간 진행 상황 전송
- 디바이스별 실행 상태 관리

#### 4. Session API (`backend/src/routes/session.ts`)
- `POST /api/session/create`: 세션 생성
- `POST /api/session/destroy`: 세션 종료
- `GET /api/session/:deviceId/mjpeg`: MJPEG 스트림 프록시
- `POST /api/session/execute-parallel`: 병렬 실행

#### 5. Device API 개선 (`backend/src/routes/device.ts`)
- `deviceId` 쿼리/바디 파라미터 추가
- SessionManager 세션 우선 사용으로 충돌 방지

---

### Frontend

#### 1. DeviceDashboard (`frontend/src/components/DeviceDashboard/`)
- 탭 기반 UI (디바이스 목록 / 병렬 실행)
- 디바이스 검색 및 필터 기능
  - 텍스트 검색 (이름, 모델, ID)
  - 상태 필터 (연결됨, 오프라인, 미승인)
  - 브랜드 필터
  - OS 필터 (Android/iOS 준비)

#### 2. DeviceList (`frontend/src/components/DeviceList/`)
- 디바이스 카드 그리드 뷰
- 상세 정보 표시 (CPU, 메모리, 배터리 등)
- 선택/체크 기능

#### 3. ParallelControl (`frontend/src/components/ParallelControl/`)
- 시나리오 선택 드롭다운
- 선택된 디바이스에서 병렬 실행
- 실행 상태 표시

#### 4. ParallelLogs (`frontend/src/components/ParallelLogs/`)
- 실시간 실행 로그 뷰어
- 디바이스별 로그 필터링

#### 5. DevicePreview 개선 (`frontend/src/components/DevicePreview/`)
- 디바이스 선택 드롭다운 추가
- 자동 세션 생성 (디바이스 선택 시)
- 세션 미리 생성으로 빠른 전환
- MJPEG 에러 시 자동 복구

---

## 해결한 문제들

### 1. 세션 충돌 문제
**증상**: 탭 이동 후 프리뷰 먹통
**원인**: `appiumDriver`(기존)와 `sessionManager`(신규)가 각각 다른 세션 사용
**해결**: Device API에서 `deviceId` 파라미터로 SessionManager 세션 사용

### 2. UIAutomator2 크래시
**증상**: "instrumentation process cannot be initialized" 오류
**원인**: 이전 UIAutomator2 프로세스가 기기에 남아있음
**해결**:
- 세션 헬스체크로 죽은 세션 감지
- 자동 세션 재생성
- 수동 정리: `adb shell pm clear io.appium.uiautomator2.server`

### 3. 다중 세션 포트 충돌
**증상**: 두 번째 디바이스 세션 생성 실패 (ECONNREFUSED 4724)
**원인**: SessionManager가 디바이스마다 다른 Appium 포트 사용 시도
**해결**: 모든 세션이 동일한 Appium 포트(4723) 사용, MJPEG 포트만 분리

### 4. 느린 디바이스 전환
**증상**: 드롭다운에서 디바이스 변경 시 수 초 대기
**원인**: 매번 새 세션 생성
**해결**: 컴포넌트 로드 시 모든 연결된 디바이스 세션 미리 생성

---

## 기술적 결정사항

### 1. 단일 Appium 서버 vs 다중 서버
- **결정**: 단일 서버 (포트 4723)
- **이유**: 4대 이하 디바이스에서는 단일 서버로 충분, 설정 간소화
- **한계**: 10대 이상 시 다중 서버 또는 Selenium Grid 필요

### 2. 세션 미리 생성
- **결정**: 모든 연결된 디바이스 세션 미리 생성
- **이유**: 빠른 디바이스 전환 UX
- **트레이드오프**: 메모리 사용량 증가 (세션당 ~50-100MB)

### 3. iOS 지원 준비
- **결정**: `DeviceOS` 타입 분리 (`'Android' | 'iOS'`)
- **이유**: 향후 iOS 디바이스 추가 대비
- **현재**: Android만 구현, iOS는 타입만 준비

---

## 성능 고려사항

| 디바이스 수 | 권장 환경 | 예상 리소스 |
|------------|----------|------------|
| 2-5대 | 로컬 단일 Appium | 200-500MB RAM |
| 5-15대 | 로컬 단일 Appium (고사양) | 500MB-1.5GB RAM |
| 15대 이상 | 다중 Appium 서버 | 분산 구성 필요 |
| 50대 이상 | 클라우드 디바이스 팜 | AWS Device Farm 등 |

**ADB 제한**: ~16-20대에서 불안정해질 수 있음

---

## 남은 작업 (Phase 3 예정)

1. **병렬 실행 고도화**
   - 실행 결과 리포트 통합
   - 디바이스별 스크린샷 캡처

2. **iOS 지원**
   - XCUITest 드라이버 연동
   - iOS 디바이스 스캔

3. **스케줄링**
   - 예약 실행 기능
   - 반복 실행 설정

4. **알림**
   - 실행 완료/실패 알림
   - Slack/Discord 연동

---

## 배운 점

1. **Appium 세션 관리의 복잡성**
   - 단일 드라이버 패턴은 멀티 디바이스에 부적합
   - 세션 상태 추적과 복구 메커니즘 필수

2. **UIAutomator2 안정성**
   - 장시간 사용 시 크래시 가능성 있음
   - 헬스체크와 자동 복구로 안정성 확보

3. **낙관적 UI 업데이트**
   - 세션 미리 생성 + 즉시 URL 변경으로 UX 개선
   - 에러 시에만 복구 로직 실행

---

## 파일 구조

```
backend/src/
├── services/
│   ├── sessionManager.ts    # 세션 관리
│   ├── deviceManager.ts     # 디바이스 스캔/정보
│   └── parallelExecutor.ts  # 병렬 실행
├── routes/
│   ├── session.ts           # 세션 API
│   └── device.ts            # 디바이스 API (개선)
└── types/index.ts           # 타입 정의

frontend/src/components/
├── DeviceDashboard/         # 메인 대시보드
├── DeviceList/              # 디바이스 목록
├── DevicePreview/           # 프리뷰 (개선)
├── ParallelControl/         # 병렬 실행 컨트롤
└── ParallelLogs/            # 실행 로그
```

---

*작성일: 2026-01-08*
