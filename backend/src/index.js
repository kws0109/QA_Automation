// backend/src/index.js

const express = require('express');
const cors = require('cors');

// Express 앱 생성
const app = express();

// 미들웨어 설정
app.use(cors());              // 프론트엔드 연결 허용
app.use(express.json());      // JSON 파싱

// ===== API 라우트 =====

// 헬스 체크 API
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: '서버가 정상 작동 중입니다!',
    timestamp: new Date().toISOString()
  });
});

// 테스트 API
app.get('/api/test', (req, res) => {
  res.json({ 
    message: '백엔드와 연결 성공!',
    data: {
      name: 'Game Automation Tool',
      version: '1.0.0'
    }
  });
});

// ===== 서버 시작 =====
const PORT = 3001;

app.listen(PORT, () => {
  console.log('========================================');
  console.log(`✅ 백엔드 서버 시작!`);
  console.log(`📡 http://localhost:${PORT}`);
  console.log(`🔍 헬스체크: http://localhost:${PORT}/api/health`);
  console.log('========================================');
});