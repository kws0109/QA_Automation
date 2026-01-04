// backend/src/index.js

const express = require('express');
const cors = require('cors');

// 라우트 가져오기
const deviceRoutes = require('./routes/devices');
const actionRoutes = require('./routes/action');
const scenarioRoutes = require('./routes/scenario');

// Express 앱 생성
const app = express();

// 미들웨어 설정
app.use(cors());

// JSON 파싱 (UTF-8 인코딩 지원 강화)
app.use(express.json({ 
  limit: '10mb',
}));

// URL 인코딩 파싱
app.use(express.urlencoded({ extended: true }));

// 모든 응답에 UTF-8 헤더 설정
app.use((req, res, next) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  next();
});

// ===== API 라우트 =====

// 헬스 체크
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: '서버가 정상 작동 중입니다!',
    timestamp: new Date().toISOString()
  });
});

// 디바이스 관련 라우트
app.use('/api/device', deviceRoutes);

// 액션 관련 라우트
app.use('/api/action', actionRoutes);

// 시나리오 관련 라우트
app.use('/api/scenarios', scenarioRoutes);

// ===== 서버 시작 =====
const PORT = 3001;

app.listen(PORT, () => {
  console.log('========================================');
  console.log(`✅ 백엔드 서버 시작!`);
  console.log(`📡 http://localhost:${PORT}`);
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
  console.log('========================================');
});