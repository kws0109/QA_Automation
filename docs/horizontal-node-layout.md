# 노드 에디터 수평 레이아웃 회고록

## 개요

**날짜**: 2026년 01월 15일
**목표**: 노드 에디터 레이아웃을 수직(상→하)에서 수평(좌→우)으로 변경하고, 노드 자동 배치 기능 구현

---

## 배경

기존 노드 에디터는 수직 레이아웃으로, 노드가 위에서 아래로 연결되었습니다. 사용자들이 워크플로우를 좌에서 우로 읽는 것이 더 자연스럽다는 피드백을 반영하여 레이아웃을 변경했습니다.

또한, 자유로운 노드 배치가 오히려 관리를 어렵게 만드는 경우가 있어 자동 배치 기능을 도입했습니다.

---

## 구현 내용

### 1. 레이아웃 상수 정의 (`Canvas.tsx`)

```typescript
const NODE_WIDTH = 140;   // 노드 너비
const NODE_HEIGHT = 80;   // 노드 높이
const NODE_GAP_X = 200;   // 노드 간 수평 간격
const START_X = 50;       // 첫 노드 X 위치
const START_Y = 200;      // 기본 Y 위치
```

### 2. 자동 배치 함수

```typescript
const getNextNodePosition = (): { x: number; y: number } => {
  if (nodes.length === 0) return { x: START_X, y: START_Y };

  const rightmostNode = nodes.reduce((prev, curr) =>
    curr.x > prev.x ? curr : prev, nodes[0]
  );

  return { x: rightmostNode.x + NODE_GAP_X, y: START_Y };
};
```

### 3. 포트 위치 변경

| 구분 | 기존 위치 | 변경 후 |
|------|----------|---------|
| 입력 포트 | 상단 | 왼쪽 |
| 출력 포트 | 하단 | 오른쪽 |
| 조건 Yes | 왼쪽 | 상단 |
| 조건 No | 오른쪽 | 하단 |

### 4. 포트 위치 계산 함수

```typescript
const getOutputPortPosition = (node: FlowNode, branch: string | null) => {
  if (node.type === 'condition') {
    if (branch === 'yes')
      return { x: node.x + NODE_WIDTH / 2, y: node.y - 2 };
    if (branch === 'no')
      return { x: node.x + NODE_WIDTH / 2, y: node.y + NODE_HEIGHT + 2 };
  }
  return { x: node.x + NODE_WIDTH + 2, y: node.y + NODE_HEIGHT / 2 };
};

const getInputPortPosition = (node: FlowNode) => {
  return { x: node.x - 2, y: node.y + NODE_HEIGHT / 2 };
};
```

### 5. 수평 연결선 렌더링

베지어 곡선을 활용한 수평 연결선:

```typescript
const createConnectionPath = (fromNode, toNode, branch) => {
  const start = getOutputPortPosition(fromNode, branch);
  const end = getInputPortPosition(toNode);

  // 루프백 연결 (오른쪽에서 왼쪽으로)
  if (start.x > end.x) {
    const loopY = Math.max(fromNode.y, toNode.y) + NODE_HEIGHT + 60;
    return `M ${start.x} ${start.y}
            L ${start.x + 30} ${start.y}
            C ${start.x + 30} ${loopY}, ${end.x - 30} ${loopY}, ${end.x - 30} ${end.y}
            L ${end.x} ${end.y}`;
  }

  // 일반 수평 연결
  const midX = (start.x + end.x) / 2;
  return `M ${start.x} ${start.y}
          C ${midX} ${start.y}, ${midX} ${end.y}, ${end.x} ${end.y}`;
};
```

### 6. CSS 스타일 업데이트 (`Canvas.css`)

새로운 포트 클래스 추가:

```css
/* 왼쪽 포트 (입력) */
.node-port.port-left {
  left: -8px;
  top: 50%;
  transform: translateY(-50%);
  width: 14px;
  height: 14px;
  border-radius: 50%;
}

/* 오른쪽 포트 (출력) */
.node-port.port-right {
  left: auto;
  right: -8px;
  top: 50%;
  transform: translateY(-50%);
  width: 14px;
  height: 14px;
  border-radius: 50%;
}

/* 조건 Yes 포트 (상단) */
.node-port.condition-yes-horizontal {
  left: 50%;
  top: -14px;
  transform: translateX(-50%);
  width: 28px;
  height: 28px;
  background: #4caf50;
}

/* 조건 No 포트 (하단) */
.node-port.condition-no-horizontal {
  left: 50%;
  bottom: -14px;
  top: auto;
  transform: translateX(-50%);
  width: 28px;
  height: 28px;
  background: #f44336;
}

/* 루프백 연결선 스타일 */
.connection-line.loop-back {
  stroke-dasharray: 8, 4;
}
```

---

## 레이아웃 비교

### 변경 전 (수직 레이아웃)
```
    ┌─────┐
    │Start│
    └──┬──┘
       │
    ┌──▼──┐
    │Node1│
    └──┬──┘
       │
    ┌──▼──┐
    │Node2│
    └─────┘
```

### 변경 후 (수평 레이아웃)
```
┌─────┐     ┌─────┐     ┌─────┐
│Start├────►│Node1├────►│Node2│
└─────┘     └─────┘     └─────┘
```

### 조건 분기 (변경 후)
```
             ┌─────┐
          Y  │NodeY│
    ┌────────┴─────┘
┌───┴──┐
│ If ? │
└───┬──┘
    └────────┐
          N  │NodeN│
             └─────┘
```

---

## 영향 받는 파일

```
frontend/src/components/Canvas/Canvas.tsx  - 레이아웃 로직 전면 수정
frontend/src/components/Canvas/Canvas.css  - 새 포트 스타일 추가
```

---

## 버그 수정

### input 포트 타원형 표시 문제
- **증상**: 입력 포트가 14px 원형이 아닌 136px 타원형 막대로 표시
- **원인**: `common.css`의 `.input { width: 100% }` 클래스가 `.node-port.input`에도 적용
- **해결**: `.node-port.input`에 명시적 크기 및 패딩 지정

```css
.node-port.input {
  top: -8px;
  width: 14px;
  height: 14px;
  padding: 0;
  border-radius: 50%;
}
```

---

## 향후 개선 가능 사항

1. **분기 자동 정렬**: 조건 분기 시 Yes/No 노드 자동 수직 정렬
2. **줌/패닝**: 대규모 시나리오를 위한 캔버스 줌 기능
3. **미니맵**: 전체 시나리오 구조 미리보기
4. **노드 그룹화**: 관련 노드들을 그룹으로 묶는 기능

---

*최종 수정일: 2026-01-15*
