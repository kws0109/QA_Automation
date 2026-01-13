// backend/src/routes/testReport.ts
// 통합 테스트 리포트 API 라우트

import express, { Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { testReportService } from '../services/testReportService';
import { reportExporter, ExportOptions } from '../services/reportExporter';
import { r2Storage } from '../services/r2Storage';

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

// 내보내기 파라미터
interface ExportParams {
  id: string;
  format: 'html' | 'pdf';
}

// 내보내기 쿼리
interface ExportQuery {
  screenshots?: string;
  paper?: 'A4' | 'Letter';
  orientation?: 'portrait' | 'landscape';
}

// 업로드 쿼리
interface UploadQuery {
  includeSuccessVideos?: string;  // 성공한 테스트 비디오도 포함할지 (기본: false)
}

// ========== 정적 경로 라우트 (와일드카드보다 먼저 정의) ==========

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

// ========== 와일드카드 라우트 (정적 경로 이후에 정의) ==========

/**
 * GET /api/test-reports/:id/export/:format
 * 리포트 내보내기 (HTML/PDF)
 */
router.get('/:id/export/:format', async (req: Request<ExportParams, unknown, unknown, ExportQuery>, res: Response) => {
  try {
    const { id, format } = req.params;
    const { screenshots, paper, orientation } = req.query;

    if (format !== 'html' && format !== 'pdf') {
      res.status(400).json({
        success: false,
        message: '지원하지 않는 형식입니다. html 또는 pdf를 사용하세요.',
      });
      return;
    }

    const report = await testReportService.getById(id);

    const options: ExportOptions = {
      includeScreenshots: screenshots === 'true',
      paperSize: paper || 'A4',
      orientation: orientation || 'portrait',
    };

    // 파일명 안전하게 인코딩 (특수문자, 한글 지원)
    const safeId = id.replace(/[^a-zA-Z0-9-_]/g, '_');
    const encodedFilename = encodeURIComponent(`report-${safeId}`);

    if (format === 'html') {
      const html = await reportExporter.generateHTML(report, options);

      res.set('Content-Type', 'text/html; charset=utf-8');
      res.set('Content-Disposition', `attachment; filename="${encodedFilename}.html"; filename*=UTF-8''${encodedFilename}.html`);
      res.send(html);
    } else {
      const pdfBuffer = await reportExporter.generatePDF(report, options);

      res.set('Content-Type', 'application/pdf');
      res.set('Content-Disposition', `attachment; filename="${encodedFilename}.pdf"; filename*=UTF-8''${encodedFilename}.pdf`);
      res.send(pdfBuffer);
    }
  } catch (e) {
    const error = e as Error;
    console.error(`[TestReport API] 내보내기 에러:`, error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * POST /api/test-reports/:id/upload
 * 리포트 R2 업로드 (HTML, PDF, 비디오)
 *
 * Query params:
 * - includeSuccessVideos: 'true' | 'false' (기본: false) - 성공한 테스트 비디오도 업로드
 */
router.post('/:id/upload', async (req: Request<IdParams, unknown, unknown, UploadQuery>, res: Response) => {
  try {
    const { id } = req.params;
    const { includeSuccessVideos } = req.query;
    const uploadSuccessVideos = includeSuccessVideos === 'true';

    if (!r2Storage.isEnabled()) {
      res.status(400).json({
        success: false,
        message: 'R2 Storage가 활성화되지 않았습니다. 환경 변수를 확인하세요.',
      });
      return;
    }

    const report = await testReportService.getById(id);

    const options: ExportOptions = {
      includeScreenshots: true,
      paperSize: 'A4',
      orientation: 'portrait',
    };

    // HTML 생성 및 업로드
    console.log(`[R2 Upload] HTML 생성 중...`);
    const html = await reportExporter.generateHTML(report, options);
    const htmlUrl = await r2Storage.uploadHTML(id, html);

    // PDF 생성 및 업로드
    console.log(`[R2 Upload] PDF 생성 중...`);
    const pdfBuffer = await reportExporter.generatePDF(report, options);
    const pdfUrl = await r2Storage.uploadPDF(id, pdfBuffer);

    // 비디오 업로드
    const videoUrls: { deviceId: string; deviceName: string; url: string; success: boolean }[] = [];
    let uploadedCount = 0;
    let skippedCount = 0;

    for (const scenario of report.scenarioResults) {
      for (const device of scenario.deviceResults) {
        // 비디오가 없으면 건너뜀
        if (!device.video?.path) {
          continue;
        }

        // 성공한 테스트는 플래그에 따라 건너뜀
        if (device.success && !uploadSuccessVideos) {
          skippedCount++;
          console.log(`[R2 Upload] 성공 비디오 건너뜀: ${device.deviceName} (includeSuccessVideos=false)`);
          continue;
        }

        try {
          // 비디오 파일 읽기
          const videoPath = path.join(__dirname, '../../reports', device.video.path);
          const videoBuffer = await fs.readFile(videoPath);
          const filename = path.basename(device.video.path);

          // R2 업로드
          const videoUrl = await r2Storage.uploadVideo(id, device.deviceId, videoBuffer, filename);

          videoUrls.push({
            deviceId: device.deviceId,
            deviceName: device.deviceName,
            url: videoUrl,
            success: device.success,
          });
          uploadedCount++;
        } catch (videoError) {
          console.error(`[R2 Upload] 비디오 업로드 실패 (${device.deviceId}):`, videoError);
        }
      }
    }

    console.log(`[R2 Upload] 완료 - HTML: 1, PDF: 1, 비디오: ${uploadedCount}개 업로드, ${skippedCount}개 건너뜀`);

    res.json({
      success: true,
      urls: {
        html: htmlUrl,
        pdf: pdfUrl,
        videos: videoUrls,
      },
      summary: {
        videosUploaded: uploadedCount,
        videosSkipped: skippedCount,
        includeSuccessVideos: uploadSuccessVideos,
      },
    });
  } catch (e) {
    const error = e as Error;
    console.error('[TestReport API] R2 업로드 에러:', error.message);
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

export default router;
