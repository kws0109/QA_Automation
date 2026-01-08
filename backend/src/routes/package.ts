// backend/src/routes/package.ts

import express, { Request, Response } from 'express';
import packageService from '../services/package';
import { CreatePackageRequest, UpdatePackageRequest } from '../types';

const router = express.Router();

// URL 파라미터 인터페이스
interface IdParams {
  id: string;
}

/**
 * GET /api/packages
 * 패키지 목록 조회
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const packages = await packageService.getAll();

    res.json({
      success: true,
      count: packages.length,
      data: packages,
    });
  } catch (e) {
    const error = e as Error;
    console.error('패키지 목록 조회 에러:', error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * GET /api/packages/:id
 * 특정 패키지 조회
 */
router.get('/:id', async (req: Request<IdParams>, res: Response) => {
  try {
    const { id } = req.params;
    const pkg = await packageService.getById(id);

    res.json({
      success: true,
      data: pkg,
    });
  } catch (e) {
    const error = e as Error;
    console.error('패키지 조회 에러:', error.message);
    res.status(404).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * POST /api/packages
 * 새 패키지 생성
 */
router.post('/', async (req: Request<object, object, CreatePackageRequest>, res: Response) => {
  try {
    const data = req.body;

    if (!data.name || !data.packageName) {
      return res.status(400).json({
        success: false,
        message: 'name과 packageName은 필수입니다.',
      });
    }

    const pkg = await packageService.create(data);

    res.status(201).json({
      success: true,
      message: '패키지가 생성되었습니다.',
      data: pkg,
    });
  } catch (e) {
    const error = e as Error;
    console.error('패키지 생성 에러:', error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * PUT /api/packages/:id
 * 패키지 수정
 */
router.put('/:id', async (req: Request<IdParams, object, UpdatePackageRequest>, res: Response) => {
  try {
    const { id } = req.params;
    const data = req.body;
    const pkg = await packageService.update(id, data);

    res.json({
      success: true,
      message: '패키지가 수정되었습니다.',
      data: pkg,
    });
  } catch (e) {
    const error = e as Error;
    console.error('패키지 수정 에러:', error.message);
    res.status(404).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * DELETE /api/packages/:id
 * 패키지 삭제
 */
router.delete('/:id', async (req: Request<IdParams>, res: Response) => {
  try {
    const { id } = req.params;
    const result = await packageService.delete(id);

    res.json(result);
  } catch (e) {
    const error = e as Error;
    console.error('패키지 삭제 에러:', error.message);
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

export default router;
