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
import { asyncHandler, syncHandler, BadRequestError, NotFoundError } from '../utils/asyncHandler';

const router = Router();

// ========== Suite 리포트 (/:id 보다 먼저 정의해야 함) ==========

/**
 * GET /api/suites/reports/list - 모든 리포트 목록
 */
router.get('/reports/list', asyncHandler(async (_req: Request, res: Response) => {
  const reports = await suiteReportService.getAllReports();
  res.json(reports);
}));

/**
 * GET /api/suites/reports/stats - 리포트 통계
 */
router.get('/reports/stats', asyncHandler(async (_req: Request, res: Response) => {
  const stats = await suiteReportService.getReportStats();
  res.json(stats);
}));

/**
 * GET /api/suites/reports/:reportId - 리포트 상세 조회
 */
router.get('/reports/:reportId', asyncHandler(async (req: Request, res: Response) => {
  const report = await suiteReportService.getReportById(req.params.reportId);
  if (!report) {
    throw new NotFoundError('Report not found');
  }
  res.json(report);
}));

/**
 * DELETE /api/suites/reports/:reportId - 리포트 삭제
 */
router.delete('/reports/:reportId', asyncHandler(async (req: Request, res: Response) => {
  const deleted = await suiteReportService.deleteReport(req.params.reportId);
  if (!deleted) {
    throw new NotFoundError('Report not found');
  }
  res.json({ success: true });
}));

/**
 * GET /api/suites/reports/:reportId/export/html - HTML 내보내기
 */
router.get('/reports/:reportId/export/html', asyncHandler(async (req: Request, res: Response) => {
  const report = await suiteReportService.getReportById(req.params.reportId);
  if (!report) {
    throw new NotFoundError('Report not found');
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
}));

/**
 * GET /api/suites/reports/:reportId/export/pdf - PDF 내보내기
 */
router.get('/reports/:reportId/export/pdf', asyncHandler(async (req: Request, res: Response) => {
  const report = await suiteReportService.getReportById(req.params.reportId);
  if (!report) {
    throw new NotFoundError('Report not found');
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
}));

/**
 * POST /api/suites/reports/:reportId/share - R2에 업로드하여 공유 링크 생성
 */
router.post('/reports/:reportId/share', asyncHandler(async (req: Request, res: Response) => {
  // R2 활성화 확인
  if (!r2Storage.isEnabled()) {
    throw new BadRequestError('R2 Storage가 활성화되지 않았습니다. 환경 변수를 확인하세요.');
  }

  const report = await suiteReportService.getReportById(req.params.reportId);
  if (!report) {
    throw new NotFoundError('Report not found');
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
}));

/**
 * GET /api/suites/execution/status - 실행 상태 조회
 */
router.get('/execution/status', syncHandler((_req: Request, res: Response) => {
  const status = suiteExecutor.getStatus();
  res.json(status);
}));

/**
 * GET /api/suites/videos/:filename - 비디오 파일 serve
 * videoPath가 절대 경로로 저장되므로 filename만 추출하여 serve
 */
router.get('/videos/:filename', syncHandler((req: Request, res: Response) => {
  const { filename } = req.params;
  const videoDir = path.join(__dirname, '../../uploads/videos');
  const videoPath = path.join(videoDir, filename);

  // 보안: 디렉토리 트래버설 방지
  const normalizedPath = path.normalize(videoPath);
  if (!normalizedPath.startsWith(videoDir)) {
    throw new BadRequestError('Access denied');
  }

  if (!fs.existsSync(videoPath)) {
    throw new NotFoundError('Video not found');
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
}));

// ========== Suite CRUD ==========

/**
 * GET /api/suites - Suite 목록 조회
 */
router.get('/', asyncHandler(async (_req: Request, res: Response) => {
  const suites = await suiteService.getAllSuites();
  res.json(suites);
}));

/**
 * GET /api/suites/:id - Suite 상세 조회
 */
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const suite = await suiteService.getSuiteById(req.params.id);
  if (!suite) {
    throw new NotFoundError('Suite not found');
  }
  res.json(suite);
}));

/**
 * POST /api/suites - Suite 생성
 */
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const input: TestSuiteInput = req.body;

  // 유효성 검사
  if (!input.name || !input.name.trim()) {
    throw new BadRequestError('Suite name is required');
  }
  if (!input.scenarioIds || input.scenarioIds.length === 0) {
    throw new BadRequestError('At least one scenario is required');
  }
  if (!input.deviceIds || input.deviceIds.length === 0) {
    throw new BadRequestError('At least one device is required');
  }

  const suite = await suiteService.createSuite(input);
  res.status(201).json(suite);
}));

/**
 * PUT /api/suites/:id - Suite 수정
 */
router.put('/:id', asyncHandler(async (req: Request, res: Response) => {
  const suite = await suiteService.updateSuite(req.params.id, req.body);
  if (!suite) {
    throw new NotFoundError('Suite not found');
  }
  res.json(suite);
}));

/**
 * DELETE /api/suites/:id - Suite 삭제
 */
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const deleted = await suiteService.deleteSuite(req.params.id);
  if (!deleted) {
    throw new NotFoundError('Suite not found');
  }
  res.json({ success: true });
}));

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
router.post('/:id/execute', asyncHandler(async (req: Request, res: Response) => {
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
}));

/**
 * POST /api/suites/:id/stop - Suite 실행 중지
 *
 * Body:
 * - queueId: 대기열 ID (선택, 큐에서 취소 시 필요)
 * - socketId: 소켓 ID (선택, 본인 확인용)
 * - userName: 사용자 이름 (선택, 본인 확인용)
 */
router.post('/:id/stop', syncHandler((req: Request, res: Response) => {
  const suiteId = req.params.id;
  const body = req.body || {};
  const queueId = body.queueId;
  const socketId = body.socketId || '';
  const userName = body.userName;

  // queueId가 제공된 경우: Orchestrator를 통해 취소
  if (queueId) {
    const result = testOrchestrator.cancelSuite(queueId, socketId, userName);
    res.json(result);
    return;
  }

  // queueId가 없는 경우: 기존 방식으로 중지 (실행 중인 Suite만)
  const stopped = suiteExecutor.stopSuite(suiteId);
  res.json({ success: stopped, message: stopped ? 'Suite stopped' : 'Suite not found or not running' });
}));

/**
 * GET /api/suites/:id/reports - Suite별 리포트 목록
 */
router.get('/:id/reports', asyncHandler(async (req: Request, res: Response) => {
  const reports = await suiteReportService.getReportsBySuiteId(req.params.id);
  res.json(reports);
}));

export default router;
