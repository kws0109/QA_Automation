# 패키지 기반 워크플로우 및 시나리오 모달 분리 회고록

## 개요

**날짜**: 2025년 1월 10일
**목표**: 시나리오 편집 시 패키지를 먼저 선택하는 워크플로우 구현 및 모달 UI 개선

---

## 배경

기존에는 시나리오와 패키지가 느슨하게 연결되어 있어 사용자가 어떤 패키지에 대한 시나리오를 작업 중인지 명확하지 않았다. 또한 시나리오 모달이 불러오기/저장/패키지관리를 모두 탭으로 포함하고 있어 복잡했다.

**개선 목표**:
1. 패키지를 먼저 선택한 후 시나리오를 편집하는 명확한 워크플로우
2. 템플릿 이미지를 패키지별로 분리 저장
3. 시나리오 모달을 기능별로 분리하여 단순화

---

## 구현 내용

### 1. 패키지 기반 워크플로우

시나리오 편집 전 패키지를 반드시 선택하도록 변경:

```
[패키지 선택 드롭다운] [패키지 관리 버튼] | [새로 만들기] [불러오기] [저장/덮어쓰기]
```

- 패키지 미선택 시 "새로 만들기", "저장" 버튼 비활성화
- 시나리오 불러오기 시 해당 패키지로 자동 전환

### 2. 템플릿 저장 경로 패키지별 분리

**변경 전**: `backend/templates/{templateId}.png`
**변경 후**: `backend/templates/{packageId}/{templateId}.png`

```typescript
// backend/src/services/imageMatch.ts
private getPackageDir(packageId: string): string {
  return path.join(TEMPLATES_DIR, packageId);
}
```

### 3. 시나리오 모달 분리

기존 `ScenarioModal` (탭 3개)을 3개의 독립 모달로 분리:

| 기존 | 변경 후 | 역할 |
|------|---------|------|
| ScenarioModal (불러오기 탭) | **ScenarioLoadModal** | 시나리오 목록 조회, 불러오기, 복제, 삭제 |
| ScenarioModal (저장 탭) | **ScenarioSaveModal** | 새 시나리오 저장 (이름, 설명, 패키지 선택) |
| ScenarioModal (패키지 탭) | **PackageModal** | 패키지 CRUD |

### 4. 저장 버튼 동작 개선

| 상태 | 버튼 텍스트 | 동작 |
|------|------------|------|
| 새 시나리오 | "💾 저장" | ScenarioSaveModal 열기 |
| 기존 시나리오 | "💾 덮어쓰기" | 확인창 후 덮어쓰기 |
| 기존 시나리오 | "📄 다른 이름으로 저장" | ScenarioSaveModal 열기 |

### 5. 시나리오 뱃지

캔버스 좌측 상단에 현재 시나리오 상태 표시:

```tsx
<div className={`scenario-badge ${scenarioId ? 'saved' : 'unsaved'}`}>
  <span className="scenario-badge-icon">{scenarioId ? '📄' : '📝'}</span>
  <span className="scenario-badge-name">{scenarioName || '임시 시나리오'}</span>
</div>
```

- 저장된 시나리오: 녹색 테두리
- 임시 시나리오: 노란색 테두리

---

## 영향 받는 파일

### 신규 생성

```
frontend/src/components/ScenarioLoadModal/
  ├── ScenarioLoadModal.tsx
  └── ScenarioLoadModal.css

frontend/src/components/ScenarioSaveModal/
  ├── ScenarioSaveModal.tsx
  └── ScenarioSaveModal.css

frontend/src/components/PackageModal/
  ├── PackageModal.tsx
  └── PackageModal.css
```

### 삭제

```
frontend/src/components/ScenarioModal/
  ├── ScenarioModal.tsx (삭제)
  └── ScenarioModal.css (삭제)
```

### 수정

```
frontend/src/App.tsx                    - 모달 분리 적용, 패키지 선택 UI
frontend/src/App.css                    - 패키지 선택기 스타일
frontend/src/components/Canvas/Canvas.tsx   - 시나리오 뱃지 추가
frontend/src/components/Canvas/Canvas.css   - 뱃지 스타일
frontend/src/components/TemplateModal/TemplateModal.tsx - packageId 지원
backend/src/services/imageMatch.ts      - 패키지별 템플릿 경로
backend/src/routes/image.ts             - packageId 파라미터 처리
```

---

## 해결한 문제들

### CSS 스타일 충돌

**문제**: `.btn-delete` 클래스가 `ParallelReports.css`에서 `opacity: 0`으로 설정되어 PackageModal의 삭제 버튼이 보이지 않음

**해결**: 모달별로 스코프를 명확히 하고 `!important` 사용
```css
.package-modal .btn-delete {
  opacity: 1 !important;
  width: auto !important;
  height: auto !important;
}
```

---

## 사용 방법

### 시나리오 편집 워크플로우

1. 패키지 드롭다운에서 작업할 패키지 선택
2. "새로 만들기" 또는 "불러오기"로 시나리오 시작
3. 노드 편집 후 "저장" 또는 "덮어쓰기"

### 패키지 관리

1. "패키지 관리" 버튼 클릭
2. "+ 추가"로 새 패키지 생성
3. 목록에서 "수정" / "삭제" 버튼으로 관리

---

## 향후 개선 가능 사항

1. **키보드 단축키**: Ctrl+S로 저장, Ctrl+Shift+S로 다른 이름으로 저장
2. **최근 시나리오**: 최근 작업한 시나리오 빠른 접근
3. **자동 저장**: 일정 간격으로 임시 저장

---

*최종 수정일: 2025-01-10*
