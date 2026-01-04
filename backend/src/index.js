const express = require('express'); // Express 프레임워크 불러오기
const cors = require('cors'); // CORS 미들웨어 불러오기

// 라우트 가져오기
const deviceRoutes = require('./routes/devices');
const actionRoutes = require('./routes/action');

// Express 앱 생성
const app = express(); // Express 애플리케이션 인스턴스 생성

// 미들웨어 설정
app.use(cors());              // 프론트엔드 연결 허용
app.use(express.json());      // JSON 파싱

/* 미들웨어란? 요청과 응답 사이에서 실행되는 함수
클라이언트 요청 -> [미들웨어1] -> [미들웨어2] -> 라우트 처리 -> 서버 응답 */

/* CORS 미들웨어란?
CORS(Cross-Origin Resource Sharing)는 
서로 다른 도메인 간의 리소스 공유를 허용하는 메커니즘입니다. 
예를 들어, 프론트엔드가 http://localhost:3000에서 실행되고 
백엔드가 http://localhost:3001에서 실행될 때,
브라우저는 보안상의 이유로 서로 다른 출처 간의 요청을 제한합니다. 
CORS 미들웨어는 이러한 제한을 우회하여 
프론트엔드가 백엔드 API에 접근할 수 있도록 도와줍니다. */

/* express.json() 미들웨어란?
이 미들웨어는 들어오는 요청의 본문이 JSON 형식일 때 
이를 자동으로 파싱하여 JavaScript 객체로 변환해줍니다. 
따라서, 클라이언트가 JSON 데이터를 서버로 보낼 때 
req.body를 통해 쉽게 접근할 수 있습니다. */

// ===== API 라우트 =====

// 헬스 체크 API
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: '서버가 정상 작동 중입니다!',
    timestamp: new Date().toISOString()
  });
});

/*app.get('/api/health')는 HTTP GET 요청을 처리하는 라우트 핸들러를 정의합니다.
클라이언트가 /api/health 엔드포인트로 GET 요청을 보내면,
서버는 JSON 형식의 응답을 반환합니다. 
이 응답에는 서버 상태(status), 메시지(message), 
그리고 현재 시간(timestamp)이 포함되어 있습니다*/

// (req, res)는 요청(request)과 응답(response) 객체를 나타냅니다.
// req: 클라이언트가 서버로 보낸 요청에 대한 정보가 담긴 객체
// res: 서버가 클라이언트로 보내는 응답을 구성하는 객체

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

// 디바이스 관련 라우트 연결
// /api/device/connect, /api/device/disconnect 등
app.use('/api/device', deviceRoutes);
// 액션 관련 라우트
app.use('/api/action', actionRoutes);


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
  console.log('   POST /api/action/clearData');   // 추가
  console.log('   POST /api/action/clearCache');  // 추가
  console.log('========================================');
});