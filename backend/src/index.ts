// backend/src/index.ts

import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import fs from 'fs';

// 로깅 유틸리티
import Logger, { LogLevel, createLogger } from './utils/logger';

// 인증 미들웨어
import { authMiddleware, optionalAuthMiddleware } from './middleware/auth';

// Rate Limiter 미들웨어
import { generalLimiter, authLimiter, executionLimiter, streamingLimiter } from './middleware/rateLimiter';

// 서버 메인 로거
const logger = createLogger('Server');

// 라우트 가져오기
import deviceRoutes from './routes/device';
import scenarioRoutes from './routes/scenario';
import reportRoutes from './routes/report';
import imageRoutes from './routes/image';
import sessionRoutes from './routes/session';
import packageRoutes from './routes/package';
import categoryRoutes from './routes/category';
import scheduleRoutes from './routes/schedule';
import testRoutes from './routes/test';
import testReportRoutes from './routes/testReport';
import screenshotRoutes from './routes/screenshot';
import dashboardRoutes from './routes/dashboard';
// AI 서비스 라우트 (실험적 기능 - 삭제 가능)
import aiRoutes from './routes/ai';
// 비디오 분석 라우트 (실험적 기능 - 삭제 가능)
import videoRoutes from './routes/video';
// OCR 테스트 라우트
import ocrRoutes from './routes/ocr';
// Test Suite 라우트
import suiteRoutes from './routes/suite';
// Slack OAuth 인증 라우트
import authRoutes from './routes/auth';
// Slack 알림 설정 라우트
import slackRoutes from './routes/slack';

// 서비스 가져오기
import { scheduleManager } from './services/scheduleManager';
import { screenStreamService } from './services/screenStreamService';
import { scrcpyStreamService } from './services/scrcpyStreamService';
import { testExecutor } from './services/testExecutor';
import { testOrchestrator } from './services/testOrchestrator';
import { screenshotService } from './services/screenshotService';
import { suiteExecutor } from './services/suiteExecutor';
import { slackNotificationService } from './services/slackNotificationService';
import { sessionManager } from './services/sessionManager';
import httpProxy from 'http';

// 중앙 이벤트 발신 서비스
import { eventEmitter } from './events';

// 에러 인터페이스
interface AppError extends Error {
  status?: number;
}

// Express 앱 생성
const app = express();

// 프록시 신뢰 설정 (Cloudflare Tunnel 등 리버스 프록시 사용 시 필요)
// X-Forwarded-For 헤더에서 클라이언트 IP를 올바르게 읽기 위함
app.set('trust proxy', 1);

// HTTP 서버 생성 (Socket.io용)
const server = http.createServer(app);

// CORS 설정: 프로덕션에서는 ALLOWED_ORIGINS 환경변수 사용
const getAllowedOrigins = (): string[] | true => {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOWED_ORIGINS) {
    return process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim());
  }
  return true; // 개발 환경: 모든 origin 허용
};

// Socket.io 설정
const io = new SocketIOServer(server, {
  cors: {
    origin: getAllowedOrigins(),
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// 미들웨어 설정
app.use(cors({
  origin: getAllowedOrigins(),
  credentials: true, // 쿠키 전송 허용
}));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  next();
});

// 템플릿 이미지 static 서빙 (패키지별 폴더 구조 지원)
// /templates/{packageId}/{filename} 또는 /templates/{filename} (레거시)
app.use('/templates', express.static(path.join(__dirname, '../templates')));

// Socket.io를 app에 저장
app.set('io', io);

// WebSocket 이벤트
io.on('connection', (socket) => {
  console.log(`🔌 클라이언트 연결: ${socket.id}`);

  // 사용자 정보 저장 (닉네임 설정 시)
  let userName: string | null = null;

  // 단일 disconnect 핸들러로 모든 정리 통합
  socket.on('disconnect', () => {
    console.log(`🔌 클라이언트 연결 해제: ${socket.id}${userName ? ` (${userName})` : ''}`);

    // 1. 큐 시스템 정리: 연결 해제된 사용자의 대기 중인 테스트 정리
    testOrchestrator.handleSocketDisconnect(socket.id);

    // 2. 스크린샷 서비스 정리: screenshot-room에 있었다면 클라이언트 제거
    if (socket.rooms.has('screenshot-room')) {
      screenshotService.removeClient();
      console.log(`📸 [Socket] 스크린샷 클라이언트 정리: ${socket.id}`);
    }
  });

  socket.on('ping', () => {
    socket.emit('pong', { message: '연결 정상!', timestamp: new Date().toISOString() });
  });

  // =========================================
  // 다중 사용자 큐 시스템 Socket 이벤트
  // =========================================

  /**
   * user:identify - 사용자 식별 (Slack 또는 닉네임)
   * 클라이언트가 연결 후 사용자 정보를 전송
   */
  socket.on('user:identify', (data: { userName: string; slackUserId?: string; avatarUrl?: string }) => {
    userName = data.userName;
    const slackUserId = data.slackUserId;
    const avatarUrl = data.avatarUrl;

    if (slackUserId) {
      console.log(`👤 사용자 식별 (Slack): ${socket.id} → ${userName} (${slackUserId})`);
    } else {
      console.log(`👤 사용자 식별: ${socket.id} → ${userName}`);
    }

    // 확인 응답
    socket.emit('user:identified', {
      socketId: socket.id,
      userName,
      slackUserId,
      avatarUrl,
    });
  });

  /**
   * queue:status - 큐 상태 요청
   * 프론트엔드 TestQueuePanel에 맞는 형식으로 응답
   */
  socket.on('queue:status', async () => {
    try {
      const status = testOrchestrator.getStatus();
      const deviceStatuses = await testOrchestrator.getDeviceStatuses(userName || undefined);
      const completedTests = testOrchestrator.getCompletedTests();

      // 실행 중인 테스트와 대기 중인 테스트 분리
      // progress는 test:progress 이벤트로 실시간 업데이트됨
      const runningTests = status.queue.filter(t => t.status === 'running');
      const pendingTests = status.queue.filter(t =>
        t.status === 'queued' || t.status === 'waiting_devices'
      );

      socket.emit('queue:status:response', {
        isProcessing: runningTests.length > 0,
        queueLength: pendingTests.length,
        runningCount: runningTests.length,
        pendingTests,
        runningTests,
        completedTests,
        deviceStatuses,
      });
    } catch (error) {
      console.error('[Socket] queue:status 오류:', error);
      socket.emit('error', { message: '큐 상태 조회 실패' });
    }
  });

  /**
   * queue:submit - 테스트 제출 (Socket으로 직접 제출)
   */
  socket.on('queue:submit', async (data: {
    deviceIds: string[];
    scenarioIds: string[];
    repeatCount?: number;
    scenarioInterval?: number;
    priority?: 0 | 1 | 2;
    testName?: string;
  }) => {
    if (!userName) {
      socket.emit('error', { message: '닉네임을 먼저 설정해주세요.' });
      return;
    }

    try {
      const result = await testOrchestrator.submitTest(
        {
          deviceIds: data.deviceIds,
          scenarioIds: data.scenarioIds,
          repeatCount: data.repeatCount || 1,
          scenarioInterval: data.scenarioInterval || 0,
        },
        userName,
        socket.id,
        {
          priority: data.priority || 0,
          testName: data.testName,
        }
      );

      socket.emit('queue:submitted', result);
    } catch (error) {
      console.error('[Socket] queue:submit 오류:', error);
      socket.emit('error', { message: (error as Error).message });
    }
  });

  /**
   * queue:cancel - 테스트 취소
   */
  socket.on('queue:cancel', (data: { queueId: string }) => {
    try {
      // userName을 전달하여 socketId가 변경되어도 취소 가능하도록 함
      const result = testOrchestrator.cancelTest(data.queueId, socket.id, userName || undefined);
      socket.emit('queue:cancel:response', result);
    } catch (error) {
      console.error('[Socket] queue:cancel 오류:', error);
      socket.emit('error', { message: (error as Error).message });
    }
  });

  /**
   * queue:force_complete - 대기 디바이스 포기하고 부분 완료
   */
  socket.on('queue:force_complete', (data: { executionId: string }) => {
    try {
      // userName을 전달하여 socketId가 변경되어도 완료 가능하도록 함
      const result = testOrchestrator.forceComplete(data.executionId, socket.id, userName || undefined);
      socket.emit('queue:force_complete:response', {
        ...result,
        executionId: data.executionId,
      });
    } catch (error) {
      console.error('[Socket] queue:force_complete 오류:', error);
      socket.emit('error', { message: (error as Error).message });
    }
  });

  // =========================================
  // 스크린샷 폴링 서비스 Socket 이벤트
  // =========================================

  /**
   * screenshot:subscribe - 스크린샷 폴링 구독
   */
  socket.on('screenshot:subscribe', (data: { deviceIds: string[] }) => {
    if (!data.deviceIds || data.deviceIds.length === 0) return;

    // screenshot-room에 참여
    socket.join('screenshot-room');
    screenshotService.addClient();
    screenshotService.subscribe(data.deviceIds);

    console.log(`📸 [Socket] 스크린샷 구독: ${data.deviceIds.join(', ')}`);
  });

  /**
   * screenshot:unsubscribe - 스크린샷 폴링 구독 해제
   */
  socket.on('screenshot:unsubscribe', (data: { deviceIds: string[] }) => {
    if (!data.deviceIds || data.deviceIds.length === 0) return;

    screenshotService.unsubscribe(data.deviceIds);
    console.log(`📸 [Socket] 스크린샷 구독 해제: ${data.deviceIds.join(', ')}`);
  });

  /**
   * screenshot:leave - 스크린샷 룸 퇴장 (페이지 이동 시)
   */
  socket.on('screenshot:leave', () => {
    socket.leave('screenshot-room');
    screenshotService.removeClient();
    console.log(`📸 [Socket] 스크린샷 룸 퇴장: ${socket.id}`);
  });
});

// API 라우트
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    message: '서버가 정상 작동 중입니다!',
    timestamp: new Date().toISOString(),
  });
});

// === 스트리밍 라우트 (인증 제외) ===
// MJPEG 스트림은 img src로 직접 요청되므로 Authorization 헤더를 보낼 수 없음
// streamingLimiter: 스트리밍 rate limiting (1분 100회)
app.get('/api/session/:deviceId/mjpeg', streamingLimiter, async (req: Request, res: Response) => {
  const { deviceId } = req.params;
  const session = sessionManager.getSessionInfo(deviceId);

  if (!session) {
    return res.status(404).json({
      success: false,
      error: 'Session not found. Create a session first.'
    });
  }

  // 세션 상태 검증 (dead session 정리)
  const isHealthy = await sessionManager.checkSessionHealth(deviceId);
  if (!isHealthy) {
    logger.warn(`[${deviceId}] MJPEG 요청 시 세션 무효 - 세션이 정리되었습니다`);
    return res.status(410).json({
      success: false,
      error: 'Session has expired. Please reconnect.'
    });
  }

  const APPIUM_HOST = process.env.APPIUM_HOST || 'localhost';
  const mjpegUrl = `http://${APPIUM_HOST}:${session.mjpegPort}`;
  let isClientConnected = true;
  let currentProxyReq: ReturnType<typeof httpProxy.get> | null = null;
  let retryCount = 0;
  const maxRetries = 3;
  const retryDelay = 1000;
  let hasLoggedError = false; // 에러 로그 중복 방지

  const connectToMjpeg = () => {
    if (!isClientConnected || retryCount >= maxRetries) {
      return;
    }

    currentProxyReq = httpProxy.get(mjpegUrl, (proxyRes) => {
      retryCount = 0;
      hasLoggedError = false;

      if (!res.headersSent) {
        res.writeHead(proxyRes.statusCode || 200, {
          'Content-Type': 'multipart/x-mixed-replace; boundary=--BoundaryString',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        });
      }

      proxyRes.pipe(res, { end: false });

      proxyRes.on('close', () => {
        if (isClientConnected && retryCount < maxRetries) {
          retryCount++;
          logger.debug(`MJPEG stream closed for ${deviceId}, reconnecting (${retryCount}/${maxRetries})...`);
          setTimeout(connectToMjpeg, retryDelay);
        }
      });
    });

    currentProxyReq.on('error', (err) => {
      // ECONNREFUSED 에러는 세션이 죽었을 가능성이 높음
      if (err.message.includes('ECONNREFUSED')) {
        if (!hasLoggedError) {
          logger.warn(`[${deviceId}] MJPEG 서버 연결 불가 - 세션이 만료되었을 수 있습니다`);
          hasLoggedError = true;
        }
        // 마지막 재시도에서도 실패하면 세션 상태 확인
        if (retryCount >= maxRetries - 1) {
          sessionManager.checkSessionHealth(deviceId).catch(() => {});
        }
      } else {
        logger.error(`MJPEG proxy error for ${deviceId}: ${err.message}`);
      }

      if (isClientConnected && retryCount < maxRetries) {
        retryCount++;
        setTimeout(connectToMjpeg, retryDelay);
      } else if (!res.headersSent) {
        res.status(502).json({
          success: false,
          error: 'Failed to connect to MJPEG stream'
        });
      }
    });
  };

  res.on('close', () => {
    isClientConnected = false;
    if (currentProxyReq) {
      currentProxyReq.destroy();
    }
  });

  connectToMjpeg();
});

// === 정적 파일 라우트 (인증 제외) ===
// 스크린샷, 비디오 파일은 img/video 태그로 직접 요청되므로 Authorization 헤더를 보낼 수 없음

// 테스트 리포트 스크린샷: /api/test-reports/screenshots/:reportId/:deviceId/:filename
app.get('/api/test-reports/screenshots/:reportId/:deviceId/:filename', async (req: Request, res: Response) => {
  try {
    const { reportId, deviceId, filename } = req.params;
    const screenshotPath = path.join(__dirname, '../reports/screenshots', reportId, deviceId, filename);

    // 보안: 디렉토리 트래버설 방지
    const normalizedPath = path.normalize(screenshotPath);
    const baseDir = path.join(__dirname, '../reports/screenshots');
    if (!normalizedPath.startsWith(baseDir)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    res.sendFile(normalizedPath, {
      headers: { 'Content-Type': 'image/png' },
    }, (err) => {
      if (err) {
        res.status(404).json({ success: false, error: 'Screenshot not found' });
      }
    });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to serve screenshot' });
  }
});

// 테스트 리포트 썸네일: /api/test-reports/thumbnails/:reportId/:deviceId/:filename
// 썸네일(WebP)이 없으면 원본 PNG로 폴백
app.get('/api/test-reports/thumbnails/:reportId/:deviceId/:filename', async (req: Request, res: Response) => {
  try {
    const { reportId, deviceId, filename } = req.params;
    const baseDir = path.join(__dirname, '../reports/screenshots');
    const originalPath = path.join(baseDir, reportId, deviceId, filename);

    // 보안: 디렉토리 트래버설 방지
    const normalizedOriginal = path.normalize(originalPath);
    if (!normalizedOriginal.startsWith(baseDir)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    // 썸네일 경로 계산 (filename.png -> filename_thumb.webp)
    const ext = path.extname(filename);
    const baseName = filename.slice(0, -ext.length);
    const thumbnailFilename = `${baseName}_thumb.webp`;
    const thumbnailPath = path.join(baseDir, reportId, deviceId, thumbnailFilename);

    // 썸네일 존재 확인
    try {
      await fs.promises.access(thumbnailPath);
      // 썸네일 존재 - WebP 반환
      res.sendFile(thumbnailPath, {
        headers: {
          'Content-Type': 'image/webp',
          'Cache-Control': 'public, max-age=31536000',
        },
      }, (err) => {
        if (err) {
          // 썸네일 전송 실패 시 원본으로 폴백
          res.sendFile(normalizedOriginal, {
            headers: { 'Content-Type': 'image/png' },
          });
        }
      });
    } catch {
      // 썸네일 없음 - 원본 PNG로 폴백
      res.sendFile(normalizedOriginal, {
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=31536000',
        },
      }, (err) => {
        if (err) {
          res.status(404).json({ success: false, error: 'Screenshot not found' });
        }
      });
    }
  } catch {
    res.status(500).json({ success: false, error: 'Failed to serve thumbnail' });
  }
});

// 테스트 리포트 비디오: /api/test-reports/videos/:reportId/:filename
app.get('/api/test-reports/videos/:reportId/:filename', async (req: Request, res: Response) => {
  try {
    const { reportId, filename } = req.params;
    const videoPath = path.join(__dirname, '../reports/videos', reportId, filename);

    // 보안: 디렉토리 트래버설 방지
    const normalizedPath = path.normalize(videoPath);
    const baseDir = path.join(__dirname, '../reports/videos');
    if (!normalizedPath.startsWith(baseDir)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    res.sendFile(normalizedPath, {
      headers: {
        'Content-Type': 'video/mp4',
        'Accept-Ranges': 'bytes',
      },
    }, (err) => {
      if (err) {
        res.status(404).json({ success: false, error: 'Video not found' });
      }
    });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to serve video' });
  }
});

// Suite 비디오: /api/suites/videos/:filename
app.get('/api/suites/videos/:filename', (req: Request, res: Response) => {
  try {
    const { filename } = req.params;
    const videoDir = path.join(__dirname, '../uploads/videos');
    const videoPath = path.join(videoDir, filename);

    // 보안: 디렉토리 트래버설 방지
    const normalizedPath = path.normalize(videoPath);
    if (!normalizedPath.startsWith(videoDir)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    // Range 요청 지원 (비디오 스트리밍)
    const fs = require('fs');
    if (!fs.existsSync(videoPath)) {
      return res.status(404).json({ success: false, error: 'Video not found' });
    }

    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      const file = fs.createReadStream(videoPath, { start, end });
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': 'video/mp4',
      });
      file.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4',
      });
      fs.createReadStream(videoPath).pipe(res);
    }
  } catch {
    res.status(500).json({ success: false, error: 'Failed to serve video' });
  }
});

// === 인증 필요 API 라우트 ===
// authMiddleware: JWT 토큰 검증 필수
// generalLimiter: 일반 API rate limiting (15분 1000회)
// executionLimiter: 테스트 실행 rate limiting (1분 10회)
app.use('/api/device', authMiddleware, generalLimiter, deviceRoutes);
app.use('/api/scenarios', authMiddleware, generalLimiter, scenarioRoutes);
app.use('/api/reports', authMiddleware, generalLimiter, reportRoutes);
app.use('/api/image', authMiddleware, generalLimiter, imageRoutes);
app.use('/api/session', authMiddleware, generalLimiter, sessionRoutes);
app.use('/api/packages', authMiddleware, generalLimiter, packageRoutes);
app.use('/api/categories', authMiddleware, generalLimiter, categoryRoutes);
app.use('/api/schedules', authMiddleware, generalLimiter, scheduleRoutes);
// 테스트 실행 라우트: 라우트별 개별 rate limit은 test.ts 내부에서 처리
app.use('/api/test', authMiddleware, generalLimiter, testRoutes);
app.use('/api/test-reports', authMiddleware, generalLimiter, testReportRoutes);
app.use('/api/screenshot', authMiddleware, generalLimiter, screenshotRoutes);
app.use('/api/dashboard', optionalAuthMiddleware, generalLimiter, dashboardRoutes);
// AI 서비스 (실험적 기능 - 삭제 가능)
app.use('/api/ai', authMiddleware, generalLimiter, aiRoutes);
// 비디오 분석 라우트 (실험적 기능 - 삭제 가능)
app.use('/api/video', authMiddleware, generalLimiter, videoRoutes);
// OCR 테스트 라우트
app.use('/api/ocr', authMiddleware, generalLimiter, ocrRoutes);
// Test Suite 라우트: 테스트 실행 포함이므로 executionLimiter 적용
app.use('/api/suites', authMiddleware, executionLimiter, suiteRoutes);
// Slack 알림 설정 라우트
app.use('/api/slack', authMiddleware, generalLimiter, slackRoutes);

// === 공개 라우트 (인증 불필요) ===
// /auth/me: 세션 확인용 - generalLimiter 적용 (15분 1000회)
// /auth/slack, /auth/slack/callback: 로그인 시도 - authLimiter 적용 (15분 20회)
app.use('/auth/me', generalLimiter, authRoutes);
app.use('/auth/status', generalLimiter, authRoutes);
app.use('/auth/logout', generalLimiter, authRoutes);
app.use('/auth', authLimiter, authRoutes);

// 404 핸들러
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'Not Found',
    message: `${req.method} ${req.path} 경로를 찾을 수 없습니다.`,
  });
});

// 글로벌 에러 핸들러
app.use((err: AppError, _req: Request, res: Response, _next: NextFunction) => {
  console.error('❌ 서버 에러:', err);

  // Appium 관련 에러
  if (err.message?.includes('session')) {
    res.status(503).json({
      success: false,
      error: 'Session Error',
      message: '디바이스 세션에 문제가 발생했습니다. 다시 연결해주세요.',
    });
    return;
  }

  // 일반 에러
  res.status(err.status || 500).json({
    success: false,
    error: err.name || 'Internal Server Error',
    message: err.message || '서버 내부 오류가 발생했습니다.',
  });
});

// 처리되지 않은 Promise 에러
process.on('unhandledRejection', (reason: unknown) => {
  console.error('⚠️ Unhandled Rejection:', reason);
});

// 처리되지 않은 예외
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception:', error);
  // 심각한 에러는 프로세스 종료 (PM2 등에서 자동 재시작)
  // process.exit(1);
});

// 스크린 스트리밍 WebSocket 서버 초기화 (noServer 모드로 수동 upgrade 처리)
screenStreamService.initialize(server);

// scrcpy H.264 스트리밍 WebSocket 서버 초기화 (noServer 모드로 수동 upgrade 처리)
scrcpyStreamService.initialize(server);

// 서버 시작
const PORT = parseInt(process.env.PORT || '3001', 10);
const HOST = process.env.HOST || '0.0.0.0';  // 외부 접근 허용

server.listen(PORT, HOST, async () => {
  const logLevel = LogLevel[Logger.getGlobalLevel()];
  const displayHost = HOST === '0.0.0.0' ? 'localhost' : HOST;
  logger.always('========================================');
  logger.always('Backend server started!');
  logger.always(`HTTP: http://${displayHost}:${PORT}`);
  logger.always(`WebSocket: ws://${displayHost}:${PORT}`);
  logger.always(`Listening on: ${HOST}:${PORT}`);
  logger.always(`Log Level: ${logLevel} (set LOG_LEVEL env to change)`);
  logger.always('');
  logger.always('API Endpoints:');
  logger.always('   [Device] /api/device/*');
  logger.always('   [Package] /api/packages/*');
  logger.always('   [Category] /api/categories/*');
  logger.always('   [Scenario] /api/scenarios/*');
  logger.always('   [Test] /api/test/*');
  logger.always('   [Report] /api/test-reports/*');
  logger.always('   [Schedule] /api/schedules/*');
  logger.always('   [Suite] /api/suites/*');
  logger.always('   [AI] /api/ai/* (experimental)');
  logger.always('========================================');

  // 중앙 이벤트 발신 서비스 초기화 (다른 서비스보다 먼저)
  eventEmitter.setIO(io);
  logger.info('Event emitter initialized');

  // 스케줄 매니저 초기화
  scheduleManager.setSocketIO(io);
  await scheduleManager.initialize();

  // 테스트 실행기 초기화
  testExecutor.setSocketIO(io);

  // 다중 사용자 큐 시스템 초기화
  testOrchestrator.setSocketIO(io);
  logger.info('Multi-user queue system initialized');

  // 스크린샷 폴링 서비스 초기화
  screenshotService.setSocketIO(io);
  logger.info('Screenshot polling service initialized');

  // Suite Executor 초기화
  suiteExecutor.setSocketIO(io);
  logger.info('Test Suite executor initialized');

  // Slack 알림 서비스 (환경 변수 기반, 초기화 불필요)
  if (slackNotificationService.isConfigured()) {
    logger.info('Slack notification service configured');
  } else {
    logger.info('Slack notification not configured (set SLACK_WEBHOOK_URL in .env)');
  }
});

export { app, io };