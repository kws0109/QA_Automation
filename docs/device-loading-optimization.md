# 디바이스 정보 로딩 최적화 회고록

## 개요

**날짜**: 2026년 01월 11일
**목표**: 다중 브라우저 환경에서 디바이스 정보 로딩 성능 개선 및 50대 디바이스 안정적 지원 방안 분석

---

## 배경

### 문제 상황
- 브라우저 2개를 열고 테스트 시 디바이스 정보 로딩이 매우 느림
- 디바이스 수가 늘어날수록 응답 시간이 선형 증가

### 원인 분석

#### 1. 순차적 디바이스 처리 (가장 큰 문제)
```typescript
// 기존 코드: 각 디바이스를 순차적으로 처리
for (const device of devices) {
  const detailed = await this.getDeviceDetailedInfo(device.id);  // 순차 실행!
}
```
디바이스가 N대면 N배 느려짐.

#### 2. 중복 scanDevices() 호출
- `getAllDevicesDetailedInfo()` → `scanDevices()` 호출 (1회)
- 각 디바이스마다 `getDeviceDetailedInfo()` → `getDeviceDetails()` → `scanDevices()` 다시 호출
- 디바이스 2대 기준: 총 `adb devices` 호출 3회 (1 + 2)

#### 3. 디바이스당 12개 ADB 명령어
| 정보 | ADB 명령 |
|------|----------|
| brand | `getprop ro.product.brand` |
| manufacturer | `getprop ro.product.manufacturer` |
| screenSize | `wm size` |
| screenDensity | `getprop ro.sf.lcd_density` |
| cpuModel | `cat /proc/cpuinfo` |
| cpuAbi | `getprop ro.product.cpu.abi` |
| sdkVersion | `getprop ro.build.version.sdk` |
| buildNumber | `getprop ro.build.display.id` |
| battery | `dumpsys battery` |
| cpuTemp | thermal zone 조회 |
| memory | `cat /proc/meminfo` |
| storage | `df -h /data` |

#### 4. 다중 브라우저 동시 요청
- App.tsx: 10초마다 `/list/detailed` 폴링
- DevicePreview.tsx: 30초마다 `/list/detailed` 폴링
- 브라우저 2개 → 부하 2배

#### 성능 영향 계산 (디바이스 2대, 브라우저 2개)
| 항목 | 호출 수 |
|------|---------|
| `adb devices` | 3회 × 2 브라우저 = 6회 |
| ADB 쉘 명령 | 12회 × 2대 × 2 브라우저 = 48회 |
| **총 ADB 명령** | **54회** (순차 실행) |

ADB 명령 하나당 평균 100~300ms → **5~15초** 이상 소요

---

## 1차 구현: 정적/동적 분리 + 병렬 처리

### 변경 사항

#### 1. 정적/동적 정보 분리
```typescript
// 정적 정보: deviceStorage에서 캐시 사용 (ADB 호출 없음)
const savedDevice = await deviceStorageService.getById(deviceId);
if (savedDevice) {
  staticInfo = {
    brand: savedDevice.brand,
    manufacturer: savedDevice.manufacturer,
    screenResolution: savedDevice.screenResolution,
    // ...
  };
}

// 동적 정보만 ADB 조회 (4개 명령)
const [batteryInfo, cpuTemp, memInfo, storageInfo] = await Promise.all([
  this.getBatteryInfo(deviceId),
  this.getCpuTemperature(deviceId),
  this.getMemoryInfo(deviceId),
  this.getStorageInfo(deviceId),
]);
```

#### 2. 중복 scanDevices() 제거
```typescript
// getDeviceDetailedInfo()에 basicInfo 파라미터 추가
async getDeviceDetailedInfo(deviceId: string, basicInfo?: DeviceInfo) {
  const info = basicInfo || await this.getDeviceDetails(deviceId);
  // ...
}

// getAllDevicesDetailedInfo()에서 한 번만 scanDevices() 호출
const devices = await this.scanDevices();  // 1회만!
const detailedResults = await Promise.allSettled(
  connectedDevices.map(device => this.getDeviceDetailedInfo(device.id, device))
);
```

#### 3. 병렬 처리
```typescript
// Promise.allSettled로 모든 디바이스 동시 조회
const detailedResults = await Promise.allSettled(
  connectedDevices.map(device => this.getDeviceDetailedInfo(device.id, device))
);
```

### 개선 결과

| 항목 | 개선 전 | 개선 후 |
|------|--------|--------|
| scanDevices() 호출 | N+1회 | **1회** |
| 디바이스당 ADB 명령 | 12개 | **4개** (67% 감소) |
| 처리 방식 | 순차 | **병렬** |
| 디바이스 2대 총 ADB | ~27회 | **~9회** |
| 예상 응답 시간 | 5~15초 | **1~3초** |

### 영향 받는 파일
```
backend/src/services/deviceManager.ts
  - getDynamicInfo(): 동적 정보만 조회 (신규)
  - getStaticInfo(): 정적 정보 조회 (신규)
  - getDeviceDetailedInfo(): 정적/동적 분리 로직
  - getAllDevicesDetailedInfo(): 병렬 처리
  - getMergedDeviceList(): 중복 로직 제거
```

---

## 50대+ 디바이스 안정적 지원 방안 (Android + iOS)

### 플랫폼별 현황

| 항목 | Android | iOS |
|------|---------|-----|
| 디바이스 탐색 | `adb devices` | `idevice_id -l` (libimobiledevice) |
| 자동화 드라이버 | UiAutomator2 | XCUITest |
| 정보 조회 | ADB shell 명령 | `ideviceinfo`, `idevicediagnostics` |
| 필수 환경 | Android SDK | macOS + Xcode |
| 서명/프로비저닝 | 불필요 (디버그 모드) | 필수 (개발자 인증서 + 프로비저닝 프로파일) |
| 화면 스트리밍 | MJPEG (go-ios/scrcpy) | WebDriverAgent 내장 |

### Android: ADB 방식의 한계

| 문제 | 설명 | 50대 영향 |
|------|------|----------|
| ADB 서버 병목 | 단일 ADB 서버가 모든 연결 처리 | 동시 연결 불안정 |
| USB 허브 한계 | 전력/대역폭 제한 | 연결 끊김, 인식 실패 |
| 폴링 부하 | 50대 × 4개 명령 = 200개/회 | 서버 CPU 과부하 |
| 순차적 특성 | ADB 명령은 본질적으로 동기식 | 응답 지연 누적 |

### iOS: XCUITest/libimobiledevice 방식의 한계

| 문제 | 설명 | 50대 영향 |
|------|------|----------|
| macOS 필수 | iOS 빌드/배포에 Xcode 필요 | 서버가 반드시 Mac이어야 함 |
| WDA 서명 | WebDriverAgent 앱 서명 필요 | 디바이스마다 프로비저닝 등록 필요 |
| 프로비저닝 제한 | 무료 계정: 3대, 유료: 100대 | 유료 개발자 계정 필수 |
| USB 멀티플렉싱 | usbmuxd 단일 프로세스 | 동시 연결 수 제한 |
| WDA 포트 충돌 | 각 디바이스별 WDA 포트 필요 | 포트 관리 복잡성 |
| 인증서 갱신 | 1년마다 갱신 필요 | 운영 부담 |

### 방안 1: 분산 워커 + 플랫폼별 서버

```
┌─────────────────────────────────────────────────────────────┐
│                     Central Backend                          │
│                  (Windows/Linux/Mac)                         │
└─────────────────────┬───────────────────────────────────────┘
                      │ REST API / WebSocket
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│ Android Worker │ │ Android Worker │ │  iOS Worker   │
│   (PC 1)      │ │   (PC 2)      │ │   (Mac)       │
│  ADB Server   │ │  ADB Server   │ │ usbmuxd+Xcode │
│ [Device 1~20] │ │ [Device 21~40]│ │ [iOS 1~10]    │
└───────────────┘ └───────────────┘ └───────────────┘
```

| 장점 | 단점 |
|------|------|
| 플랫폼별 독립 확장 | 여러 PC/서버 필요 |
| USB 허브 부하 분산 | 네트워크 복잡도 증가 |
| iOS는 Mac에서만 처리 | 워커 관리 오버헤드 |
| 각 워커 독립 장애 격리 | 인프라 비용 증가 |

**구현 복잡도**: ⭐⭐⭐⭐

### 방안 2: 디바이스 에이전트 방식 (Push 기반)

각 디바이스에 에이전트 앱을 설치하여 정보를 Push

```
┌─────────────────┐              ┌─────────────────┐
│ Android 디바이스 │              │   iOS 디바이스   │
│ ┌─────────────┐ │              │ ┌─────────────┐ │
│ │ Agent App  │─┼──► WebSocket │ │ Agent App  │─┼──► WebSocket
│ │(백그라운드)  │ │       │      │ │(백그라운드)  │ │       │
│ └─────────────┘ │       │      │ └─────────────┘ │       │
└─────────────────┘       │      └─────────────────┘       │
                          ▼                                ▼
                    ┌─────────────────────────────────────────┐
                    │              Backend Server              │
                    └─────────────────────────────────────────┘
```

**에이전트 앱 역할:**
- 배터리, 메모리, 스토리지 정보 주기적 전송
- 연결 상태 heartbeat
- 스크린샷/화면 스트리밍

| 장점 | 단점 |
|------|------|
| ADB/libimobiledevice 폴링 불필요 | 앱 개발 필요 (Android + iOS) |
| 실시간 Push | 디바이스에 앱 설치 필요 |
| 확장성 우수 (플랫폼 무관) | 앱 권한 관리 필요 |
| 네트워크만 연결되면 동작 | iOS 백그라운드 제한 존재 |
| USB 연결 불필요 | iOS 앱 배포/서명 필요 |

**iOS 에이전트 제약:**
- 백그라운드 실행 제한 (10분 후 중단)
- 백그라운드 모드 우회: Location updates, Background fetch 활용
- TestFlight 또는 Enterprise 배포 필요

**구현 복잡도**: ⭐⭐⭐⭐⭐

### 방안 3: Appium 내장 정보 활용

Appium 세션이 이미 열려있으면 ADB/libimobiledevice 없이 정보 조회 가능

```typescript
// Android: ADB 대신 Appium 드라이버 활용
const batteryInfo = await driver.execute('mobile: batteryInfo');
const deviceInfo = await driver.execute('mobile: deviceInfo');

// iOS: XCUITest 드라이버 활용
const iosDeviceInfo = await driver.execute('mobile: deviceInfo');
const iosBattery = await driver.execute('mobile: batteryInfo');
const activeApp = await driver.execute('mobile: activeAppInfo');
```

**플랫폼별 Appium mobile: 명령어:**

| 명령어 | Android (UiAutomator2) | iOS (XCUITest) |
|--------|------------------------|----------------|
| `mobile: deviceInfo` | ✅ | ✅ |
| `mobile: batteryInfo` | ✅ | ✅ |
| `mobile: activeAppInfo` | ✅ | ✅ |
| `mobile: getDeviceTime` | ✅ | ✅ |
| `mobile: shell` | ✅ (ADB 직접 호출) | ❌ |

| 장점 | 단점 |
|------|------|
| 추가 인프라 불필요 | 세션 있는 디바이스만 가능 |
| 안정적 (Appium이 관리) | 일부 정보 제한적 |
| Android/iOS 동일 인터페이스 | 세션 없으면 폴백 필요 |
| 구현 간단 | iOS는 WDA가 포그라운드여야 함 |

**구현 복잡도**: ⭐⭐

### 방안 4: 하이브리드 계층 구조 (권장)

```
┌────────────────────────────────────────────────────────────────┐
│                       Central Backend                           │
├────────────────────────────────────────────────────────────────┤
│  Device Registry (Redis/Memory)                                 │
│  - 디바이스 상태 캐시 (30초 TTL)                                  │
│  - 플랫폼별 분류 (android/ios)                                   │
│  - 마지막 업데이트 시간                                          │
└────────────────────────────────────────────────────────────────┘
          ▲                    ▲                    ▲
          │                    │                    │
    ┌─────┴─────┐        ┌─────┴─────┐        ┌─────┴─────┐
    │ Android    │        │ Android    │        │ iOS       │
    │ Worker     │        │ Worker     │        │ Worker    │
    │ (Win/Linux)│        │ (Win/Linux)│        │ (macOS)   │
    │ ADB        │        │ ADB        │        │ idevice   │
    │ [1~20대]   │        │ [21~40대]  │        │ [1~10대]  │
    └───────────┘        └───────────┘        └───────────┘
```

**핵심 원칙:**
1. **플랫폼별 Worker**: Android는 Windows/Linux, iOS는 macOS 전용
2. **Worker 분리**: 15~20대씩 담당하는 워커 프로세스
3. **청크 처리**: 한 번에 5대씩만 동시 조회
4. **긴 캐시 TTL**: 정적 정보 영구, 동적 정보 30초
5. **Lazy 로딩**: 사용자가 보는 디바이스만 상세 조회
6. **통합 API**: 프론트엔드는 플랫폼 구분 없이 단일 API 호출

**Worker 통신 프로토콜:**
```typescript
interface WorkerMessage {
  type: 'device_update' | 'device_disconnect' | 'heartbeat';
  platform: 'android' | 'ios';
  deviceId: string;
  data: DeviceInfo;
}
```

**구현 복잡도**: ⭐⭐⭐

### 방안 비교

| 방안 | 안정성 | 구현 난이도 | 비용 | iOS 지원 | 권장 |
|------|--------|------------|------|----------|------|
| 분산 워커 + 플랫폼별 서버 | ⭐⭐⭐ | ⭐⭐⭐⭐ | 중 (Mac 필수) | ✅ | 중기 |
| 디바이스 에이전트 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 낮음 | ⚠️ (제약 있음) | 장기 |
| Appium 내장 활용 | ⭐⭐⭐⭐ | ⭐⭐ | 없음 | ✅ | **즉시** |
| 하이브리드 워커 | ⭐⭐⭐⭐ | ⭐⭐⭐ | 낮음 (Mac 1대) | ✅ | **중기 (권장)** |

### 즉시 적용 가능한 추가 개선

```typescript
// 1. 청크 처리 (한 번에 5대씩)
async function getDevicesInChunks(devices: Device[], chunkSize = 5) {
  const results = [];
  for (let i = 0; i < devices.length; i += chunkSize) {
    const chunk = devices.slice(i, i + chunkSize);
    const chunkResults = await Promise.allSettled(
      chunk.map(d => getDeviceInfo(d.id))
    );
    results.push(...chunkResults);
    await sleep(100); // ADB/idevice 서버 숨 돌리기
  }
  return results;
}

// 2. 세션 있으면 Appium 사용, 없으면 네이티브 명령
async function getDynamicInfo(deviceId: string, platform: 'android' | 'ios') {
  const session = sessionManager.getSession(deviceId);
  if (session) {
    // Appium 내장 명령 (Android/iOS 공통)
    return await getInfoViaAppium(session.driver);
  }
  // 플랫폼별 폴백
  if (platform === 'android') {
    return await getInfoViaADB(deviceId);
  } else {
    return await getInfoViaLibimobiledevice(deviceId);
  }
}

// 3. 플랫폼별 디바이스 탐색
async function scanAllDevices(): Promise<Device[]> {
  const [androidDevices, iosDevices] = await Promise.all([
    scanAndroidDevices(),  // adb devices
    scanIOSDevices(),      // idevice_id -l
  ]);
  return [...androidDevices, ...iosDevices];
}

// 4. 캐시 TTL 늘리기 (30초)
const deviceCache = new Map<string, { data: DeviceInfo, expires: number }>();
```

### 권장 로드맵

```
Phase 1 (완료): 정적/동적 분리 + 병렬 처리 [Android Only]
  └─ 기본 성능 개선

Phase 2 (단기): iOS 기본 지원 추가
  ├─ libimobiledevice 연동 (idevice_id, ideviceinfo)
  ├─ DeviceInfo에 platform 필드 추가
  ├─ XCUITest 드라이버 세션 관리
  └─ 예상 기간: 1주

Phase 3 (단기): Appium 내장 활용 + 청크 처리
  ├─ 세션 있으면 mobile: 명령 사용 (Android/iOS 공통)
  ├─ 청크 처리로 50대 기본 지원
  └─ 예상 기간: 1주

Phase 4 (중기): 하이브리드 워커 구조
  ├─ Android Worker (Windows/Linux)
  ├─ iOS Worker (macOS)
  ├─ Central Backend가 Worker 통합 관리
  └─ 예상 기간: 2~3주

Phase 5 (장기, 선택): 디바이스 에이전트 앱
  ├─ Android 에이전트 앱 개발
  ├─ iOS 에이전트 앱 개발 (백그라운드 제약 우회)
  └─ 궁극적 솔루션
```

---

## iOS 지원 구현 체크리스트

### 필수 환경
- [ ] macOS 서버 (또는 iOS Worker용 Mac mini)
- [ ] Xcode 설치 + Command Line Tools
- [ ] Apple Developer 계정 (유료: 연 $99)
- [ ] libimobiledevice 설치 (`brew install libimobiledevice`)

### Backend 변경사항
- [ ] `DeviceInfo`에 `platform: 'android' | 'ios'` 필드 추가
- [ ] `iOSDeviceManager` 서비스 추가
  - `scanDevices()`: `idevice_id -l`
  - `getDeviceInfo()`: `ideviceinfo -u {udid}`
  - `getBatteryInfo()`: `idevicediagnostics diagnostics Battery`
- [ ] `SessionManager` iOS 세션 지원
  - XCUITest 드라이버 capabilities
  - WDA 포트 관리 (8100 + offset)
- [ ] `Actions` iOS 전용 메서드 추가
  - 일부 액션은 Android/iOS 공통 (tap, swipe)
  - 일부 액션은 플랫폼별 분기 필요 (launchApp, terminateApp)

### Frontend 변경사항
- [ ] 디바이스 카드에 플랫폼 아이콘 표시
- [ ] 디바이스 필터에 플랫폼 필터 추가
- [ ] iOS 전용 정보 표시 (UDID, iOS 버전 등)

### iOS Appium Capabilities 예시
```typescript
const iosCapabilities = {
  platformName: 'iOS',
  'appium:automationName': 'XCUITest',
  'appium:udid': 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
  'appium:platformVersion': '17.0',
  'appium:deviceName': 'iPhone 15',
  'appium:bundleId': 'com.example.app',
  'appium:xcodeOrgId': 'TEAM_ID',
  'appium:xcodeSigningId': 'iPhone Developer',
  'appium:wdaLocalPort': 8100,  // 디바이스별로 다르게 설정
  'appium:mjpegServerPort': 9200,  // MJPEG 스트리밍 포트
};
```

---

## 폴링 주기 조정 시 부작용 (참고)

폴링 주기를 늘리면 (예: 10초 → 30초):

| 영향 | 설명 | 심각도 |
|------|------|--------|
| 디바이스 연결/해제 감지 지연 | USB 연결/해제 후 최대 30초까지 UI에 반영 안 됨 | 중간 |
| 배터리/메모리 정보 지연 | 실시간 모니터링 느낌 감소 | 낮음 |
| 세션 상태 불일치 | 세션이 죽었는데 UI에서 "연결됨"으로 표시될 수 있음 | 중간 |

**결론**: 폴링 주기 조정보다 병렬 처리 + 캐싱이 더 효과적

---

*최종 수정일: 2026-01-12*
