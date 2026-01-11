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

## 50대 디바이스 안정적 지원 방안 (미구현)

### 현재 ADB 방식의 한계

| 문제 | 설명 | 50대 영향 |
|------|------|----------|
| ADB 서버 병목 | 단일 ADB 서버가 모든 연결 처리 | 동시 연결 불안정 |
| USB 허브 한계 | 전력/대역폭 제한 | 연결 끊김, 인식 실패 |
| 폴링 부하 | 50대 × 4개 명령 = 200개/회 | 서버 CPU 과부하 |
| 순차적 특성 | ADB 명령은 본질적으로 동기식 | 응답 지연 누적 |

### 방안 1: ADB over TCP + 분산 처리

```
[디바이스 1~10] ─── ADB Server 1 (PC 1) ───┐
[디바이스 11~20] ── ADB Server 2 (PC 2) ───┼─── Backend Server
[디바이스 21~30] ── ADB Server 3 (PC 3) ───┤
...                                        ┘
```

| 장점 | 단점 |
|------|------|
| 기존 코드 대부분 유지 | 여러 PC/서버 필요 |
| USB 허브 부하 분산 | 네트워크 복잡도 증가 |
| 병렬 처리 가능 | ADB TCP 연결 불안정할 수 있음 |

**구현 복잡도**: ⭐⭐⭐

### 방안 2: 디바이스 에이전트 방식 (Push 기반)

각 디바이스에 에이전트 앱을 설치하여 정보를 Push

```
┌─────────────────┐
│  Android 디바이스  │
│  ┌─────────────┐ │
│  │ Agent App  │──────► WebSocket ──► Backend
│  │ (백그라운드) │ │
│  └─────────────┘ │
└─────────────────┘
```

**에이전트 앱 역할:**
- 배터리, 메모리, 스토리지 정보 주기적 전송
- 연결 상태 heartbeat
- 스크린샷/화면 스트리밍

| 장점 | 단점 |
|------|------|
| ADB 폴링 불필요 | 앱 개발 필요 (Android) |
| 실시간 Push | 디바이스에 앱 설치 필요 |
| 확장성 우수 | 앱 권한 관리 필요 |
| 네트워크만 연결되면 동작 | Appium과 별개로 동작 |

**구현 복잡도**: ⭐⭐⭐⭐

### 방안 3: Appium 내장 정보 활용

Appium 세션이 이미 열려있으면 ADB 없이 정보 조회 가능

```typescript
// 현재: ADB 직접 호출
await execAsync(`adb -s ${deviceId} shell dumpsys battery`);

// 개선: Appium 드라이버 활용
const batteryInfo = await driver.execute('mobile: batteryInfo');
const deviceInfo = await driver.execute('mobile: deviceInfo');
```

| 장점 | 단점 |
|------|------|
| 추가 인프라 불필요 | 세션 있는 디바이스만 가능 |
| 안정적 (Appium이 관리) | 일부 정보 제한적 |
| 구현 간단 | 세션 없으면 ADB 폴백 필요 |

**구현 복잡도**: ⭐⭐

### 방안 4: 하이브리드 계층 구조 (권장)

```
┌─────────────────────────────────────────────────────┐
│                    Backend Server                    │
├─────────────────────────────────────────────────────┤
│  Device Registry (Redis/Memory)                     │
│  - 디바이스 상태 캐시 (30초 TTL)                      │
│  - 마지막 업데이트 시간                               │
└─────────────────────────────────────────────────────┘
          ▲                    ▲                    ▲
          │                    │                    │
    ┌─────┴─────┐        ┌─────┴─────┐        ┌─────┴─────┐
    │ ADB Worker │        │ ADB Worker │        │ ADB Worker │
    │  (1~17대)  │        │ (18~34대)  │        │ (35~50대)  │
    └───────────┘        └───────────┘        └───────────┘
```

**핵심 원칙:**
1. **Worker 분리**: 15~20대씩 담당하는 워커 프로세스
2. **청크 처리**: 한 번에 5대씩만 동시 조회
3. **긴 캐시 TTL**: 정적 정보 영구, 동적 정보 30초
4. **Lazy 로딩**: 사용자가 보는 디바이스만 상세 조회

**구현 복잡도**: ⭐⭐⭐

### 방안 비교

| 방안 | 안정성 | 구현 난이도 | 비용 | 권장 |
|------|--------|------------|------|------|
| ADB over TCP 분산 | ⭐⭐⭐ | ⭐⭐⭐ | 중 (PC 추가) | 중기 |
| 디바이스 에이전트 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 낮음 | 장기 |
| Appium 내장 활용 | ⭐⭐⭐⭐ | ⭐⭐ | 없음 | **즉시** |
| 하이브리드 워커 | ⭐⭐⭐⭐ | ⭐⭐⭐ | 낮음 | 중기 |

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
    await sleep(100); // ADB 서버 숨 돌리기
  }
  return results;
}

// 2. 세션 있으면 Appium 사용, 없으면 ADB
async function getDynamicInfo(deviceId: string) {
  const session = sessionManager.getSession(deviceId);
  if (session) {
    return await getInfoViaAppium(session.driver);
  }
  return await getInfoViaADB(deviceId);
}

// 3. 캐시 TTL 늘리기 (30초)
const deviceCache = new Map<string, { data: DeviceInfo, expires: number }>();
```

### 권장 로드맵

```
Phase 1 (완료): 정적/동적 분리 + 병렬 처리
  └─ 기본 성능 개선

Phase 2 (즉시 가능): 청크 처리 + Appium 내장 활용
  └─ 50대 기본 지원 가능

Phase 3 (1~2주): 하이브리드 워커 구조
  └─ 안정성 향상

Phase 4 (선택): 디바이스 에이전트 앱
  └─ 궁극적 솔루션
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

*최종 수정일: 2026-01-11*
