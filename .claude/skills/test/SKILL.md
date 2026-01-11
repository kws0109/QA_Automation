---
name: test
description: 프로젝트 테스트 및 빌드 검증. TypeScript 타입 체크, ESLint 린팅, 빌드 실행. "테스트 실행", "빌드 확인", "타입 체크" 요청 시 사용
allowed-tools:
  - Bash(npm:*)
  - Bash(npx:*)
  - Read
  - Grep
  - Glob
---

# 프로젝트 테스트 스킬

## 개요
프로젝트의 코드 품질과 빌드 상태를 검증합니다.

## 실행 단계

### 1. Backend 검증
```bash
cd backend && npm run typecheck
```
TypeScript 타입 오류 확인

```bash
cd backend && npm run build
```
빌드 성공 여부 확인

### 2. Frontend 검증
```bash
cd frontend && npm run lint
```
ESLint 규칙 위반 확인

```bash
cd frontend && npm run build
```
Vite 빌드 성공 여부 확인

## 결과 보고

각 단계 실행 후 다음을 보고합니다:
- 성공/실패 상태
- 발견된 오류 목록 (있는 경우)
- 오류 수정 제안

## 오류 수정

오류가 발견되면:
1. 오류 내용 분석
2. 관련 파일 확인
3. 수정 방안 제시
4. 사용자 승인 후 수정 적용

## 사용 예시

사용자가 다음과 같이 요청할 때 이 스킬을 사용:
- "테스트 실행해줘"
- "빌드 되는지 확인해"
- "타입 에러 있는지 봐줘"
- "린트 체크해줘"
