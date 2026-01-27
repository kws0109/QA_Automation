# 테스트 스위트, 실행 센터, 비디오 타임라인 회고록

## 개요

**날짜**: 2026년 01월 27일
**목표**: 테스트 스위트 기능 구현, 실행 센터 통합, 비디오 타임라인 기능 추가

---

## 배경

QA 자동화 도구의 실용성을 높이기 위해 다음 기능들이 필요했습니다:

1. **테스트 스위트**: 여러 시나리오를 묶어서 순차 실행하는 기능
2. **실행 센터 통합**: 테스트 실행과 큐 현황을 한 화면에서 관리
3. **비디오 타임라인**: 실행 영상에서 각 단계를 쉽게 찾아볼 수 있는 기능

---

## 구현 내용

### 1. 테스트 스위트 (Suite) 기능

#### Backend
- **`backend/src/types/suite.ts`**: Suite 관련 타입 정의
  - `Suite`: 스위트 기본 정보 (이름, 설명, 시나리오 목록, 디바이스 목록)
  - `SuiteExecution`: 스위트 실행 상태 추적
  - `SuiteExecutionResult`: 실행 결과

- **`backend/src/services/suiteService.ts`**: 스위트 CRUD
  ```typescript
  class SuiteService {
    create(data: CreateSuiteRequest): Suite
    getAll(): Suite[]
    getById(id: string): Suite
    update(id: string, data: Partial<Suite>): Suite
    delete(id: string): void
  }
  ```

- **`backend/src/services/suiteExecutor.ts`**: 스위트 실행 엔진
  - 선택된 디바이스들에 시나리오 순차 실행
  - WebSocket으로 실시간 진행 상황 전송
  - 디바이스별 독립 실행 (한 디바이스 실패해도 다른 디바이스 계속)

- **`backend/src/services/suiteReportService.ts`**: 스위트 리포트 관리

- **`backend/src/routes/suite.ts`**: API 엔드포인트
  | 메서드 | 경로 | 설명 |
  |--------|------|------|
  | GET | `/api/suites` | 스위트 목록 |
  | POST | `/api/suites` | 스위트 생성 |
  | GET | `/api/suites/:id` | 스위트 상세 |
  | PUT | `/api/suites/:id` | 스위트 수정 |
  | DELETE | `/api/suites/:id` | 스위트 삭제 |
  | POST | `/api/suites/:id/execute` | 스위트 실행 |
  | POST | `/api/suites/execution/:id/stop` | 실행 중지 |

#### Frontend
- **`frontend/src/components/SuiteManager/`**: 스위트 관리 UI
  - 스위트 목록/생성/편집/삭제
  - 시나리오 선택 (드래그 앤 드롭으로 순서 조정)
  - 디바이스 선택
  - 실행 및 중지 버튼

### 2. 실행 센터 (ExecutionCenter) 통합

#### 파일 구조
```
frontend/src/components/ExecutionCenter/
├── ExecutionCenter.tsx    # 메인 컴포넌트
├── ExecutionCenter.css    # 스타일
└── index.ts               # export
```

#### 주요 변경사항
- **TestExecutionPanel** 간소화: 큐 관리 로직 제거, 순수 설정 UI로 변경
- **QueueSidebar**를 ExecutionCenter 레벨에서 관리
- 탭 구조:
  - 테스트 실행 (개별 시나리오)
  - Suite 실행 (스위트 선택 및 실행)
  - 실행 이력 (TestReports)

#### 레이아웃
```
┌─────────────────────────────────────────────────────────────┐
│ ExecutionCenter                                             │
├─────────────────────────────────────────┬───────────────────┤
│ Main Content Area                       │ QueueSidebar      │
│ ┌─────────────────────────────────────┐ │ ┌───────────────┐ │
│ │ [테스트 실행] [Suite 실행] [이력]   │ │ │ 진행 중 Suite │ │
│ ├─────────────────────────────────────┤ │ ├───────────────┤ │
│ │                                     │ │ │ 대기 중       │ │
│ │   Tab Content                       │ │ ├───────────────┤ │
│ │                                     │ │ │ 진행 중       │ │
│ │                                     │ │ ├───────────────┤ │
│ │                                     │ │ │ 완료          │ │
│ └─────────────────────────────────────┘ │ └───────────────┘ │
└─────────────────────────────────────────┴───────────────────┘
```

#### 시나리오 트리 레이아웃 수정
패키지/카테고리 펼치기 시 자식 요소가 우측이 아닌 아래로 확장되도록 CSS 수정:
```css
.scenario-tree { display: block; }
.tree-node { display: block; }
.tree-node .node-children { display: block; }
.package-node { display: block; }
```

### 3. 비디오 타임라인

#### 컴포넌트
- **`frontend/src/components/TestReports/VideoTimeline.tsx`**

#### 기능
- 비디오 플레이어 아래 타임라인 바 표시
- 각 실행 단계에 컬러 마커 표시:
  - 녹색: 성공 (passed)
  - 빨간색: 실패 (failed/error)
  - 노란색: 대기 중 (waiting)
- 마커 클릭 시 해당 시점으로 비디오 이동
- 마커 호버 시 툴팁 (노드명, 액션, 상태)

#### 포인터 위치 감지 개선
- **`backend/src/services/videoAnalyzer/pointerLocationDetector.ts`**
  - 영상에서 터치 포인터 위치 감지
  - OpenCV 기반 원형 감지

### 4. UI/UX 개선

#### QueueSidebar
- Suite 섹션 추가 (보라색 테마)
- 실행 중인 스위트 진행률 표시
- Suite 실행 중지 버튼

#### TestReports
- 디자인 전면 개선
- 비디오 타임라인 통합
- 단계별 상세 정보 표시

#### VideoConverter
- 진행률 바 개선
- 상태 메시지 표시

---

## 영향 받는 파일

### Backend (신규)
```
backend/src/routes/suite.ts
backend/src/services/suiteExecutor.ts
backend/src/services/suiteReportService.ts
backend/src/services/suiteService.ts
backend/src/services/videoAnalyzer/pointerLocationDetector.ts
backend/src/types/suite.ts
```

### Backend (수정)
```
backend/src/index.ts
backend/src/routes/video.ts
backend/src/services/videoAnalyzer/index.ts
backend/src/services/videoAnalyzer/screenRecorder.ts
backend/src/services/videoAnalyzer/types.ts
backend/src/services/videoAnalyzer/videoParser.ts
backend/src/types/index.ts
```

### Frontend (신규)
```
frontend/src/components/ExecutionCenter/
frontend/src/components/SuiteManager/
frontend/src/components/TestReports/VideoTimeline.tsx
```

### Frontend (수정)
```
frontend/src/App.tsx
frontend/src/components/TestExecutionPanel/QueueSidebar.css
frontend/src/components/TestExecutionPanel/QueueSidebar.tsx
frontend/src/components/TestExecutionPanel/TestExecutionPanel.css
frontend/src/components/TestExecutionPanel/TestExecutionPanel.tsx
frontend/src/components/TestReports/TestReports.css
frontend/src/components/TestReports/TestReports.tsx
frontend/src/components/VideoConverter/VideoConverter.css
frontend/src/components/VideoConverter/VideoConverter.tsx
frontend/src/types/index.ts
```

---

## 사용 방법

### 테스트 스위트 생성
1. Suite 관리 탭으로 이동
2. "새 스위트" 버튼 클릭
3. 이름, 설명 입력
4. 실행할 시나리오 선택 (순서 조정 가능)
5. 대상 디바이스 선택
6. "저장" 버튼 클릭

### 스위트 실행
1. 실행 센터 > Suite 실행 탭
2. 스위트 선택
3. "실행" 버튼 클릭
4. QueueSidebar에서 진행 상황 확인

### 비디오 타임라인 사용
1. 실행 이력 탭에서 리포트 선택
2. 비디오 플레이어 아래 타임라인 확인
3. 마커 클릭하여 해당 단계로 이동

---

## 향후 개선 가능 사항

1. **스위트 스케줄링**: 특정 시간에 스위트 자동 실행
2. **스위트 템플릿**: 자주 사용하는 스위트 구성 저장
3. **병렬 스위트 실행**: 여러 스위트 동시 실행
4. **타임라인 줌**: 특정 구간 확대/축소

---

*최종 수정일: 2026-01-27*
