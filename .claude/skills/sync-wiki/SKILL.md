---
name: sync-wiki
description: GitHub Wiki 동기화. docs/ 폴더의 마크다운 파일을 GitHub Wiki에 동기화. "위키 동기화", "wiki sync", "문서 동기화" 요청 시 사용
allowed-tools:
  - Bash(git:*)
  - Bash(cp:*)
  - Bash(ls:*)
  - Bash(cat:*)
  - Read
  - Write
  - Glob
---

# GitHub Wiki 동기화 스킬

## 개요
`docs/` 폴더의 마크다운 파일을 GitHub Wiki 레포지토리에 동기화합니다.

## Wiki 정보

| 항목 | 값 |
|------|------|
| GitHub 레포지토리 | https://github.com/kws0109/QA_Automation |
| Wiki | https://github.com/kws0109/QA_Automation/wiki |
| Wiki 클론 주소 | https://github.com/kws0109/QA_Automation.wiki.git |
| 로컬 Wiki 경로 | `.wiki-temp/` |

## 동기화 절차

### 1. Wiki 레포 준비
```bash
if [ -d ".wiki-temp" ]; then
  cd .wiki-temp && git pull && cd ..
else
  git clone https://github.com/kws0109/QA_Automation.wiki.git .wiki-temp
fi
```

### 2. docs/ 파일 확인
```bash
ls -la docs/*.md 2>/dev/null || echo "docs/ 폴더에 마크다운 파일이 없습니다"
```

### 3. 파일 복사
```bash
cp docs/*.md .wiki-temp/
```

### 4. Home.md 및 _Sidebar.md 갱신

새 문서가 추가되면 반드시 Home.md와 _Sidebar.md에 링크를 추가합니다.

**Home.md 형식:**
```markdown
## 기능 회고록

* [[새-회고록-파일명]] - 간단한 설명
```

**_Sidebar.md 형식:**
```markdown
### 기능 회고록
* [[새-회고록-파일명]]
```

### 5. 커밋 및 푸시
```bash
cd .wiki-temp && git add . && git commit -m "docs: sync from docs/" && git push && cd ..
```

## 주의사항

1. **Wiki 링크 규칙**
   - 올바른 형식: `[[파일명]]` (예: `[[phase2-retrospective]]`)
   - `.md` 확장자는 제외하고 작성
   - 파이프로 별칭 지정 불가 (`[[파일명|별칭]]` 안됨)

2. **Git Credential**
   - Git Credential Manager가 설정되어 있어야 합니다
   - 첫 접근 시 인증하면 이후 자동 처리됩니다

3. **.gitignore**
   - `.wiki-temp/` 폴더가 .gitignore에 추가되어 있어야 합니다

## 사용 예시

사용자가 다음과 같이 요청할 때 이 스킬을 사용:
- "위키 동기화해줘"
- "wiki sync"
- "문서 동기화"
- "회고록 올려줘"
