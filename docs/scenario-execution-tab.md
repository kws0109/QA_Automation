# 시나리오 실행 탭 분리 회고록

## 개요

**날짜**: 2025년 1월 10일
**목표**: 디바이스 관리 탭에서 시나리오 실행 기능을 별도의 "시나리오 실행" 탭으로 분리

---

## 배경

기존 DeviceDashboard 컴포넌트는 다음 기능들을 모두 담당하고 있었습니다:
- 디바이스 목록/상태 표시
- 검색/필터
- 세션 관리
- 별칭 편집
- **시나리오 선택**
- **디바이스 선택 (체크박스)**
- **병렬 실행 컨트롤**
- **실행 결과 표시**
- **실시간 로그 표시**

하나의 컴포넌트가 너무 많은 책임을 가지고 있어 관심사 분리(Separation of Concerns)가 필요했습니다. 디바이스 관리와 시나리오 실행은 서로 다른 작업 흐름이므로 탭을 분리하여 UX를 개선하고자 했습니다.

---

## 구현 내용

### 1. ScenarioExecution 컴포넌트 생성

새로운 시나리오 실행 전용 컴포넌트를 생성했습니다.

**파일 구조**:
```
frontend/src/components/ScenarioExecution/
├── ScenarioExecution.tsx   # 메인 컴포넌트
├── ScenarioExecution.css   # 스타일
└── index.ts                # export
```

**주요 기능**:
- 시나리오 선택 드롭다운
- 연결된 디바이스 목록 (체크박스 선택)
- 전체 선택/해제 버튼
- 병렬 실행 시작/중지 버튼
- 세션 자동 생성 (세션 없는 디바이스 선택 시)
- 실행 결과 요약 (성공/실패 수, 소요시간)
- 실시간 로그 뷰어

**Props 인터페이스**:
```typescript
interface ScenarioExecutionProps {
  scenarios: ScenarioSummary[];
  parallelLogs: ParallelLog[];
  isParallelRunning: boolean;
  lastParallelResult: ParallelExecutionResult | null;
  onParallelRunningChange: (running: boolean) => void;
  onParallelComplete: (result: ParallelExecutionResult) => void;
}
```

### 2. DeviceDashboard 간소화

실행 관련 코드를 모두 제거하여 디바이스 관리 전용으로 변경했습니다.

**제거된 기능**:
- `selectedDevices`, `selectedScenarioId` 상태
- 디바이스 선택 체크박스
- 병렬 실행 컨트롤 섹션
- 실행 결과/로그 표시
- `scenarios`, `parallelLogs` 등 실행 관련 props

**유지된 기능**:
- 디바이스 목록 그리드 표시
- 검색/필터 (텍스트, 상태, 브랜드, OS)
- 세션 생성/종료
- 별칭 편집
- 오프라인 디바이스 삭제
- 실시간 상태 모니터링 (배터리, 메모리, 스토리지, 온도)

### 3. App.tsx 탭 구조 변경

**탭 타입 변경**:
```typescript
// Before
type AppTab = 'scenario' | 'devices' | 'reports' | 'schedules';

// After
type AppTab = 'scenario' | 'devices' | 'execution' | 'reports' | 'schedules';
```

**새 탭 순서**:
```
시나리오 편집 → 디바이스 관리 → 시나리오 실행 → 실행 리포트 → 스케줄 관리
```

**"실행중" 뱃지 이동**:
- 기존: 디바이스 관리 탭에 표시
- 변경: 시나리오 실행 탭에 표시

---

## 영향 받는 파일

```
frontend/src/components/ScenarioExecution/ScenarioExecution.tsx  (신규)
frontend/src/components/ScenarioExecution/ScenarioExecution.css  (신규)
frontend/src/components/ScenarioExecution/index.ts               (신규)
frontend/src/components/DeviceDashboard/DeviceDashboard.tsx      (수정)
frontend/src/components/DeviceDashboard/DeviceDashboard.css      (수정)
frontend/src/App.tsx                                             (수정)
```

---

## UI 레이아웃

### 시나리오 실행 탭

```
┌────────────────────────────────────────────────────────────────────┐
│ 시나리오 실행                          [새로고침]                    │
│ 3개 디바이스 사용 가능                                              │
├──────────────────────┬─────────────────────────────────────────────┤
│  설정 패널 (400px)    │  결과/로그 패널                              │
│                      │                                             │
│  ┌─────────────────┐ │  ┌─────────────────────────────────────────┐│
│  │ 시나리오 선택    │ │  │ 실행 결과                                ││
│  │ [드롭다운    ▼] │ │  │ 총 소요시간: 45.32초                     ││
│  └─────────────────┘ │  │ 성공: 2 / 실패: 1                        ││
│                      │  │                                         ││
│  ┌─────────────────┐ │  │ - Galaxy S21 (성공) 15.2s               ││
│  │ 디바이스 선택    │ │  │ - Pixel 6 (성공) 14.8s                  ││
│  │ [전체선택][해제] │ │  │ - iPhone 13 (실패) 15.3s                ││
│  │ 2개 선택        │ │  └─────────────────────────────────────────┘│
│  │                 │ │                                             │
│  │ ☑ Galaxy S21   │ │  ┌─────────────────────────────────────────┐│
│  │   Android 12    │ │  │ 실행 로그                                ││
│  │   [세션 활성]   │ │  │                                         ││
│  │                 │ │  │ 10:30:15 [Galaxy S21] 시나리오 시작      ││
│  │ ☑ Pixel 6      │ │  │ 10:30:16 [Galaxy S21] 탭 액션 성공       ││
│  │   Android 13    │ │  │ 10:30:17 [Pixel 6] 시나리오 시작         ││
│  │   [세션 없음]   │ │  │ ...                                     ││
│  └─────────────────┘ │  └─────────────────────────────────────────┘│
│                      │                                             │
│  ┌─────────────────┐ │                                             │
│  │ [병렬 실행 시작]│ │                                             │
│  └─────────────────┘ │                                             │
└──────────────────────┴─────────────────────────────────────────────┘
```

---

## 사용 방법

1. **시나리오 실행 탭** 클릭
2. 드롭다운에서 **시나리오 선택**
3. 실행할 **디바이스 체크박스 선택** (또는 전체 선택)
4. **[병렬 실행 시작]** 버튼 클릭
5. 오른쪽 패널에서 **실시간 로그** 확인
6. 실행 완료 후 **결과 요약** 확인

---

## 향후 개선 가능 사항

1. **디바이스 그룹**: 자주 사용하는 디바이스 조합을 그룹으로 저장
2. **실행 프리셋**: 시나리오 + 디바이스 조합을 프리셋으로 저장
3. **로그 필터링**: 디바이스별, 상태별 로그 필터
4. **로그 내보내기**: 실행 로그를 파일로 저장

---

*최종 수정일: 2025-01-10*
