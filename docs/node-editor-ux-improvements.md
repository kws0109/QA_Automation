# 노드 에디터 UX 개선 회고록

## 개요

**날짜**: 2026년 01월 15일
**목표**: 노드 에디터의 사용성 개선 - 컨텍스트 메뉴, 자동 연결, 노드 삽입 기능 추가

---

## 배경

기존 노드 에디터는 노드 추가 후 수동으로 연결선을 그려야 했고, 노드 타입 변경이나 중간에 노드 삽입이 불가능했습니다. 사용자 경험을 개선하기 위해 다음 기능들이 필요했습니다:

1. 노드 타입 변경 기능
2. 기존 노드 사이에 새 노드 삽입
3. 노드 추가 시 자동 연결
4. 노드 삭제 시 자동 재배치

---

## 구현 내용

### 1. 컨텍스트 메뉴 시스템

노드 우클릭 시 컨텍스트 메뉴 표시:
- **타입 변경**: 서브메뉴로 노드 타입 선택 (Start, Action, Condition, Loop, End)
- **노드 삽입**: 선택한 노드 다음에 새 노드 삽입
- **삭제**: 노드 삭제

```typescript
// 서브메뉴 포함 컨텍스트 메뉴 상태
interface ContextMenuState {
  type: 'node' | 'connection' | 'canvas';
  x: number;
  y: number;
  nodeId?: string;
  connectionIndex?: number;
  showSubMenu?: 'changeType' | 'insertNode' | null;
}
```

### 2. 서브메뉴 UI

메인 메뉴 옆에 서브메뉴가 나란히 표시되도록 구현:

```css
.context-menu-wrapper {
  position: fixed;
  display: flex;
  align-items: flex-start;  /* 메뉴 높이 독립 */
  z-index: 1000;
}
```

### 3. 노드 삽입 로직 (버그 수정)

**문제**: `rearrangeNodes()` 호출 시 클로저로 인해 이전 `connections` 상태 참조

**해결**: 새 연결을 동기적으로 계산 후 `setNodes()` 내에서 직접 BFS 재배치

```typescript
const handleNodeInsertAfter = (afterNodeId: string, nodeType: NodeType) => {
  // 1. 새 연결 미리 계산
  let updatedConnections: Connection[];
  if (outgoingConnection) {
    updatedConnections = [
      ...connections.filter(c => c.from !== afterNodeId || c.to !== outgoingConnection.to),
      { from: afterNodeId, to: newNodeId, label: outgoingConnection.label },
      { from: newNodeId, to: outgoingConnection.to },
    ];
  } else {
    updatedConnections = [...connections, { from: afterNodeId, to: newNodeId }];
  }

  // 2. 연결 업데이트
  setConnections(updatedConnections);

  // 3. 노드 추가 + 재배치 (updatedConnections 기반 BFS)
  setNodes(prev => {
    const nodesWithNew = [...prev, newNode];
    // BFS로 정렬 후 위치 재할당
    return orderedNodes.map((node, index) => ({
      ...node,
      x: START_X + index * NODE_GAP_X,
      y: START_Y,
    }));
  });
};
```

### 4. 자동 연결 (더블클릭 노드 추가)

사이드바에서 더블클릭으로 노드 추가 시 자동으로 이전 노드와 연결:

```typescript
const handleNodeAddAuto = (type: NodeType) => {
  const { x, y } = getNextNodePosition();
  const newNodeId = `node_${Date.now()}`;

  // 가장 오른쪽 노드 찾기
  const rightmostNode = nodes.length > 0
    ? nodes.reduce((prev, curr) => curr.x > prev.x ? curr : prev, nodes[0])
    : null;

  setNodes(prev => [...prev, newNode]);

  // 이전 노드에서 나가는 연결이 없으면 자동 연결
  if (rightmostNode && !connections.some(c => c.from === rightmostNode.id)) {
    setConnections(prev => [...prev, { from: rightmostNode.id, to: newNodeId }]);
  }
};
```

### 5. 노드 삭제 시 자동 재배치

중간 노드 삭제 시 빈 공간을 메우도록 자동 재배치:

```typescript
const handleNodeDelete = (nodeId: string) => {
  // 남은 연결 계산
  const remainingConnections = connections.filter(
    conn => conn.from !== nodeId && conn.to !== nodeId,
  );

  setNodes(prev => prev.filter(node => node.id !== nodeId));
  setConnections(remainingConnections);

  // BFS로 재정렬
  setTimeout(() => {
    setNodes(prev => {
      // BFS 순서로 노드 정렬 후 위치 재할당
      return orderedNodes.map((node, index) => ({
        ...node,
        x: 50 + index * 200,
        y: 200,
      }));
    });
  }, 50);
};
```

### 6. 포트 스타일 수정

노드 포트가 잘리는 문제 해결:

```css
.canvas-node {
  overflow: visible;  /* hidden에서 변경 */
}

.node-port.input {
  width: 14px;
  height: 14px;
  padding: 0;
  border-radius: 50%;
}
```

---

## 영향 받는 파일

```
frontend/src/App.tsx                    - 노드 삽입, 자동 연결, 타입 변경 로직
frontend/src/components/Canvas/Canvas.tsx   - 컨텍스트 메뉴 UI
frontend/src/components/Canvas/Canvas.css   - 메뉴 스타일, 포트 스타일
frontend/src/components/Sidebar/Sidebar.tsx - 더블클릭 핸들러
frontend/src/common.css                 - 확인 모달 스타일
```

---

## 사용 방법

### 노드 추가
- **더블클릭**: 사이드바에서 노드 타입 더블클릭 → 자동 배치 + 자동 연결
- **드래그**: 사이드바에서 캔버스로 드래그 → 원하는 위치에 배치

### 노드 타입 변경
1. 노드 우클릭 → 컨텍스트 메뉴 표시
2. "타입 변경" 호버 → 서브메뉴 표시
3. 원하는 타입 클릭
4. 파라미터가 있으면 확인 모달 표시

### 노드 삽입
1. 삽입할 위치의 이전 노드 우클릭
2. "노드 삽입" 호버 → 서브메뉴 표시
3. 원하는 타입 클릭 → 해당 노드 다음에 삽입

### 노드 삭제
- 노드 선택 후 Delete 키
- 또는 우클릭 → "삭제" 클릭
- 중간 노드 삭제 시 자동으로 빈 공간 메움

---

## 기술적 고려사항

### React 상태 업데이트 비동기 문제
`setConnections()` 호출 후 바로 `connections` 상태를 참조하면 이전 값이 반환됩니다. 해결책:
- 새 값을 변수에 저장 후 직접 전달
- 또는 `setNodes()` 내에서 계산

### BFS 기반 노드 정렬
연결 그래프를 BFS로 순회하여 노드 순서 결정:
1. Start 노드에서 시작
2. 연결을 따라 다음 노드 방문
3. 방문 순서대로 x 좌표 할당

---

## 향후 개선 가능 사항

1. **Undo/Redo**: 노드 편집 작업 취소/재실행
2. **다중 선택**: Shift+클릭으로 여러 노드 선택 후 일괄 삭제/이동
3. **키보드 단축키**: Ctrl+C/V로 노드 복사/붙여넣기

---

*최종 수정일: 2026-01-15*
