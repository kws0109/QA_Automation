# 에디터 테스트 패널 및 대기 후 탭 기능 회고록

## 개요

**날짜**: 2026년 01월 16일
**목표**: 노드 에디터에서 단일 노드 테스트 실행 및 대기 액션 개선

---

## 배경

### 문제 1: 노드 에디터에서 테스트 실행 불편
기존에는 시나리오 전체를 실행해야만 테스트가 가능했습니다. 특정 노드 하나만 테스트하고 싶을 때 불편했습니다.

### 문제 2: 대기 후 탭 스텝 중복
"이미지가 나타날 때까지 대기" 후 "이미지 탭"을 하려면 2개의 노드가 필요했습니다. 이로 인해 시나리오가 불필요하게 길어지는 문제가 있었습니다.

### 문제 3: clearData/clearCache 액션 미구현
Panel UI에는 "앱 데이터 삭제", "앱 캐시 삭제" 옵션이 있었지만 실제 구현이 누락되어 있었습니다.

---

## 구현 내용

### 1. EditorTestPanel 컴포넌트

노드 에디터 우측에 테스트 패널을 추가하여 단일 노드 실행이 가능해졌습니다.

**주요 기능:**
- 디바이스 선택 (editing 역할 디바이스만 표시)
- 세션 생성/종료
- 패키지 정보 표시 및 경고
- 실행 로그 표시
- 자동 스크롤 옵션

**API 엔드포인트:**
```
POST /api/test/execute-node
Body: { deviceId, node, appPackage }
```

### 2. 대기 후 탭 (tapAfterWait) 옵션

4개의 대기 액션에 `tapAfterWait` 옵션을 추가했습니다:

| 액션 | 설명 |
|------|------|
| `waitUntilExists` | 요소가 나타나면 자동 탭 |
| `waitUntilTextExists` | 텍스트가 나타나면 자동 탭 |
| `waitUntilImage` | 이미지가 나타나면 자동 탭 |
| `waitUntilTextOcr` | OCR 텍스트가 나타나면 자동 탭 |

**사용 예시:**
```typescript
// 기존: 2개 노드 필요
await actions.waitUntilImage('start-button');
await actions.tapImage('start-button');

// 개선: 1개 노드로 처리
await actions.waitUntilImage('start-button', 30000, 1000, { tapAfterWait: true });
```

### 3. clearData/clearCache 시스템 액션

ADB shell 명령을 사용하여 앱 데이터/캐시 삭제 기능을 구현했습니다.

| 액션 | ADB 명령 | 설명 |
|------|---------|------|
| `clearData` | `pm clear <package>` | 앱 데이터 전체 삭제 |
| `clearCache` | `rm -rf /data/data/<package>/cache/*` | 캐시만 삭제 |

### 4. Canvas 노드 하이라이트

테스트 실행 중 현재 실행 중인 노드를 시각적으로 표시합니다.

```css
.node.highlighted {
  box-shadow: 0 0 0 3px #60a5fa, 0 0 20px rgba(96, 165, 250, 0.5);
  animation: pulse-highlight 1.5s ease-in-out infinite;
}
```

### 5. 디바이스 역할 관리

디바이스에 역할(role)을 부여하여 용도를 구분합니다:
- `editing`: 노드 에디터에서 테스트용
- `testing`: 시나리오 실행 탭에서 사용

---

## 영향 받는 파일

```
backend/src/appium/actions.ts           - tapAfterWait 옵션, clearData/clearCache 추가
backend/src/services/testExecutor.ts    - 파라미터 전달, 새 액션 케이스
backend/src/routes/test.ts              - execute-node API
backend/src/routes/device.ts            - 역할 업데이트 API
backend/src/services/deviceStorage.ts   - 역할 저장
backend/src/types/index.ts              - DeviceRole 타입

frontend/src/components/EditorTestPanel/  - 새 컴포넌트
frontend/src/components/Panel/Panel.tsx   - 체크박스 UI
frontend/src/components/Panel/Panel.css   - 체크박스 스타일
frontend/src/components/Canvas/Canvas.tsx - 노드 하이라이트
frontend/src/components/Canvas/Canvas.css - 하이라이트 스타일
frontend/src/App.tsx                      - EditorTestPanel 통합
```

---

## 사용 방법

### 대기 후 탭 옵션 사용
1. 대기 액션 노드 선택 (waitUntilImage, waitUntilTextOcr 등)
2. 우측 패널에서 "대기 후 탭" 체크박스 활성화
3. 요소가 나타나면 자동으로 탭 실행

### 에디터 테스트 패널 사용
1. 시나리오 편집 탭에서 노드 선택
2. 우측 테스트 패널에서 디바이스 선택
3. 세션 생성 후 "실행" 버튼 클릭
4. 실행 로그에서 결과 확인

---

## 향후 개선 가능 사항

1. **연속 노드 실행**: 선택한 노드부터 끝까지 실행하는 기능
2. **브레이크포인트**: 특정 노드에서 일시 정지
3. **변수 오버라이드**: 테스트 시 변수 값 임시 변경

---

*최종 수정일: 2026-01-16*
