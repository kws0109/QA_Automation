# GitHub Wiki 자동 게시 기능 회고록

## 개요

**날짜**: 2026년 1월 9일
**목표**: 기능 추가/수정 시 GitHub Wiki에 자동으로 히스토리 기록

---

## 배경

기존에는 Tistory 블로그에 개발 히스토리를 기록하려 했으나, Tistory API가 2024년 10월부로 종료됨.

**대안 검토**:
- GitHub Wiki: Git 기반, 레포와 통합, 무료
- Notion: API 지원, 유연한 구조
- Confluence: 강력한 문서화, 소규모 무료

**선택**: GitHub Wiki
- 이미 Git 레포지토리 사용 중
- 별도 계정/설정 불필요
- 마크다운 기반으로 docs/ 폴더와 호환

---

## 구현 내용

### 1. WikiService (`backend/src/services/wikiService.ts`)

```typescript
class WikiService {
  // Wiki 레포지토리 클론/업데이트
  private async prepareWikiRepo(): Promise<void>

  // 페이지 게시
  async post(options: WikiPostOptions): Promise<Result>

  // 기능 회고록 게시
  async postFeatureLog(featureName, description, changes, files): Promise<Result>

  // docs/ 폴더 동기화
  async syncFromDocs(): Promise<SyncResult>
}
```

**동작 방식**:
1. Wiki 레포지토리를 `.wiki-temp/` 폴더에 클론
2. 마크다운 파일 생성/수정
3. Git commit & push로 Wiki에 반영

### 2. Wiki API Routes (`backend/src/routes/wiki.ts`)

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/wiki/status` | 설정 상태 확인 |
| POST | `/api/wiki/init` | 수동 초기화 |
| POST | `/api/wiki/post` | 페이지 게시 |
| POST | `/api/wiki/feature` | 기능 회고록 게시 |
| POST | `/api/wiki/sync` | docs/ 폴더 동기화 |

### 3. 환경변수 설정

```env
# GitHub Wiki Configuration
GITHUB_REPO_OWNER=your-username
GITHUB_REPO_NAME=game-automation-tool
GITHUB_TOKEN=ghp_xxxxxxxxxxxx
```

---

## 설정 방법

### 1. GitHub Personal Access Token 생성

1. https://github.com/settings/tokens 접속
2. "Generate new token (classic)" 클릭
3. 권한 선택: `repo` (Full control of private repositories)
4. 토큰 생성 후 복사

### 2. GitHub Wiki 활성화

1. GitHub 레포지토리 > Wiki 탭
2. "Create the first page" 클릭하여 Wiki 활성화
3. 아무 페이지나 하나 생성 (Home 등)

### 3. 환경변수 설정

`backend/.env` 파일에 추가:
```env
GITHUB_REPO_OWNER=your-github-username
GITHUB_REPO_NAME=game-automation-tool
GITHUB_TOKEN=ghp_your_token_here
```

---

## 사용 방법

### API로 직접 게시

```bash
# 기능 회고록 게시
curl -X POST http://localhost:3001/api/wiki/feature \
  -H "Content-Type: application/json" \
  -d '{
    "featureName": "새로 만들기 버튼",
    "description": "시나리오를 초기화하고 새로 시작하는 기능",
    "changes": ["Header에 버튼 추가", "App.tsx에 핸들러 추가"],
    "files": ["frontend/src/App.tsx", "frontend/src/components/Header/Header.tsx"]
  }'
```

### docs/ 폴더 동기화

```bash
# docs/ 폴더의 모든 .md 파일을 Wiki에 동기화
curl -X POST http://localhost:3001/api/wiki/sync
```

---

## 영향 받는 파일

```
backend/src/
├── services/
│   └── wikiService.ts    # Wiki 서비스 (NEW)
├── routes/
│   └── wiki.ts           # Wiki API 라우트 (NEW)
├── index.ts              # 라우트 등록 추가
└── .env.example          # 환경변수 예시 추가
```

---

## 향후 개선 가능 사항

1. **Frontend UI**: Wiki 게시 버튼/모달 추가
2. **자동 게시**: 커밋 시 자동으로 회고록 생성
3. **카테고리**: Wiki 사이드바에 카테고리별 목차 자동 생성
4. **이미지 업로드**: 스크린샷 등 이미지 첨부 지원

---

*최종 수정일: 2026-01-09*
