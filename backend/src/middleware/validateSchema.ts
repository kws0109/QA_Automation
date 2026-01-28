// backend/src/middleware/validateSchema.ts
// Zod 스키마 검증 미들웨어

import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

/**
 * Zod 에러를 사용자 친화적인 형식으로 변환
 */
function formatZodError(error: ZodError): { field: string; message: string }[] {
  return error.errors.map((err) => ({
    field: err.path.join('.'),
    message: err.message,
  }));
}

/**
 * 요청 본문(body)을 Zod 스키마로 검증하는 미들웨어
 *
 * @example
 * import { validateBody } from '../middleware/validateSchema';
 * import { ScenarioCreateSchema } from '../schemas/scenario.schema';
 *
 * router.post('/', validateBody(ScenarioCreateSchema), (req, res) => {
 *   // req.body는 이미 검증되고 타입이 지정됨
 * });
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        error: '입력 데이터 검증 실패',
        details: formatZodError(result.error),
      });
      return;
    }

    // 검증된 데이터로 교체 (transform 등 적용)
    req.body = result.data;
    next();
  };
}

/**
 * 요청 쿼리 파라미터를 Zod 스키마로 검증하는 미들웨어
 */
export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);

    if (!result.success) {
      res.status(400).json({
        error: '쿼리 파라미터 검증 실패',
        details: formatZodError(result.error),
      });
      return;
    }

    req.query = result.data as typeof req.query;
    next();
  };
}

/**
 * 요청 경로 파라미터를 Zod 스키마로 검증하는 미들웨어
 */
export function validateParams<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);

    if (!result.success) {
      res.status(400).json({
        error: '경로 파라미터 검증 실패',
        details: formatZodError(result.error),
      });
      return;
    }

    req.params = result.data as typeof req.params;
    next();
  };
}
