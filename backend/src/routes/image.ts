// backend/src/routes/image.ts

import { Router, Request, Response } from 'express';
import multer, { FileFilterCallback } from 'multer';
import { imageMatchService } from '../services/imageMatch';
import { sessionManager } from '../services/sessionManager';
import { asyncHandler, syncHandler, BadRequestError, NotFoundError } from '../utils/asyncHandler';

const router = Router();

// 허용된 이미지 MIME 타입
const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];

// 허용된 파일 확장자
const ALLOWED_EXTENSIONS = /\.(png|jpe?g|gif|webp)$/i;

// 파일 타입 검증 함수
const imageFileFilter = (
  _req: Request,
  file: Express.Multer.File,
  callback: FileFilterCallback
): void => {
  // MIME 타입 검사
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    callback(new Error(`허용되지 않는 파일 타입입니다: ${file.mimetype}. 허용: PNG, JPEG, GIF, WebP`));
    return;
  }

  // 파일 확장자 검사
  if (!ALLOWED_EXTENSIONS.test(file.originalname)) {
    callback(new Error(`허용되지 않는 파일 확장자입니다: ${file.originalname}`));
    return;
  }

  callback(null, true);
};

// multer 설정 (메모리 저장 + 파일 검증)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: imageFileFilter,
});

/**
 * 디바이스 세션 검증 헬퍼
 */
async function validateDeviceSession(deviceId: string) {
  const isHealthy = await sessionManager.checkSessionHealth(deviceId);
  if (!isHealthy) {
    throw new BadRequestError('해당 디바이스의 세션이 없거나 종료되었습니다. 세션을 먼저 연결하세요.');
  }

  const driver = sessionManager.getDriver(deviceId);
  if (!driver) {
    throw new BadRequestError(`디바이스 세션을 찾을 수 없습니다: ${deviceId}`);
  }

  return driver;
}

// 템플릿 목록 조회 (packageId 쿼리 파라미터로 필터링)
router.get('/templates', syncHandler((req: Request, res: Response) => {
  const { packageId } = req.query;
  const templates = imageMatchService.getTemplates(packageId as string | undefined);
  res.json({ success: true, data: templates });
}));

// 템플릿 추가 (packageId 필수)
router.post('/templates', upload.single('image'), asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new BadRequestError('이미지 파일이 필요합니다');
  }

  const name = req.body.name || `Template ${Date.now()}`;
  const packageId = req.body.packageId;

  if (!packageId) {
    throw new BadRequestError('packageId가 필요합니다');
  }

  const template = await imageMatchService.addTemplate(name, req.file.buffer, packageId);
  res.json({ success: true, data: template });
}));

// 템플릿 삭제
router.delete('/templates/:id', syncHandler((req: Request, res: Response) => {
  const { id } = req.params;
  const { packageId } = req.query;
  const deleted = imageMatchService.deleteTemplate(id, packageId as string | undefined);

  if (!deleted) {
    throw new NotFoundError('템플릿을 찾을 수 없습니다');
  }

  res.json({ success: true, message: '삭제되었습니다' });
}));

// 템플릿 이미지 조회 (ID로 검색, 모든 패키지에서 찾음)
router.get('/templates/:id/image', syncHandler((req: Request, res: Response) => {
  const { id } = req.params;
  const imagePath = imageMatchService.getTemplateImagePath(id);

  if (!imagePath) {
    throw new NotFoundError('템플릿을 찾을 수 없습니다');
  }

  res.sendFile(imagePath);
}));

// 현재 화면에서 이미지 찾기 (deviceId 필수)
router.post('/find', asyncHandler(async (req: Request, res: Response) => {
  const { templateId, threshold, region, deviceId } = req.body;

  if (!templateId) {
    throw new BadRequestError('templateId가 필요합니다');
  }

  if (!deviceId) {
    throw new BadRequestError('deviceId가 필요합니다');
  }

  const driver = await validateDeviceSession(deviceId);

  // 스크린샷 캡처
  const screenshot = await driver.takeScreenshot();
  const screenshotBuffer = Buffer.from(screenshot, 'base64');

  // 이미지 매칭
  const result = await imageMatchService.findImageCenter(
    screenshotBuffer,
    templateId,
    { threshold, region }
  );

  res.json({ success: true, data: result });
}));

// 스크린샷에서 영역 캡처하여 템플릿으로 저장 (deviceId 필수)
router.post('/capture-template', asyncHandler(async (req: Request, res: Response) => {
  const { name, x, y, width, height, deviceId, packageId } = req.body;

  if (!name || x === undefined || y === undefined || !width || !height) {
    throw new BadRequestError('name, x, y, width, height가 필요합니다');
  }

  if (!packageId) {
    throw new BadRequestError('packageId가 필요합니다');
  }

  if (!deviceId) {
    throw new BadRequestError('deviceId가 필요합니다. 디바이스를 선택해주세요.');
  }

  const sessionDriver = await validateDeviceSession(deviceId);

  const screenshotBase64 = await sessionDriver.takeScreenshot();
  const screenshotBuffer = Buffer.from(screenshotBase64, 'base64');

  // sharp로 영역 잘라내기 + 원본 스크린샷 크기 확인
  const sharp = await import('sharp');
  const screenshotMetadata = await sharp.default(screenshotBuffer).metadata();
  const sourceWidth = screenshotMetadata.width || 0;
  const sourceHeight = screenshotMetadata.height || 0;

  const croppedBuffer = await sharp.default(screenshotBuffer)
    .extract({ left: x, top: y, width, height })
    .png()
    .toBuffer();

  // 템플릿으로 저장 (패키지별 + 캡처 좌표 정보 포함)
  const template = await imageMatchService.addTemplate(name, croppedBuffer, packageId, {
    x,
    y,
    sourceWidth,
    sourceHeight,
  });

  res.json({ success: true, data: template });
}));

// 템플릿 매칭 테스트 (인식률 확인)
router.post('/test-match', asyncHandler(async (req: Request, res: Response) => {
  const { templateId, threshold, region, deviceId } = req.body;

  if (!templateId) {
    throw new BadRequestError('templateId가 필요합니다');
  }

  if (!deviceId) {
    throw new BadRequestError('deviceId가 필요합니다');
  }

  const driver = await validateDeviceSession(deviceId);

  // 스크린샷 캡처 시간 측정
  const captureStart = Date.now();
  const screenshot = await driver.takeScreenshot();
  const screenshotBuffer = Buffer.from(screenshot, 'base64');
  const captureTime = Date.now() - captureStart;

  // 이미지 매칭 (상세 결과 포함)
  const matchStart = Date.now();
  const result = await imageMatchService.matchTemplate(
    screenshotBuffer,
    templateId,
    { threshold: threshold || 0.9, region }
  );
  const matchTime = Date.now() - matchStart;

  // 템플릿 정보 조회
  const template = imageMatchService.getTemplate(templateId);

  // centerX/centerY 계산
  const centerX = result.x + result.width / 2;
  const centerY = result.y + result.height / 2;

  res.json({
    success: true,
    data: {
      matched: result.found,
      confidence: result.confidence,
      location: result.found ? {
        x: result.x,
        y: result.y,
        centerX: Math.round(centerX),
        centerY: Math.round(centerY),
      } : null,
      template: template ? {
        id: template.id,
        name: template.name,
        width: template.width,
        height: template.height,
      } : null,
      timing: {
        captureTime,
        matchTime,
        totalTime: captureTime + matchTime,
      },
      threshold: threshold || 0.9,
    },
  });
}));

// 템플릿 기반 추천 ROI 조회
router.get('/templates/:id/recommended-roi', syncHandler((req: Request, res: Response) => {
  const { id } = req.params;
  const { packageId, margin } = req.query;

  // 템플릿 조회
  const template = imageMatchService.getTemplate(id, packageId as string | undefined);
  if (!template) {
    throw new NotFoundError('템플릿을 찾을 수 없습니다');
  }

  // 마진 비율 (기본 20%)
  const marginRatio = margin ? parseFloat(margin as string) : 0.2;

  // ROI 계산
  const roi = imageMatchService.calculateRecommendedROI(template, marginRatio);

  if (!roi) {
    throw new BadRequestError('템플릿에 캡처 좌표 정보가 없습니다. 템플릿을 재캡처해주세요.');
  }

  res.json({
    success: true,
    data: roi,
    hasCaptureInfo: true,
    template: {
      captureX: template.captureX,
      captureY: template.captureY,
      sourceWidth: template.sourceWidth,
      sourceHeight: template.sourceHeight,
    },
  });
}));

export default router;
