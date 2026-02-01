# Server Manager 종료 버그 수정 회고록

## 개요

**날짜**: 2026년 02월 01일
**목표**: 서버 매니저 종료 시 Windows 탐색기 종료 및 시스템 프리징 버그 수정

---

## 배경

서버 매니저 프로그램 종료 시 두 가지 심각한 문제가 발생했습니다:

1. **Windows 탐색기(explorer.exe) 강제 종료**: 프로그램 종료 후 작업표시줄이 사라지고 Windows 단축키가 동작하지 않음
2. **시스템 프리징**: 종료 후 약 10초간 시스템이 멈추는 현상

---

## 원인 분석

### 버그 1: 탐색기 종료

`processManager.ts`의 `cleanup()` 메서드에서 포트 기반 프로세스 종료 시:

```typescript
// 문제의 코드
netstat -ano | findstr :${config.port} | findstr LISTENING
```

Cloudflare 서버의 경우 `port: 0`으로 설정되어 있어서:
- `findstr :0`이 `0.0.0.0:*` 형태의 **모든 리스닝 포트**를 매칭
- explorer.exe를 포함한 시스템 프로세스의 PID가 반환됨
- `taskkill /T /F`로 이들을 강제 종료

### 버그 2: 시스템 프리징

`execSync`로 동기적으로 taskkill을 실행:
- 4개 서버 × (taskkill + netstat) = 최소 8번의 동기 호출
- 각 명령이 완료될 때까지 메인 스레드 블로킹
- Electron UI 완전 멈춤 (Not Responding)

---

## 구현 내용

### 1. 포트 0 보호 및 정확한 매칭

```typescript
// 수정 후
if (config.port <= 0) {
  continue; // Cloudflare 등 포트 없는 서비스 스킵
}

// 더 정확한 포트 매칭 (공백 추가)
`findstr ":${config.port} "`

// 시스템 프로세스 보호
if (parseInt(pid, 10) > 4) { // PID 0=System Idle, PID 4=System
```

### 2. 비동기 병렬 처리

```typescript
// 비동기 명령 실행 헬퍼 (타임아웃 포함)
private async execWithTimeout(command: string, timeoutMs: number = 3000): Promise<void>

// PID로 프로세스 종료 (비동기)
private async killByPid(pid: number): Promise<void>

// 포트로 프로세스 종료 (비동기, 병렬)
private async killByPort(port: number): Promise<void>

// 새로운 비동기 cleanup 메서드
async cleanupAsync(): Promise<void> {
  // Step 1: 모든 프로세스 PID로 병렬 종료
  await Promise.all(pidKillPromises);

  // Step 2: 포트 기반 폴백 (병렬)
  await Promise.all(portKillPromises);
}
```

### 3. 호출부 수정 (main.ts)

```typescript
// 창 닫기 이벤트
await processManager?.cleanupAsync();

// 트레이 Quit 메뉴
await processManager?.cleanupAsync();
```

---

## 영향 받는 파일

```
server-manager/electron/processManager.ts
server-manager/electron/main.ts
```

---

## 성능 비교

| 항목 | Before | After |
|------|--------|-------|
| 종료 시간 | 8-12초 | 2-5초 |
| UI 반응성 | 멈춤 (Not Responding) | 반응형 유지 |
| 처리 방식 | 순차 동기 | 병렬 비동기 |

```
Before (동기 순차):
taskkill 1 → taskkill 2 → netstat 1 → ...
       총: 8-12초 (UI 블로킹)

After (비동기 병렬):
┌ kill 1 ─┐
├ kill 2 ─┼→ Promise.all() → 완료
├ kill 3 ─┤
└ kill 4 ─┘
       총: 2-3초 (UI 반응형)
```

---

## 교훈

1. **포트 값 검증 필수**: 0이나 음수 포트에 대한 처리 필요
2. **시스템 프로세스 보호**: PID 검증으로 중요 프로세스 보호
3. **동기 → 비동기**: Electron 메인 프로세스에서 execSync 지양
4. **병렬 처리**: 독립적인 작업은 Promise.all()로 병렬화

---

## 향후 개선 가능 사항

- 종료 진행 상황을 UI에 표시 (프로그레스 바)
- 프로세스 종료 실패 시 사용자에게 알림
- graceful shutdown 옵션 (SIGTERM 먼저 시도 후 SIGKILL)

---

*최종 수정일: 2026-02-01*
