// backend/src/routes/report.ts

import express, { Request, Response } from 'express';
import reportService from '../services/report';
import { asyncHandler } from '../utils/asyncHandler';

const router = express.Router();

// URL 파라미터 인터페이스
interface IdParams {
  id: string;
}

/**
 * GET /api/reports
 * 리포트 목록 조회
 */
router.get('/', asyncHandler(async (_req: Request, res: Response) => {
  const reports = await reportService.getAll();

  res.json({
    success: true,
    count: reports.length,
    data: reports,
  });
}));

/**
 * GET /api/reports/:id
 * 특정 리포트 조회
 */
router.get('/:id', asyncHandler(async (req: Request<IdParams>, res: Response) => {
  const { id } = req.params;
  const report = await reportService.getById(id);

  res.json({
    success: true,
    data: report,
  });
}));

/**
 * DELETE /api/reports/:id
 * 리포트 삭제
 */
router.delete('/:id', asyncHandler(async (req: Request<IdParams>, res: Response) => {
  const { id } = req.params;
  const result = await reportService.delete(id);

  res.json(result);
}));

/**
 * DELETE /api/reports
 * 모든 리포트 삭제
 */
router.delete('/', asyncHandler(async (_req: Request, res: Response) => {
  const result = await reportService.deleteAll();

  res.json(result);
}));

export default router;
