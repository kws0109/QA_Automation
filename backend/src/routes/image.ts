// backend/src/routes/image.ts

import { Router, Request, Response } from 'express';
import multer from 'multer';
import { imageMatchService } from '../services/imageMatch';
import driver from '../appium/driver';
import { sessionManager } from '../services/sessionManager';

const router = Router();

// multer 설정 (메모리 저장)
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

// 템플릿 목록 조회 (packageId 쿼리 파라미터로 필터링)
router.get('/templates', (req: Request, res: Response) => {
  try {
    const { packageId } = req.query;
    const templates = imageMatchService.getTemplates(packageId as string | undefined);
    res.json({ success: true, data: templates });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

// 템플릿 추가 (packageId 필수)
router.post('/templates', upload.single('image'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, error: '이미지 파일이 필요합니다' });
      return;
    }

    const name = req.body.name || `Template ${Date.now()}`;
    const packageId = req.body.packageId;

    if (!packageId) {
      res.status(400).json({ success: false, error: 'packageId가 필요합니다' });
      return;
    }

    const template = await imageMatchService.addTemplate(name, req.file.buffer, packageId);

    res.json({ success: true, data: template });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

// 템플릿 삭제
router.delete('/templates/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { packageId } = req.query;
    const deleted = imageMatchService.deleteTemplate(id, packageId as string | undefined);

    if (!deleted) {
      res.status(404).json({ success: false, error: '템플릿을 찾을 수 없습니다' });
      return;
    }

    res.json({ success: true, message: '삭제되었습니다' });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

// 템플릿 이미지 조회 (ID로 검색, 모든 패키지에서 찾음)
router.get('/templates/:id/image', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const imagePath = imageMatchService.getTemplateImagePath(id);

    if (!imagePath) {
      res.status(404).json({ success: false, error: '템플릿을 찾을 수 없습니다' });
      return;
    }

    res.sendFile(imagePath);
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

// 현재 화면에서 이미지 찾기
router.post('/find', async (req: Request, res: Response) => {
  try {
    const { templateId, threshold, region } = req.body;
    
    if (!templateId) {
      res.status(400).json({ success: false, error: 'templateId가 필요합니다' });
      return;
    }

    // 연결 상태 확인
    const status = driver.getStatus();
    if (!status.connected) {
      res.status(400).json({ success: false, error: '디바이스가 연결되지 않았습니다' });
      return;
    }

    // 스크린샷 캡처
    const appiumDriver = await driver.getDriver();
    const screenshot = await appiumDriver.takeScreenshot();
    const screenshotBuffer = Buffer.from(screenshot, 'base64');

    // 이미지 매칭
    const result = await imageMatchService.findImageCenter(
      screenshotBuffer,
      templateId,
      { threshold, region }
    );

    res.json({ success: true, data: result });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

// 스크린샷에서 영역 캡처하여 템플릿으로 저장
router.post('/capture-template', async (req: Request, res: Response) => {
  try {
    const { name, x, y, width, height, deviceId, packageId } = req.body;

    if (!name || x === undefined || y === undefined || !width || !height) {
      res.status(400).json({
        success: false,
        error: 'name, x, y, width, height가 필요합니다'
      });
      return;
    }

    if (!packageId) {
      res.status(400).json({
        success: false,
        error: 'packageId가 필요합니다'
      });
      return;
    }

    let screenshotBase64: string;

    // deviceId가 있으면 sessionManager 사용, 없으면 싱글톤 driver 사용
    if (deviceId) {
      const sessionDriver = sessionManager.getDriver(deviceId);
      if (!sessionDriver) {
        res.status(400).json({ success: false, error: `디바이스 세션을 찾을 수 없습니다: ${deviceId}` });
        return;
      }
      screenshotBase64 = await sessionDriver.takeScreenshot();
    } else {
      // 싱글톤 드라이버 (하위 호환성)
      const status = driver.getStatus();
      if (!status.connected) {
        res.status(400).json({ success: false, error: '디바이스가 연결되지 않았습니다' });
        return;
      }
      const appiumDriver = await driver.getDriver();
      screenshotBase64 = await appiumDriver.takeScreenshot();
    }

    const screenshotBuffer = Buffer.from(screenshotBase64, 'base64');

    // sharp로 영역 잘라내기
    const sharp = await import('sharp');
    const croppedBuffer = await sharp.default(screenshotBuffer)
      .extract({ left: x, top: y, width, height })
      .png()
      .toBuffer();

    // 템플릿으로 저장 (패키지별)
    const template = await imageMatchService.addTemplate(name, croppedBuffer, packageId);

    res.json({ success: true, data: template });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;