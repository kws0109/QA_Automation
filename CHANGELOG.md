# Changelog

모든 주요 변경 사항이 이 파일에 기록됩니다.

형식은 [Keep a Changelog](https://keepachangelog.com/ko/1.0.0/)를 기반으로 합니다.

---

## [Unreleased]

### Added
- 스크린샷 로딩 최적화 (썸네일 + 가상화 그리드)
- API Reference 및 Architecture Diagram 문서
- Backend/Frontend README 문서

### Fixed
- Server Manager restart 시 상태 동기화 버그
- testExecutor 액션 타임아웃 시 테스트 중단 처리

---

## [2026-01-29] - Server Manager & 외부 접근

### Added
- **Server Manager (Electron)**: Backend, Frontend, Appium 통합 관리 앱
  - 원클릭 시작/중지
  - 실시간 로그 뷰어
  - 시스템 트레이 지원
  - Windows portable exe 패키징
- **외부 접근 지원**
  - LAN 내 다른 PC에서 접근 가능
  - Cloudflare Tunnel 연동 (인터넷 접근)
  - 동적 API URL 설정

### Fixed
- Cloudflare Tunnel 환경 호환성 개선
- Server Manager Windows cmd.exe ENOENT 에러

### Documentation
- Cloudflare Tunnel 설정 가이드
- 외부 접근 설정 가이드
- Server Manager 사용법

---

## [2026-01-28] - 대규모 리팩토링

### Changed
- **Context 분리**: AppStateContext를 7개 Context로 분리
  - AuthContext, DeviceContext, ExecutionContext
  - UIContext, FlowEditorContext, ScenarioEditorContext
  - EditorPreviewContext
- **testExecutor 모듈화**: 1,979줄 → 5개 모듈로 분리
  - ExecutionStateManager
  - ExecutionMediaManager
  - ActionExecutionService
  - NodeNavigationService
  - PerformanceMetricsCollector

### Added
- Rate Limiting 미들웨어 (5가지 리미터)
- Zod 스키마 검증 (scenario, execution)
- ErrorBoundary 컴포넌트
- 폴링 통합 (DeviceContext, useQueueStatus)

### Fixed
- 순환 의존성 제거
- 중복 코드 정리

---

## [2026-01-27] - 노드 편집 기능 강화

### Added
- **노드 복사/붙여넣기**: Ctrl+C/V로 노드 복제
- **노드 사이에 붙여넣기**: 연결 중간에 노드 삽입
- **노드 검색**: 시나리오 내 노드 검색 기능
- **스와이프 좌표 선택**: 프리뷰에서 드래그로 좌표 선택

### Fixed
- 좌표 변환 오류 (가로/세로 모드 대응)
- 에디터 테스트 하이라이트 스크린샷 스킵

---

## [2026-01-26] - 텍스트 입력 개선

### Added
- **ADB 직접 입력**: 키보드 언어 무관 텍스트 입력
- **기존 텍스트 삭제 옵션**: clearFirst
- **랜덤 텍스트**: useAdb/clearFirst 옵션 추가

### Changed
- 텍스트 입력 로직 단순화 (replaceElementValue + setValue)

### Fixed
- ADB 클립보드 입력 문제 해결

---

## [2026-01-25] - 조건 노드 확장

### Added
- 조건 노드 이미지/OCR 조건 지원
- 에디터 테스트 조건 노드 분기 지원
- 템플릿 이미지 프리뷰 표시

### Fixed
- MJPEG 프록시 안정성 개선

---

## [2026-01-24] - SuiteExecutor 통합

### Changed
- SuiteExecutor에 NodeNavigationService 통합
- SuiteExecutor에 PerformanceMetricsCollector 통합
- 성능 메트릭 로직 통합
- testExecutor/suiteExecutor 액션 실행 로직 통합

### Fixed
- 인증 및 대시보드 관련 버그

---

## [2026-01-23] - OpenCV 네이티브 빌드

### Added
- OpenCV 네이티브 빌드 및 테스트 환경 구성
- opencv4nodejs 의존성 추가

### Changed
- 이미지 매칭 성능 개선 (네이티브 OpenCV)

---

## [2026-01-22] - 실행 모듈 분리

### Changed
- execution 모듈 디렉토리 분리
  - `backend/src/services/execution/`
  - types.ts, ExecutionStateManager.ts
  - ExecutionMediaManager.ts, ActionExecutionService.ts
  - NodeNavigationService.ts

### Documentation
- Phase 1-3 대규모 리팩토링 회고록

---

## [Phase 4] - 스케줄링 & 리포트 내보내기

### Added
- **스케줄링**: Cron 기반 예약 실행
  - scheduleService, scheduleManager
  - 프리셋 (매일 10시, 매시간 등)
  - 요일 선택 UI
  - 즉시 실행 버튼
  - 실행 이력 조회
- **리포트 내보내기**
  - HTML 내보내기 (스크린샷 Base64 임베딩)
  - PDF 내보내기 (Puppeteer)
- **비디오 타임라인**
  - 스텝별 마커 표시
  - 마커 클릭 시 해당 시점 이동
  - 대기 액션 시작/완료 이원화

---

## [Phase 3] - 통합 리포트 & 비디오 녹화

### Added
- **통합 리포트**
  - ParallelReportService
  - 디바이스별 스크린샷 캡처
  - 디바이스별 비디오 녹화
- **리포트 뷰어**
  - 디바이스별 탭 전환
  - 단계별 실행 결과 테이블
  - 비디오 플레이어
  - 스크린샷 갤러리

---

## [Phase 2] - 다중 디바이스 지원

### Added
- **DeviceManager**: ADB 디바이스 목록 조회
- **SessionManager**: 디바이스별 Appium 세션 관리
- **ParallelExecutor**: 병렬 시나리오 실행
- **Actions 클래스 리팩토링**: DriverProvider 주입 방식
- **디바이스 대시보드**: 상세 정보 카드 UI
- **디바이스 정보 영구 저장**: 오프라인 디바이스 유지

### Changed
- 포트 자동 할당 (Appium, MJPEG)

---

## [Phase 1] - 이미지 인식

### Added
- **템플릿 매칭**: sharp, pixelmatch 기반
- **MJPEG 실시간 스트리밍**
- **이미지 기반 액션**
  - tapImage
  - waitUntilImage
  - waitUntilImageGone

---

## [Phase 0] - TypeScript 마이그레이션

### Changed
- Backend 전체 .js → .ts 변환
- Frontend 전체 .jsx → .tsx 변환
- 타입 정의 완료

---

## 추가 기능

### Slack 연동
- Slack OAuth 로그인
- 테스트 결과 알림
- 채널 선택 UI

### OCR 텍스트 인식
- Google Cloud Vision API 연동
- tapOcrText, waitUntilTextExists, waitUntilTextGone

### 메트릭 대시보드
- 실행 통계, 성공률 추이
- 기간별 필터링

### 이미지 매칭 하이라이트
- 매칭 영역 시각화
- ROI 설정 지원

### 노드 라벨
- 시나리오 플로우 설명 텍스트

### terminateApp 액션
- 앱 강제 종료

---

## 기술 부채 해결

- React Query 마이그레이션 (조건부 - 필요 시)
- 폴링 통합으로 API 호출 76% 감소
- Context 분리로 리렌더링 최적화
- Rate Limiting으로 서버 보호
- Zod 스키마로 입력 검증 자동화

---

*최종 수정일: 2026-01-30*
