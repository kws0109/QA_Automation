// backend/src/routes/package.ts

import express, { Request, Response } from 'express';
import packageService from '../services/package';
import { CreatePackageRequest, UpdatePackageRequest } from '../types';
import { asyncHandler, BadRequestError } from '../utils/asyncHandler';

const router = express.Router();

// URL 파라미터 인터페이스
interface IdParams {
  id: string;
}

/**
 * GET /api/packages
 * 패키지 목록 조회
 */
router.get('/', asyncHandler(async (_req: Request, res: Response) => {
  const packages = await packageService.getAll();

  res.json({
    success: true,
    count: packages.length,
    data: packages,
  });
}));

/**
 * GET /api/packages/:id
 * 특정 패키지 조회
 */
router.get('/:id', asyncHandler(async (req: Request<IdParams>, res: Response) => {
  const { id } = req.params;
  const pkg = await packageService.getById(id);

  res.json({
    success: true,
    data: pkg,
  });
}));

/**
 * POST /api/packages
 * 새 패키지 생성
 */
router.post('/', asyncHandler(async (req: Request<object, object, CreatePackageRequest>, res: Response) => {
  const data = req.body;

  if (!data.name || !data.packageName) {
    throw new BadRequestError('name과 packageName은 필수입니다.');
  }

  const pkg = await packageService.create(data);

  res.status(201).json({
    success: true,
    message: '패키지가 생성되었습니다.',
    data: pkg,
  });
}));

/**
 * PUT /api/packages/:id
 * 패키지 수정
 */
router.put('/:id', asyncHandler(async (req: Request<IdParams, object, UpdatePackageRequest>, res: Response) => {
  const { id } = req.params;
  const data = req.body;
  const pkg = await packageService.update(id, data);

  res.json({
    success: true,
    message: '패키지가 수정되었습니다.',
    data: pkg,
  });
}));

/**
 * DELETE /api/packages/:id
 * 패키지 삭제
 */
router.delete('/:id', asyncHandler(async (req: Request<IdParams>, res: Response) => {
  const { id } = req.params;
  const result = await packageService.delete(id);

  res.json(result);
}));

export default router;
