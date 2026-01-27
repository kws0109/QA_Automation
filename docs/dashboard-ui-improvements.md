# 통합 대시보드 UI 개선 회고록

## 개요

**날짜**: 2026년 01월 27일
**목표**: 통합 대시보드의 가독성과 시각적 일관성 개선

---

## 배경

통합 대시보드에서 여러 UI 문제점이 발견되었습니다:
1. Suite 실행 히스토리가 누락되어 있음
2. 이미지 매칭/OCR 성능 메트릭이 표시되지 않음
3. 최근 실행 목록이 촌스러운 파란색 배경으로 덮여 있음
4. 테이블의 성공률 셀에서 막대와 숫자가 겹침
5. 성공률 추이 차트의 막대가 선을 가려 트렌드 파악이 어려움
6. PDF 내보내기 시 텍스트가 보이지 않고 레이아웃이 잘림

---

## 구현 내용

### 1. Suite 히스토리 테이블 추가

**새 컴포넌트**: `SuiteTable.tsx`

Suite별 실행 이력을 테이블로 표시:
- Suite명, 실행 수, 시나리오/디바이스 수
- 성공률 (프로그레스 바 포함)
- 평균 실행 시간, 최근 실행 시간
- 정렬 및 검색 기능

**DB 스키마 확장**:
```sql
ALTER TABLE test_executions ADD COLUMN suite_id TEXT;
ALTER TABLE test_executions ADD COLUMN suite_name TEXT;
```

### 2. 성능 메트릭 컴포넌트 추가

**새 컴포넌트**: `PerformanceMetrics.tsx`

이미지 매칭과 OCR 성능을 시각화:
```
┌─────────────────────────────────────────────────┐
│  성능 메트릭                                     │
├────────────────────┬────────────────────────────┤
│  🖼️ 이미지 매칭     │  🔤 OCR 텍스트 인식        │
│  총 매칭: 1,234    │  총 인식: 567             │
│  평균 시간: 45ms   │  평균 시간: 120ms         │
│  평균 신뢰도: 95%  │  평균 신뢰도: 92%         │
│  성공률: 98.5%     │  성공률: 94.2%            │
│                    │                           │
│  [템플릿별 성능]    │  [매칭 타입별] [API별]    │
└────────────────────┴────────────────────────────┘
```

### 3. 타임라인 스타일 UI 적용

**최근 실행** (`RecentExecutions.tsx`)과 **디바이스 성능** (`DevicePerformance.tsx`)을 타임라인 스타일로 변경:

```
변경 전:
┌─────────────────────────────────┐
│ [배경색] 테스트명 정보들          │
└─────────────────────────────────┘

변경 후:
  10:30  ●─── 로그인 테스트
         │    3대 · 5/5 성공 · 1m 2s
         │
  10:25  ●─── 결제 플로우
              2대 · 3/5 성공 · 45s
```

**새 CSS 클래스**:
- `.timeline-list`, `.timeline-item`
- `.timeline-dot`, `.timeline-line`
- `.timeline-content`, `.timeline-meta`

### 4. 성공률 셀 개선

기존의 겹치는 구조를 분리된 레이아웃으로 변경:

```
변경 전:
│ [████████] 85.5%    │  ← 막대 위에 숫자가 겹침

변경 후:
│  85.5%  [████████░░░░]  │  ← 숫자와 막대 분리, 중앙 정렬
```

**새 CSS 구조**:
```css
.success-rate-cell {
  display: inline-flex;
  justify-content: center;
  width: 100%;
}

.rate-bar-container {
  width: 80px;
  height: 6px;
}
```

### 5. 성공률 추이 차트 개선

막대(Bar) 차트를 영역(Area) 차트로 변경:

```
변경 전:
     ┌──┐     ┌──┐
─────│██│─────│██│──── (막대가 선을 가림)
     └──┘     └──┘

변경 후:
      ╱╲       ╱╲
─────╱──╲─────╱──╲──── (선이 명확하게 보임)
    ░░░░░░░░░░░░░░░░   (반투명 영역)
```

### 6. PDF 내보내기 개선

**@media print 스타일 대폭 보강**:

| 문제 | 해결 |
|------|------|
| 밝은 텍스트가 안 보임 | 모든 텍스트 색상을 어두운 색으로 변경 |
| 레이아웃 잘림 | page-break-inside: avoid 규칙 추가 |
| 테이블 헤더 누락 | display: table-header-group 적용 |

---

## 영향 받는 파일

```
frontend/src/components/MetricsDashboard/
├── SuiteTable.tsx (신규)
├── PerformanceMetrics.tsx (신규)
├── RecentExecutions.tsx (수정)
├── DevicePerformance.tsx (수정)
├── ScenarioTable.tsx (수정)
├── SuccessRateChart.tsx (수정)
├── MetricsDashboard.tsx (수정)
├── MetricsDashboard.css (수정)
└── useDashboardData.ts (수정)

backend/src/
├── services/metricsDatabase.ts (수정)
├── services/metricsCollector.ts (수정)
├── services/metricsAggregator.ts (수정)
├── services/reportExporter.ts (수정)
└── routes/dashboard.ts (수정)
```

---

## API 엔드포인트

| 엔드포인트 | 설명 |
|-----------|------|
| `GET /api/dashboard/suite-history` | Suite 히스토리 목록 |
| `GET /api/dashboard/suite/:id/history` | 특정 Suite 실행 이력 |
| `GET /api/dashboard/image-match-performance` | 이미지 매칭 성능 메트릭 |
| `GET /api/dashboard/ocr-performance` | OCR 성능 메트릭 |

---

## 디자인 원칙

이번 개선에서 적용한 디자인 원칙:

1. **일관성**: 최근 실행과 디바이스 성능에 동일한 타임라인 스타일 적용
2. **가독성**: 겹치는 요소 제거, 충분한 여백 확보
3. **정보 밀도**: 필요한 정보만 표시, 세부 정보는 호버/클릭으로
4. **색상 의미**: 성공(녹색), 경고(노랑), 실패(빨강) 일관 적용

---

## 향후 개선 가능 사항

- [ ] 대시보드 위젯 커스터마이징 (드래그 앤 드롭)
- [ ] 실시간 업데이트 (WebSocket 연동)
- [ ] 다크/라이트 테마 전환
- [ ] 대시보드 공유 링크 생성

---

*최종 수정일: 2026-01-27*
