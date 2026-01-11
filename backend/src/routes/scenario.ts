// backend/src/routes/scenario.ts

import express, { Request, Response } from 'express';
import scenarioService from '../services/scenario';

const router = express.Router();

// 시나리오 데이터 인터페이스
interface ScenarioBody {
  name?: string;
  description?: string;
  packageId?: string;
  categoryId?: string;  // 중분류 카테고리 ID
  nodes?: Array<{
    id: string;
    type: string;
    params?: Record<string, unknown>;
    [key: string]: unknown;
  }>;
  connections?: Array<{
    from: string;
    to: string;
    branch?: string;
  }>;
}

// 쿼리 파라미터 인터페이스
interface ScenarioQuery {
  packageId?: string;
  categoryId?: string;  // 중분류 카테고리 ID
}

// URL 파라미터 인터페이스
interface IdParams {
  id: string;
}

/**
 * GET /api/scenarios
 * 시나리오 목록 조회
 * Query params:
 *   - packageId (선택) - 특정 패키지의 시나리오만 조회
 *   - categoryId (선택) - 특정 카테고리의 시나리오만 조회
 */
router.get('/', async (req: Request<object, object, object, ScenarioQuery>, res: Response) => {
  try {
    const { packageId, categoryId } = req.query;
    const scenarios = await scenarioService.getAll(packageId, categoryId);

    res.json({
      success: true,
      count: scenarios.length,
      packageId: packageId || null,
      categoryId: categoryId || null,
      data: scenarios,
    });
  } catch (e) {
    const error = e as Error;
    console.error('시나리오 목록 조회 에러:', error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * GET /api/scenarios/:id
 * 특정 시나리오 조회
 */
router.get('/:id', async (req: Request<IdParams>, res: Response) => {
  try {
    const { id } = req.params;
    const scenario = await scenarioService.getById(id);

    res.json({
      success: true,
      data: scenario,
    });
  } catch (e) {
    const error = e as Error;
    console.error('시나리오 조회 에러:', error.message);
    res.status(404).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * POST /api/scenarios
 * 새 시나리오 생성
 * Required: packageId (대분류), categoryId (중분류)
 */
router.post('/', async (req: Request<object, object, ScenarioBody>, res: Response) => {
  try {
    const data = req.body;

    // packageId 필수 체크
    if (!data.packageId) {
      res.status(400).json({
        success: false,
        message: 'packageId는 필수입니다.',
      });
      return;
    }

    // categoryId 필수 체크
    if (!data.categoryId) {
      res.status(400).json({
        success: false,
        message: 'categoryId는 필수입니다.',
      });
      return;
    }

    const scenario = await scenarioService.create(data);

    res.status(201).json({
      success: true,
      message: '시나리오가 생성되었습니다.',
      data: scenario,
    });
  } catch (e) {
    const error = e as Error;
    console.error('시나리오 생성 에러:', error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * PUT /api/scenarios/:id
 * 시나리오 수정
 */
router.put('/:id', async (req: Request<IdParams, object, ScenarioBody>, res: Response) => {
  try {
    const { id } = req.params;
    const data = req.body;
    const scenario = await scenarioService.update(id, data);

    res.json({
      success: true,
      message: '시나리오가 수정되었습니다.',
      data: scenario,
    });
  } catch (e) {
    const error = e as Error;
    console.error('시나리오 수정 에러:', error.message);
    res.status(404).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * DELETE /api/scenarios/:id
 * 시나리오 삭제
 */
router.delete('/:id', async (req: Request<IdParams>, res: Response) => {
  try {
    const { id } = req.params;
    const result = await scenarioService.delete(id);

    res.json(result);
  } catch (e) {
    const error = e as Error;
    console.error('시나리오 삭제 에러:', error.message);
    res.status(404).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * POST /api/scenarios/:id/duplicate
 * 시나리오 복제
 */
router.post('/:id/duplicate', async (req: Request<IdParams>, res: Response) => {
  try {
    const { id } = req.params;
    const scenario = await scenarioService.duplicate(id);

    res.status(201).json({
      success: true,
      message: '시나리오가 복제되었습니다.',
      data: scenario,
    });
  } catch (e) {
    const error = e as Error;
    console.error('시나리오 복제 에러:', error.message);
    res.status(404).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * POST /api/scenarios/:id/move
 * 시나리오 이동 (다른 카테고리로)
 */
router.post('/:id/move', async (req: Request<IdParams, object, { packageId: string; categoryId: string }>, res: Response) => {
  try {
    const { id } = req.params;
    const { packageId, categoryId } = req.body;

    if (!packageId || !categoryId) {
      res.status(400).json({
        success: false,
        message: 'packageId와 categoryId는 필수입니다.',
      });
      return;
    }

    const scenario = await scenarioService.update(id, { packageId, categoryId });

    res.json({
      success: true,
      message: '시나리오가 이동되었습니다.',
      data: scenario,
    });
  } catch (e) {
    const error = e as Error;
    console.error('시나리오 이동 에러:', error.message);
    res.status(404).json({
      success: false,
      message: error.message,
    });
  }
});

export default router;