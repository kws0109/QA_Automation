# 트리 검색/필터 회고록

## 개요

**날짜**: 2026년 1월 10일
**목표**: 시나리오 트리 탐색기에서 검색어로 빠르게 시나리오, 카테고리, 패키지를 찾는 기능 제공

---

## 배경

시나리오가 많아지면 트리에서 원하는 항목을 찾기 어려워집니다. 검색 기능을 추가하여 이름 기반으로 빠르게 필터링하고, 매칭되는 텍스트를 하이라이트하여 사용성을 개선하였습니다.

**추가된 기능:**
- 검색 입력 필드
- 실시간 트리 필터링
- 매칭 텍스트 하이라이트
- 자동 부모 노드 확장

---

## 구현 내용

### 1. 검색 상태

```typescript
const [searchQuery, setSearchQuery] = useState<string>('');
```

### 2. 노드 매칭 로직

```typescript
// 노드 이름이 검색어와 매칭되는지 확인
const nodeMatchesSearch = (node: TreeNode, query: string): boolean => {
  if (!query) return true;
  const lowerQuery = query.toLowerCase();
  const nameMatches = node.name.toLowerCase().includes(lowerQuery);
  const packageNameMatches = node.packageName?.toLowerCase().includes(lowerQuery) || false;
  return nameMatches || packageNameMatches;
};

// 노드 또는 자식 중 매칭되는 것이 있는지 확인
const nodeOrChildrenMatch = (node: TreeNode, query: string): boolean => {
  if (!query) return true;
  if (nodeMatchesSearch(node, query)) return true;
  if (node.children) {
    return node.children.some((child) => nodeOrChildrenMatch(child, query));
  }
  return false;
};
```

### 3. 자동 확장

검색어가 있을 때 매칭되는 노드의 부모들을 자동으로 확장:

```typescript
useEffect(() => {
  if (!searchQuery) return;

  const newExpanded = new Set<string>();

  const findMatchingParents = (nodes: TreeNode[], parentIds: string[] = []) => {
    for (const node of nodes) {
      const currentPath = [...parentIds, node.id];

      if (nodeMatchesSearch(node, searchQuery)) {
        // 매칭되면 부모 노드들을 확장
        parentIds.forEach((id) => newExpanded.add(id));
      }

      if (node.children) {
        findMatchingParents(node.children, currentPath);
      }
    }
  };

  findMatchingParents(treeData);
  setExpandedNodes((prev) => new Set([...prev, ...newExpanded]));
}, [searchQuery, treeData]);
```

### 4. 텍스트 하이라이트

```typescript
const highlightText = (text: string, query: string): React.ReactNode => {
  if (!query) return text;

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lowerText.indexOf(lowerQuery);

  if (index === -1) return text;

  return (
    <>
      {text.substring(0, index)}
      <mark className="search-highlight">
        {text.substring(index, index + query.length)}
      </mark>
      {text.substring(index + query.length)}
    </>
  );
};
```

### 5. 트리 필터링 적용

```tsx
// 루트 레벨 필터링
treeData
  .filter((node) => nodeOrChildrenMatch(node, searchQuery))
  .map((node) => renderTreeNode(node))

// 자식 노드 필터링
node.children
  .filter((child) => nodeOrChildrenMatch(child, searchQuery))
  .map((child) => renderTreeNode(child, depth + 1))
```

---

## 영향 받는 파일

```
frontend/src/components/ScenarioSaveModal/
├── ScenarioSaveModal.tsx  (검색 로직 및 UI)
└── ScenarioSaveModal.css  (검색 입력 및 하이라이트 스타일)
```

---

## 사용 방법

1. **검색 입력**
   - 트리 패널 상단 검색창에 검색어 입력
   - 실시간으로 매칭되는 항목만 표시

2. **매칭 대상**
   - 시나리오 이름
   - 카테고리 이름
   - 패키지 이름
   - 패키지 Android 패키지명

3. **하이라이트**
   - 매칭되는 텍스트는 노란색 배경으로 강조

4. **검색 초기화**
   - × 버튼 클릭하여 검색어 삭제
   - 전체 트리 다시 표시

---

## 스타일

```css
/* 검색 입력 */
.tree-search {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  background: #1e1e2e;
  border-bottom: 1px solid #313244;
}

.tree-search-input {
  flex: 1;
  background: #313244;
  border: 1px solid #45475a;
  border-radius: 4px;
  padding: 6px 10px;
  color: #cdd6f4;
  font-size: 12px;
}

.tree-search-input:focus {
  border-color: #89b4fa;
}

/* 하이라이트 */
.search-highlight {
  background: #f9e2af;
  color: #1e1e2e;
  padding: 0 2px;
  border-radius: 2px;
}

/* 검색 결과 없음 */
.tree-no-results {
  padding: 40px 20px;
  text-align: center;
  color: #6c7086;
}
```

---

## UX 특징

| 기능 | 설명 |
|------|------|
| 실시간 필터링 | 입력 즉시 트리 업데이트 |
| 대소문자 무시 | 검색어 대소문자 구분 없음 |
| 부분 매칭 | 전체 이름이 아닌 부분 문자열도 매칭 |
| 계층 유지 | 매칭되면 부모 노드도 함께 표시 |
| 자동 확장 | 매칭되는 노드의 부모 자동 펼침 |
| 결과 없음 표시 | 매칭 항목 없을 시 안내 메시지 |

---

## 향후 개선 가능 사항

- 정규식 검색 지원
- 검색 히스토리 (최근 검색어)
- 고급 필터 (타입별, 날짜별)
- 키보드 단축키 (Ctrl+F로 검색창 포커스)
- 검색 결과 개수 표시

---

*최종 수정일: 2026-01-10*
