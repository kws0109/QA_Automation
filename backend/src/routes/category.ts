// backend/src/routes/category.ts

import { Router, Request, Response } from 'express';
import { categoryService } from '../services/category';
import { CreateCategoryData, UpdateCategoryData } from '../types';

const router = Router();

/**
 * GET /api/categories?packageId=xxx
 * 패키지별 카테고리 목록 조회
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { packageId } = req.query;

    if (!packageId || typeof packageId !== 'string') {
      res.status(400).json({
        success: false,
        message: 'packageId 쿼리 파라미터가 필요합니다.',
      });
      return;
    }

    const categories = await categoryService.getByPackage(packageId);
    res.json({
      success: true,
      data: categories,
    });
  } catch (e) {
    const error = e as Error;
    console.error('카테고리 목록 조회 에러:', error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * GET /api/categories/:packageId/:categoryId
 * 단일 카테고리 조회
 */
router.get('/:packageId/:categoryId', async (req: Request, res: Response) => {
  try {
    const { packageId, categoryId } = req.params;
    const category = await categoryService.getById(packageId, categoryId);

    if (!category) {
      res.status(404).json({
        success: false,
        message: `카테고리 '${categoryId}'를 찾을 수 없습니다.`,
      });
      return;
    }

    res.json({
      success: true,
      data: category,
    });
  } catch (e) {
    const error = e as Error;
    console.error('카테고리 조회 에러:', error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * POST /api/categories
 * 카테고리 생성
 */
router.post('/', async (req: Request<object, object, CreateCategoryData>, res: Response) => {
  try {
    const { packageId, name, description } = req.body;

    if (!packageId) {
      res.status(400).json({
        success: false,
        message: 'packageId는 필수입니다.',
      });
      return;
    }

    if (!name || !name.trim()) {
      res.status(400).json({
        success: false,
        message: '카테고리 이름은 필수입니다.',
      });
      return;
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
  } catch (e) {
    const error = e as Error;
    console.error('카테고리 생성 에러:', error.message);
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * PUT /api/categories/:packageId/:categoryId
 * 카테고리 수정
 */
router.put('/:packageId/:categoryId', async (req: Request<{ packageId: string; categoryId: string }, object, UpdateCategoryData>, res: Response) => {
  try {
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
  } catch (e) {
    const error = e as Error;
    console.error('카테고리 수정 에러:', error.message);
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * DELETE /api/categories/:packageId/:categoryId
 * 카테고리 삭제
 */
router.delete('/:packageId/:categoryId', async (req: Request, res: Response) => {
  try {
    const { packageId, categoryId } = req.params;

    const result = await categoryService.delete(packageId, categoryId);

    if (!result) {
      res.status(404).json({
        success: false,
        message: `카테고리 '${categoryId}'를 찾을 수 없습니다.`,
      });
      return;
    }

    res.json({
      success: true,
      message: '카테고리가 삭제되었습니다.',
    });
  } catch (e) {
    const error = e as Error;
    console.error('카테고리 삭제 에러:', error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

export default router;
