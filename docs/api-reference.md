# API Reference

QA Automation Tool REST API 전체 명세서

---

## 개요

| 항목 | 값 |
|------|-----|
| Base URL | `http://localhost:3001` |
| 인증 | JWT Bearer Token |
| Content-Type | `application/json` |

---

## 인증

대부분의 API는 JWT 토큰이 필요합니다. 토큰은 쿠키(`token`)로 자동 전송됩니다.

### 인증 제외 엔드포인트

| 엔드포인트 | 설명 |
|-----------|------|
| `GET /auth/*` | 인증 관련 |
| `GET /api/test-reports/screenshots/*` | 스크린샷 파일 |
| `GET /api/test-reports/thumbnails/*` | 썸네일 파일 |
| `GET /api/test-reports/videos/*` | 비디오 파일 |

---

## 인증 API

### Slack OAuth 시작

```
GET /auth/slack
```

Slack OAuth 인증 페이지로 리다이렉트합니다.

**Response**: 302 Redirect to Slack

---

### Slack OAuth 콜백

```
GET /auth/slack/callback?code={code}&state={state}
```

OAuth 완료 후 콜백. JWT 토큰을 쿠키에 설정하고 프론트엔드로 리다이렉트합니다.

**Query Parameters**:
| 파라미터 | 타입 | 설명 |
|---------|------|------|
| code | string | Slack 인증 코드 |
| state | string | CSRF 토큰 |

**Response**: 302 Redirect to Frontend

---

### 인증 상태 확인

```
GET /auth/status
```

현재 인증 상태와 사용자 정보를 반환합니다.

**Response**:
```json
{
  "authenticated": true,
  "user": {
    "id": "U123456",
    "name": "홍길동",
    "email": "user@example.com",
    "avatar": "https://...",
    "teamId": "T123456",
    "teamName": "My Workspace"
  }
}
```

---

### 닉네임 로그인

```
POST /auth/nickname
```

Slack 없이 닉네임으로 간단 로그인합니다.

**Request Body**:
```json
{
  "nickname": "tester1"
}
```

**Response**:
```json
{
  "success": true,
  "user": {
    "id": "nickname_tester1",
    "name": "tester1"
  }
}
```

---

### 로그아웃

```
POST /auth/logout
```

JWT 토큰 쿠키를 삭제합니다.

**Response**:
```json
{
  "success": true
}
```

---

## 디바이스 API

### 디바이스 목록 조회

```
GET /api/devices
```

연결된 디바이스와 저장된 오프라인 디바이스 목록을 반환합니다.

**Response**:
```json
{
  "devices": [
    {
      "id": "emulator-5554",
      "name": "Pixel 6",
      "model": "Pixel 6",
      "brand": "Google",
      "androidVersion": "14",
      "sdkVersion": 34,
      "status": "connected",
      "sessionActive": true,
      "alias": "테스트폰1",
      "batteryLevel": 85,
      "batteryStatus": "charging",
      "memoryTotal": 8192,
      "memoryAvailable": 4096,
      "storageTotal": 128000,
      "storageAvailable": 64000
    }
  ]
}
```

---

### 디바이스 상세 조회

```
GET /api/devices/:deviceId
```

특정 디바이스의 상세 정보를 반환합니다.

**Path Parameters**:
| 파라미터 | 타입 | 설명 |
|---------|------|------|
| deviceId | string | 디바이스 ID |

**Response**: 단일 디바이스 객체

---

### 디바이스 별칭 수정

```
PUT /api/devices/:deviceId/alias
```

디바이스의 사용자 정의 별칭을 수정합니다.

**Request Body**:
```json
{
  "alias": "테스트폰1"
}
```

**Response**:
```json
{
  "success": true
}
```

---

### 저장된 디바이스 삭제

```
DELETE /api/devices/:deviceId
```

오프라인 디바이스를 목록에서 삭제합니다.

**Response**:
```json
{
  "success": true
}
```

---

## 세션 API

### 세션 목록 조회

```
GET /api/sessions
```

활성 Appium 세션 목록을 반환합니다.

**Response**:
```json
{
  "sessions": [
    {
      "deviceId": "emulator-5554",
      "sessionId": "abc123",
      "appiumPort": 4723,
      "mjpegPort": 9100,
      "status": "active",
      "createdAt": "2026-01-30T10:00:00Z"
    }
  ]
}
```

---

### 세션 시작

```
POST /api/sessions/:deviceId/start
```

디바이스에 Appium 세션을 생성합니다.

**Path Parameters**:
| 파라미터 | 타입 | 설명 |
|---------|------|------|
| deviceId | string | 디바이스 ID |

**Response**:
```json
{
  "success": true,
  "session": {
    "deviceId": "emulator-5554",
    "sessionId": "abc123",
    "mjpegPort": 9100
  }
}
```

---

### 세션 종료

```
POST /api/sessions/:deviceId/stop
```

디바이스의 Appium 세션을 종료합니다.

**Response**:
```json
{
  "success": true
}
```

---

### MJPEG 스트림

```
GET /api/sessions/:deviceId/stream
```

디바이스 화면의 MJPEG 스트림을 반환합니다.

**Response**: `multipart/x-mixed-replace` MJPEG 스트림

---

## 시나리오 API

### 시나리오 목록 조회

```
GET /api/scenarios
```

**Query Parameters**:
| 파라미터 | 타입 | 설명 |
|---------|------|------|
| packageId | string? | 패키지 필터 |

**Response**:
```json
{
  "scenarios": [
    {
      "id": "scn_123",
      "name": "로그인 테스트",
      "packageId": "pkg_456",
      "createdAt": "2026-01-30T10:00:00Z",
      "updatedAt": "2026-01-30T12:00:00Z"
    }
  ]
}
```

---

### 시나리오 상세 조회

```
GET /api/scenarios/:id
```

**Response**:
```json
{
  "id": "scn_123",
  "name": "로그인 테스트",
  "packageId": "pkg_456",
  "nodes": [
    {
      "id": "node_1",
      "type": "start",
      "position": { "x": 100, "y": 100 }
    },
    {
      "id": "node_2",
      "type": "tap",
      "position": { "x": 300, "y": 100 },
      "data": {
        "x": 540,
        "y": 960
      }
    }
  ],
  "connections": [
    {
      "id": "conn_1",
      "sourceId": "node_1",
      "targetId": "node_2",
      "sourceHandle": "default"
    }
  ]
}
```

---

### 시나리오 생성

```
POST /api/scenarios
```

**Request Body**:
```json
{
  "name": "로그인 테스트",
  "packageId": "pkg_456",
  "nodes": [...],
  "connections": [...]
}
```

**Response**:
```json
{
  "id": "scn_123",
  "name": "로그인 테스트",
  ...
}
```

---

### 시나리오 수정

```
PUT /api/scenarios/:id
```

**Request Body**: 시나리오 생성과 동일

**Response**: 수정된 시나리오 객체

---

### 시나리오 삭제

```
DELETE /api/scenarios/:id
```

**Response**:
```json
{
  "success": true
}
```

---

## Suite API

### Suite 목록 조회

```
GET /api/suites
```

**Response**:
```json
{
  "suites": [
    {
      "id": "suite_123",
      "name": "일일 테스트",
      "deviceIds": ["emulator-5554"],
      "scenarioIds": ["scn_1", "scn_2"],
      "createdAt": "2026-01-30T10:00:00Z"
    }
  ]
}
```

---

### Suite 생성

```
POST /api/suites
```

**Request Body**:
```json
{
  "name": "일일 테스트",
  "deviceIds": ["emulator-5554", "emulator-5556"],
  "scenarioIds": ["scn_1", "scn_2", "scn_3"]
}
```

**Response**: 생성된 Suite 객체

---

### Suite 수정

```
PUT /api/suites/:id
```

**Request Body**: Suite 생성과 동일

---

### Suite 삭제

```
DELETE /api/suites/:id
```

---

### Suite 실행

```
POST /api/suites/:id/execute
```

**Request Body**:
```json
{
  "repeatCount": 1,
  "scenarioInterval": 5000
}
```

**Response**:
```json
{
  "executionId": "exec_123",
  "status": "queued"
}
```

---

## 테스트 실행 API

### 테스트 실행 요청

```
POST /api/test/execute
```

**Request Body**:
```json
{
  "type": "scenario",
  "scenarioId": "scn_123",
  "deviceIds": ["emulator-5554"],
  "repeatCount": 1,
  "scenarioInterval": 0
}
```

또는 Suite 실행:
```json
{
  "type": "suite",
  "suiteId": "suite_123",
  "repeatCount": 1,
  "scenarioInterval": 5000
}
```

**Response**:
```json
{
  "executionId": "exec_123",
  "status": "queued",
  "position": 1
}
```

---

### 큐 상태 조회

```
GET /api/test/queue/status
```

**Response**:
```json
{
  "queue": [
    {
      "executionId": "exec_123",
      "type": "scenario",
      "scenarioName": "로그인 테스트",
      "deviceIds": ["emulator-5554"],
      "status": "running",
      "progress": 45,
      "currentStep": 5,
      "totalSteps": 11,
      "requestedBy": "홍길동",
      "requestedAt": "2026-01-30T10:00:00Z"
    }
  ],
  "deviceStatus": {
    "emulator-5554": {
      "status": "busy",
      "currentExecution": "exec_123"
    }
  }
}
```

---

### 실행 중지

```
POST /api/test/stop/:executionId
```

**Response**:
```json
{
  "success": true
}
```

---

### 진행률 조회

```
GET /api/test/progress/:executionId
```

**Response**:
```json
{
  "executionId": "exec_123",
  "status": "running",
  "progress": 45,
  "currentStep": 5,
  "totalSteps": 11,
  "steps": [
    {
      "nodeId": "node_1",
      "status": "passed",
      "duration": 1500
    }
  ]
}
```

---

## 리포트 API

### 리포트 목록 조회

```
GET /api/test-reports
```

**Query Parameters**:
| 파라미터 | 타입 | 설명 |
|---------|------|------|
| type | string? | `scenario` or `suite` |
| limit | number? | 결과 수 (기본: 50) |
| offset | number? | 오프셋 |

**Response**:
```json
{
  "reports": [
    {
      "id": "report_123",
      "type": "scenario",
      "scenarioName": "로그인 테스트",
      "status": "passed",
      "duration": 45000,
      "startedAt": "2026-01-30T10:00:00Z",
      "completedAt": "2026-01-30T10:00:45Z"
    }
  ],
  "total": 150
}
```

---

### 리포트 상세 조회

```
GET /api/test-reports/:id
```

**Response**:
```json
{
  "id": "report_123",
  "type": "scenario",
  "scenarioId": "scn_123",
  "scenarioName": "로그인 테스트",
  "devices": [
    {
      "deviceId": "emulator-5554",
      "deviceName": "Pixel 6",
      "status": "passed",
      "duration": 45000,
      "steps": [
        {
          "nodeId": "node_1",
          "nodeType": "tap",
          "status": "passed",
          "duration": 1500,
          "timestamp": "2026-01-30T10:00:01Z"
        }
      ],
      "screenshots": [
        {
          "nodeId": "node_2",
          "path": "screenshots/report_123/emulator-5554/step_2.png",
          "timestamp": "2026-01-30T10:00:02Z"
        }
      ],
      "video": {
        "path": "videos/report_123/emulator-5554.mp4",
        "duration": 45
      }
    }
  ]
}
```

---

### 리포트 삭제

```
DELETE /api/test-reports/:id
```

---

### HTML 내보내기

```
GET /api/test-reports/:id/export/html
```

**Response**: HTML 파일 다운로드

---

### PDF 내보내기

```
GET /api/test-reports/:id/export/pdf
```

**Response**: PDF 파일 다운로드

---

### 스크린샷 조회

```
GET /api/test-reports/screenshots/:reportId/:deviceId/:filename
```

**Response**: PNG 이미지

---

### 썸네일 조회

```
GET /api/test-reports/thumbnails/:reportId/:deviceId/:filename
```

**Response**: WebP 이미지 (없으면 PNG 폴백)

---

### 비디오 조회

```
GET /api/test-reports/videos/:reportId/:deviceId/:filename
```

**Response**: MP4 비디오

---

## 스케줄 API

### 스케줄 목록 조회

```
GET /api/schedules
```

**Response**:
```json
{
  "schedules": [
    {
      "id": "sched_123",
      "name": "일일 테스트",
      "suiteId": "suite_123",
      "suiteName": "로그인 Suite",
      "cronExpression": "0 10 * * *",
      "enabled": true,
      "nextRunAt": "2026-01-31T10:00:00Z",
      "lastRunAt": "2026-01-30T10:00:00Z"
    }
  ]
}
```

---

### 스케줄 생성

```
POST /api/schedules
```

**Request Body**:
```json
{
  "name": "일일 테스트",
  "suiteId": "suite_123",
  "cronExpression": "0 10 * * *",
  "enabled": true
}
```

---

### 스케줄 수정

```
PUT /api/schedules/:id
```

---

### 스케줄 삭제

```
DELETE /api/schedules/:id
```

---

### 스케줄 활성화

```
POST /api/schedules/:id/enable
```

---

### 스케줄 비활성화

```
POST /api/schedules/:id/disable
```

---

### 즉시 실행

```
POST /api/schedules/:id/run
```

스케줄된 Suite를 즉시 실행합니다.

**Response**:
```json
{
  "executionId": "exec_123"
}
```

---

### 실행 이력 조회

```
GET /api/schedules/:id/history
```

**Query Parameters**:
| 파라미터 | 타입 | 설명 |
|---------|------|------|
| limit | number? | 결과 수 (기본: 20) |

**Response**:
```json
{
  "history": [
    {
      "executionId": "exec_123",
      "status": "completed",
      "startedAt": "2026-01-30T10:00:00Z",
      "completedAt": "2026-01-30T10:05:00Z"
    }
  ]
}
```

---

## 이미지 매칭 API

### 이미지 매칭 테스트

```
POST /api/images/match
```

**Request Body**:
```json
{
  "deviceId": "emulator-5554",
  "templateId": "tpl_123",
  "threshold": 0.8,
  "roi": {
    "x": 0,
    "y": 0,
    "width": 1080,
    "height": 1920
  }
}
```

**Response**:
```json
{
  "found": true,
  "confidence": 0.95,
  "location": {
    "x": 540,
    "y": 960,
    "width": 100,
    "height": 50
  },
  "centerX": 590,
  "centerY": 985
}
```

---

### 하이라이트 스크린샷

```
POST /api/images/highlight
```

매칭된 영역을 하이라이트한 스크린샷을 반환합니다.

**Request Body**:
```json
{
  "deviceId": "emulator-5554",
  "templateId": "tpl_123"
}
```

**Response**: PNG 이미지 (Base64 또는 파일)

---

## OCR API

### 텍스트 인식

```
POST /api/ocr/recognize
```

**Request Body**:
```json
{
  "deviceId": "emulator-5554",
  "roi": {
    "x": 0,
    "y": 0,
    "width": 1080,
    "height": 500
  }
}
```

**Response**:
```json
{
  "texts": [
    {
      "text": "로그인",
      "confidence": 0.98,
      "bounds": {
        "x": 490,
        "y": 200,
        "width": 100,
        "height": 30
      }
    }
  ]
}
```

---

### 텍스트 위치 찾기

```
POST /api/ocr/find
```

**Request Body**:
```json
{
  "deviceId": "emulator-5554",
  "text": "로그인",
  "exact": false
}
```

**Response**:
```json
{
  "found": true,
  "location": {
    "x": 490,
    "y": 200,
    "width": 100,
    "height": 30
  },
  "centerX": 540,
  "centerY": 215
}
```

---

## Slack API

### 채널 목록 조회

```
GET /api/slack/channels
```

**Response**:
```json
{
  "channels": [
    {
      "id": "C123456",
      "name": "qa-alerts"
    }
  ]
}
```

---

### 알림 설정 수정

```
PUT /api/slack/settings
```

**Request Body**:
```json
{
  "enabled": true,
  "channelId": "C123456",
  "notifyOnSuccess": true,
  "notifyOnFailure": true,
  "mentionRequester": true
}
```

---

### 테스트 메시지 전송

```
POST /api/slack/test
```

설정된 채널로 테스트 메시지를 전송합니다.

**Response**:
```json
{
  "success": true
}
```

---

## 대시보드 API

### 실행 통계 조회

```
GET /api/dashboard/stats
```

**Query Parameters**:
| 파라미터 | 타입 | 설명 |
|---------|------|------|
| period | string | `day`, `week`, `month` |

**Response**:
```json
{
  "totalExecutions": 150,
  "passedExecutions": 140,
  "failedExecutions": 10,
  "successRate": 93.3,
  "averageDuration": 45000,
  "executionsByDay": [
    { "date": "2026-01-30", "total": 20, "passed": 18 }
  ]
}
```

---

## 에러 응답

### 공통 에러 형식

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request body",
    "details": [
      {
        "field": "deviceId",
        "message": "Required"
      }
    ]
  }
}
```

### HTTP 상태 코드

| 코드 | 설명 |
|------|------|
| 200 | 성공 |
| 201 | 생성됨 |
| 400 | 잘못된 요청 |
| 401 | 인증 필요 |
| 403 | 권한 없음 |
| 404 | 리소스 없음 |
| 409 | 충돌 (디바이스 사용 중 등) |
| 429 | 요청 제한 초과 |
| 500 | 서버 오류 |

---

## Rate Limiting

| 엔드포인트 | 제한 |
|-----------|------|
| 일반 API | 15분당 1000회 |
| 인증 API | 15분당 20회 |
| 테스트 실행 | 1분당 10회 |
| 파일 업로드 | 1분당 30회 |
| 스트리밍 | 1분당 100회 |

**Rate Limit 헤더**:
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1706612400
```

---

*최종 수정일: 2026-01-30*
