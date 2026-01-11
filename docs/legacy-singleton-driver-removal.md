# 레거시 싱글톤 Driver 코드 제거 회고록

## 개요

**날짜**: 2026년 01월 11일
**목표**: 더 이상 사용되지 않는 싱글톤 Driver 패턴 코드를 완전히 제거하고, 멀티 디바이스 환경에 맞는 세션 검증 로직 강화

---

## 배경

프로젝트 초기에는 단일 디바이스만 지원하는 싱글톤 AppiumDriver 패턴을 사용했습니다. Phase 2에서 멀티 디바이스 지원을 위해 SessionManager 기반 아키텍처로 전환했지만, 레거시 코드가 여전히 남아 있어서:

1. 코드베이스 혼란 야기
2. 빌드 시 불필요한 코드 포함
3. 새 개발자가 어떤 패턴을 사용해야 하는지 혼동

---

## 구현 내용

### 1. 삭제된 파일 (총 1,406줄)

| 파일 | 줄 수 | 설명 |
|------|-------|------|
| `backend/src/appium/driver.ts` | 389 | 싱글톤 AppiumDriver 클래스 |
| `backend/src/routes/action.ts` | 280 | 레거시 액션 API 엔드포인트 |
| `backend/src/services/executor.ts` | 737 | 레거시 시나리오 실행기 |

### 2. 제거된 레거시 API

```
# 디바이스 API (싱글톤)
POST /api/device/connect
POST /api/device/disconnect
GET  /api/device/status

# 액션 API (싱글톤)
POST /api/action/tap
POST /api/action/longPress
POST /api/action/inputText
POST /api/action/click
POST /api/action/wait
POST /api/action/back
POST /api/action/home
POST /api/action/restart
POST /api/action/clearData
POST /api/action/clearCache

# 시나리오 실행 API (싱글톤)
GET  /api/scenarios/execution/status
GET  /api/scenarios/execution/log
POST /api/scenarios/stop
POST /api/scenarios/:id/run
```

### 3. 세션 검증 로직 강화

**SessionManager에 추가된 기능:**

```typescript
// 좀비 세션 감지 및 재생성
async validateAndEnsureSessions(
  deviceIds: string[],
  devices: DeviceDetailedInfo[]
): Promise<{
  validatedDeviceIds: string[];
  recreatedDeviceIds: string[];
  failedDeviceIds: string[];
}>

// 세션 건강 상태 확인 (getWindowSize로 실제 Appium 세션 검증)
async checkSessionHealth(deviceId: string): Promise<boolean>
```

**적용된 서비스:**
- `parallelExecutor.ts` - 병렬 실행 전 세션 검증
- `scheduleManager.ts` - 스케줄 실행 전 세션 검증
- `routes/image.ts` - 이미지 API 호출 전 세션 검증

### 4. TemplateModal deviceId 지원

이미지 템플릿 캡처 기능이 멀티 디바이스 환경에서 동작하도록 수정:

```typescript
// DevicePreview에서 선택된 디바이스 ID를 App.tsx로 전달
interface DevicePreviewProps {
  onDeviceIdChange?: (deviceId: string) => void;
}

// App.tsx에서 TemplateModal로 전달
<TemplateModal
  deviceId={previewDeviceId}
  packageId={selectedPackageId}
/>
```

### 5. 서버 재시작 스크립트 개선

포트 충돌 문제 해결을 위해 cross-platform `kill-port` 패키지 도입:

```json
{
  "scripts": {
    "kill:port": "npx kill-port 3001",
    "restart": "npx kill-port 3001 && npm run dev"
  }
}
```

---

## 영향 받는 파일

```
# 삭제됨
backend/src/appium/driver.ts
backend/src/routes/action.ts
backend/src/services/executor.ts

# 수정됨
backend/src/appium/actions.ts          - defaultActions export 제거
backend/src/index.ts                   - actionRoutes 참조 제거
backend/src/routes/device.ts           - connect/disconnect/status 제거
backend/src/routes/image.ts            - deviceId 필수화, 세션 검증 추가
backend/src/routes/scenario.ts         - executor 참조 및 관련 API 제거
backend/src/services/parallelExecutor.ts - 세션 검증 추가
backend/src/services/scheduleManager.ts  - 세션 검증 추가
backend/src/services/sessionManager.ts   - validateAndEnsureSessions 추가
backend/package.json                   - kill-port 추가, 스크립트 정리
frontend/src/App.tsx                   - previewDeviceId 상태 추가
frontend/src/components/DevicePreview/DevicePreview.tsx - onDeviceIdChange 추가
frontend/src/components/TemplateModal/TemplateModal.tsx - deviceId prop 추가
```

---

## 현재 아키텍처

### 시나리오 실행 흐름

```
사용자 요청
    ↓
┌─────────────────────────────────────────┐
│           testExecutor.ts               │ ← 단일/다중 시나리오 실행
│           parallelExecutor.ts           │ ← 병렬 디바이스 실행
│           scheduleManager.ts            │ ← 스케줄 기반 실행
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│         sessionManager.ts               │
│  - validateAndEnsureSessions()          │ ← 세션 검증/재생성
│  - getActions(deviceId)                 │ ← 디바이스별 Actions 인스턴스
│  - checkSessionHealth(deviceId)         │ ← 좀비 세션 감지
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│         Actions 클래스 인스턴스          │
│  - new Actions(driverProvider, deviceId)│
│  - tap(), swipe(), tapImage() 등        │
└─────────────────────────────────────────┘
    ↓
    Appium Server (디바이스별 포트)
```

### 제거된 레거시 흐름

```
(더 이상 존재하지 않음)

routes/action.ts → defaultActions → appiumDriver (싱글톤)
routes/scenario.ts → executor.ts → defaultActions → appiumDriver
routes/device.ts → appiumDriver.connect/disconnect
```

---

## 사용 방법

### 시나리오 실행 (새 방식)

```typescript
// POST /api/test/execute
{
  "scenarioIds": ["scenario-1", "scenario-2"],
  "deviceIds": ["emulator-5554", "emulator-5556"],
  "options": {
    "intervalMs": 2000,
    "stopOnError": false
  }
}
```

### 이미지 템플릿 캡처

1. DevicePreview에서 디바이스 선택
2. Panel에서 "이미지 템플릿" 버튼 클릭
3. TemplateModal에서 "화면 캡처" 탭 선택
4. 영역 드래그하여 템플릿 저장

---

## 향후 개선 가능 사항

1. **세션 자동 복구**: 네트워크 끊김 시 자동 재연결
2. **세션 풀링**: 자주 사용하는 디바이스 세션 미리 생성
3. **헬스체크 주기화**: 백그라운드에서 주기적으로 세션 상태 확인

---

*최종 수정일: 2026-01-11*
