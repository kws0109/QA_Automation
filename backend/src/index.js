// backend/src/index.js

const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

// 라우트 가져오기
const deviceRoutes = require('./routes/devices');
const actionRoutes = require('./routes/actions');
const scenarioRoutes = require('./routes/scenario');

// Express 앱 생성
const app = express();

// HTTP 서버 생성 (Socket.io용)
const server = http.createServer(app);

// Socket.io 설정
const io = new Server(server, {
  cors: {
    origin: '*',  // 개발 중에는 모든 origin 허용
    methods: ['GET', 'POST'],
  },
});

// 미들웨어 설정
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  next();
});

// Socket.io를 app에 저장 (다른 모듈에서 사용)
app.set('io', io);

// ===== WebSocket 이벤트 =====
io.on('connection', (socket) => {
  console.log(`🔌 클라이언트 연결: ${socket.id}`);

  // 연결 해제
  socket.on('disconnect', () => {
    console.log(`🔌 클라이언트 연결 해제: ${socket.id}`);
  });

  // 핑-퐁 테스트
  socket.on('ping', () => {
    socket.emit('pong', { message: '연결 정상!', timestamp: new Date().toISOString() });
  });
});

// ===== API 라우트 =====

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: '서버가 정상 작동 중입니다!',
    timestamp: new Date().toISOString()
  });
});

app.use('/api/device', deviceRoutes);
app.use('/api/action', actionRoutes);
app.use('/api/scenarios', scenarioRoutes);

// ===== 서버 시작 =====
const PORT = 3001;

// app.listen 대신 server.listen 사용!
server.listen(PORT, () => {
  console.log('========================================');
  console.log(`✅ 백엔드 서버 시작!`);
  console.log(`📡 HTTP: http://localhost:${PORT}`);
  console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
  console.log('');
  console.log('📌 API 엔드포인트:');
  console.log('   [디바이스]');
  console.log('   POST /api/device/connect');
  console.log('   POST /api/device/disconnect');
  console.log('   GET  /api/device/status');
  console.log('   GET  /api/device/screenshot');
  console.log('');
  console.log('   [액션]');
  console.log('   POST /api/action/tap');
  console.log('   POST /api/action/longPress');
  console.log('   POST /api/action/inputText');
  console.log('   POST /api/action/click');
  console.log('   POST /api/action/wait');
  console.log('   POST /api/action/back');
  console.log('   POST /api/action/home');
  console.log('   POST /api/action/restart');
  console.log('   POST /api/action/clearData');
  console.log('   POST /api/action/clearCache');
  console.log('');
  console.log('   [시나리오]');
  console.log('   GET    /api/scenarios');
  console.log('   GET    /api/scenarios/:id');
  console.log('   POST   /api/scenarios');
  console.log('   PUT    /api/scenarios/:id');
  console.log('   DELETE /api/scenarios/:id');
  console.log('   POST   /api/scenarios/:id/duplicate');
  console.log('   POST   /api/scenarios/:id/run');
  console.log('   POST   /api/scenarios/stop');
  console.log('   GET    /api/scenarios/execution/status');
  console.log('   GET    /api/scenarios/execution/log');
  console.log('');
  console.log('📌 WebSocket 이벤트:');
  console.log('   scenario:start    - 시나리오 시작');
  console.log('   scenario:node     - 노드 실행');
  console.log('   scenario:complete - 시나리오 완료');
  console.log('   scenario:error    - 실행 오류');
  console.log('========================================');
});

// io 객체 내보내기 (다른 모듈에서 사용)
module.exports = { app, io };