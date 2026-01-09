# 노드 라벨 기능 회고록

## 개요

**날짜**: 2026년 1월 9일
**목표**: 시나리오 노드에 설명(라벨)을 추가하여 플로우 가독성 향상

---

## 배경

시나리오 편집기에서 노드 연결만으로는 각 노드가 어떤 동작을 수행하는지 파악하기 어려웠음. 특히 복잡한 시나리오에서는 "이 tap 노드가 무엇을 클릭하는 것인지" 알기 위해 일일이 노드를 선택해야 했음.

**요구사항**: 노드에 설명 텍스트를 추가하여 한눈에 시나리오 흐름을 파악할 수 있게 함

---

## 구현 내용

### 1. 타입 정의 확장

#### Frontend (`frontend/src/types/index.ts`)
```typescript
export interface FlowNode {
  id: string;
  type: NodeType;
  label?: string;  // 노드 설명 (예: "로그인 버튼 클릭")
  x: number;
  y: number;
  params: NodeParams;
}
```

#### Backend (`backend/src/services/scenario.ts`)
```typescript
interface ScenarioNode {
  id: string;
  type: string;
  label?: string;  // 노드 설명 (예: "로그인 버튼 클릭")
  params?: Record<string, unknown>;
  [key: string]: unknown;
}
```

#### ParallelExecutor (`backend/src/services/parallelExecutor.ts`)
```typescript
interface ScenarioNode {
  id: string;
  type: string;
  label?: string;  // 노드 설명 (예: "로그인 버튼 클릭")
  params?: ScenarioNodeParams;
  [key: string]: unknown;
}
```

### 2. Panel 컴포넌트 수정 (`frontend/src/components/Panel/Panel.tsx`)

노드 선택 시 "설명" 입력 필드 추가:

```typescript
const handleLabelChange = (value: string) => {
  onNodeUpdate?.(selectedNode.id, { label: value });
};

// JSX
<div className="panel-field">
  <label>설명</label>
  <input
    type="text"
    value={selectedNode.label || ''}
    onChange={(e) => handleLabelChange(e.target.value)}
    placeholder="예: 로그인 버튼 클릭"
  />
  <small>시나리오 흐름을 설명하는 텍스트</small>
</div>
```

### 3. Canvas 노드 표시 (`frontend/src/components/Canvas/Canvas.tsx`)

노드에 라벨을 시각적으로 표시:

```tsx
{/* 노드 라벨 (설명) */}
{node.label && (
  <div className="node-label" title={node.label}>
    {node.label}
  </div>
)}
```

### 4. Canvas CSS 스타일 (`frontend/src/components/Canvas/Canvas.css`)

```css
/* 노드 라벨 (설명) */
.node-label {
  padding: 6px 12px;
  background: #252525;
  border-top: 1px solid #3a3a3a;
  border-radius: 0 0 6px 6px;
  font-size: 11px;
  color: #4fc3f7;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
```

**스타일 특징**:
- 노드 하단에 배치 (헤더와 바디 아래)
- 하늘색 텍스트로 구분 (`#4fc3f7`)
- 텍스트 오버플로우 시 말줄임표 처리 (`text-overflow: ellipsis`)
- 마우스 호버 시 `title` 속성으로 전체 텍스트 확인 가능

### 5. 리포트에서 라벨 사용 (`backend/src/services/parallelExecutor.ts`)

실행 결과의 `nodeName`에 라벨 우선 사용:

```typescript
// 스텝 기록 (start 노드 제외)
if (node.type !== 'start') {
  steps.push({
    nodeId,
    nodeName: node.label || node.params?.actionType || node.params?.conditionType || node.params?.loopType || node.type,
    nodeType: node.type,
    status: stepStatus,
    startTime: stepStartTime,
    endTime: new Date().toISOString(),
    error: stepError,
  });
}
```

**우선순위**:
1. `node.label` (사용자 정의 설명)
2. `node.params?.actionType` (액션 타입)
3. `node.params?.conditionType` (조건 타입)
4. `node.params?.loopType` (루프 타입)
5. `node.type` (노드 타입)

---

## 기술적 결정사항

### 1. 단일 `label` 필드 vs `name` + `description` 분리

**결정**: 단일 `label` 필드 사용

**이유**:
- 비개발자 사용자를 위한 간결한 UI
- 노드 크기 제한으로 긴 텍스트 표시 어려움
- name/description 분리 시 혼란 가능 (어느 것을 어디에 입력?)

### 2. 라벨 표시 위치

**결정**: 노드 하단 (헤더와 바디 아래)

**이유**:
- 헤더에는 노드 타입 아이콘과 이름이 있음
- 바디에는 액션 타입과 미리보기 이미지가 있음
- 하단에 배치하여 추가 정보임을 명확히 함

### 3. 기존 시나리오 호환성

**결정**: `label`은 선택적 필드 (`label?: string`)

**이유**:
- 기존 시나리오 파일에 `label` 필드가 없어도 동작
- 점진적 마이그레이션 가능 (필요한 노드에만 라벨 추가)

---

## 사용 예시

### Before (라벨 없음)
```
[Start] → [Action: tap] → [Action: wait] → [Condition: elementExists] → [End]
```
- 각 노드가 무엇을 하는지 불명확

### After (라벨 있음)
```
[Start] → [Action: 로그인 버튼 클릭] → [Action: 로딩 대기 2초] → [Condition: 홈 화면 확인] → [End]
```
- 시나리오 흐름이 한눈에 파악됨

---

## 영향 받는 파일

```
frontend/src/
├── types/index.ts                    # FlowNode에 label 추가
├── components/
│   ├── Panel/Panel.tsx               # 라벨 입력 필드 추가
│   └── Canvas/
│       ├── Canvas.tsx                # 노드에 라벨 표시
│       └── Canvas.css                # 라벨 스타일

backend/src/
├── services/
│   ├── scenario.ts                   # ScenarioNode에 label 추가
│   └── parallelExecutor.ts           # 리포트에서 라벨 사용
```

---

## 향후 개선 가능 사항

1. **라벨 자동 제안**: 액션 타입에 따른 기본 라벨 자동 생성
2. **다국어 지원**: 라벨 필드의 다국어 입력/표시
3. **검색 기능**: 라벨 텍스트로 노드 검색
4. **라벨 템플릿**: 자주 사용하는 라벨 저장/불러오기

---

*최종 수정일: 2026-01-09*
