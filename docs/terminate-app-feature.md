# 앱 종료 기능 및 에러 시 자동 종료 회고록

## 개요

**날짜**: 2026년 1월 9일
**목표**:
1. 앱 종료(terminateApp) 액션 추가
2. 테스트 에러 발생 시 10초 후 앱 자동 종료

---

## 배경

테스트 실패 후 앱이 계속 실행 상태로 남아있으면:
- 다음 테스트 시작 시 예상치 못한 상태에서 시작
- 리소스 낭비 (배터리, 메모리)
- 수동으로 앱 종료 필요

**요구사항**:
1. 사용자가 명시적으로 앱을 종료할 수 있는 액션
2. 에러 발생 시 자동으로 앱 종료 (10초 딜레이로 리포트 확인 시간 확보)

---

## 구현 내용

### 1. terminateApp 액션 추가

#### Backend Actions 클래스 (`backend/src/appium/actions.ts`)

```typescript
/**
 * 앱 종료 (패키지명으로)
 */
async terminateApp(packageName?: string): Promise<ActionResult> {
  const driver = await this._getDriver();
  const targetPackage = packageName || await driver.getCurrentPackage();

  console.log(`🛑 [${this.deviceId}] 앱 종료: ${targetPackage}`);

  await driver.terminateApp(targetPackage);

  return { success: true, action: 'terminateApp', package: targetPackage };
}
```

**특징**:
- `packageName` 생략 시 현재 실행 중인 앱 종료
- `driver.terminateApp()` 사용 (Appium 내장 메서드)

#### Panel UI 액션 목록 (`frontend/src/components/Panel/Panel.tsx`)

```typescript
const ACTION_TYPES: ActionTypeItem[] = [
  // ... 기존 액션들
  // 시스템
  { value: 'launchApp', label: '앱 실행', group: 'system' },
  { value: 'terminateApp', label: '앱 종료', group: 'system' },  // 추가
  // ...
];
```

#### ParallelExecutor 액션 실행 (`backend/src/services/parallelExecutor.ts`)

```typescript
case 'terminateApp':
  result = await actions.terminateApp(
    params.appPackage as string | undefined || scenarioPackageName || undefined
  );
  break;
```

**우선순위**:
1. 노드 파라미터의 `appPackage`
2. 시나리오 패키지명
3. 현재 실행 중인 앱 (undefined 전달 시)

---

### 2. 에러 발생 시 10초 후 앱 자동 종료

#### ParallelExecutor 에러 처리 (`backend/src/services/parallelExecutor.ts`)

```typescript
// 에러 발생 시 10초 후 앱 종료
if (scenarioPackageName) {
  console.log(`⏰ [${deviceId}] 10초 후 앱 종료 예정: ${scenarioPackageName}`);
  this._emitToDevice(deviceId, 'device:node', {
    nodeId: 'auto-terminate',
    status: 'start',
    message: `에러 발생 - 10초 후 앱 종료 예정`,
  });

  // 10초 대기 후 앱 종료 (비동기로 실행, 결과 반환에는 영향 없음)
  setTimeout(async () => {
    try {
      await actions.terminateApp(scenarioPackageName);
      console.log(`🛑 [${deviceId}] 앱 자동 종료 완료: ${scenarioPackageName}`);
      this._emitToDevice(deviceId, 'device:node', {
        nodeId: 'auto-terminate',
        status: 'success',
        message: `앱 자동 종료 완료: ${scenarioPackageName}`,
      });
    } catch (terminateErr) {
      console.warn(`[${deviceId}] ⚠️ 앱 자동 종료 실패:`, terminateErr);
      this._emitToDevice(deviceId, 'device:node', {
        nodeId: 'auto-terminate',
        status: 'error',
        message: `앱 자동 종료 실패`,
      });
    }
  }, 10000);
}
```

**설계 결정사항**:

1. **10초 딜레이**
   - 이유: 에러 발생 직후 스크린샷/비디오 캡처 시간 확보
   - 이유: 사용자가 에러 상황 확인할 시간 제공

2. **비동기 실행 (setTimeout)**
   - 이유: 테스트 결과 반환을 지연시키지 않음
   - 이유: 리포트 생성은 즉시 완료됨

3. **WebSocket 이벤트 전송**
   - 프론트엔드 로그에서 앱 종료 상태 확인 가능
   - `device:node` 이벤트 재활용 (nodeId: 'auto-terminate')

4. **시나리오 패키지 확인**
   - `scenarioPackageName`이 있을 때만 자동 종료
   - 패키지 지정 없는 시나리오는 종료 대상 앱 불명확

---

## 흐름도

```
테스트 실패 발생
       │
       ▼
 스크린샷 캡처
       │
       ▼
 비디오 녹화 종료
       │
       ▼
 Socket.IO 이벤트 전송
 (device:scenario:complete)
       │
       ▼
 결과 반환 (실패)
       │
       ▼
┌──────────────────────┐
│   10초 타이머 시작    │  ← setTimeout
│   (비동기 실행)       │
└──────────────────────┘
       │
       ▼
 (10초 후)
       │
       ▼
 actions.terminateApp()
       │
       ▼
 Socket.IO 이벤트 전송
 (앱 종료 완료)
```

---

## 사용 예시

### 시나리오에서 명시적 앱 종료

```
[Start] → [Action: launchApp] → ... → [Action: terminateApp] → [End]
```

### 에러 발생 시 자동 종료 로그

```
❌ [emulator-5554] 시나리오 실패: 이미지를 찾을 수 없음: login_button
⏰ [emulator-5554] 10초 후 앱 종료 예정: com.example.app
... (10초 후) ...
🛑 [emulator-5554] 앱 자동 종료 완료: com.example.app
```

---

## 영향 받는 파일

```
backend/src/
├── appium/actions.ts           # terminateApp 메서드 추가
└── services/parallelExecutor.ts # 액션 실행 + 에러 시 자동 종료

frontend/src/
└── components/Panel/Panel.tsx  # 액션 목록에 추가
```

---

## 테스트 시나리오

### 1. terminateApp 액션 직접 사용
1. 시나리오에 `terminateApp` 액션 추가
2. 시나리오 실행
3. 앱이 정상적으로 종료되는지 확인

### 2. 에러 시 자동 종료
1. 의도적으로 실패하는 시나리오 생성 (존재하지 않는 이미지 탭 등)
2. 시나리오 실행
3. 에러 발생 확인
4. 10초 후 앱이 자동 종료되는지 확인
5. 콘솔 로그 확인

---

## 향후 개선 가능 사항

1. **자동 종료 대기 시간 설정**: 사용자가 10초 대신 다른 시간 지정 가능
2. **자동 종료 비활성화 옵션**: 특정 시나리오에서는 자동 종료 안 함
3. **실패 후 재시작 옵션**: 종료 후 앱 재시작하여 다음 테스트 준비
4. **홈으로 이동 옵션**: 종료 대신 홈 버튼 누르기

---

*최종 수정일: 2026-01-09*
