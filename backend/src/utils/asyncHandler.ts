// backend/src/utils/asyncHandler.ts

import { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * API 에러 응답 타입
 */
interface ApiErrorResponse {
  success: false;
  error: string;
  code?: string;
}

/**
 * HTTP 에러 클래스
 * 상태 코드와 함께 에러를 던질 수 있음
 */
export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/**
 * 400 Bad Request 에러
 */
export class BadRequestError extends HttpError {
  constructor(message: string, code?: string) {
    super(400, message, code);
    this.name = 'BadRequestError';
  }
}

/**
 * 404 Not Found 에러
 */
export class NotFoundError extends HttpError {
  constructor(message: string, code?: string) {
    super(404, message, code);
    this.name = 'NotFoundError';
  }
}

/**
 * Express 비동기 라우트 핸들러 래퍼
 *
 * try-catch 보일러플레이트 제거:
 * - 에러 발생 시 자동으로 JSON 응답 전송
 * - HttpError 인스턴스면 해당 상태 코드 사용
 * - 그 외 에러는 500 상태 코드
 *
 * @example
 * // Before
 * router.get('/items', async (req, res) => {
 *   try {
 *     const items = await getItems();
 *     res.json({ success: true, data: items });
 *   } catch (err) {
 *     const error = err as Error;
 *     res.status(500).json({ success: false, error: error.message });
 *   }
 * });
 *
 * // After
 * router.get('/items', asyncHandler(async (req, res) => {
 *   const items = await getItems();
 *   res.json({ success: true, data: items });
 * }));
 *
 * // 400/404 에러 던지기
 * throw new BadRequestError('필수 파라미터가 누락되었습니다');
 * throw new NotFoundError('리소스를 찾을 수 없습니다');
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch((err: unknown) => {
      const error = err as Error;

      // 이미 응답이 시작된 경우 next로 전달
      if (res.headersSent) {
        return next(error);
      }

      // HttpError인 경우 해당 상태 코드 사용
      if (err instanceof HttpError) {
        const response: ApiErrorResponse = {
          success: false,
          error: err.message,
        };
        if (err.code) {
          response.code = err.code;
        }
        return res.status(err.statusCode).json(response);
      }

      // 일반 에러는 500
      console.error(`[Route Error] ${req.method} ${req.path}:`, error.message);
      res.status(500).json({
        success: false,
        error: error.message,
      } as ApiErrorResponse);
    });
  };
}

/**
 * 동기 라우트 핸들러 래퍼 (동기 함수용)
 */
export function syncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => void
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      fn(req, res, next);
    } catch (err: unknown) {
      const error = err as Error;

      if (res.headersSent) {
        return next(error);
      }

      if (err instanceof HttpError) {
        const response: ApiErrorResponse = {
          success: false,
          error: err.message,
        };
        if (err.code) {
          response.code = err.code;
        }
        return res.status(err.statusCode).json(response);
      }

      console.error(`[Route Error] ${req.method} ${req.path}:`, error.message);
      res.status(500).json({
        success: false,
        error: error.message,
      } as ApiErrorResponse);
    }
  };
}
