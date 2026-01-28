// backend/src/routes/category.ts

import { Router, Request, Response } from 'express';
import { categoryService } from '../services/category';
import { CreateCategoryData, UpdateCategoryData } from '../types';
import { asyncHandler, BadRequestError, NotFoundError } from '../utils/asyncHandler';

const router = Router();

/**
 * GET /api/categories?packageId=xxx
 * 패키지별 카테고리 목록 조회
 */
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const { packageId } = req.query;

  if (!packageId || typeof packageId !== 'string') {
    throw new BadRequestError('packageId 쿼리 파라미터가 필요합니다.');
  }

  const categories = await categoryService.getByPackage(packageId);
  res.json({
    success: true,
    data: categories,
  });
}));

/**
 * GET /api/categories/:packageId/:categoryId
 * 단일 카테고리 조회
 */
router.get('/:packageId/:categoryId', asyncHandler(async (req: Request, res: Response) => {
  const { packageId, categoryId } = req.params;
  const category = await categoryService.getById(packageId, categoryId);

  if (!category) {
    throw new NotFoundError(`카테고리 '${categoryId}'를 찾을 수 없습니다.`);
  }

  res.json({
    success: true,
    data: category,
  });
}));

/**
 * POST /api/categories
 * 카테고리 생성
 */
router.post('/', asyncHandler(async (req: Request<object, object, CreateCategoryData>, res: Response) => {
  const { packageId, name, description } = req.body;

  if (!packageId) {
    throw new BadRequestError('packageId는 필수입니다.');
  }

  if (!name || !name.trim()) {
    throw new BadRequestError('카테고리 이름은 필수입니다.');
  }

  const category = await categoryService.create({
    packageId,
    name: name.trim(),
    description,
  });

  res.status(201).json({
    success: true,
    data: category,
  });
}));

/**
 * PUT /api/categories/:packageId/:categoryId
 * 카테고리 수정
 */
router.put('/:packageId/:categoryId', asyncHandler(async (req: Request<{ packageId: string; categoryId: string }, object, UpdateCategoryData>, res: Response) => {
  const { packageId, categoryId } = req.params;
  const { name, description, order } = req.body;

  const category = await categoryService.update(packageId, categoryId, {
    name,
    description,
    order,
  });

  res.json({
    success: true,
    data: category,
  });
}));

/**
 * DELETE /api/categories/:packageId/:categoryId
 * 카테고리 삭제
 */
router.delete('/:packageId/:categoryId', asyncHandler(async (req: Request, res: Response) => {
  const { packageId, categoryId } = req.params;

  const result = await categoryService.delete(packageId, categoryId);

  if (!result) {
    throw new NotFoundError(`카테고리 '${categoryId}'를 찾을 수 없습니다.`);
  }

  res.json({
    success: true,
    message: '카테고리가 삭제되었습니다.',
  });
}));

export default router;
