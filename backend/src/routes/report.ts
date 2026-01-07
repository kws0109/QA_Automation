// backend/src/routes/report.ts

import express, { Request, Response } from 'express';
import reportService from '../services/report';

const router = express.Router();

// URL 파라미터 인터페이스
interface IdParams {
  id: string;
}

/**
 * GET /api/reports
 * 리포트 목록 조회
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const reports = await reportService.getAll();

    res.json({
      success: true,
      count: reports.length,
      data: reports,
    });
  } catch (e) {
    const error = e as Error;
    console.error('리포트 목록 조회 에러:', error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * GET /api/reports/:id
 * 특정 리포트 조회
 */
router.get('/:id', async (req: Request<IdParams>, res: Response) => {
  try {
    const { id } = req.params;
    const report = await reportService.getById(id);

    res.json({
      success: true,
      data: report,
    });
  } catch (e) {
    const error = e as Error;
    console.error('리포트 조회 에러:', error.message);
    res.status(404).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * DELETE /api/reports/:id
 * 리포트 삭제
 */
router.delete('/:id', async (req: Request<IdParams>, res: Response) => {
  try {
    const { id } = req.params;
    const result = await reportService.delete(id);

    res.json(result);
  } catch (e) {
    const error = e as Error;
    console.error('리포트 삭제 에러:', error.message);
    res.status(404).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * DELETE /api/reports
 * 모든 리포트 삭제
 */
router.delete('/', async (_req: Request, res: Response) => {
  try {
    const result = await reportService.deleteAll();

    res.json(result);
  } catch (e) {
    const error = e as Error;
    console.error('리포트 전체 삭제 에러:', error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

export default router;