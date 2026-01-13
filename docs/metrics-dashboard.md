# 통합 메트릭 대시보드 회고록

## 개요

**날짜**: 2026년 1월 14일
**목표**: 테스트 실행 결과를 시각적으로 분석할 수 있는 통합 대시보드 구현

---

## 배경

QA 자동화 테스트 실행 결과가 누적되면서, 전체적인 테스트 현황을 한눈에 파악할 수 있는 대시보드가 필요해졌습니다. 기존에는 개별 리포트만 확인할 수 있어서 다음과 같은 정보를 얻기 어려웠습니다:

- 일별/주별 성공률 추이
- 자주 발생하는 실패 패턴
- 시나리오별 성능 비교
- 디바이스별 테스트 성능

---

## 구현 내용

### 1. 백엔드: 메트릭 수집 시스템

**파일**: `backend/src/services/metricsCollector.ts`, `backend/src/services/metricsDatabase.ts`

테스트 실행 완료 시 자동으로 메트릭을 SQLite 데이터베이스에 저장합니다.

**데이터베이스 스키마**:
- `test_executions`: 테스트 실행 메타데이터
- `scenario_results`: 시나리오별 결과
- `device_results`: 디바이스별 결과
- `step_metrics`: 스텝별 성능 메트릭
- `device_environments`: 디바이스 환경 스냅샷
- `daily_aggregates`: 일별 집계 캐시

```typescript
// testExecutor.ts에서 자동 호출
metricsCollector.collect(report).catch((err) => {
  console.error(`메트릭 수집 실패:`, err);
});
```

### 2. 백엔드: 대시보드 API

**파일**: `backend/src/routes/dashboard.ts`

| 엔드포인트 | 설명 |
|-----------|------|
| `GET /api/dashboard/overview` | 전체 요약 (KPI) |
| `GET /api/dashboard/success-rate-trend` | 일별 성공률 추이 |
| `GET /api/dashboard/failure-patterns` | 실패 패턴 분석 |
| `GET /api/dashboard/scenarios` | 시나리오별 히스토리 |
| `GET /api/dashboard/devices` | 디바이스별 성능 |
| `GET /api/dashboard/recent-executions` | 최근 실행 목록 |

### 3. 프론트엔드: MetricsDashboard 컴포넌트

**파일**: `frontend/src/components/MetricsDashboard/`

recharts 라이브러리를 사용하여 데이터 시각화를 구현했습니다.

#### 컴포넌트 구조

```
MetricsDashboard/
├── MetricsDashboard.tsx      # 메인 레이아웃
├── MetricsDashboard.css      # VS Code 다크 테마 스타일
├── useDashboardData.ts       # 데이터 fetching 훅
├── OverviewCards.tsx         # KPI 카드 (5개)
├── SuccessRateChart.tsx      # 일별 성공률 라인 차트
├── FailurePatterns.tsx       # 실패 유형 도넛 차트
├── ScenarioTable.tsx         # 시나리오 히스토리 테이블
├── RecentExecutions.tsx      # 최근 실행 목록
└── DevicePerformance.tsx     # 디바이스별 성능 바 차트
```

#### KPI 카드 (OverviewCards)

| 카드 | 설명 | 색상 |
|------|------|------|
| 총 실행 | 전체 테스트 실행 횟수 | 파랑 |
| 성공률 | 전체 시나리오 성공률 | 초록 |
| 평균 시간 | 시나리오 평균 실행 시간 | 보라 |
| 실패 | 실패한 시나리오 수 | 빨강 |
| 디바이스 | 고유 디바이스 수 | 청록 |

#### 성공률 추이 차트

일별 성공률과 실행 횟수를 표시하는 복합 차트:
- 라인: 성공률 (%)
- 바: 실행 횟수

#### 실패 패턴 분석

- 도넛 차트로 실패 유형별 비율 표시
- 클릭 시 해당 실패의 최근 발생 이력 표시
- 실패 유형: 이미지 매칭 실패, 요소 없음, 타임아웃 등

#### 시나리오 테이블

| 컬럼 | 정렬 | 설명 |
|------|------|------|
| 시나리오명 | ✓ | 시나리오 이름 |
| 패키지 | - | 소속 패키지 |
| 실행 수 | ✓ | 총 실행 횟수 |
| 성공률 | ✓ | 성공률 (바 + 텍스트) |
| 평균 시간 | ✓ | 평균 실행 시간 |
| 최근 실행 | ✓ | 마지막 실행 시간 |
| 상태 | - | 최근 성공/실패 |

---

## 추가 수정 사항

### 뱃지 스타일 수정

MetricsDashboard.css에서 `.status-badge`를 전역으로 정의하여 다른 컴포넌트의 뱃지 스타일이 덮어씌워지는 문제가 있었습니다.

**문제**: DeviceDashboard와 TestReports의 뱃지가 원형(24x24px)으로 변경됨

**해결**: CSS 셀렉터를 `.scenario-table .status-badge`로 범위 지정

```css
/* Before (문제) */
.status-badge { ... }

/* After (수정) */
.scenario-table .status-badge { ... }
```

### 뱃지 텍스트 줄바꿈 방지

뱃지 텍스트가 세로로 표시되는 문제를 `white-space: nowrap`으로 해결:

- `DeviceDashboard.css`: 연결됨/사용가능 뱃지
- `TestReports.css`: 완료 상태 뱃지

---

## 영향 받는 파일

```
frontend/src/App.tsx                                  # 탭 순서 변경
frontend/src/components/MetricsDashboard/             # 신규 컴포넌트 (10개 파일)
frontend/src/components/DeviceDashboard/DeviceDashboard.css
frontend/src/components/TestReports/TestReports.css
frontend/src/types/index.ts                           # 대시보드 타입 정의
frontend/package.json                                 # recharts 의존성 추가
backend/src/services/metricsCollector.ts              # (이전 커밋)
backend/src/services/metricsDatabase.ts               # (이전 커밋)
backend/src/services/metricsAggregator.ts             # (이전 커밋)
backend/src/routes/dashboard.ts                       # (이전 커밋)
.gitignore                                            # backend/data/ 추가
```

---

## 트러블슈팅

### 데이터베이스 미생성 문제

**증상**: 테스트 실행 후 대시보드가 로드되지 않음

**원인 분석**:
1. `backend/data/metrics.db` 파일이 존재하지 않음
2. `metricsCollector.collect()`가 비동기로 호출되어 서버 재시작 시 수집 실패

**해결**:
1. 기존 리포트(`reports/test/*.json`)에서 수동으로 메트릭 수집
2. 데이터베이스 정상 생성 확인 (110KB, 2건의 실행 기록)

```bash
# 수동 메트릭 수집 (일회성)
node -e "
const { metricsCollector } = require('./dist/services/metricsCollector');
const fs = require('fs');
const report = JSON.parse(fs.readFileSync('./reports/test/파일명.json', 'utf-8'));
metricsCollector.collect(report);
"
```

---

## 사용 방법

1. 백엔드 서버 실행: `cd backend && npm run dev`
2. 프론트엔드 실행: `cd frontend && npm run dev`
3. 브라우저에서 "통합 대시보드" 탭 클릭 (첫 번째 탭)

### 기간 필터

헤더의 기간 버튼으로 데이터 범위 조절:
- 7일 / 30일 / 90일 / 전체

### 새로고침

수동 새로고침 버튼으로 최신 데이터 로드

---

## 향후 개선 가능 사항

1. **실시간 업데이트**: WebSocket으로 테스트 완료 시 자동 갱신
2. **커스텀 기간**: 날짜 범위 직접 선택
3. **내보내기**: 대시보드 데이터 CSV/Excel 내보내기
4. **비교 기능**: 두 기간의 성능 비교
5. **알림 설정**: 성공률 임계값 이하 시 알림

---

*최종 수정일: 2026-01-14*
