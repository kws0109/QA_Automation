# Game Automation Tool Wiki

비개발자가 시각적 플로우차트 인터페이스로 모바일 게임 자동화 테스트 시나리오를 만들 수 있는 도구

---

## Phase 회고록

* [[phase2-retrospective]] - 다중 디바이스 지원, 병렬 실행
* [[phase3-retrospective]] - 통합 리포트, 비디오 녹화
* [[phase4-scheduling-retrospective]] - 스케줄링 (예약/반복 실행)

---

## 세션/디바이스 관리

* [[session-management-improvements]] - 세션 관리 개선 (중복 생성 방지, DevicePreview 연결 UI)
* [[session-health-check-fix]] - 세션 유효성 검사 강화 (죽은 세션 자동 정리)
* [[legacy-singleton-driver-removal]] - 레거시 싱글톤 Driver 코드 제거 및 세션 검증 강화
* [[device-dashboard-ui-improvement]] - 디바이스 대시보드 UI 개선
* [[device-storage-feature]] - 디바이스 정보 영구 저장 및 실시간 모니터링
* [[device-realtime-preview]] - 디바이스 실시간 프리뷰 패널
* [[device-name-display]] - 로그에 deviceName 표시 (alias/model)

---

## 시나리오 편집

* [[scenario-save-feature]] - 시나리오 저장/덮어쓰기 기능
* [[new-scenario-feature]] - 캔버스 초기화 및 새 시나리오 생성
* [[scenario-modal-refactoring]] - 시나리오 모달 리팩토링 (불러오기/새로 만들기 분리)
* [[scenario-tree-explorer]] - 시나리오 트리 탐색기 UI
* [[tree-context-menu]] - 트리 컨텍스트 메뉴 (카테고리 관리)
* [[tree-drag-drop]] - 드래그 앤 드롭 시나리오 이동
* [[tree-search-filter]] - 트리 검색/필터 기능
* [[scenario-flow-summary]] - 시나리오 흐름 텍스트 요약 (테스트 케이스 변환 기반)
* [[node-label-feature]] - 플로우차트 노드에 사용자 정의 라벨 추가
* [[package-workflow-modal-separation]] - 패키지 기반 워크플로우 및 시나리오 모달 분리
* [[horizontal-node-layout]] - 노드 에디터 수평 레이아웃 (좌→우 자동 배치)

---

## 테스트 실행 시스템

* [[test-execution-refactoring]] - 테스트 실행 시스템 리팩토링 (Who/What/When 패러다임)
* [[test-execution-panel-ui]] - 테스트 실행 패널 UI 리팩토링 (가로 배치, 필터링)
* [[scenario-execution-tab]] - 시나리오 실행 탭 구현
* [[scenario-interval-feature]] - 시나리오 간 인터벌 설정 기능
* [[image-matching-debug-and-test-ui-refactor]] - 이미지 매칭 디버깅 개선 및 테스트 실행 UI 리팩토링
* [[multi-user-test-queue-system]] - 다중 사용자 테스트 큐 시스템 (디바이스 잠금, 대기열)
* [[multi-user-implementation-plan]] - 다중 사용자 구현 계획 (Step-by-Step)
* [[parallel-test-execution-architecture]] - 다중 테스트 병렬 실행 아키텍처 (가용성 우선 디스패치)
* [[legacy-parallel-executor-removal]] - 레거시 parallelExecutor 제거 계획 (큐 시스템 통합)
* [[split-execution-and-device-selection]] - 분할 실행 및 디바이스 선택 개선
* [[queue-sidebar-progress-refactor]] - QueueSidebar 진행률 계산 리팩토링

---

## 액션/이미지 인식

* [[terminate-app-feature]] - terminateApp 액션으로 앱 강제 종료
* [[template-name-error-message]] - 이미지 인식 에러 메시지 개선
* [[template-image-path-fix]] - 패키지별 템플릿 이미지 경로 수정
* [[image-recognition-enhancement-plan]] - 이미지 인식 고도화 계획 (게임 엔진 앱 대응)
* [[opencv-native-installation]] - OpenCV 네이티브 버전 설치 (WASM → Native)
* [[device-opencv-removal]] - 디바이스 측 OpenCV 매칭 제거 (백엔드 전용 전환)
* [[ocr-text-actions]] - OCR 텍스트 매칭 액션 (Google Cloud Vision API)

---

## 리포트/비디오

* [[video-timeline-feature]] - 비디오 타임라인 마커 기능
* [[test-reports-video-recording]] - TestReports 비디오 녹화 및 ParallelReports 삭제
* [[per-scenario-video-recording]] - 시나리오별 개별 비디오 녹화
* [[video-timeline-compatibility-fix]] - 비디오 타임라인 호환성 수정 (duration 단위, 툴팁)
* [[step-grouping-wait-actions]] - 대기 액션 스텝 그룹화 (테이블 간소화)
* [[video-seek-navigation]] - 비디오 시점 이동 (마커/테이블 행 클릭)

---

## UI/성능 최적화

* [[tab-switching-performance]] - 탭 전환 성능 최적화 (State Lifting, CSS display:none)
* [[ui-refactoring-patch]] - Header 간소화 및 레거시 코드 제거
* [[test-execution-performance]] - 테스트 실행 시작 성능 최적화 (병렬화, 즉시 피드백)
* [[device-loading-optimization]] - 디바이스 정보 로딩 최적화 (정적/동적 분리, 50대 지원 방안)

---

## 개발 도구/인프라

* [[github-wiki-feature]] - 회고록 자동 Wiki 게시
* [[eslint-setup-and-launchapp-fix]] - ESLint 설정 및 launchApp packageName 버그 수정

---

## 기술 스택

* **Frontend**: React 18, TypeScript, Vite
* **Backend**: Node.js, Express, TypeScript, Socket.IO
* **자동화**: Appium, UiAutomator2
* **이미지 처리**: sharp, pixelmatch

---

## 링크

* [GitHub Repository](https://github.com/kws0109/QA_Automation)
