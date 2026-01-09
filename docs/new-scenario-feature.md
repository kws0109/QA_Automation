# 새 시나리오 만들기 기능 회고록

## 개요

**날짜**: 2026년 1월 9일
**목표**: 시나리오를 불러온 상태에서 새 시나리오를 만들 수 있는 기능 추가

---

## 배경

기존에는 시나리오를 불러온 후 새로운 시나리오를 시작하려면 페이지를 새로고침해야 했음.

**문제점**:
- 불러온 시나리오를 초기화하는 방법이 없음
- 새 시나리오 작업을 위해 페이지 새로고침 필요
- 사용자 경험 저하

**요구사항**:
- "새로 만들기" 버튼으로 현재 작업 초기화
- 작업 중인 내용이 있을 경우 확인 다이얼로그 표시

---

## 구현 내용

### 1. App.tsx - 새 시나리오 함수 추가

```typescript
const handleNewScenario = () => {
  if (nodes.length > 0 && !window.confirm('현재 작업을 지우고 새 시나리오를 만드시겠습니까?')) {
    return;
  }
  setNodes([]);
  setConnections([]);
  setCurrentScenarioId(null);
  setCurrentScenarioName('');
  setSelectedNodeId(null);
  setSelectedConnectionIndex(null);
};
```

**동작 방식**:
- 노드가 있는 경우 확인 다이얼로그 표시
- 확인 시 모든 상태 초기화:
  - `nodes`: 빈 배열
  - `connections`: 빈 배열
  - `currentScenarioId`: null (임시 시나리오 상태)
  - `currentScenarioName`: 빈 문자열
  - `selectedNodeId`: null
  - `selectedConnectionIndex`: null

### 2. Header.tsx - Props 및 버튼 추가

새 props:
```typescript
interface HeaderProps {
  // ... 기존 props
  onNew: () => void;
}
```

버튼 렌더링:
```tsx
<button
  className="header-btn new"
  onClick={onNew}
  title="새 시나리오 만들기"
>
  ✨ 새로 만들기
</button>
```

### 3. Header.css - 버튼 스타일

```css
.header-btn.new {
  background: #7b1fa2;
  border-color: #9c27b0;
}

.header-btn.new:hover {
  background: #9c27b0;
}
```

**디자인**:
- 보라색 배경 (#7b1fa2)
- 호버 시 밝은 보라색 (#9c27b0)
- 다른 버튼과 구분되는 색상으로 시각적 강조

---

## 사용 흐름

### 새 시나리오 시작
1. 시나리오 작업 중 "✨ 새로 만들기" 클릭
2. "현재 작업을 지우고 새 시나리오를 만드시겠습니까?" 확인
3. 확인 클릭 → 캔버스 초기화
4. 헤더에 "📝 임시 시나리오" 표시

### 빈 상태에서
1. "✨ 새로 만들기" 클릭
2. 노드가 없으므로 확인 없이 바로 초기화

---

## 영향 받는 파일

```
frontend/src/
├── App.tsx                           # handleNewScenario 함수 추가
└── components/
    └── Header/
        ├── Header.tsx                # onNew prop 및 버튼 추가
        └── Header.css                # 버튼 스타일 추가
```

---

## 버튼 배치 순서

헤더 중앙 버튼 영역:
1. ✨ 새로 만들기 (보라색)
2. 📁 시나리오
3. 💾 저장 / 💾 새로 저장
4. 📊 리포트

---

## 향후 개선 가능 사항

1. **Ctrl+N 단축키**: 키보드 단축키로 새 시나리오 생성
2. **자동 저장 확인**: 저장하지 않은 변경 사항 감지 및 저장 제안
3. **최근 시나리오**: 최근 작업한 시나리오 빠른 접근

---

*최종 수정일: 2026-01-09*
