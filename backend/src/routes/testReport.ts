// backend/src/routes/testReport.ts
// 통합 테스트 리포트 API 라우트

import express, { Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { testReportService } from '../services/testReportService';

const router = express.Router();

// URL 파라미터 인터페이스
interface IdParams {
  id: string;
}

// 스크린샷 경로 파라미터
interface ScreenshotParams {
  reportId: string;
  deviceId: string;
  filename: string;
}

// 비디오 경로 파라미터
interface VideoParams {
  reportId: string;
  filename: string;
}

/**
 * GET /api/test-reports
 * 통합 리포트 목록 조회
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const reports = await testReportService.getAll();

    res.json({
      success: true,
      reports,
    });
  } catch (e) {
    const error = e as Error;
    console.error('[TestReport API] 목록 조회 에러:', error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * GET /api/test-reports/:id
 * 특정 리포트 상세 조회
 */
router.get('/:id', async (req: Request<IdParams>, res: Response) => {
  try {
    const { id } = req.params;
    const report = await testReportService.getById(id);

    res.json({
      success: true,
      report,
    });
  } catch (e) {
    const error = e as Error;
    console.error('[TestReport API] 상세 조회 에러:', error.message);
    res.status(404).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * DELETE /api/test-reports/:id
 * 리포트 삭제
 */
router.delete('/:id', async (req: Request<IdParams>, res: Response) => {
  try {
    const { id } = req.params;
    const result = await testReportService.delete(id);

    res.json(result);
  } catch (e) {
    const error = e as Error;
    console.error('[TestReport API] 삭제 에러:', error.message);
    res.status(404).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * DELETE /api/test-reports
 * 모든 리포트 삭제
 */
router.delete('/', async (_req: Request, res: Response) => {
  try {
    const result = await testReportService.deleteAll();

    res.json(result);
  } catch (e) {
    const error = e as Error;
    console.error('[TestReport API] 전체 삭제 에러:', error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * GET /api/test-reports/screenshots/:reportId/:deviceId/:filename
 * 스크린샷 파일 제공
 */
router.get('/screenshots/:reportId/:deviceId/:filename', async (req: Request<ScreenshotParams>, res: Response) => {
  try {
    const { reportId, deviceId, filename } = req.params;
    const relativePath = `screenshots/${reportId}/${deviceId}/${filename}`;
    const buffer = await testReportService.getScreenshot(relativePath);

    res.set('Content-Type', 'image/png');
    res.send(buffer);
  } catch (e) {
    const error = e as Error;
    console.error('[TestReport API] 스크린샷 조회 에러:', error.message);
    res.status(404).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * GET /api/test-reports/videos/:reportId/:filename
 * 비디오 파일 제공 (Range 요청 지원으로 시크 가능)
 */
router.get('/videos/:reportId/:filename', async (req: Request<VideoParams>, res: Response) => {
  try {
    const { reportId, filename } = req.params;
    const videoPath = path.join(__dirname, '../../reports/videos', reportId, filename);

    // 파일 존재 확인
    await fs.access(videoPath);

    // sendFile은 자동으로 Range 요청을 처리하여 비디오 시크 지원
    res.sendFile(videoPath, {
      headers: {
        'Content-Type': 'video/mp4',
        'Accept-Ranges': 'bytes',
      },
    });
  } catch (e) {
    const error = e as Error;
    console.error('[TestReport API] 비디오 조회 에러:', error.message);
    res.status(404).json({
      success: false,
      message: error.message,
    });
  }
});

export default router;
