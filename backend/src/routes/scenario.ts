// backend/src/routes/scenario.ts

import express, { Request, Response, NextFunction } from 'express';
import { Server as SocketIOServer } from 'socket.io';
import scenarioService from '../services/scenario';
import executor from '../services/executor';

const router = express.Router();

// 시나리오 데이터 인터페이스
interface ScenarioBody {
  name?: string;
  description?: string;
  packageId?: string;
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
}

// URL 파라미터 인터페이스
interface IdParams {
  id: string;
}

// Socket.io 연결 미들웨어
router.use((req: Request, _res: Response, next: NextFunction) => {
  const io = req.app.get('io') as SocketIOServer | undefined;
  if (io) {
    executor.setSocketIO(io);
  }
  next();
});

/**
 * GET /api/scenarios/execution/status
 * 실행 상태 조회 (이 라우트를 :id 라우트보다 먼저 배치!)
 */
router.get('/execution/status', (_req: Request, res: Response) => {
  const status = executor.getStatus();
  res.json(status);
});

/**
 * GET /api/scenarios/execution/log
 * 실행 로그 조회
 */
router.get('/execution/log', (_req: Request, res: Response) => {
  const log = executor.getLog();
  res.json({
    success: true,
    count: log.length,
    data: log,
  });
});

/**
 * POST /api/scenarios/stop
 * 시나리오 실행 중지
 */
router.post('/stop', (_req: Request, res: Response) => {
  try {
    executor.stop();
    res.json({
      success: true,
      message: '시나리오 실행이 중지되었습니다.',
    });
  } catch (e) {
    const error = e as Error;
    console.error('시나리오 중지 에러:', error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * GET /api/scenarios
 * 시나리오 목록 조회
 * Query params: packageId (선택) - 특정 패키지의 시나리오만 조회
 */
router.get('/', async (req: Request<object, object, object, ScenarioQuery>, res: Response) => {
  try {
    const { packageId } = req.query;
    const scenarios = await scenarioService.getAll(packageId);

    res.json({
      success: true,
      count: scenarios.length,
      packageId: packageId || null,
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
 */
router.post('/', async (req: Request<object, object, ScenarioBody>, res: Response) => {
  try {
    const data = req.body;

    // packageId 필수 체크
    if (!data.packageId) {
      return res.status(400).json({
        success: false,
        message: 'packageId는 필수입니다.',
      });
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
 * POST /api/scenarios/:id/run
 * 시나리오 실행
 */
router.post('/:id/run', async (req: Request<IdParams>, res: Response) => {
  try {
    const { id } = req.params;

    // 시나리오 조회
    const scenario = await scenarioService.getById(id);

    // 시나리오 실행 (타입 단언)
    const result = await executor.run(scenario as Parameters<typeof executor.run>[0]);

    res.json(result);
  } catch (e) {
    const error = e as Error;
    console.error('시나리오 실행 에러:', error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

export default router;