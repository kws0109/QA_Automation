# 시나리오 저장(수정) 기능 회고록

## 개요

**날짜**: 2026년 1월 9일
**목표**: 기존 시나리오를 불러온 후 수정하여 덮어쓰기 저장할 수 있는 기능 추가

---

## 배경

기존에는 시나리오를 불러와서 수정한 후 저장하려면 "새로 저장" 탭에서 새 이름으로 저장해야 했음.

**문제점**:
- 같은 시나리오를 수정할 때마다 새 파일이 생성됨
- 시나리오 관리가 번거로움
- 버전 관리 어려움

**요구사항**:
- 불러온 시나리오를 즉시 덮어쓰기 저장
- 새 시나리오인 경우 모달을 통해 저장

---

## 구현 내용

### 1. App.tsx - 시나리오 ID 상태 추가

```typescript
const [currentScenarioId, setCurrentScenarioId] = useState<string | null>(null);
```

시나리오 불러오기 시 ID 저장:
```typescript
const handleScenarioLoad = (scenario: Scenario) => {
  setNodes(scenario.nodes || []);
  setConnections(scenario.connections || []);
  setCurrentScenarioId(scenario.id || null);  // ID 저장
  setCurrentScenarioName(scenario.name || '');
};
```

### 2. App.tsx - 저장 함수 추가

```typescript
const handleSaveScenario = async () => {
  if (!currentScenarioId) {
    // 새 시나리오인 경우 모달 열기
    setIsScenarioModalOpen(true);
    return;
  }

  try {
    await axios.put(`${API_BASE}/api/scenarios/${currentScenarioId}`, {
      name: currentScenarioName,
      nodes,
      connections,
    });
    alert('저장되었습니다!');
  } catch (err) {
    const error = err as { response?: { data?: { message?: string } } };
    alert('저장 실패: ' + (error.response?.data?.message || '알 수 없는 에러'));
  }
};
```

**동작 방식**:
- `currentScenarioId`가 있으면: PUT 요청으로 덮어쓰기
- `currentScenarioId`가 없으면: 시나리오 모달 열기 (새로 저장)

### 3. Header.tsx - 저장 버튼 추가

새 props:
```typescript
interface HeaderProps {
  // ... 기존 props
  hasScenarioId: boolean;
  onSave: () => void;
}
```

버튼 렌더링:
```tsx
<button
  className={`header-btn save ${hasScenarioId ? '' : 'new'}`}
  onClick={onSave}
  title={hasScenarioId ? '현재 시나리오 저장' : '새 시나리오로 저장'}
>
  {hasScenarioId ? '💾 저장' : '💾 새로 저장'}
</button>
```

**UX 개선**:
- 불러온 시나리오: "💾 저장" 표시
- 새 시나리오: "💾 새로 저장" 표시
- 툴팁으로 동작 설명

---

## 사용 흐름

### 기존 시나리오 수정
1. "📁 시나리오" 클릭 → 모달 열기
2. "불러오기" 탭에서 시나리오 선택 후 불러오기
3. 노드 수정
4. "💾 저장" 클릭 → 즉시 덮어쓰기

### 새 시나리오 저장
1. 캔버스에서 노드 작성
2. "💾 새로 저장" 클릭 → 모달 열림
3. 패키지, 이름, 설명 입력
4. "저장" 클릭

---

## 영향 받는 파일

```
frontend/src/
├── App.tsx                      # 상태 및 저장 로직 추가
└── components/
    └── Header/Header.tsx        # 저장 버튼 추가
```

---

## API 사용

### 시나리오 수정 (PUT)
```
PUT /api/scenarios/:id
Body: { name, nodes, connections }
```

이 API는 이미 backend에 구현되어 있었음 (`scenarioService.update`).

---

## 향후 개선 가능 사항

1. **자동 저장**: 일정 간격으로 자동 저장
2. **Ctrl+S 단축키**: 키보드 단축키로 저장
3. **저장 상태 표시**: 수정됨/저장됨 상태 표시
4. **다른 이름으로 저장**: 현재 시나리오를 새 이름으로 복제

---

*최종 수정일: 2026-01-09*
