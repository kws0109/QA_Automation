# OpenCV 네이티브 버전 설치 회고록

## 개요

**날짜**: 2026년 01월 12일
**목표**: WASM 기반 OpenCV에서 네이티브 OpenCV로 전환하여 안정성 및 성능 향상

---

## 배경

기존 이미지 매칭 시스템에서 사용하던 WASM 기반 OpenCV 라이브러리들이 서버 크래시 문제를 일으켰습니다:

| 라이브러리 | 문제점 |
|-----------|--------|
| `@techstark/opencv-js` | 이미지 매칭 시 서버 크래시 |
| `opencv-wasm` | 초기화 과정에서 불안정 |

네이티브 OpenCV 바인딩(`@u4/opencv4nodejs`)으로 전환하여 안정성과 성능을 개선했습니다.

---

## 구현 내용

### 1. 시스템 OpenCV 설치

Chocolatey를 통해 Windows 시스템에 OpenCV 4.11.0 설치:

```powershell
# 관리자 권한 PowerShell에서 실행
choco install opencv -y
```

설치 경로: `C:\tools\opencv`

### 2. @u4/opencv4nodejs 설치

환경변수 설정 후 네이티브 바인딩 설치:

```bash
cd backend
OPENCV4NODEJS_DISABLE_AUTOBUILD=1 \
OPENCV_INCLUDE_DIR="C:/tools/opencv/build/include" \
OPENCV_LIB_DIR="C:/tools/opencv/build/x64/vc16/lib" \
npm install @u4/opencv4nodejs
```

### 3. imageMatch.ts 리팩토링

WASM API에서 네이티브 API로 변경:

**Before (WASM):**
```typescript
import { cv } from 'opencv-wasm';

// 비동기 초기화 필요
async function initOpenCV() { ... }

// Mat 생성
const srcMat = new cv.Mat(height, width, cv.CV_8UC4);
srcMat.data.set(buffer);

// 매칭
cv.matchTemplate(src, tmpl, result, cv.TM_CCOEFF_NORMED);
const minMax = cv.minMaxLoc(result);

// 수동 메모리 해제 필요
srcMat.delete();
```

**After (Native):**
```typescript
import cv from '@u4/opencv4nodejs';

// 초기화 불필요, 즉시 사용 가능
console.log('[OpenCV] 네이티브 버전 로드됨:', cv.version);

// Buffer에서 직접 디코딩
const srcMat = cv.imdecode(screenshotBuffer);

// 메서드 체이닝
const srcGray = srcMat.cvtColor(cv.COLOR_BGR2GRAY);
const resultMat = srcGray.matchTemplate(tmplGray, cv.TM_CCOEFF_NORMED);
const minMax = resultMat.minMaxLoc();

// 자동 메모리 관리 (GC)
```

---

## 영향 받는 파일

```
backend/src/services/imageMatch.ts  - OpenCV 네이티브 API 적용
backend/package.json                - @u4/opencv4nodejs 의존성 추가
```

---

## 개선 효과

| 항목 | Before (WASM) | After (Native) |
|------|---------------|----------------|
| 안정성 | 크래시 발생 | 안정적 |
| 초기화 | 비동기 대기 필요 | 즉시 사용 |
| 메모리 관리 | 수동 delete() 필수 | 자동 GC |
| 성능 | WASM 오버헤드 | 네이티브 속도 |

---

## 사전 요구사항

1. **Windows**: Visual Studio 2019 Build Tools
2. **OpenCV**: `choco install opencv` (관리자 권한)
3. **Python**: node-gyp 빌드용

---

## 향후 개선 가능 사항

1. **Docker 환경 지원**: Linux용 OpenCV 설치 스크립트 추가
2. **macOS 지원**: Homebrew를 통한 OpenCV 설치 가이드
3. **GPU 가속**: CUDA 지원 OpenCV 빌드 옵션

---

*최종 수정일: 2026-01-12*
