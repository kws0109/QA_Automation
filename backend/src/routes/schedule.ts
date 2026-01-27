// backend/src/routes/schedule.ts

import { Router, Request, Response } from 'express';
import scheduleService from '../services/scheduleService';
import { scheduleManager } from '../services/scheduleManager';
import { CreateScheduleRequest, UpdateScheduleRequest } from '../types';

const router = Router();

/**
 * GET /api/schedules
 * 스케줄 목록 조회
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const schedules = await scheduleService.getAll();
    res.json({
      success: true,
      data: schedules,
    });
  } catch (error) {
    console.error('스케줄 목록 조회 실패:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '스케줄 목록 조회 실패',
    });
  }
});

/**
 * GET /api/schedules/history
 * 전체 실행 이력 조회
 */
router.get('/history', async (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const history = await scheduleService.getAllHistory(limit);
    res.json({
      success: true,
      data: history,
    });
  } catch (error) {
    console.error('실행 이력 조회 실패:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '실행 이력 조회 실패',
    });
  }
});

/**
 * GET /api/schedules/active
 * 활성 스케줄 목록 (현재 Cron 작업 중인)
 */
router.get('/active', (_req: Request, res: Response) => {
  try {
    const activeSchedules = scheduleManager.getActiveSchedules();
    res.json({
      success: true,
      data: activeSchedules,
    });
  } catch (error) {
    console.error('활성 스케줄 조회 실패:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '활성 스케줄 조회 실패',
    });
  }
});

/**
 * GET /api/schedules/:id
 * 특정 스케줄 조회
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const schedule = await scheduleService.getById(req.params.id);
    res.json({
      success: true,
      data: schedule,
    });
  } catch (error) {
    console.error('스케줄 조회 실패:', error);
    res.status(404).json({
      success: false,
      error: error instanceof Error ? error.message : '스케줄을 찾을 수 없습니다',
    });
  }
});

/**
 * GET /api/schedules/:id/history
 * 특정 스케줄의 실행 이력 조회
 */
router.get('/:id/history', async (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
    const history = await scheduleService.getHistoryByScheduleId(req.params.id, limit);
    res.json({
      success: true,
      data: history,
    });
  } catch (error) {
    console.error('스케줄 실행 이력 조회 실패:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '실행 이력 조회 실패',
    });
  }
});

/**
 * POST /api/schedules
 * 새 스케줄 생성 (Suite 기반)
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const data: CreateScheduleRequest = req.body;

    // 필수 필드 검증
    if (!data.name || !data.suiteId || !data.cronExpression) {
      res.status(400).json({
        success: false,
        error: 'name, suiteId, cronExpression은 필수입니다.',
      });
      return;
    }

    const schedule = await scheduleService.create(data);
    res.status(201).json({
      success: true,
      data: schedule,
    });
  } catch (error) {
    console.error('스케줄 생성 실패:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : '스케줄 생성 실패',
    });
  }
});

/**
 * PUT /api/schedules/:id
 * 스케줄 수정
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const data: UpdateScheduleRequest = req.body;
    const schedule = await scheduleService.update(req.params.id, data);

    // Cron 작업 갱신
    await scheduleManager.refreshSchedule(schedule.id);

    res.json({
      success: true,
      data: schedule,
    });
  } catch (error) {
    console.error('스케줄 수정 실패:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : '스케줄 수정 실패',
    });
  }
});

/**
 * DELETE /api/schedules/:id
 * 스케줄 삭제
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    // Cron 작업 먼저 중지
    await scheduleManager.removeSchedule(req.params.id);

    const result = await scheduleService.delete(req.params.id);
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('스케줄 삭제 실패:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : '스케줄 삭제 실패',
    });
  }
});

/**
 * POST /api/schedules/:id/enable
 * 스케줄 활성화
 */
router.post('/:id/enable', async (req: Request, res: Response) => {
  try {
    await scheduleManager.enableSchedule(req.params.id);
    const schedule = await scheduleService.getById(req.params.id);
    res.json({
      success: true,
      data: schedule,
      message: '스케줄이 활성화되었습니다.',
    });
  } catch (error) {
    console.error('스케줄 활성화 실패:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : '스케줄 활성화 실패',
    });
  }
});

/**
 * POST /api/schedules/:id/disable
 * 스케줄 비활성화
 */
router.post('/:id/disable', async (req: Request, res: Response) => {
  try {
    await scheduleManager.disableSchedule(req.params.id);
    const schedule = await scheduleService.getById(req.params.id);
    res.json({
      success: true,
      data: schedule,
      message: '스케줄이 비활성화되었습니다.',
    });
  } catch (error) {
    console.error('스케줄 비활성화 실패:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : '스케줄 비활성화 실패',
    });
  }
});

/**
 * POST /api/schedules/:id/run
 * 스케줄 즉시 실행
 */
router.post('/:id/run', async (req: Request, res: Response) => {
  try {
    // 비동기로 실행 시작 (응답은 바로 반환)
    scheduleManager.runNow(req.params.id).catch(err => {
      console.error('스케줄 즉시 실행 실패:', err);
    });

    res.json({
      success: true,
      message: '스케줄 실행이 시작되었습니다.',
    });
  } catch (error) {
    console.error('스케줄 즉시 실행 요청 실패:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : '스케줄 즉시 실행 실패',
    });
  }
});

export default router;
