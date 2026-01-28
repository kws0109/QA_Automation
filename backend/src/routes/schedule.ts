// backend/src/routes/schedule.ts

import { Router, Request, Response } from 'express';
import scheduleService from '../services/scheduleService';
import { scheduleManager } from '../services/scheduleManager';
import { CreateScheduleRequest, UpdateScheduleRequest } from '../types';
import { asyncHandler, syncHandler, BadRequestError } from '../utils/asyncHandler';

const router = Router();

/**
 * GET /api/schedules
 * 스케줄 목록 조회
 */
router.get('/', asyncHandler(async (_req: Request, res: Response) => {
  const schedules = await scheduleService.getAll();
  res.json({
    success: true,
    data: schedules,
  });
}));

/**
 * GET /api/schedules/history
 * 전체 실행 이력 조회
 */
router.get('/history', asyncHandler(async (req: Request, res: Response) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
  const history = await scheduleService.getAllHistory(limit);
  res.json({
    success: true,
    data: history,
  });
}));

/**
 * GET /api/schedules/active
 * 활성 스케줄 목록 (현재 Cron 작업 중인)
 */
router.get('/active', syncHandler((_req: Request, res: Response) => {
  const activeSchedules = scheduleManager.getActiveSchedules();
  res.json({
    success: true,
    data: activeSchedules,
  });
}));

/**
 * GET /api/schedules/:id
 * 특정 스케줄 조회
 */
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const schedule = await scheduleService.getById(req.params.id);
  res.json({
    success: true,
    data: schedule,
  });
}));

/**
 * GET /api/schedules/:id/history
 * 특정 스케줄의 실행 이력 조회
 */
router.get('/:id/history', asyncHandler(async (req: Request, res: Response) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
  const history = await scheduleService.getHistoryByScheduleId(req.params.id, limit);
  res.json({
    success: true,
    data: history,
  });
}));

/**
 * POST /api/schedules
 * 새 스케줄 생성 (Suite 기반)
 */
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const data: CreateScheduleRequest = req.body;

  // 필수 필드 검증
  if (!data.name || !data.suiteId || !data.cronExpression) {
    throw new BadRequestError('name, suiteId, cronExpression은 필수입니다.');
  }

  const schedule = await scheduleService.create(data);
  res.status(201).json({
    success: true,
    data: schedule,
  });
}));

/**
 * PUT /api/schedules/:id
 * 스케줄 수정
 */
router.put('/:id', asyncHandler(async (req: Request, res: Response) => {
  const data: UpdateScheduleRequest = req.body;
  const schedule = await scheduleService.update(req.params.id, data);

  // Cron 작업 갱신
  await scheduleManager.refreshSchedule(schedule.id);

  res.json({
    success: true,
    data: schedule,
  });
}));

/**
 * DELETE /api/schedules/:id
 * 스케줄 삭제
 */
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  // Cron 작업 먼저 중지
  await scheduleManager.removeSchedule(req.params.id);

  const result = await scheduleService.delete(req.params.id);
  res.json({
    success: true,
    data: result,
  });
}));

/**
 * POST /api/schedules/:id/enable
 * 스케줄 활성화
 */
router.post('/:id/enable', asyncHandler(async (req: Request, res: Response) => {
  await scheduleManager.enableSchedule(req.params.id);
  const schedule = await scheduleService.getById(req.params.id);
  res.json({
    success: true,
    data: schedule,
    message: '스케줄이 활성화되었습니다.',
  });
}));

/**
 * POST /api/schedules/:id/disable
 * 스케줄 비활성화
 */
router.post('/:id/disable', asyncHandler(async (req: Request, res: Response) => {
  await scheduleManager.disableSchedule(req.params.id);
  const schedule = await scheduleService.getById(req.params.id);
  res.json({
    success: true,
    data: schedule,
    message: '스케줄이 비활성화되었습니다.',
  });
}));

/**
 * POST /api/schedules/:id/run
 * 스케줄 즉시 실행
 */
router.post('/:id/run', syncHandler((req: Request, res: Response) => {
  // 비동기로 실행 시작 (응답은 바로 반환)
  scheduleManager.runNow(req.params.id).catch(err => {
    console.error('스케줄 즉시 실행 실패:', err);
  });

  res.json({
    success: true,
    message: '스케줄 실행이 시작되었습니다.',
  });
}));

export default router;
