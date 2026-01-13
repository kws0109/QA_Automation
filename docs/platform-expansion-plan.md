# 플랫폼 확장 계획

## 개요

**작성일**: 2026년 01월 13일
**현재 상태**: Appium + Android 기반 완성
**목표**: iOS 지원 및 에이전트 앱 방식으로 확장

---

## 현재 아키텍처 (Appium 기반)

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Frontend   │────►│   Backend    │────►│    Appium    │
│   (React)    │     │  (Node.js)   │     │   Server     │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                  │
                                                  ▼
                                          ┌──────────────┐
                                          │ UiAutomator2 │
                                          │  (Android)   │
                                          └──────────────┘
```

### 현재 지원 범위

| 플랫폼 | 지원 여부 | 비고 |
|--------|----------|------|
| Android | ✅ 완전 지원 | UiAutomator2 드라이버 |
| iOS | ❌ 미지원 | Mac 필요 |

---

## Phase 1: iOS 지원 (Appium 기반)

### 필수 요구사항

| 항목 | 필수 여부 | 설명 |
|------|----------|------|
| **macOS** | ✅ 필수 | Xcode가 macOS에서만 실행 |
| **Xcode** | ✅ 필수 | iOS 시뮬레이터, WebDriverAgent 빌드 |
| **Apple Developer 계정** | ⚠️ 실기기 필수 | 프로비저닝 프로파일 필요 |

### Mac 확보 방안

| 방안 | 월 비용 | 장점 | 단점 |
|------|---------|------|------|
| **Mac Mini 구매** | 일시불 $600+ | 안정적, 장기 사용 | 초기 비용 |
| **MacStadium** | $79~ | 전용 서버, 관리 불필요 | 월 비용 |
| **AWS EC2 Mac** | $26/일~ | 온디맨드 사용 | 최소 24시간, 비용 높음 |
| **MacinCloud** | $20~ | 저렴 | 공유 환경, 성능 제한 |

### 아키텍처 변경

```
┌─────────────────────────────────────────────────────────┐
│                    Unified Backend                       │
│                     (Windows/Linux)                      │
└─────────────────────────────────────────────────────────┘
           │                              │
           ▼                              ▼
  ┌─────────────────┐          ┌─────────────────┐
  │ Android Worker  │          │   iOS Worker    │
  │ (Windows/Linux) │          │    (macOS)      │
  │ Appium + ADB    │          │ Appium + Xcode  │
  └─────────────────┘          └─────────────────┘
           │                              │
           ▼                              ▼
  ┌─────────────────┐          ┌─────────────────┐
  │ Android Devices │          │  iOS Devices    │
  └─────────────────┘          └─────────────────┘
```

### 구현 작업

1. **플랫폼 추상화 인터페이스 설계**
   ```typescript
   interface IDeviceDriver {
     connect(deviceId: string): Promise<void>;
     disconnect(): Promise<void>;
     tap(x: number, y: number): Promise<void>;
     swipe(from: Point, to: Point, duration: number): Promise<void>;
     input(text: string): Promise<void>;
     screenshot(): Promise<Buffer>;
     launchApp(bundleId: string): Promise<void>;
     terminateApp(bundleId: string): Promise<void>;
   }
   ```

2. **iOS 드라이버 구현**
   - XCUITest 드라이버 연동
   - WebDriverAgent 설정
   - iOS 전용 capabilities 관리

3. **시나리오 호환성**
   - 좌표를 비율 기반으로 저장 (해상도 독립)
   - 플랫폼별 템플릿 이미지 지원
   - 플랫폼별 오버라이드 옵션

---

## Phase 2: 에이전트 앱 방식 (장기)

### 개요

Appium 대신 디바이스에 직접 에이전트 앱을 설치하여 자동화 수행

```
┌──────────────┐     ┌──────────────┐
│   Frontend   │────►│   Backend    │
│   (React)    │     │  (Node.js)   │
└──────────────┘     └──────┬───────┘
                            │ WebSocket
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
        ┌──────────┐  ┌──────────┐  ┌──────────┐
        │ Agent App│  │ Agent App│  │ Agent App│
        │(Device 1)│  │(Device 2)│  │(Device N)│
        └──────────┘  └──────────┘  └──────────┘
```

### Appium vs 에이전트 앱 비교

| 항목 | Appium 방식 | 에이전트 앱 방식 |
|------|-------------|-----------------|
| **서버 부하** | 높음 (디바이스당 Appium) | 낮음 (WebSocket만) |
| **레이턴시** | 100-500ms | 10-50ms |
| **확장성** | 50대 한계 | 수백 대 가능 |
| **개발 비용** | 낮음 (기존 Appium) | 높음 (앱 개발 필요) |
| **USB 연결** | 필수 | 불필요 (WiFi 가능) |
| **iOS 지원** | 가능 (Mac 필요) | 매우 제한적 |

### Android 에이전트 앱 기술 스택

| 기능 | 구현 방식 |
|------|-----------|
| **탭/스와이프** | AccessibilityService + GestureDescription |
| **텍스트 입력** | InputConnection API |
| **스크린샷** | MediaProjection API |
| **화면 스트리밍** | MediaProjection + WebSocket (MJPEG) |
| **UI 요소 탐색** | AccessibilityNodeInfo |
| **앱 실행/종료** | Intent / ActivityManager |

### 에이전트 앱 핵심 코드 (참고)

```kotlin
class AutomationService : AccessibilityService() {

    fun performTap(x: Int, y: Int) {
        val path = Path().apply { moveTo(x.toFloat(), y.toFloat()) }
        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, 100))
            .build()
        dispatchGesture(gesture, null, null)
    }

    fun findElement(text: String): AccessibilityNodeInfo? {
        return rootInActiveWindow?.findAccessibilityNodeInfosByText(text)?.firstOrNull()
    }
}
```

### iOS 에이전트 앱 제약사항

| 제약 | 설명 |
|------|------|
| **백그라운드 실행 제한** | 10분 후 중단 |
| **AccessibilityService 없음** | 시스템 레벨 자동화 불가 |
| **앱 배포** | TestFlight 또는 Enterprise 배포 필요 |

**결론**: iOS는 에이전트 앱 방식보다 Appium(XCUITest)이 현실적

---

## 권장 로드맵

```
현재 상태: Appium + Android 완성
│
├─ 단기 (Mac 구입 전)
│   ├─ Android 기능 강화 (이미지 인식, 안정성)
│   ├─ 플랫폼 추상화 인터페이스 설계
│   └─ 에이전트 앱 프로토타입 (선택)
│
├─ 중기 (Mac 구입 후)
│   ├─ iOS 드라이버 구현 (Appium XCUITest)
│   ├─ iOS 전용 템플릿 지원
│   └─ 동일 시나리오로 Android/iOS 동시 테스트
│
└─ 장기 (선택)
    ├─ Android 에이전트 앱 개발
    ├─ Appium 대체 또는 하이브리드 운영
    └─ 대규모 확장 (100대+)
```

---

## 하이브리드 방식 (최종 목표)

```
┌─────────────────────────────────────────────────────────┐
│                    Unified Backend                       │
├─────────────────────────────────────────────────────────┤
│              Platform Abstraction Layer                  │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐       │
│  │AndroidAppium│ │AndroidAgent │ │  iOSAppium  │       │
│  │   Driver    │ │   Driver    │ │   Driver    │       │
│  └─────────────┘ └─────────────┘ └─────────────┘       │
└─────────────────────────────────────────────────────────┘

에이전트 앱 설치된 Android → 에이전트 앱 사용 (빠름)
에이전트 앱 미설치 Android → Appium 폴백 (호환성)
iOS 디바이스 → Appium XCUITest (Mac 필요)
```

**장점:**
- 점진적 마이그레이션 가능
- 기존 시나리오 100% 호환
- 플랫폼/방식 자동 선택

---

*최종 수정일: 2026-01-13*
