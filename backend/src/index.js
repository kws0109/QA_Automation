// backend/src/index.js

const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

// 라우트 가져오기
const deviceRoutes = require('./routes/device');
const actionRoutes = require('./routes/action');
const scenarioRoutes = require('./routes/scenario');
const reportRoutes = require('./routes/report');  // 추가!

// Express 앱 생성
const app = express();

// HTTP 서버 생성 (Socket.io용)
const server = http.createServer(app);

// Socket.io 설정
const io = new Server(server, {
  cors: {
    origin: '*',
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
app.use('/api/reports', reportRoutes);  // 추가!

// 서버 시작
const PORT = 3001;

server.listen(PORT, () => {
  console.log('========================================');
  console.log(`✅ 백엔드 서버 시작!`);
  console.log(`📡 HTTP: http://localhost:${PORT}`);
  console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
  console.log('');
  console.log('📌 API 엔드포인트:');
  console.log('   [디바이스] /api/device/*');
  console.log('   [액션] /api/action/*');
  console.log('   [시나리오] /api/scenarios/*');
  console.log('   [리포트] /api/reports/*');  // 추가!
  console.log('========================================');
});

module.exports = { app, io };