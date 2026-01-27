// backend/src/routes/suite.ts
// Test Suite API 라우트

import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import suiteService from '../services/suiteService';
import { suiteExecutor } from '../services/suiteExecutor';
import suiteReportService from '../services/suiteReportService';
import { testOrchestrator } from '../services/testOrchestrator';
import { reportExporter, ExportOptions } from '../services/reportExporter';
import { r2Storage } from '../services/r2Storage';
import { TestSuiteInput } from '../types';

const router = Router();

// ========== Suite 리포트 (/:id 보다 먼저 정의해야 함) ==========

/**
 * GET /api/suites/reports/list - 모든 리포트 목록
 */
router.get('/reports/list', async (_req: Request, res: Response) => {
  try {
    const reports = await suiteReportService.getAllReports();
    res.json(reports);
  } catch (err) {
    console.error('[SuiteAPI] Failed to get reports:', err);
    res.status(500).json({ error: 'Failed to get reports' });
  }
});

/**
 * GET /api/suites/reports/stats - 리포트 통계
 */
router.get('/reports/stats', async (_req: Request, res: Response) => {
  try {
    const stats = await suiteReportService.getReportStats();
    res.json(stats);
  } catch (err) {
    console.error('[SuiteAPI] Failed to get report stats:', err);
    res.status(500).json({ error: 'Failed to get report stats' });
  }
});

/**
 * GET /api/suites/reports/:reportId - 리포트 상세 조회
 */
router.get('/reports/:reportId', async (req: Request, res: Response) => {
  try {
    const report = await suiteReportService.getReportById(req.params.reportId);
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }
    res.json(report);
  } catch (err) {
    console.error('[SuiteAPI] Failed to get report:', err);
    res.status(500).json({ error: 'Failed to get report' });
  }
});

/**
 * DELETE /api/suites/reports/:reportId - 리포트 삭제
 */
router.delete('/reports/:reportId', async (req: Request, res: Response) => {
  try {
    const deleted = await suiteReportService.deleteReport(req.params.reportId);
    if (!deleted) {
      return res.status(404).json({ error: 'Report not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[SuiteAPI] Failed to delete report:', err);
    res.status(500).json({ error: 'Failed to delete report' });
  }
});

/**
 * GET /api/suites/reports/:reportId/export/html - HTML 내보내기
 */
router.get('/reports/:reportId/export/html', async (req: Request, res: Response) => {
  try {
    const report = await suiteReportService.getReportById(req.params.reportId);
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const includeScreenshots = req.query.screenshots !== 'false';
    const options: ExportOptions = {
      includeScreenshots,
    };

    console.log(`[SuiteAPI] Generating HTML for report: ${req.params.reportId}`);
    const html = await reportExporter.generateSuiteHTML(report, options);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="suite-report-${report.id}.html"`);
    res.send(html);
  } catch (err) {
    console.error('[SuiteAPI] Failed to export HTML:', err);
    res.status(500).json({ error: 'Failed to export HTML' });
  }
});

/**
 * GET /api/suites/reports/:reportId/export/pdf - PDF 내보내기
 */
router.get('/reports/:reportId/export/pdf', async (req: Request, res: Response) => {
  try {
    const report = await suiteReportService.getReportById(req.params.reportId);
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const includeScreenshots = req.query.screenshots !== 'false';
    const paperSize = (req.query.paperSize as 'A4' | 'Letter') || 'A4';
    const orientation = (req.query.orientation as 'portrait' | 'landscape') || 'portrait';

    const options: ExportOptions = {
      includeScreenshots,
      paperSize,
      orientation,
    };

    console.log(`[SuiteAPI] Generating PDF for report: ${req.params.reportId}`);
    const pdfBuffer = await reportExporter.generateSuitePDF(report, options);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="suite-report-${report.id}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('[SuiteAPI] Failed to export PDF:', err);
    res.status(500).json({ error: 'Failed to export PDF' });
  }
});

/**
 * POST /api/suites/reports/:reportId/share - R2에 업로드하여 공유 링크 생성
 */
router.post('/reports/:reportId/share', async (req: Request, res: Response) => {
  try {
    // R2 활성화 확인
    if (!r2Storage.isEnabled()) {
      return res.status(400).json({
        error: 'R2 Storage가 활성화되지 않았습니다. 환경 변수를 확인하세요.',
      });
    }

    const report = await suiteReportService.getReportById(req.params.reportId);
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const includeScreenshots = req.body.includeScreenshots !== false;
    const format = req.body.format || 'html'; // 'html' | 'pdf' | 'both'

    const options: ExportOptions = {
      includeScreenshots,
      paperSize: 'A4',
      orientation: 'portrait',
    };

    const result: { htmlUrl?: string; pdfUrl?: string } = {};

    // HTML 업로드
    if (format === 'html' || format === 'both') {
      console.log(`[SuiteAPI] Generating HTML for R2 upload: ${report.id}`);
      const html = await reportExporter.generateSuiteHTML(report, options);
      const htmlUrl = await r2Storage.uploadHTML(`suite-${report.id}`, html);
      result.htmlUrl = htmlUrl;
      console.log(`[SuiteAPI] HTML uploaded: ${htmlUrl}`);
    }

    // PDF 업로드
    if (format === 'pdf' || format === 'both') {
      console.log(`[SuiteAPI] Generating PDF for R2 upload: ${report.id}`);
      const pdfBuffer = await reportExporter.generateSuitePDF(report, options);
      const pdfUrl = await r2Storage.uploadPDF(`suite-${report.id}`, pdfBuffer);
      result.pdfUrl = pdfUrl;
      console.log(`[SuiteAPI] PDF uploaded: ${pdfUrl}`);
    }

    res.json({
      success: true,
      reportId: report.id,
      suiteName: report.suiteName,
      ...result,
    });
  } catch (err) {
    console.error('[SuiteAPI] Failed to share report:', err);
    res.status(500).json({ error: 'Failed to share report' });
  }
});

/**
 * GET /api/suites/execution/status - 실행 상태 조회
 */
router.get('/execution/status', async (_req: Request, res: Response) => {
  try {
    const status = suiteExecutor.getStatus();
    res.json(status);
  } catch (err) {
    console.error('[SuiteAPI] Failed to get execution status:', err);
    res.status(500).json({ error: 'Failed to get execution status' });
  }
});

/**
 * GET /api/suites/videos/:filename - 비디오 파일 serve
 * videoPath가 절대 경로로 저장되므로 filename만 추출하여 serve
 */
router.get('/videos/:filename', (req: Request, res: Response) => {
  try {
    const { filename } = req.params;
    const videoDir = path.join(__dirname, '../../uploads/videos');
    const videoPath = path.join(videoDir, filename);

    // 보안: 디렉토리 트래버설 방지
    const normalizedPath = path.normalize(videoPath);
    if (!normalizedPath.startsWith(videoDir)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!fs.existsSync(videoPath)) {
      return res.status(404).json({ error: 'Video not found' });
    }

    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      // Range 요청 지원 (비디오 스트리밍)
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      const file = fs.createReadStream(videoPath, { start, end });
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': 'video/mp4',
      });
      file.pipe(res);
    } else {
      // 전체 파일 전송
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4',
      });
      fs.createReadStream(videoPath).pipe(res);
    }
  } catch (err) {
    console.error('[SuiteAPI] Failed to serve video:', err);
    res.status(500).json({ error: 'Failed to serve video' });
  }
});

// ========== Suite CRUD ==========

/**
 * GET /api/suites - Suite 목록 조회
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const suites = await suiteService.getAllSuites();
    res.json(suites);
  } catch (err) {
    console.error('[SuiteAPI] Failed to get suites:', err);
    res.status(500).json({ error: 'Failed to get suites' });
  }
});

/**
 * GET /api/suites/:id - Suite 상세 조회
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const suite = await suiteService.getSuiteById(req.params.id);
    if (!suite) {
      return res.status(404).json({ error: 'Suite not found' });
    }
    res.json(suite);
  } catch (err) {
    console.error('[SuiteAPI] Failed to get suite:', err);
    res.status(500).json({ error: 'Failed to get suite' });
  }
});

/**
 * POST /api/suites - Suite 생성
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const input: TestSuiteInput = req.body;

    // 유효성 검사
    if (!input.name || !input.name.trim()) {
      return res.status(400).json({ error: 'Suite name is required' });
    }
    if (!input.scenarioIds || input.scenarioIds.length === 0) {
      return res.status(400).json({ error: 'At least one scenario is required' });
    }
    if (!input.deviceIds || input.deviceIds.length === 0) {
      return res.status(400).json({ error: 'At least one device is required' });
    }

    const suite = await suiteService.createSuite(input);
    res.status(201).json(suite);
  } catch (err) {
    console.error('[SuiteAPI] Failed to create suite:', err);
    res.status(500).json({ error: 'Failed to create suite' });
  }
});

/**
 * PUT /api/suites/:id - Suite 수정
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const suite = await suiteService.updateSuite(req.params.id, req.body);
    if (!suite) {
      return res.status(404).json({ error: 'Suite not found' });
    }
    res.json(suite);
  } catch (err) {
    console.error('[SuiteAPI] Failed to update suite:', err);
    res.status(500).json({ error: 'Failed to update suite' });
  }
});

/**
 * DELETE /api/suites/:id - Suite 삭제
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const deleted = await suiteService.deleteSuite(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Suite not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[SuiteAPI] Failed to delete suite:', err);
    res.status(500).json({ error: 'Failed to delete suite' });
  }
});

// ========== Suite 실행 ==========

/**
 * POST /api/suites/:id/execute - Suite 실행 (큐 시스템 통합)
 *
 * Body:
 * - userName: 사용자 이름 (선택, 기본: 'Anonymous')
 * - socketId: 소켓 ID (선택)
 * - priority: 우선순위 (선택, 0=일반, 1=높음, 2=긴급)
 *
 * Suite는 분할 실행을 지원하지 않음:
 * - 모든 디바이스 가용 → 즉시 실행
 * - 하나라도 사용 중 → 전체 대기열 추가
 */
router.post('/:id/execute', async (req: Request, res: Response) => {
  try {
    const suiteId = req.params.id;
    const body = req.body || {};
    const userName = body.userName || 'Anonymous';
    const socketId = body.socketId || '';
    const priority = body.priority as 0 | 1 | 2 | undefined;
    const repeatCount = body.repeatCount as number | undefined;
    const scenarioInterval = body.scenarioInterval as number | undefined;
    const requesterSlackId = body.requesterSlackId as string | undefined;

    // Orchestrator를 통해 실행 (큐 시스템 사용)
    const result = await testOrchestrator.submitSuite(
      suiteId,
      userName,
      socketId,
      { priority, repeatCount, scenarioInterval, requesterSlackId }
    );

    res.json(result);
  } catch (err) {
    console.error('[SuiteAPI] Failed to execute suite:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * POST /api/suites/:id/stop - Suite 실행 중지
 *
 * Body:
 * - queueId: 대기열 ID (선택, 큐에서 취소 시 필요)
 * - socketId: 소켓 ID (선택, 본인 확인용)
 * - userName: 사용자 이름 (선택, 본인 확인용)
 */
router.post('/:id/stop', async (req: Request, res: Response) => {
  try {
    const suiteId = req.params.id;
    const body = req.body || {};
    const queueId = body.queueId;
    const socketId = body.socketId || '';
    const userName = body.userName;

    // queueId가 제공된 경우: Orchestrator를 통해 취소
    if (queueId) {
      const result = testOrchestrator.cancelSuite(queueId, socketId, userName);
      return res.json(result);
    }

    // queueId가 없는 경우: 기존 방식으로 중지 (실행 중인 Suite만)
    const stopped = suiteExecutor.stopSuite(suiteId);
    res.json({ success: stopped, message: stopped ? 'Suite stopped' : 'Suite not found or not running' });
  } catch (err) {
    console.error('[SuiteAPI] Failed to stop suite:', err);
    res.status(500).json({ error: 'Failed to stop suite' });
  }
});

/**
 * GET /api/suites/:id/reports - Suite별 리포트 목록
 */
router.get('/:id/reports', async (req: Request, res: Response) => {
  try {
    const reports = await suiteReportService.getReportsBySuiteId(req.params.id);
    res.json(reports);
  } catch (err) {
    console.error('[SuiteAPI] Failed to get suite reports:', err);
    res.status(500).json({ error: 'Failed to get suite reports' });
  }
});

export default router;
