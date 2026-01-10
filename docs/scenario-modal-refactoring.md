# 시나리오 모달 리팩토링 회고록

## 개요

**날짜**: 2026년 1월 10일
**목표**: ScenarioLoadModal과 ScenarioSaveModal의 공통 기능을 추출하여 코드 중복 제거 및 유지보수성 향상

---

## 배경

시나리오 저장/불러오기 모달에 트리 탐색기 UI를 구현하면서 두 모달 간 기능이 많이 겹치는 것을 발견:
- 트리 데이터 로딩 및 상태 관리
- 노드 확장/축소
- 검색 및 하이라이트
- 드래그 앤 드롭
- 컨텍스트 메뉴

이러한 중복 코드는 유지보수 시 양쪽 모달을 모두 수정해야 하는 부담과 불일치 위험을 초래했습니다.

---

## 구현 내용

### 1. useScenarioTree 커스텀 훅 생성

**파일**: `frontend/src/hooks/useScenarioTree.tsx`

트리 관련 상태와 로직을 하나의 훅으로 추출:

```typescript
export function useScenarioTree(options: UseScenarioTreeOptions = {}) {
  // 상태
  const [treeData, setTreeData] = useState<TreeNode[]>([]);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [dragState, setDragState] = useState<DragState>({...});

  // 함수
  const loadTreeData = async () => {...};
  const toggleExpand = (nodeId: string) => {...};
  const handleDragStart = (e, node) => {...};
  const handleDrop = async (e, targetNode) => {...};
  const nodeOrChildrenMatch = (node, query) => {...};
  const highlightText = (text, query) => {...};

  return {
    treeData, expandedNodes, loading, searchQuery, dragState,
    loadTreeData, toggleExpand, expandNode, reset,
    setSearchQuery, clearSearch, nodeOrChildrenMatch, highlightText,
    handleDragStart, handleDragOver, handleDragLeave, handleDrop, handleDragEnd
  };
}
```

### 2. ScenarioTreePanel 공유 컴포넌트 생성

**파일**: `frontend/src/components/ScenarioTreePanel/`

트리 UI 렌더링을 담당하는 재사용 가능한 컴포넌트:

```typescript
interface ScenarioTreePanelProps {
  // 상태
  treeData: TreeNode[];
  expandedNodes: Set<string>;
  loading: boolean;
  searchQuery: string;
  dragState: DragState;

  // 선택
  selectedNodeId?: string;
  selectedType?: 'package' | 'category' | 'scenario';

  // 헤더
  title: string;
  hint?: string;

  // 이벤트 핸들러
  onNodeClick, onNodeDoubleClick, onContextMenu, onSearchChange, ...

  // 커스텀 렌더링 (render props)
  renderNodeExtra?: (node, depth) => ReactNode;
  renderEmptyPackage?: (node, depth) => ReactNode;
  renderPackageFooter?: (node, depth) => ReactNode;
}
```

### 3. 모달 리팩토링

| 파일 | Before | After | 감소율 |
|------|--------|-------|--------|
| ScenarioLoadModal.tsx | ~600줄 | ~357줄 | 40% |
| ScenarioLoadModal.css | ~560줄 | ~245줄 | 56% |
| ScenarioSaveModal.tsx | ~895줄 | ~500줄 | 44% |
| ScenarioSaveModal.css | ~560줄 | ~264줄 | 53% |

### 4. 추가 개선 사항

#### 컨텍스트 메뉴 닫기 개선
- `click` → `mousedown` 이벤트로 변경 (더 안정적)
- `ESC` 키 핸들러 추가

#### 불러오기 모달 드래그앤드롭
- 시나리오를 다른 카테고리로 드래그하여 이동 가능

#### 카테고리 추가 버그 수정
- `renderPackageFooter` prop 추가
- 카테고리가 있는 패키지에서도 "+" 버튼으로 새 카테고리 추가 가능

---

## 영향 받는 파일

```
frontend/src/hooks/useScenarioTree.tsx          # 신규
frontend/src/components/ScenarioTreePanel/      # 신규
  ├── ScenarioTreePanel.tsx
  ├── ScenarioTreePanel.css
  └── index.ts
frontend/src/components/ScenarioLoadModal/
  ├── ScenarioLoadModal.tsx                     # 리팩토링
  └── ScenarioLoadModal.css                     # 간소화
frontend/src/components/ScenarioSaveModal/
  ├── ScenarioSaveModal.tsx                     # 리팩토링
  └── ScenarioSaveModal.css                     # 간소화
```

---

## 사용 방법

### 모달에서 공유 컴포넌트 사용

```tsx
import useScenarioTree from '../../hooks/useScenarioTree';
import ScenarioTreePanel from '../ScenarioTreePanel';

function MyModal() {
  const tree = useScenarioTree({
    initialPackageId: 'pkg-1',
    initialCategoryId: 'cat-1',
  });

  useEffect(() => {
    if (isOpen) {
      tree.loadTreeData();
    }
  }, [isOpen]);

  return (
    <ScenarioTreePanel
      treeData={tree.treeData}
      expandedNodes={tree.expandedNodes}
      loading={tree.loading}
      searchQuery={tree.searchQuery}
      dragState={tree.dragState}
      onNodeClick={handleNodeClick}
      onSearchChange={tree.setSearchQuery}
      onSearchClear={tree.clearSearch}
      onDragStart={tree.handleDragStart}
      onDragOver={tree.handleDragOver}
      onDragLeave={tree.handleDragLeave}
      onDrop={tree.handleDrop}
      onDragEnd={tree.handleDragEnd}
      nodeOrChildrenMatch={tree.nodeOrChildrenMatch}
      highlightText={tree.highlightText}
      // 커스텀 렌더링
      renderNodeExtra={(node) => node.type === 'package' && <button>+</button>}
    />
  );
}
```

---

## 아키텍처 결정

### 왜 완전 통합이 아닌 공유 컴포넌트 추출인가?

세 가지 옵션을 검토:
1. **완전 통합** (하나의 모달로 합침) - 모드 전환 복잡성 증가
2. **공유 컴포넌트 추출** (선택) - 유연성 유지하면서 중복 제거
3. **현상 유지** - 중복 코드 유지

옵션 2를 선택한 이유:
- 각 모달의 고유 기능(저장 폼, 상세 정보 등)을 독립적으로 관리 가능
- render props 패턴으로 커스터마이징 용이
- 점진적 개선 가능

---

## 향후 개선 가능 사항

1. **트리 가상화**: 대량의 노드 처리 시 성능 최적화 (react-window)
2. **키보드 네비게이션**: 화살표 키로 트리 탐색
3. **멀티 셀렉트**: 여러 시나리오 동시 선택 및 일괄 작업
4. **즐겨찾기**: 자주 사용하는 시나리오 빠른 접근

---

*최종 수정일: 2026-01-10*
