// backend/src/routes/suite.ts
// Test Suite API 라우트

import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import suiteService from '../services/suiteService';
import { suiteExecutor } from '../services/suiteExecutor';
import suiteReportService from '../services/suiteReportService';
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
 * POST /api/suites/:id/execute - Suite 실행
 */
router.post('/:id/execute', async (req: Request, res: Response) => {
  try {
    const suiteId = req.params.id;

    // Suite 존재 확인
    const suite = await suiteService.getSuiteById(suiteId);
    if (!suite) {
      return res.status(404).json({ error: 'Suite not found' });
    }

    // 실행 시작 (비동기로 실행, 즉시 응답)
    suiteExecutor.executeSuite(suiteId)
      .then(result => {
        console.log(`[SuiteAPI] Suite execution completed: ${suiteId}`);
      })
      .catch(err => {
        console.error(`[SuiteAPI] Suite execution failed: ${suiteId}`, err);
      });

    res.json({
      success: true,
      message: 'Suite execution started',
      suiteId,
      suiteName: suite.name,
    });
  } catch (err) {
    console.error('[SuiteAPI] Failed to execute suite:', err);
    res.status(500).json({ error: 'Failed to execute suite' });
  }
});

/**
 * POST /api/suites/:id/stop - Suite 실행 중지
 */
router.post('/:id/stop', async (req: Request, res: Response) => {
  try {
    const stopped = suiteExecutor.stopSuite(req.params.id);
    res.json({ success: stopped });
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
