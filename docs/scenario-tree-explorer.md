# 시나리오 트리 탐색기 UI 회고록

## 개요

**날짜**: 2026년 1월 10일
**목표**: 시나리오 저장 모달을 폴더 트리 탐색기 형태로 개선하여 직관적인 계층 구조 탐색 제공

---

## 배경

기존 시나리오 저장 모달은 패키지와 카테고리를 각각 드롭다운으로 선택하는 방식이었습니다. 3-tier 구조(패키지 → 카테고리 → 시나리오)가 도입되면서, 전체 계층을 한눈에 파악하고 탐색할 수 있는 UI가 필요해졌습니다.

**기존 방식의 한계:**
- 드롭다운 2개를 순차적으로 선택해야 함
- 전체 구조를 파악하기 어려움
- 기존 시나리오 목록을 확인하기 위해 별도 모달 필요

**트리 탐색기의 장점:**
- 전체 계층 구조를 한눈에 파악
- 확장/축소로 원하는 영역만 탐색
- 기존 시나리오 위치 확인 가능
- 파일 탐색기처럼 익숙한 UX

---

## 구현 내용

### 1. 트리 데이터 구조

```typescript
interface TreeNode {
  id: string;
  name: string;
  type: 'package' | 'category' | 'scenario';
  packageId?: string;
  categoryId?: string;
  packageName?: string;  // Android 패키지명
  children?: TreeNode[];
}
```

### 2. 트리 데이터 로드

모달이 열릴 때 API를 통해 전체 트리 데이터를 구성:
1. 패키지 목록 조회 (`GET /api/packages`)
2. 각 패키지별 카테고리 조회 (`GET /api/categories?packageId=...`)
3. 각 카테고리별 시나리오 조회 (`GET /api/scenarios?packageId=...&categoryId=...`)

### 3. UI 레이아웃

```
┌──────────────────────────────────────────────────────────┐
│  시나리오 저장                                        ×  │
├────────────────────────┬─────────────────────────────────┤
│  저장 위치 선택        │  저장 위치                      │
├────────────────────────┤  📦 게임A / 📁 로그인           │
│  📦 게임A (com.a)  [2] │─────────────────────────────────│
│  ├── 📂 로그인     [3] │  시나리오 이름 *                │
│  │   ├── 📄 TC001      │  [                           ]  │
│  │   └── 📄 TC002      │─────────────────────────────────│
│  └── 📁 결제       [1] │  설명 (선택)                    │
│  📦 게임B (com.b)  [1] │  [                           ]  │
│  └── 📁 튜토리얼   [0] │─────────────────────────────────│
│                        │  💾 노드 5개, 연결 4개 저장됨   │
├────────────────────────┴─────────────────────────────────┤
│                                      [취소]  [저장]      │
└──────────────────────────────────────────────────────────┘
```

### 4. 트리 노드 인터랙션

| 노드 타입 | 클릭 동작 |
|-----------|-----------|
| 패키지 | 확장/축소 토글 |
| 카테고리 | 저장 위치로 선택 |
| 시나리오 | 해당 카테고리 선택 |

### 5. 시각적 표현

- **패키지**: 📦 아이콘, 굵은 글씨, Android 패키지명 표시
- **카테고리**: 📁/📂 아이콘 (접힘/펼침), 선택 시 파란색 하이라이트
- **시나리오**: 📄 아이콘, 연한 색상
- **자식 개수**: 각 폴더 옆에 배지로 표시

---

## 영향 받는 파일

```
frontend/src/components/ScenarioSaveModal/
├── ScenarioSaveModal.tsx  (전면 재작성)
└── ScenarioSaveModal.css  (전면 재작성)
```

---

## 주요 코드

### 트리 노드 렌더링

```tsx
const renderTreeNode = (node: TreeNode, depth: number = 0) => {
  const isExpanded = expandedNodes.has(node.id);
  const isSelected = node.type === 'category' &&
    node.categoryId === selectedCategoryId;

  return (
    <div className="tree-node-wrapper">
      <div
        className={`tree-node ${node.type} ${isSelected ? 'selected' : ''}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => handleNodeClick(node)}
      >
        <span className="tree-expand-icon">
          {hasChildren ? (isExpanded ? '▼' : '▶') : ' '}
        </span>
        <span className="tree-node-icon">
          {node.type === 'package' && '📦'}
          {node.type === 'category' && (isExpanded ? '📂' : '📁')}
          {node.type === 'scenario' && '📄'}
        </span>
        <span className="tree-node-name">{node.name}</span>
      </div>
      {isExpanded && node.children?.map(child =>
        renderTreeNode(child, depth + 1)
      )}
    </div>
  );
};
```

---

## 사용 방법

1. 저장 버튼 클릭 → 저장 모달 열림
2. 왼쪽 트리에서 패키지 클릭하여 확장
3. 원하는 카테고리 클릭하여 선택 (파란색 하이라이트)
4. 오른쪽 폼에서 시나리오 이름 입력
5. 저장 버튼 클릭

---

## 향후 개선 예정

1. **우클릭 컨텍스트 메뉴**: 새 카테고리 생성, 이름 변경
2. **드래그 앤 드롭**: 시나리오를 다른 카테고리로 이동
3. **검색/필터**: 이름으로 검색하여 빠른 탐색

---

*최종 수정일: 2026-01-10*
