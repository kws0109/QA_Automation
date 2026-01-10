// backend/src/index.ts

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';

// 라우트 가져오기
import deviceRoutes from './routes/device';
import actionRoutes from './routes/action';
import scenarioRoutes from './routes/scenario';
import reportRoutes from './routes/report';
import imageRoutes from './routes/image';
import sessionRoutes from './routes/session';
import packageRoutes from './routes/package';
import categoryRoutes from './routes/category';
import scheduleRoutes from './routes/schedule';

// 서비스 가져오기
import { scheduleManager } from './services/scheduleManager';

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
app.use(cors());
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

  socket.on('disconnect', () => {
    console.log(`🔌 클라이언트 연결 해제: ${socket.id}`);
  });

  socket.on('ping', () => {
    socket.emit('pong', { message: '연결 정상!', timestamp: new Date().toISOString() });
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
app.use('/api/action', actionRoutes);
app.use('/api/scenarios', scenarioRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/image', imageRoutes);
app.use('/api/session', sessionRoutes);
app.use('/api/packages', packageRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/schedules', scheduleRoutes);

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
  console.log('   [액션] /api/action/*');
  console.log('   [패키지] /api/packages/*');
  console.log('   [카테고리] /api/categories/*');
  console.log('   [시나리오] /api/scenarios/*');
  console.log('   [리포트] /api/reports/*');
  console.log('   [스케줄] /api/schedules/*');
  console.log('========================================');

  // 스케줄 매니저 초기화
  scheduleManager.setSocketIO(io);
  await scheduleManager.initialize();
});

export { app, io };