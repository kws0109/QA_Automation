# 테스트 실행 시작 성능 최적화 회고록

## 개요

**날짜**: 2026년 1월 11일
**목표**: 테스트 실행 버튼 클릭 후 진행 상황이 표시되기까지의 지연 시간 단축

---

## 배경

테스트 실행 버튼을 클릭한 후 "디바이스별 진행 상황" 카드가 나타나기까지 체감 지연이 있었습니다. 원인 분석 결과:

1. **순차적 데이터 조회**: 패키지/카테고리 정보를 시나리오별로 하나씩 조회
2. **순차적 준비 작업**: 디바이스 정보 → 큐 생성 → 세션 검증 순서로 실행
3. **늦은 UI 피드백**: 모든 준비가 완료된 후에야 UI 업데이트

---

## 구현 내용

### 1. 즉시 피드백 이벤트 (`test:preparing`)

실행 버튼 클릭 즉시 UI에 상태를 표시합니다.

**Backend (`testExecutor.ts`)**:
```typescript
this._emit('test:preparing', {
  deviceIds: request.deviceIds,
  scenarioIds: request.scenarioIds,
  message: '테스트 준비 중...',
});
```

**Frontend (`TestExecutionPanel.tsx`)**:
```typescript
const handleTestPreparing = (data: { deviceIds: string[]; scenarioIds: string[]; message: string }) => {
  addLog('info', `⏳ ${data.message}`);
  setIsProgressCollapsed(false);  // 준비 시작 시 자동으로 펼치기
};

socket.on('test:preparing', handleTestPreparing);
```

### 2. buildQueue 병렬화

패키지/카테고리 정보 조회를 순차에서 병렬로 변경했습니다.

**이전 (순차)**:
```typescript
for (const scenario of scenarios) {
  // 각 시나리오마다 await 발생 (N+1 문제)
  const pkg = await packageService.getById(scenario.packageId);
  const cat = await categoryService.getById(scenario.packageId, scenario.categoryId);
}
```

**개선 (병렬)**:
```typescript
// 1. 고유 ID 수집
const uniquePackageIds = new Set<string>();
const uniqueCategoryKeys = new Set<string>();

for (const scenario of scenarios) {
  uniquePackageIds.add(scenario.packageId);
  uniqueCategoryKeys.add(`${scenario.packageId}:${scenario.categoryId}`);
}

// 2. 병렬 조회
const packagePromises = Array.from(uniquePackageIds).map(async (pkgId) => {
  try {
    const pkgData = await packageService.getById(pkgId);
    packageCache.set(pkgId, pkgData);
  } catch {
    packageCache.set(pkgId, { id: pkgId, name: '알 수 없음', packageName: '' });
  }
});

await Promise.all([...packagePromises, ...categoryPromises]);

// 3. 캐시에서 사용
for (const scenario of scenarios) {
  const pkg = packageCache.get(scenario.packageId);
  const category = categoryCache.get(scenario.categoryId);
  // ...
}
```

### 3. execute() 병렬화

디바이스 정보 조회와 큐 생성을 병렬로 실행합니다.

```typescript
// 병렬 시작
const devicesPromise = deviceManager.getMergedDeviceList();
const queuePromise = this.buildQueue(request.scenarioIds, request.repeatCount || 1);

// 병렬 대기
const [devices, queueResult] = await Promise.all([devicesPromise, queuePromise]);
```

### 4. 비효율 방지

큐 생성이 실패하면 세션 검증을 건너뛰어 불필요한 세션 생성을 방지합니다.

```typescript
const [devices, queueResult] = await Promise.all([devicesPromise, queuePromise]);
const { queue, skippedIds } = queueResult;

// 큐가 비어있으면 세션 검증 없이 종료
if (queue.length === 0) {
  throw new Error('실행할 시나리오가 없습니다.');
}

// 큐 생성 성공 후에만 세션 검증 실행
const validationResult = await sessionManager.validateAndEnsureSessions(request.deviceIds, devices);
```

---

## 실행 흐름 비교

### 이전
```
[실행 버튼 클릭]
    ↓
[디바이스 정보 조회] ────────────────── 순차
    ↓
[시나리오 큐 생성 (패키지/카테고리 순차 조회)] ── 순차
    ↓
[세션 검증/생성]
    ↓
[UI 업데이트] ← 지연 발생
```

### 개선 후
```
[실행 버튼 클릭]
    ↓
[test:preparing 이벤트] → [UI 즉시 업데이트] ← 즉시 피드백
    ↓
[디바이스 정보 조회] ─┬─ 병렬
[시나리오 큐 생성]   ─┘
    ↓
[큐 유효성 검사] ← 실패 시 세션 검증 건너뜀
    ↓
[세션 검증/생성]
    ↓
[test:start 이벤트]
```

---

## 영향 받는 파일

```
backend/src/services/testExecutor.ts     # 병렬화 로직, test:preparing 이벤트
frontend/src/components/TestExecutionPanel/
└── TestExecutionPanel.tsx               # test:preparing 핸들러
```

---

## 성능 개선 효과

| 항목 | 이전 | 개선 후 |
|------|------|---------|
| UI 피드백 | 모든 준비 완료 후 | 즉시 |
| 패키지/카테고리 조회 | O(N) 순차 | O(1) 병렬 (고유 ID만) |
| 디바이스 + 큐 생성 | 순차 | 병렬 |
| 실패 시 낭비 | 세션 검증 후 실패 | 즉시 실패 |

---

## 안정성 검토

| 항목 | 상태 | 설명 |
|------|------|------|
| 기능적 안정성 | ✅ | 기존 동작 유지 |
| 에러 처리 | ✅ | 개별 try-catch로 폴백 처리 |
| 레이스 컨디션 | ✅ | 의존성 순서 보장 |
| 데이터 무결성 | ✅ | 영향 없음 |

---

## 향후 개선 가능 사항

- 세션 검증 자체의 병렬화 (현재는 디바이스별 순차)
- 큐 생성 결과 캐싱 (동일 시나리오 재실행 시)
- WebSocket 연결 상태 체크 최적화

---

*최종 수정일: 2026-01-11*
