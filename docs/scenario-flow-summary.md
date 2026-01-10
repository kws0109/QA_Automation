# 시나리오 흐름 요약 기능 회고록

## 개요

**날짜**: 2025년 1월 10일
**목표**: 시나리오의 노드 연결을 텍스트로 요약하여 표시하는 기능 구현 (테스트 케이스 자동 변환의 기반)

---

## 배경

비개발자가 플로우차트로 작성한 시나리오를 텍스트 형태로 확인할 수 있는 기능이 필요했습니다. 이 기능은 다음 목적을 위해 설계되었습니다:

1. **가독성**: 복잡한 시나리오의 전체 흐름을 한눈에 파악
2. **문서화**: 시나리오를 마크다운으로 내보내어 문서화 가능
3. **확장성**: 향후 테스트 케이스 자동 변환 기능의 중간 단계로 활용

---

## 구현 내용

### 1. 타입 정의 (frontend/src/types/index.ts)

```typescript
// 노드 순회 결과
export interface TraversalNode {
  node: FlowNode;
  depth: number;                              // 들여쓰기 레벨 (분기/루프 깊이)
  branch?: 'yes' | 'no' | 'loop' | 'exit';    // 분기 라벨
  stepNumber: number;                         // 순서 번호
}

// 시나리오 흐름 요약 결과
export interface ScenarioFlowSummary {
  scenarioName: string;
  scenarioId?: string;
  totalNodes: number;
  totalSteps: number;
  hasConditions: boolean;
  hasLoops: boolean;
  disconnectedNodes: FlowNode[];              // 연결되지 않은 노드들
  traversalOrder: TraversalNode[];
  textSummary: string;
}
```

### 2. 요약 서비스 (frontend/src/services/scenarioSummary.ts)

**핵심 함수**:

| 함수 | 설명 |
|------|------|
| `traverseScenario()` | DFS로 Start→End 노드 순회, 분기/루프 처리 |
| `nodeToText()` | 단일 노드를 읽기 쉬운 텍스트로 변환 |
| `generateSummary()` | 전체 시나리오 요약 생성 |
| `toMarkdown()` | 마크다운 형식으로 변환 |

**DFS 순회 알고리즘 특징**:
- 조건 노드: Yes/No 두 분기를 순차적으로 순회
- 루프 노드: loop 내부 먼저 순회 후 exit 분기
- 무한 루프 방지: `nodeId:depth:branch` 조합으로 방문 추적
- 미연결 노드 감지: 순회되지 않은 노드 별도 표시

**텍스트 포맷 예시**:
```
[시나리오: 로그인 테스트]
=============================================

1. [START] 시나리오 시작

2. [ACTION] 앱 실행
   - 설명: 앱 시작하기
   - 패키지: com.example.app

3. [ACTION] 탭
   - 설명: 로그인 버튼 클릭
   - 좌표: (540, 1200)

4. [CONDITION] 요소 존재 확인
   - 설명: 로그인 성공 확인
   - 선택자: com.app:id/welcome

   [YES] 조건 참:
     5. [ACTION] 탭 - 메인 메뉴 진입
     6. [END] 종료

   [NO] 조건 거짓:
     7. [ACTION] 대기 2000ms
     8. [END] 종료
```

### 3. UI 컴포넌트 (frontend/src/components/ScenarioSummaryModal/)

**구성 파일**:
- `ScenarioSummaryModal.tsx` - 메인 컴포넌트
- `ScenarioSummaryModal.css` - 스타일
- `index.ts` - export

**주요 기능**:
- 텍스트/Markdown 탭 전환
- 통계 표시 (노드 수, 단계 수, 분기/루프 유무)
- 클립보드 복사 버튼
- Markdown 파일 다운로드

### 4. App.tsx 통합

- 시나리오 툴바에 "📋 요약" 버튼 추가
- 노드가 없으면 버튼 비활성화
- ScenarioSummaryModal 렌더링

---

## 영향 받는 파일

```
frontend/src/types/index.ts                           # 타입 추가
frontend/src/services/scenarioSummary.ts              # 신규 생성
frontend/src/components/ScenarioSummaryModal/         # 신규 생성
  ├── ScenarioSummaryModal.tsx
  ├── ScenarioSummaryModal.css
  └── index.ts
frontend/src/App.tsx                                  # 버튼 및 모달 추가
```

---

## 사용 방법

1. 시나리오 편집 화면에서 노드 추가
2. 툴바의 **📋 요약** 버튼 클릭
3. 모달에서 텍스트 요약 확인
4. 필요시 클립보드 복사 또는 Markdown 다운로드

---

## 향후 개선 가능 사항

1. **테스트 케이스 변환**: 요약 데이터를 기반으로 TC 문서 자동 생성
2. **Excel/CSV 내보내기**: 다양한 포맷 지원
3. **시나리오 비교**: 두 시나리오의 흐름 diff 기능
4. **Jira/TestRail 연동**: 테스트 관리 도구와 연동

---

*최종 수정일: 2025-01-10*
