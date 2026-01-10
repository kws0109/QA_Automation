# 트리 컨텍스트 메뉴 회고록

## 개요

**날짜**: 2026년 1월 10일
**목표**: 시나리오 트리 탐색기에서 우클릭 컨텍스트 메뉴를 통해 카테고리 관리 기능 제공

---

## 배경

트리 탐색기 UI가 구현된 후, 카테고리를 추가/수정/삭제하기 위해 별도의 관리 페이지로 이동해야 하는 불편함이 있었습니다. 파일 탐색기처럼 우클릭으로 컨텍스트 메뉴를 통해 직접 관리할 수 있도록 개선하였습니다.

**추가된 기능:**
- 패키지 우클릭 → 새 카테고리 생성
- 카테고리 우클릭 → 이름 변경, 삭제

---

## 구현 내용

### 1. 컨텍스트 메뉴 상태

```typescript
interface ContextMenuState {
  visible: boolean;
  x: number;       // 마우스 위치 X
  y: number;       // 마우스 위치 Y
  node: TreeNode | null;  // 우클릭한 노드
}
```

### 2. 우클릭 핸들러

```tsx
const handleContextMenu = (e: React.MouseEvent, node: TreeNode) => {
  e.preventDefault();
  e.stopPropagation();

  // 시나리오 노드는 컨텍스트 메뉴 미지원
  if (node.type === 'scenario') return;

  setContextMenu({
    visible: true,
    x: e.clientX,
    y: e.clientY,
    node,
  });
};
```

### 3. 메뉴 항목

| 노드 타입 | 메뉴 항목 | 동작 |
|-----------|-----------|------|
| 패키지 | ➕ 새 카테고리 | 인라인 입력 필드 표시 |
| 카테고리 | ✏️ 이름 변경 | 인라인 입력 필드로 전환 |
| 카테고리 | 🗑️ 삭제 | 확인 후 삭제 |

### 4. 인라인 입력

트리 노드 내에서 직접 입력하는 방식:

```tsx
// 새 카테고리 입력
<input
  type="text"
  className="tree-inline-input"
  placeholder="새 카테고리 이름"
  onKeyDown={(e) => {
    if (e.key === 'Enter') handleNewCategorySubmit();
    if (e.key === 'Escape') cancel();
  }}
  onBlur={() => cancel()}
  autoFocus
/>
```

**UX 고려사항:**
- Enter: 저장
- Escape: 취소
- 포커스 이탈(blur): 취소
- 자동 포커스(autoFocus)

### 5. 삭제 제한

시나리오가 있는 카테고리는 삭제할 수 없도록 제한:

```typescript
const handleDeleteCategory = async () => {
  const hasChildren = contextMenu.node.children?.length > 0;
  if (hasChildren) {
    alert('시나리오가 있는 카테고리는 삭제할 수 없습니다.');
    return;
  }
  // ...
};
```

---

## 영향 받는 파일

```
frontend/src/components/ScenarioSaveModal/
├── ScenarioSaveModal.tsx  (컨텍스트 메뉴 로직 추가)
└── ScenarioSaveModal.css  (메뉴 및 인라인 입력 스타일)
```

---

## API 호출

| 기능 | Method | Endpoint |
|------|--------|----------|
| 카테고리 생성 | POST | `/api/categories` |
| 카테고리 수정 | PUT | `/api/categories/:packageId/:categoryId` |
| 카테고리 삭제 | DELETE | `/api/categories/:packageId/:categoryId` |

---

## 사용 방법

1. **새 카테고리 생성**
   - 패키지 노드 우클릭 → "새 카테고리" 클릭
   - 인라인 입력 필드에 이름 입력 → Enter

2. **카테고리 이름 변경**
   - 카테고리 노드 우클릭 → "이름 변경" 클릭
   - 기존 이름이 입력된 상태에서 수정 → Enter

3. **카테고리 삭제**
   - 빈 카테고리만 삭제 가능
   - 카테고리 노드 우클릭 → "삭제" 클릭 → 확인

---

## 스타일

```css
.tree-context-menu {
  position: fixed;
  background: #313244;
  border: 1px solid #45475a;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  z-index: 1000;
}

.context-menu-item.danger {
  color: #f38ba8;  /* 빨간색 - 삭제 액션 */
}
```

---

## 향후 개선 가능 사항

- 패키지 생성/수정/삭제 메뉴 추가
- 시나리오 삭제 메뉴 추가
- 키보드 단축키 지원 (F2: 이름 변경, Delete: 삭제)

---

*최종 수정일: 2026-01-10*
