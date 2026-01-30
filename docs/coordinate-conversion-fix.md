# 좌표 변환 오류 수정 회고록

## 개요

**날짜**: 2026년 01월 29일
**목표**: 가로/세로 모드 앱에서 좌표 변환 오류 해결

---

## 배경

사용자가 가로 모드(landscape) 앱에서 탭 좌표를 저장한 후 실행하면, 좌표가 화면 범위를 벗어나는 오류가 발생했습니다.

### 증상
- 가로 모드 앱 (2246x1080)에서 좌표 저장
- 실행 시 "탭 좌표가 화면 범위를 벗어남" 에러
- 저장된 퍼센트 좌표: (0.496, 0.862)
- 잘못된 절대 좌표: (536, 1654) - 세로 모드 기준
- 올바른 절대 좌표: (1114, 931) - 가로 모드 기준

---

## 원인 분석

### 1. Actions.getDriver() 메서드 부재

`ActionExecutionService.getDeviceScreenSize()`가 `actions.getDriver()`를 호출하지만, `Actions` 클래스에 해당 메서드가 없었습니다.

```typescript
// ActionExecutionService.ts (기존)
private async getDeviceScreenSize(actions: Actions) {
  const driver = await actions.getDriver(); // TypeError: actions.getDriver is not a function
  // ...
}
```

**결과**: 에러 발생 → 기본값 `1080x1920` (세로 모드) 반환 → 좌표 변환 오류

### 2. 스와이프 퍼센트 좌표 범위 불일치

| 위치 | 기존 범위 | 올바른 범위 |
|------|----------|------------|
| `useSwipeSelect.ts` | 0-100 | 0-1 |
| 백엔드 기대값 | 0-1 | 0-1 |

---

## 구현 내용

### 1. Actions.getDriver() 메서드 추가

**파일**: `backend/src/appium/actions/index.ts`

```typescript
/**
 * 드라이버 인스턴스 반환 (화면 크기 조회 등 외부에서 필요할 때 사용)
 */
async getDriver(): Promise<Browser> {
  return this.driverProvider();
}
```

이제 `ActionExecutionService`가 실제 디바이스 화면 크기를 조회할 수 있습니다.

### 2. 스와이프 퍼센트 좌표 범위 수정

**파일**: `frontend/src/components/DevicePreview/hooks/useSwipeSelect.ts`

```typescript
// 기존 (잘못됨)
const startXPercent = (swipeStart.x / img.clientWidth) * 100;

// 수정 (올바름)
const startXPercent = swipeStart.x / img.clientWidth;
```

### 3. UI 표시 수정

**파일**: `frontend/src/components/DevicePreview/components/SwipeSelectPanel.tsx`

```typescript
// 기존
({deviceSwipe.startXPercent.toFixed(1)}%)

// 수정 (0-1 범위를 퍼센트로 표시)
({(deviceSwipe.startXPercent * 100).toFixed(1)}%)
```

---

## 영향 받는 파일

```
backend/src/appium/actions/index.ts           # getDriver() 메서드 추가
frontend/src/components/DevicePreview/hooks/useSwipeSelect.ts  # 퍼센트 범위 수정
frontend/src/components/DevicePreview/components/SwipeSelectPanel.tsx  # UI 표시 수정
```

---

## 좌표 변환 흐름

### Before (오류 발생)

```
1. 사용자가 가로 모드 앱에서 탭 (0.496, 0.862)
2. ActionExecutionService.getDeviceScreenSize() 호출
3. actions.getDriver() → TypeError
4. catch → 기본값 { width: 1080, height: 1920 } 반환
5. 좌표 변환: (0.496 * 1080, 0.862 * 1920) = (536, 1654)
6. 실제 화면(2246x1080)에서 (536, 1654)는 범위 초과 → 에러
```

### After (정상 동작)

```
1. 사용자가 가로 모드 앱에서 탭 (0.496, 0.862)
2. ActionExecutionService.getDeviceScreenSize() 호출
3. actions.getDriver() → driver 반환
4. driver.getWindowRect() → { width: 2246, height: 1080 }
5. 좌표 변환: (0.496 * 2246, 0.862 * 1080) = (1114, 931)
6. 정상 탭 실행
```

---

## 검증

| 항목 | 결과 |
|------|------|
| TypeScript 타입 체크 | 통과 |
| Backend 빌드 | 통과 |
| Frontend 빌드 | 통과 |
| 실제 디바이스 테스트 | 통과 |

---

## 향후 개선 가능 사항

1. **화면 크기 캐싱**: 매 좌표 변환마다 `getWindowRect()` 호출 대신 실행 시작 시 한 번만 조회
2. **디버그 로그 정리**: 프로덕션에서 `console.log` 제거 또는 환경 변수 기반 조건부 출력

---

*최종 수정일: 2026-01-29*
