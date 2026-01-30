# Contributing Guide

QA Automation Tool에 기여해주셔서 감사합니다!

---

## 시작하기

### 개발 환경 설정

1. **레포지토리 포크 및 클론**
   ```bash
   git clone https://github.com/YOUR_USERNAME/QA_Automation.git
   cd QA_Automation
   ```

2. **의존성 설치**
   ```bash
   # Backend
   cd backend && npm install

   # Frontend
   cd ../frontend && npm install
   ```

3. **환경 변수 설정**
   ```bash
   cp backend/.env.example backend/.env
   cp frontend/.env.example frontend/.env
   ```

4. **개발 서버 실행**
   ```bash
   # Terminal 1: Backend
   cd backend && npm run dev

   # Terminal 2: Frontend
   cd frontend && npm run dev

   # Terminal 3: Appium
   appium --port 4900 --allow-insecure=uiautomator2:adb_shell
   ```

---

## 브랜치 전략

```
main
 │
 ├── feature/기능명      # 새 기능 개발
 ├── fix/버그설명        # 버그 수정
 ├── docs/문서명         # 문서 작업
 └── refactor/대상       # 리팩토링
```

### 브랜치 이름 규칙

| 접두사 | 용도 | 예시 |
|--------|------|------|
| `feature/` | 새 기능 | `feature/slack-notification` |
| `fix/` | 버그 수정 | `fix/session-timeout` |
| `docs/` | 문서 작업 | `docs/api-reference` |
| `refactor/` | 리팩토링 | `refactor/test-executor` |
| `chore/` | 빌드/설정 | `chore/eslint-config` |

---

## 커밋 메시지

### 형식

```
<type>: <subject>

<body>

<footer>
```

### Type

| Type | 설명 |
|------|------|
| `feat` | 새 기능 |
| `fix` | 버그 수정 |
| `docs` | 문서 변경 |
| `style` | 포맷팅 (코드 변경 없음) |
| `refactor` | 리팩토링 |
| `test` | 테스트 추가/수정 |
| `chore` | 빌드/설정 변경 |

### 예시

```
feat: Slack 테스트 결과 알림 기능 추가

- slackNotificationService 구현
- 테스트 완료 시 Slack 채널 알림
- 성공/실패 여부에 따른 메시지 포맷

Closes #123
```

---

## Pull Request

### PR 제출 전 체크리스트

- [ ] 코드 포맷팅 확인 (`npm run lint`)
- [ ] 타입 체크 통과 (`npm run typecheck`)
- [ ] 빌드 성공 (`npm run build`)
- [ ] 관련 테스트 추가/수정
- [ ] 문서 업데이트 (필요 시)

### PR 템플릿

```markdown
## 변경 사항
-

## 변경 유형
- [ ] 새 기능
- [ ] 버그 수정
- [ ] 문서 업데이트
- [ ] 리팩토링
- [ ] 기타

## 테스트 방법
1.
2.
3.

## 스크린샷 (UI 변경 시)


## 관련 이슈
Closes #
```

---

## 코드 스타일

### TypeScript

- **들여쓰기**: 2 spaces
- **세미콜론**: 사용
- **따옴표**: 작은따옴표 (`'`)
- **타입**: 명시적 타입 선언 권장

```typescript
// Good
const userName: string = 'tester';

// Avoid
const userName = 'tester';
```

### React

- **컴포넌트**: 함수형 컴포넌트 + 화살표 함수
- **상태 관리**: Context API
- **스타일**: CSS 파일 분리

```tsx
// Good
const MyComponent: React.FC<Props> = ({ value }) => {
  return <div>{value}</div>;
};

// Avoid
function MyComponent(props) {
  return <div>{props.value}</div>;
}
```

### 파일 구조

```
ComponentName/
├── ComponentName.tsx      # 메인 컴포넌트
├── ComponentName.css      # 스타일
├── components/            # 하위 컴포넌트
│   └── SubComponent.tsx
├── hooks/                 # 커스텀 훅
│   └── useComponentLogic.ts
└── index.ts               # export
```

---

## 테스트

### Frontend 테스트

```bash
cd frontend

# 단위 테스트
npm run test

# 단일 실행
npm run test:run

# 커버리지
npm run test:coverage
```

### Backend 테스트

```bash
cd backend

# 타입 체크
npm run typecheck

# 빌드
npm run build
```

---

## 문서 작성

### 기능 회고록 (docs/)

새 기능 구현 시 `docs/` 폴더에 회고록을 작성합니다.

**파일명**: `{기능명-케밥케이스}.md`

**템플릿**:
```markdown
# {기능명} 회고록

## 개요

**날짜**: {YYYY년 MM월 DD일}
**목표**: {기능의 목적}

---

## 배경

{왜 이 기능이 필요했는지}

---

## 구현 내용

### 1. {구현 항목}
{설명}

---

## 영향 받는 파일

```
{파일 목록}
```

---

## 사용 방법

{API 또는 UI 사용법}

---

*최종 수정일: {YYYY-MM-DD}*
```

### Wiki 동기화

`docs/` 폴더 수정 후:

```bash
# Wiki 레포 준비
cd .wiki-temp && git pull && cd ..

# 파일 복사
cp docs/*.md .wiki-temp/

# 커밋 & 푸시
cd .wiki-temp && git add . && git commit -m "docs: sync" && git push
```

---

## 이슈 보고

### 버그 리포트

```markdown
## 버그 설명
{버그 현상}

## 재현 방법
1.
2.
3.

## 예상 동작
{정상 동작}

## 환경
- OS:
- Node.js:
- 브라우저:

## 스크린샷/로그
```

### 기능 제안

```markdown
## 기능 설명
{제안하는 기능}

## 사용 사례
{어떤 상황에서 필요한지}

## 예상 구현 방안
{가능하다면}
```

---

## 코드 리뷰

### 리뷰 관점

1. **기능**: 요구사항 충족 여부
2. **성능**: 병목 지점, 불필요한 연산
3. **보안**: 인젝션, XSS 등 취약점
4. **유지보수성**: 가독성, 중복 코드
5. **테스트**: 엣지 케이스 고려

### 리뷰 코멘트 예시

```
✅ LGTM (Looks Good To Me)
💬 제안: ~하면 어떨까요?
❓ 질문: 이 부분의 의도가 무엇인가요?
🔧 수정 필요: ~가 문제입니다
```

---

## 운영 고려사항

이 도구는 **현업에서 사용되는 QA 자동화 도구**입니다.

### 성능 기준

| 항목 | 기준 |
|------|------|
| 동시 접속 사용자 | 다중 |
| 연결 디바이스 | 50대+ |
| 동시 테스트 | 50개+ |

### 코드 작성 시 체크

- [ ] 폴링 주기가 적절한가?
- [ ] 불필요한 데이터 전송이 없는가?
- [ ] WebSocket 브로드캐스트 빈도가 적절한가?
- [ ] 50대 디바이스에서 병목이 없는가?

---

## 질문 & 지원

- **이슈 트래커**: [GitHub Issues](https://github.com/kws0109/QA_Automation/issues)
- **문서**: [GitHub Wiki](https://github.com/kws0109/QA_Automation/wiki)

---

감사합니다! 🎉
