# 이미지/텍스트 인식 하이라이트 및 UI 스타일 통일 회고록

## 개요

**날짜**: 2026년 01월 26일
**목표**: 테스트 리포트에서 이미지/텍스트 인식 결과를 하이라이트된 스크린샷으로 시각화하고, UI 테마를 통일

---

## 배경

### 1. 이미지/텍스트 인식 하이라이트
테스트 실행 시 이미지 인식(`tapImage`, `waitUntilImage`)과 OCR 텍스트 인식(`tapOcrText`, `waitUntilTextExists`) 액션이 실행될 때, 어떤 영역이 매칭되었는지 시각적으로 확인하기 어려웠습니다. 디버깅과 검증을 위해 매칭된 영역에 하이라이트 박스를 그린 스크린샷을 리포트에 저장하는 기능이 필요했습니다.

### 2. Confidence 표시 문제
이미지 인식 결과의 신뢰도(Confidence)가 소수점 1자리로 표시되어 99.95%가 100.0%로 반올림되는 문제가 있었습니다.

### 3. UI 테마 불일치
시나리오 관련 모달(Load, Save)과 트리 패널이 Catppuccin Mocha 색상으로 하드코딩되어 있어, VS Code Dark Theme 기반의 다른 UI 컴포넌트와 색상이 일치하지 않았습니다.

### 4. 디바이스 대시보드 뱃지 정렬
디바이스 카드의 뱃지(연결 타입, 상태, 역할)가 각각 다른 크기와 정렬로 표시되어 일관성이 없었습니다.

---

## 구현 내용

### 1. 이미지 인식 하이라이트

#### waitUntilImage nodeId 파라미터 추가
`backend/src/appium/actions.ts`의 `waitUntilImage` 메서드에 `nodeId` 파라미터를 추가하여 하이라이트 스크린샷 저장을 지원합니다.

```typescript
async waitUntilImage(
  templateId: string,
  timeout: number = 30000,
  interval: number = 1000,
  options: ImageMatchOptions & { tapAfterWait?: boolean; nodeId?: string } = {}
): Promise<ActionResult> {
  const { threshold = 0.8, region, tapAfterWait = false, nodeId } = options;

  // 이미지 매칭 성공 시
  if (nodeId && result.highlightedBuffer) {
    imageMatchEmitter.emitMatchSuccess({
      deviceId: this.deviceId,
      nodeId,
      templateId,
      confidence: result.confidence,
      highlightedBuffer: result.highlightedBuffer,
      matchRegion: { x, y, width, height },
      timestamp: new Date().toISOString(),
    });
  }
}
```

#### testExecutor에서 nodeId 전달
`backend/src/services/testExecutor.ts`에서 이미지 액션 호출 시 `node.id`를 전달합니다.

```typescript
case 'tapImage':
  result = await actions.tapImage(params.templateId as string, {
    threshold: (params.threshold as number) || 0.8,
    region: params.region as RegionType | undefined,
    nodeId: node.id,
  });
  break;

case 'waitUntilImage':
  result = await actions.waitUntilImage(
    params.templateId as string,
    (params.timeout as number) || 30000,
    1000,
    {
      threshold: (params.threshold as number) || 0.8,
      region: params.region as RegionType | undefined,
      tapAfterWait: params.tapAfterWait as boolean || false,
      nodeId: node.id,
    }
  );
  break;
```

### 2. OCR 텍스트 인식 하이라이트

`backend/src/services/textMatcher/textMatcher.ts`에 하이라이트 기능을 추가하여 텍스트가 인식된 영역에 박스를 그립니다.

### 3. Confidence 소수점 2자리 표시

`frontend/src/components/TestReports/TestReports.tsx`에서 신뢰도 표시를 수정했습니다.

```typescript
// Before
{(screenshot.confidence * 100).toFixed(1)}%

// After
{(screenshot.confidence * 100).toFixed(2)}%
```

### 4. 디바이스 대시보드 뱃지 통일

#### HTML 구조 변경
`frontend/src/components/DeviceDashboard/DeviceDashboard.tsx`에서 뱃지를 `.badges-row`로 그룹화했습니다.

```tsx
<div className="badges-row">
  <span className={`badge connection-type ${isWifiDevice(device.id) ? 'wifi' : 'usb'}`}>
    {isWifiDevice(device.id) ? '📶 WiFi' : '🔌 USB'}
  </span>
  <span className={`badge status ${...}`}>...</span>
  <button className={`badge role ${device.role === 'editing' ? 'editing' : 'testing'}`}>
    ...
  </button>
</div>
```

#### CSS 통일
`frontend/src/components/DeviceDashboard/DeviceDashboard.css`에 공통 `.badge` 스타일을 정의했습니다.

```css
.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 22px;
  padding: 0 8px;
  border-radius: 11px;
  font-size: 11px;
  font-weight: var(--font-medium);
  white-space: nowrap;
  border: 1px solid transparent;
}
```

### 5. 시나리오 모달/트리 패널 CSS 변수 적용

세 개의 CSS 파일에서 하드코딩된 Catppuccin Mocha 색상을 VS Code Dark Theme CSS 변수로 변환했습니다.

| Catppuccin Mocha | CSS 변수 |
|------------------|----------|
| `#181825` | `var(--bg-base)` |
| `#1e1e2e` | `var(--bg-surface)` |
| `#313244` | `var(--border-default)` |
| `#45475a` | `var(--bg-active)` |
| `#6c7086` | `var(--text-muted)` |
| `#a6adc8` | `var(--text-secondary)` |
| `#cdd6f4` | `var(--text-primary)` |
| `#89b4fa` | `var(--accent-primary)` |
| `#f38ba8` | `var(--color-danger)` |
| `#a6e3a1` | `var(--color-success)` |
| `#f9e2af` | `var(--color-warning)` |

---

## 영향 받는 파일

```
backend/src/appium/actions.ts                    - waitUntilImage nodeId 지원
backend/src/services/testExecutor.ts             - nodeId 전달
backend/src/services/screenshotEventService.ts   - 스크린샷 이벤트 처리
backend/src/services/textMatcher/textMatcher.ts  - OCR 하이라이트
backend/src/services/textMatcher/types.ts        - 타입 정의

frontend/src/components/DeviceDashboard/DeviceDashboard.tsx  - 뱃지 구조 변경
frontend/src/components/DeviceDashboard/DeviceDashboard.css  - 뱃지 스타일 통일
frontend/src/components/ScenarioLoadModal/ScenarioLoadModal.css   - CSS 변수
frontend/src/components/ScenarioSaveModal/ScenarioSaveModal.css   - CSS 변수
frontend/src/components/ScenarioTreePanel/ScenarioTreePanel.css   - CSS 변수
frontend/src/components/TestReports/TestReports.tsx   - Confidence 소수점
frontend/src/components/TestReports/TestReports.css   - 스타일 추가
```

---

## 사용 방법

### 이미지 인식 하이라이트 확인
1. 시나리오에 `tapImage` 또는 `waitUntilImage` 액션 추가
2. 테스트 실행
3. 테스트 리포트에서 해당 노드의 스크린샷 확인
4. 매칭된 영역에 녹색 하이라이트 박스가 표시됨

### OCR 텍스트 인식 하이라이트 확인
1. 시나리오에 `tapOcrText` 또는 `waitUntilTextExists` 액션 추가
2. 테스트 실행
3. 테스트 리포트에서 해당 노드의 스크린샷 확인
4. 인식된 텍스트 영역에 하이라이트 박스가 표시됨

---

## 향후 개선 가능 사항

1. **하이라이트 색상 커스터마이징**: 성공/실패에 따라 다른 색상 적용
2. **다중 매칭 표시**: 여러 영역이 매칭된 경우 모두 표시
3. **애니메이션 GIF 생성**: 대기 액션의 경우 시간에 따른 변화를 GIF로 저장

---

*최종 수정일: 2026-01-26*
