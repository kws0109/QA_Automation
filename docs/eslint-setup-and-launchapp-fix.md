# ESLint 설정 및 launchApp 버그 수정 회고록

## 개요

**날짜**: 2026년 1월 11일
**목표**: ESLint 엄격 규칙 설정 및 launchApp 액션의 packageName undefined 버그 수정

---

## 배경

### 문제 1: launchApp 액션 오류
테스트 실행 시 `launchApp` 액션에서 다음 오류 발생:
```
Malformed type for "appId" parameter of command activateApp
Expected: string
Actual: undefined
```

**원인**: 시나리오가 패키지에 종속되어 있음에도 `launchApp` 액션에서 `packageName`을 수동으로 입력해야 했음.

### 문제 2: ESLint 미설정
프론트엔드에 ESLint가 설정되어 있지 않아 코드 품질 검증이 불가능했음.

---

## 구현 내용

### 1. launchApp 버그 수정 - appPackage 자동 주입

**접근 방식**: 시나리오는 이미 패키지에 종속되어 있으므로, 실행 시점에 부모 패키지의 `packageName`을 자동으로 주입.

#### 타입 정의 추가
```typescript
// backend/src/types/execution.ts
export interface ScenarioQueueItem {
  scenarioId: string;
  scenarioName: string;
  packageId: string;
  packageName: string;      // 패키지 표시 이름
  appPackage: string;       // Android 앱 패키지명 (예: com.example.app)
  categoryId: string;
  categoryName: string;
  order: number;
  repeatIndex: number;
}
```

#### testExecutor 수정
```typescript
// buildQueue()에서 appPackage 설정
queue.push({
  scenarioId: scenario.id,
  scenarioName: scenario.name,
  packageId: pkg?.id || '',
  packageName: pkg?.name || '',
  appPackage: pkg?.packageName || '',  // 패키지에서 자동 주입
  // ...
});

// executeActionNode()에서 사용
case 'launchApp':
  await actions.launchApp(params.packageName || appPackage);
  break;
case 'terminateApp':
  await actions.terminateApp(params.packageName || appPackage);
  break;
```

**장점**: 기존 시나리오 재저장 불필요 - 런타임에 패키지 정보 조회

---

### 2. ESLint 설정

#### 설치된 패키지
```bash
npm install -D eslint eslint-plugin-react-hooks eslint-plugin-react-refresh typescript-eslint @eslint/js globals
```

#### eslint.config.js 설정
```javascript
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist'] },
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off',
      'react-hooks/exhaustive-deps': 'warn',
      // 실험적 엄격 규칙 비활성화 (일반적인 React 패턴과 충돌)
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/immutability': 'off',
      'semi': ['error', 'always'],
      'quotes': ['error', 'single'],
      'comma-dangle': ['error', 'always-multiline'],
    },
  },
);
```

---

### 3. 코드 품질 개선

#### App.tsx 리팩토링
- `fetchScenarios`, `fetchTemplates`, `fetchPackages`를 `useCallback`으로 래핑
- 함수 선언을 useEffect 사용 전으로 이동 (호이스팅 문제 해결)
- useEffect 의존성 배열에 함수 추가

```typescript
// Before: 함수 선언 전에 사용 (ESLint 에러)
useEffect(() => {
  fetchScenarios();  // 아직 선언되지 않음
}, []);

const fetchScenarios = async () => { ... };

// After: useCallback으로 선언 후 사용
const fetchScenarios = useCallback(async () => { ... }, []);

useEffect(() => {
  fetchScenarios();
}, [fetchScenarios]);
```

#### ExecutionProgress.tsx
- `Date.now()` 호출을 `useMemo`로 감싸서 렌더 순수성 보장

```typescript
// Before: 렌더 중 Date.now() 호출 (불순 함수)
const estimatedRemaining = () => {
  const elapsed = Date.now() - new Date(status.startedAt).getTime();
  // ...
};

// After: useMemo로 메모이제이션
const estimatedRemaining = useMemo(() => {
  const elapsed = Date.now() - new Date(status.startedAt).getTime();
  // ...
}, [status.startedAt, progress.completed, progress.total]);
```

---

## 비활성화한 엄격 규칙

| 규칙 | 이유 |
|------|------|
| `set-state-in-effect` | 데이터 페칭 패턴과 충돌 (fetch → setState) |
| `refs` | 소켓 등 ref 전달 패턴과 충돌 |
| `purity` | Date.now() 등 일반적인 패턴과 충돌 |
| `immutability` | Map/Set 사용 패턴과 충돌 |

이 규칙들은 React 19의 실험적 기능으로, 현재 프로젝트의 일반적인 패턴과 호환되지 않아 비활성화함.

---

## 영향 받는 파일

```
backend/src/services/testExecutor.ts
backend/src/types/execution.ts
frontend/eslint.config.js
frontend/package.json
frontend/src/App.tsx
frontend/src/components/TestExecutionPanel/ExecutionProgress.tsx
+ 기타 컴포넌트 (ESLint auto-fix 적용)
```

---

## 검증 결과

| 항목 | 결과 |
|------|------|
| ESLint | 0 에러, 12 경고 |
| Frontend 빌드 | 성공 (1.89s) |
| Backend TypeCheck | 통과 |
| Backend 빌드 | 성공 |

---

## 향후 개선 가능 사항

1. **경고 해결**: 남은 12개 경고 (missing dependencies 등) 점진적 해결
2. **Prettier 통합**: ESLint와 Prettier 통합으로 일관된 포맷팅
3. **pre-commit 훅**: Husky로 커밋 전 자동 린트 검사

---

*최종 수정일: 2026-01-11*
