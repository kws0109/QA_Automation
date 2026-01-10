# 트리 드래그 앤 드롭 회고록

## 개요

**날짜**: 2026년 1월 10일
**목표**: 시나리오 트리 탐색기에서 드래그 앤 드롭으로 시나리오를 다른 카테고리로 이동

---

## 배경

트리 탐색기에서 시나리오를 다른 카테고리로 이동하려면 별도의 편집 기능이 필요했습니다. 파일 탐색기처럼 직관적인 드래그 앤 드롭으로 시나리오를 이동할 수 있도록 개선하였습니다.

**추가된 기능:**
- 시나리오 노드 드래그 시작
- 카테고리 노드에 드롭하여 이동
- 실시간 시각적 피드백 (드래그 중, 드롭 가능 영역)

---

## 구현 내용

### 1. 드래그 상태 관리

```typescript
interface DragState {
  isDragging: boolean;        // 드래그 진행 중
  draggedNode: TreeNode | null;  // 드래그 중인 노드
  dropTargetId: string | null;   // 현재 호버 중인 드롭 대상
}
```

### 2. 드래그 이벤트 핸들러

| 이벤트 | 대상 | 동작 |
|--------|------|------|
| `dragStart` | 시나리오 노드 | 드래그 데이터 설정, 상태 업데이트 |
| `dragOver` | 카테고리 노드 | 드롭 가능 표시, dropEffect 설정 |
| `dragLeave` | 카테고리 노드 | 드롭 대상 하이라이트 제거 |
| `drop` | 카테고리 노드 | API 호출하여 시나리오 이동 |
| `dragEnd` | 시나리오 노드 | 상태 초기화 |

### 3. 드래그 시작 핸들러

```typescript
const handleDragStart = (e: React.DragEvent, node: TreeNode) => {
  if (node.type !== 'scenario') {
    e.preventDefault();
    return;
  }

  const scenarioId = node.id.replace('scen-', '');

  e.dataTransfer.setData('text/plain', JSON.stringify({
    scenarioId,
    scenarioName: node.name,
    fromPackageId: node.packageId,
    fromCategoryId: node.categoryId,
  }));
  e.dataTransfer.effectAllowed = 'move';

  setDragState({
    isDragging: true,
    draggedNode: node,
    dropTargetId: null,
  });
};
```

### 4. 드롭 핸들러

```typescript
const handleDrop = async (e: React.DragEvent, targetNode: TreeNode) => {
  e.preventDefault();

  if (targetNode.type !== 'category') return;

  const data = JSON.parse(e.dataTransfer.getData('text/plain'));
  const { scenarioId, fromCategoryId } = data;

  // 같은 카테고리로 이동은 무시
  if (fromCategoryId === targetNode.categoryId) return;

  // API 호출: 시나리오 이동
  await axios.post(`/api/scenarios/${scenarioId}/move`, {
    packageId: targetNode.packageId,
    categoryId: targetNode.categoryId,
  });

  // 트리 새로고침
  await loadTreeData();
};
```

### 5. 시각적 피드백

| 상태 | 스타일 |
|------|--------|
| 드래그 중인 노드 | 반투명 (opacity: 0.5) |
| 드롭 가능 카테고리 | 녹색 점선 테두리, 연한 녹색 배경 |
| 시나리오 노드 | cursor: grab / grabbing |

---

## 영향 받는 파일

```
backend/src/routes/scenario.ts       # POST /api/scenarios/:id/move 추가
frontend/src/components/ScenarioSaveModal/
├── ScenarioSaveModal.tsx            # 드래그 앤 드롭 로직
└── ScenarioSaveModal.css            # 드래그 피드백 스타일
```

---

## API 호출

| 기능 | Method | Endpoint |
|------|--------|----------|
| 시나리오 이동 | POST | `/api/scenarios/:id/move` |

**Request Body:**
```json
{
  "packageId": "string",
  "categoryId": "string"
}
```

**Response:**
```json
{
  "success": true,
  "message": "시나리오가 이동되었습니다.",
  "data": { ... }
}
```

---

## 사용 방법

1. **시나리오 드래그**
   - 시나리오(📄) 노드를 마우스로 드래그 시작
   - 커서가 grabbing 모양으로 변경

2. **카테고리에 드롭**
   - 대상 카테고리(📁)로 드래그
   - 녹색 점선 테두리가 나타나면 드롭 가능
   - 마우스 버튼을 놓으면 이동 완료

3. **제한 사항**
   - 같은 카테고리 내 이동은 무시됨
   - 패키지/카테고리 노드는 드래그 불가
   - 시나리오 노드만 드래그 가능

---

## 스타일

```css
/* 드래그 중인 노드 */
.tree-node.dragging {
  opacity: 0.5;
  background: #45475a;
}

/* 드롭 가능한 카테고리 */
.tree-node.drop-target {
  background: #a6e3a133;
  border: 2px dashed #a6e3a1;
  border-radius: 4px;
}

/* 시나리오 노드 커서 */
.tree-node.scenario {
  cursor: grab;
}

.tree-node.scenario:active {
  cursor: grabbing;
}
```

---

## 향후 개선 가능 사항

- 다중 선택 후 일괄 이동
- 드래그 중 자동 스크롤 (긴 목록)
- 패키지 간 이동 지원 (현재는 패키지 내 카테고리 간 이동만)
- Undo/Redo 지원

---

*최종 수정일: 2026-01-10*
