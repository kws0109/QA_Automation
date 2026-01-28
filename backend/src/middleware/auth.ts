// backend/src/middleware/auth.ts
// JWT 인증 미들웨어

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// JWT 시크릿 검증
const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret === 'default_secret_change_me') {
    if (process.env.NODE_ENV === 'production') {
      console.error('❌ [Auth] CRITICAL: JWT_SECRET 환경변수가 설정되지 않았습니다!');
      console.error('   프로덕션 환경에서는 반드시 안전한 JWT_SECRET을 설정해야 합니다.');
      console.error('   .env 파일에 JWT_SECRET=<랜덤 문자열 32자 이상> 추가하세요.');
      process.exit(1);
    }
    // 개발 환경: 세션 동안 유효한 랜덤 시크릿 생성
    const devSecret = `dev_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    console.warn('⚠️ [Auth] 개발 모드: 임시 JWT_SECRET 생성됨 (서버 재시작 시 기존 토큰 무효화)');
    return devSecret;
  }

  // 시크릿 길이 검증
  if (secret.length < 32) {
    console.warn('⚠️ [Auth] JWT_SECRET이 32자 미만입니다. 보안을 위해 더 긴 시크릿을 권장합니다.');
  }

  return secret;
};

const JWT_SECRET = getJwtSecret();

// JWT 페이로드 인터페이스
export interface JwtPayload {
  userId: string;
  userName: string;
  email?: string;
  avatarUrl?: string;
  teamId: string;
  teamName?: string;
}

// Request 객체에 user 속성 추가를 위한 확장
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * JWT 인증 미들웨어
 * Authorization: Bearer <token> 헤더에서 토큰을 추출하고 검증
 *
 * 성공 시: req.user에 디코딩된 payload 저장
 * 실패 시: 401 응답
 */
export const authMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  // Authorization 헤더에서 토큰 추출
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    res.status(401).json({
      success: false,
      error: '인증이 필요합니다. 로그인 후 다시 시도해주세요.',
      code: 'AUTH_REQUIRED',
    });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    req.user = decoded;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        success: false,
        error: '세션이 만료되었습니다. 다시 로그인해주세요.',
        code: 'TOKEN_EXPIRED',
      });
    } else if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({
        success: false,
        error: '유효하지 않은 토큰입니다.',
        code: 'INVALID_TOKEN',
      });
    } else {
      res.status(500).json({
        success: false,
        error: '인증 처리 중 오류가 발생했습니다.',
        code: 'AUTH_ERROR',
      });
    }
  }
};

/**
 * 선택적 인증 미들웨어
 * 토큰이 있으면 검증하고 req.user에 저장, 없어도 통과
 * 비회원도 접근 가능하지만 로그인 상태를 알아야 하는 API에 사용
 */
export const optionalAuthMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
      req.user = decoded;
    } catch {
      // 토큰이 유효하지 않아도 통과 (req.user는 undefined)
    }
  }

  next();
};

// JWT_SECRET export (다른 모듈에서 토큰 생성 시 사용)
export { JWT_SECRET };
