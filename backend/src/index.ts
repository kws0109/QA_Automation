// backend/src/index.ts

import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';

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

// 서비스 가져오기
import { scheduleManager } from './services/scheduleManager';
import { testExecutor } from './services/testExecutor';
import { testOrchestrator } from './services/testOrchestrator';
import { screenshotService } from './services/screenshotService';
import { suiteExecutor } from './services/suiteExecutor';

// 에러 인터페이스
interface AppError extends Error {
  status?: number;
}

// Express 앱 생성
const app = express();

// HTTP 서버 생성 (Socket.io용)
const server = http.createServer(app);

// Socket.io 설정
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// 미들웨어 설정
app.use(cors({
  origin: true, // 모든 origin 허용 (개발 환경)
  credentials: true, // 쿠키 전송 허용
}));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  next();
});
// JSON 파싱
app.use(express.json());

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

  socket.on('disconnect', () => {
    console.log(`🔌 클라이언트 연결 해제: ${socket.id}${userName ? ` (${userName})` : ''}`);

    // 큐 시스템 정리: 연결 해제된 사용자의 대기 중인 테스트 정리
    testOrchestrator.handleSocketDisconnect(socket.id);
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

  // 소켓 연결 해제 시 스크린샷 클라이언트 정리
  socket.on('disconnect', () => {
    // 이미 위에서 처리하지만, screenshot-room에 있었는지 확인
    if (socket.rooms.has('screenshot-room')) {
      screenshotService.removeClient();
    }
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

app.use('/api/device', deviceRoutes);
app.use('/api/scenarios', scenarioRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/image', imageRoutes);
app.use('/api/session', sessionRoutes);
app.use('/api/packages', packageRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/schedules', scheduleRoutes);
app.use('/api/test', testRoutes);
app.use('/api/test-reports', testReportRoutes);
app.use('/api/screenshot', screenshotRoutes);
app.use('/api/dashboard', dashboardRoutes);
// AI 서비스 (실험적 기능 - 삭제 가능)
app.use('/api/ai', aiRoutes);
// 비디오 분석 라우트 (실험적 기능 - 삭제 가능)
app.use('/api/video', videoRoutes);
// OCR 테스트 라우트
app.use('/api/ocr', ocrRoutes);
// Test Suite 라우트
app.use('/api/suites', suiteRoutes);
// Slack OAuth 인증 라우트 (ngrok 콜백 경로와 일치해야 함)
app.use('/auth', authRoutes);

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
  console.error('⚠️ Uncaught Exception:', error);
  // 심각한 에러는 프로세스 종료 (PM2 등에서 자동 재시작)
  // process.exit(1);
});

// 서버 시작
const PORT = 3001;

server.listen(PORT, async () => {
  console.log('========================================');
  console.log('✅ 백엔드 서버 시작!');
  console.log(`📡 HTTP: http://localhost:${PORT}`);
  console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
  console.log('');
  console.log('📌 API 엔드포인트:');
  console.log('   [디바이스] /api/device/*');
  console.log('   [패키지] /api/packages/*');
  console.log('   [카테고리] /api/categories/*');
  console.log('   [시나리오] /api/scenarios/*');
  console.log('   [테스트] /api/test/*');
  console.log('   [통합리포트] /api/test-reports/*');
  console.log('   [구리포트] /api/reports/* (deprecated)');
  console.log('   [스케줄] /api/schedules/*');
  console.log('   [Suite] /api/suites/*');
  console.log('   [AI] /api/ai/* (실험적)');
  console.log('========================================');

  // 스케줄 매니저 초기화
  scheduleManager.setSocketIO(io);
  await scheduleManager.initialize();

  // 테스트 실행기 초기화
  testExecutor.setSocketIO(io);

  // 다중 사용자 큐 시스템 초기화
  testOrchestrator.setSocketIO(io);
  console.log('🔄 다중 사용자 큐 시스템 초기화 완료');

  // 스크린샷 폴링 서비스 초기화
  screenshotService.setSocketIO(io);
  console.log('📸 스크린샷 폴링 서비스 초기화 완료');

  // Suite Executor 초기화
  suiteExecutor.setSocketIO(io);
  console.log('📦 Test Suite 실행기 초기화 완료');
});

export { app, io };