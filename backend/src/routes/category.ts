// backend/src/routes/category.ts

import { Router, Request, Response } from 'express';
import { categoryService } from '../services/category';
import { CreateCategoryData, UpdateCategoryData } from '../types';

const router = Router();

/**
 * GET /api/categories
 * 모든 카테고리 조회
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const categories = await categoryService.getAll();
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
 * GET /api/categories/:id
 * 단일 카테고리 조회
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const category = await categoryService.getById(id);

    if (!category) {
      res.status(404).json({
        success: false,
        message: `카테고리 '${id}'를 찾을 수 없습니다.`,
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
    const { id, name, description } = req.body;

    if (!name || !name.trim()) {
      res.status(400).json({
        success: false,
        message: '카테고리 이름은 필수입니다.',
      });
      return;
    }

    const category = await categoryService.create({
      id,
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
 * PUT /api/categories/:id
 * 카테고리 수정
 */
router.put('/:id', async (req: Request<{ id: string }, object, UpdateCategoryData>, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, order } = req.body;

    const category = await categoryService.update(id, {
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
 * DELETE /api/categories/:id
 * 카테고리 삭제
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // default 카테고리 삭제 방지
    if (id === 'default') {
      res.status(400).json({
        success: false,
        message: '기본 카테고리는 삭제할 수 없습니다.',
      });
      return;
    }

    const result = await categoryService.delete(id);

    if (!result) {
      res.status(404).json({
        success: false,
        message: `카테고리 '${id}'를 찾을 수 없습니다.`,
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

/**
 * POST /api/categories/reorder
 * 카테고리 순서 변경
 */
router.post('/reorder', async (req: Request<object, object, { items: { id: string; order: number }[] }>, res: Response) => {
  try {
    const { items } = req.body;

    if (!items || !Array.isArray(items)) {
      res.status(400).json({
        success: false,
        message: 'items 배열이 필요합니다.',
      });
      return;
    }

    await categoryService.reorder(items);

    const categories = await categoryService.getAll();
    res.json({
      success: true,
      data: categories,
    });
  } catch (e) {
    const error = e as Error;
    console.error('카테고리 순서 변경 에러:', error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

export default router;
