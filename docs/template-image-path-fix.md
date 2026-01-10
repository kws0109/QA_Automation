# 패키지별 템플릿 이미지 경로 버그 수정 회고록

## 개요

**날짜**: 2025년 1월 10일
**목표**: 패키지별로 저장된 템플릿 이미지가 Canvas에서 미리보기되지 않는 문제 수정

---

## 배경

패키지 기반 워크플로우 도입 후, 템플릿 이미지가 `templates/{packageId}/` 폴더에 저장되도록 변경되었습니다. 그러나 Canvas 컴포넌트는 여전히 기존 경로(`/templates/{templateId}.png`)로 이미지를 요청하여 404 에러가 발생했습니다.

---

## 문제 분석

### 기존 구조
```
templates/
├── templates.json          # 레거시 (패키지 없음)
├── pkg_xxx/
│   ├── templates.json      # 패키지별 메타데이터
│   ├── tpl_001.png
│   └── tpl_002.png
```

### 문제점
- Canvas: `${API_BASE}/templates/${templateId}.png` 요청
- 실제 파일 위치: `templates/{packageId}/{templateId}.png`
- 경로 불일치로 이미지 로드 실패

---

## 구현 내용

### 1. 백엔드 - 템플릿 이미지 조회 API 추가

**파일**: `backend/src/services/imageMatch.ts`

```typescript
// 템플릿 ID로 이미지 파일 경로 반환 (모든 패키지에서 검색)
getTemplateImagePath(templateId: string): string | null {
  const template = this.getTemplate(templateId);
  if (!template) return null;
  return this.getTemplatePath(template);
}
```

**파일**: `backend/src/routes/image.ts`

```typescript
// GET /api/image/templates/:id/image
router.get('/templates/:id/image', (req, res) => {
  const { id } = req.params;
  const imagePath = imageMatchService.getTemplateImagePath(id);

  if (!imagePath) {
    return res.status(404).json({ error: '템플릿을 찾을 수 없습니다' });
  }

  res.sendFile(imagePath);
});
```

### 2. 프론트엔드 - 새 API 경로 사용

**파일**: `frontend/src/components/Canvas/Canvas.tsx`

```tsx
// 변경 전
src={`${API_BASE}/templates/${node.params.templateId}.png`}

// 변경 후
src={`${API_BASE}/api/image/templates/${node.params.templateId}/image`}
```

---

## 영향 받는 파일

```
backend/src/services/imageMatch.ts    # getTemplateImagePath() 메서드 추가
backend/src/routes/image.ts           # GET /templates/:id/image 엔드포인트 추가
frontend/src/components/Canvas/Canvas.tsx  # 이미지 경로 변경
```

---

## 장점

1. **단일 진입점**: 템플릿 ID만으로 이미지 조회 가능 (패키지 ID 불필요)
2. **하위 호환성**: 기존 레거시 템플릿도 동일한 API로 조회 가능
3. **캐싱 가능**: 정적 파일처럼 `sendFile`로 전송하여 브라우저 캐싱 활용

---

## 관련 수정사항

같은 세션에서 수정된 다른 버그들:
- 템플릿 저장 시 `packageId` 누락 버그 (DevicePreview)
- MJPEG 프록시 연결 끊김 시 재연결 로직

---

*최종 수정일: 2025-01-10*
