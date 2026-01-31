// backend/src/routes/scenario.ts

import express, { Request, Response } from 'express';
import scenarioService from '../services/scenario';
import { asyncHandler, BadRequestError } from '../utils/asyncHandler';
import { validateBody } from '../middleware/validateSchema';
import {
  ScenarioCreateSchema,
  ScenarioUpdateSchema,
  ValidatedScenarioCreate,
  ValidatedScenarioUpdate,
} from '../schemas/scenario.schema';

const router = express.Router();

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
router.get('/', asyncHandler(async (req: Request<object, object, object, ScenarioQuery>, res: Response) => {
  const { packageId, categoryId } = req.query;
  const scenarios = await scenarioService.getAll(packageId, categoryId);

  res.json({
    success: true,
    count: scenarios.length,
    packageId: packageId || null,
    categoryId: categoryId || null,
    data: scenarios,
  });
}));

/**
 * GET /api/scenarios/:id
 * 특정 시나리오 조회
 */
router.get('/:id', asyncHandler(async (req: Request<IdParams>, res: Response) => {
  const { id } = req.params;
  const scenario = await scenarioService.getById(id);

  res.json({
    success: true,
    data: scenario,
  });
}));

/**
 * POST /api/scenarios
 * 새 시나리오 생성
 * Required: packageId (대분류), categoryId (중분류)
 */
router.post(
  '/',
  validateBody(ScenarioCreateSchema),
  asyncHandler(async (req: Request<object, object, ValidatedScenarioCreate>, res: Response) => {
    // Zod 스키마에서 이미 검증됨
    const data = req.body;
    const scenario = await scenarioService.create(data);

    res.status(201).json({
      success: true,
      message: '시나리오가 생성되었습니다.',
      data: scenario,
    });
  })
);

/**
 * PUT /api/scenarios/:id
 * 시나리오 수정
 */
router.put(
  '/:id',
  validateBody(ScenarioUpdateSchema),
  asyncHandler(async (req: Request<IdParams, object, ValidatedScenarioUpdate>, res: Response) => {
    const { id } = req.params;
    const data = req.body;
    const scenario = await scenarioService.update(id, data);

    res.json({
      success: true,
      message: '시나리오가 수정되었습니다.',
      data: scenario,
    });
  })
);

/**
 * DELETE /api/scenarios/:id
 * 시나리오 삭제
 */
router.delete('/:id', asyncHandler(async (req: Request<IdParams>, res: Response) => {
  const { id } = req.params;
  const result = await scenarioService.delete(id);

  res.json(result);
}));

/**
 * POST /api/scenarios/:id/duplicate
 * 시나리오 복제
 */
router.post('/:id/duplicate', asyncHandler(async (req: Request<IdParams>, res: Response) => {
  const { id } = req.params;
  const scenario = await scenarioService.duplicate(id);

  res.status(201).json({
    success: true,
    message: '시나리오가 복제되었습니다.',
    data: scenario,
  });
}));

/**
 * POST /api/scenarios/:id/move
 * 시나리오 이동 (다른 카테고리로)
 */
router.post('/:id/move', asyncHandler(async (req: Request<IdParams, object, { packageId: string; categoryId: string }>, res: Response) => {
  const { id } = req.params;
  const { packageId, categoryId } = req.body;

  if (!packageId || !categoryId) {
    throw new BadRequestError('packageId와 categoryId는 필수입니다.');
  }

  const scenario = await scenarioService.update(id, { packageId, categoryId });

  res.json({
    success: true,
    message: '시나리오가 이동되었습니다.',
    data: scenario,
  });
}));

/**
 * POST /api/scenarios/:id/migrate-coordinates
 * 단일 시나리오의 절대 좌표를 퍼센트 좌표로 마이그레이션
 * Body: { sourceWidth: number, sourceHeight: number }
 */
router.post('/:id/migrate-coordinates', asyncHandler(async (req: Request<IdParams, object, { sourceWidth: number; sourceHeight: number }>, res: Response) => {
  const { id } = req.params;
  const { sourceWidth, sourceHeight } = req.body;

  if (!sourceWidth || !sourceHeight) {
    throw new BadRequestError('sourceWidth와 sourceHeight는 필수입니다. (좌표를 기록했던 기기의 해상도)');
  }

  const scenario = await scenarioService.getById(id);
  let migratedCount = 0;

  const migratedNodes = scenario.nodes.map(node => {
    if (!node.params) return node;

    const params = { ...node.params };
    let changed = false;

    // 탭/롱프레스 좌표 마이그레이션
    if (params.x !== undefined && params.y !== undefined &&
        params.xPercent === undefined && params.yPercent === undefined) {
      params.xPercent = params.x / sourceWidth;
      params.yPercent = params.y / sourceHeight;
      changed = true;
    }

    // 스와이프 좌표 마이그레이션
    if (params.startX !== undefined && params.startY !== undefined &&
        params.endX !== undefined && params.endY !== undefined &&
        params.startXPercent === undefined) {
      params.startXPercent = params.startX / sourceWidth;
      params.startYPercent = params.startY / sourceHeight;
      params.endXPercent = params.endX / sourceWidth;
      params.endYPercent = params.endY / sourceHeight;
      changed = true;
    }

    if (changed) {
      migratedCount++;
      return { ...node, params };
    }
    return node;
  });

  if (migratedCount === 0) {
    res.json({
      success: true,
      message: '마이그레이션할 좌표가 없습니다. (이미 퍼센트 좌표가 있거나 좌표 사용 노드가 없음)',
      migratedCount: 0,
    });
    return;
  }

  // 마이그레이션된 노드로 시나리오 업데이트
  await scenarioService.update(id, { nodes: migratedNodes });

  res.json({
    success: true,
    message: `${migratedCount}개 노드의 좌표가 마이그레이션되었습니다.`,
    migratedCount,
    sourceResolution: { width: sourceWidth, height: sourceHeight },
  });
}));

/**
 * POST /api/scenarios/migrate-all-coordinates
 * 모든 시나리오의 절대 좌표를 퍼센트 좌표로 일괄 마이그레이션
 * Body: { sourceWidth: number, sourceHeight: number }
 */
router.post('/migrate-all-coordinates', asyncHandler(async (req: Request<object, object, { sourceWidth: number; sourceHeight: number }>, res: Response) => {
  const { sourceWidth, sourceHeight } = req.body;

  if (!sourceWidth || !sourceHeight) {
    throw new BadRequestError('sourceWidth와 sourceHeight는 필수입니다. (좌표를 기록했던 기기의 해상도)');
  }

  const allScenarios = await scenarioService.getAll();
  let totalMigratedNodes = 0;
  const migratedScenarios: string[] = [];

  for (const scenarioSummary of allScenarios) {
    const scenario = await scenarioService.getById(scenarioSummary.id);
    let scenarioMigratedCount = 0;

    const migratedNodes = scenario.nodes.map(node => {
      if (!node.params) return node;

      const params = { ...node.params };
      let changed = false;

      // 탭/롱프레스 좌표 마이그레이션
      if (params.x !== undefined && params.y !== undefined &&
          params.xPercent === undefined && params.yPercent === undefined) {
        params.xPercent = params.x / sourceWidth;
        params.yPercent = params.y / sourceHeight;
        changed = true;
      }

      // 스와이프 좌표 마이그레이션
      if (params.startX !== undefined && params.startY !== undefined &&
          params.endX !== undefined && params.endY !== undefined &&
          params.startXPercent === undefined) {
        params.startXPercent = params.startX / sourceWidth;
        params.startYPercent = params.startY / sourceHeight;
        params.endXPercent = params.endX / sourceWidth;
        params.endYPercent = params.endY / sourceHeight;
        changed = true;
      }

      if (changed) {
        scenarioMigratedCount++;
        return { ...node, params };
      }
      return node;
    });

    if (scenarioMigratedCount > 0) {
      await scenarioService.update(scenario.id, { nodes: migratedNodes });
      totalMigratedNodes += scenarioMigratedCount;
      migratedScenarios.push(scenario.name);
    }
  }

  res.json({
    success: true,
    message: `${migratedScenarios.length}개 시나리오에서 ${totalMigratedNodes}개 노드가 마이그레이션되었습니다.`,
    totalMigratedNodes,
    migratedScenarios,
    sourceResolution: { width: sourceWidth, height: sourceHeight },
  });
}));

export default router;
