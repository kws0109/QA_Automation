# Canvas 줌/그리드/스크롤 기능 회고록

## 개요

**날짜**: 2026년 01월 31일
**목표**: 시나리오 편집기 Canvas에 줌 인/아웃, 그리드 재배치, 상하 스크롤 기능 추가

---

## 배경

시나리오가 복잡해지면서 다음 문제들이 발생했습니다:
- 노드가 많아지면 전체 시나리오 흐름 파악이 어려움
- 수평 방향으로만 배치되어 화면을 벗어남
- 연결선이 노드를 관통하여 흐름 파악이 혼란스러움
- 상하 스크롤이 동작하지 않아 긴 시나리오 탐색 불가

---

## 구현 내용

### 1. 줌 기능

**상수 정의:**
```typescript
const ZOOM_MIN = 0.25;   // 최소 25%
const ZOOM_MAX = 2.0;    // 최대 200%
const ZOOM_STEP = 0.1;   // 10% 단위
const ZOOM_DEFAULT = 1.0; // 기본 100%
```

**줌 적용 방식:**
- 노드: `left: node.x * zoom`, `transform: scale(${zoom})`, `transformOrigin: '0 0'`
- SVG 연결선: `transform: scale(${zoom})`, `transformOrigin: '0 0'`
- 콘텐츠 영역: 너비/높이에 zoom 배율 적용

**지원 기능:**
- 버튼: +/- 버튼, 전체 보기(⊡), 100% 리셋(1:1)
- 키보드: Ctrl+0 (리셋), Ctrl++ (줌인), Ctrl+- (줌아웃)
- 마우스: Ctrl+휠 줌

### 2. 그리드 재배치 (BFS 기반)

**알고리즘:**
1. Start 노드부터 BFS(너비 우선 탐색) 수행
2. 연결 순서대로 노드 정렬
3. 6개/줄 기준으로 그리드 배치
4. 연결되지 않은 노드는 마지막에 추가

**레이아웃 상수:**
```typescript
const NODE_GAP_X = 200;  // 노드 간 가로 간격
const NODE_GAP_Y = 300;  // 줄 간 세로 간격
const DEFAULT_NODES_PER_ROW = 6;  // 줄당 노드 수
```

### 3. 연결선 라우팅 개선

**라우팅 시나리오:**

| 상황 | 라우팅 방식 |
|------|------------|
| 같은 줄 인접 노드 | 직선 연결 |
| 그리드 줄바꿈 | 두 줄 사이 중간(midY)으로 우회 |
| 루프백 (이전 줄로) | Yes: 위로 우회, No: 아래로 우회 |
| 분기 (Y 좌표 다름) | goingUp 플래그로 동적 방향 결정 |

**꺾이는 지점:**
```typescript
const startTurnX = start.x + 25;  // 시작 노드 바로 옆
const endTurnX = end.x - 25;      // 도착 노드 바로 옆
```

**동적 우회 방향:**
```typescript
const goingUp = toNode.y < fromNode.y;  // 윗줄로 가는지 여부

if (branch === 'yes') {
  // Yes 분기: 윗줄로 가면 아래로 우회, 아랫줄로 가면 위로 우회
  const turnY = goingUp
    ? Math.max(fromNode.y + fromHeight, toNode.y + toHeight) + 40
    : Math.min(fromNode.y, toNode.y) - 40;
}
```

### 4. 상하 스크롤 문제 해결

**문제 원인 (CSS Specificity 충돌):**
```css
/* App.css - specificity: 20 (class + class) */
.editor-main .canvas { overflow-y: hidden; }

/* Canvas.css - specificity: 10 (class only) */
.canvas { overflow: auto; }
```

**해결:**
```css
/* App.css 수정 */
.editor-main .canvas {
  overflow: auto;  /* hidden → auto */
}
```

---

## 영향 받는 파일

```
frontend/src/App.css                        - overflow 수정
frontend/src/components/Canvas/Canvas.css   - 줌 컨트롤 스타일 추가
frontend/src/components/Canvas/Canvas.tsx   - 줌 상태, 연결선 라우팅 로직
frontend/src/contexts/FlowEditorContext.tsx - 그리드 재배치 함수
.gitignore                                  - 학습 문서 제외
```

---

## 사용 방법

### 줌 컨트롤
- **+ 버튼**: 줌 인 (Ctrl++ 단축키)
- **- 버튼**: 줌 아웃 (Ctrl+- 단축키)
- **⊡ 버튼**: 전체 노드가 보이도록 자동 줌
- **1:1 버튼**: 100%로 리셋 (Ctrl+0 단축키)
- **⋮⋮ 버튼**: 그리드 재배치 (6개/줄)
- **Ctrl+휠**: 마우스 위치 기준 줌

### 그리드 재배치
1. 캔버스 우측 하단의 ⋮⋮ 버튼 클릭
2. 모든 노드가 BFS 순서로 6개/줄 그리드 배치
3. 연결선이 자동으로 줄 사이를 통과하도록 재조정

---

## 향후 개선 가능 사항

1. **연결선 경로 메모이제이션**: 노드/연결 변경 시에만 재계산
2. **가상화 렌더링**: 50+ 노드 시 화면에 보이는 노드만 렌더링
3. **줌 중심점 개선**: 현재 좌상단 기준 → 마우스 위치 기준
4. **줄당 노드 수 설정**: 사용자가 직접 설정 가능하도록

---

*최종 수정일: 2026-01-31*
