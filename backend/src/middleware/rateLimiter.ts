// backend/src/middleware/rateLimiter.ts
// API Rate Limiting 미들웨어

import rateLimit from 'express-rate-limit';

/**
 * 일반 API Rate Limiter
 * - 15분 동안 1000개 요청 허용
 * - 대부분의 API 엔드포인트에 적용
 */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 1000, // 최대 1000개 요청
  standardHeaders: true, // RateLimit-* 헤더 반환
  legacyHeaders: false, // X-RateLimit-* 헤더 비활성화
  message: {
    error: '너무 많은 요청이 발생했습니다. 15분 후에 다시 시도해주세요.',
  },
});

/**
 * 인증 API Rate Limiter
 * - 15분 동안 20개 요청 허용
 * - 로그인/가입 등 인증 관련 엔드포인트에 적용
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 20, // 최대 20개 요청
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: '로그인 시도가 너무 많습니다. 15분 후에 다시 시도해주세요.',
  },
  // 인증 실패 시에만 카운트 (선택적)
  skipSuccessfulRequests: false,
});

/**
 * 테스트 실행 API Rate Limiter
 * - 1분 동안 10개 요청 허용
 * - 리소스 집약적인 전체 테스트 실행 엔드포인트에 적용
 */
export const executionLimiter = rateLimit({
  windowMs: 60 * 1000, // 1분
  max: 10, // 최대 10개 요청
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: '테스트 실행 요청이 너무 많습니다. 1분 후에 다시 시도해주세요.',
  },
});

/**
 * 에디터 테스트 Rate Limiter
 * - 1분 동안 120개 요청 허용 (평균 2초에 1개)
 * - 인터랙티브한 에디터 테스트에서 단일 노드 실행에 적용
 */
export const editorTestLimiter = rateLimit({
  windowMs: 60 * 1000, // 1분
  max: 120, // 최대 120개 요청
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: '에디터 테스트 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
  },
});

/**
 * 업로드 API Rate Limiter
 * - 1분 동안 30개 요청 허용
 * - 파일 업로드 엔드포인트에 적용
 */
export const uploadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1분
  max: 30, // 최대 30개 요청
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: '업로드 요청이 너무 많습니다. 1분 후에 다시 시도해주세요.',
  },
});

/**
 * 디바이스 스트리밍 Rate Limiter
 * - 1분 동안 100개 요청 허용
 * - MJPEG 스트리밍 등 연결 관련 엔드포인트에 적용
 */
export const streamingLimiter = rateLimit({
  windowMs: 60 * 1000, // 1분
  max: 100, // 최대 100개 요청
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: '스트리밍 요청이 너무 많습니다. 1분 후에 다시 시도해주세요.',
  },
});
