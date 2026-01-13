import { Router, Request, Response } from 'express';
import http from 'http';
import { sessionManager } from '../services/sessionManager';
import { deviceManager } from '../services/deviceManager';

const router = Router();

// 세션 생성
router.post('/create', async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.body;

    if (!deviceId) {
      return res.status(400).json({
        success: false,
        error: 'deviceId is required'
      });
    }

    // 디바이스 존재 확인
    const device = await deviceManager.getDeviceDetails(deviceId);
    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }

    if (device.status !== 'connected') {
      return res.status(400).json({
        success: false,
        error: `Device is ${device.status}`
      });
    }

    // ensureSession: 기존 세션이 살아있으면 반환, 죽었거나 없으면 새로 생성
    const sessionInfo = await sessionManager.ensureSession(device);

    res.json({
      success: true,
      session: sessionInfo
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      success: false,
      error: `Failed to create session: ${message}`
    });
  }
});

// 세션 종료
router.post('/destroy', async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.body;

    if (!deviceId) {
      return res.status(400).json({
        success: false,
        error: 'deviceId is required'
      });
    }

    const result = await sessionManager.destroySession(deviceId);

    res.json({
      success: true,
      destroyed: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to destroy session'
    });
  }
});

// 모든 세션 종료
router.post('/destroy-all', async (req: Request, res: Response) => {
  try {
    await sessionManager.destroyAllSessions();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to destroy sessions'
    });
  }
});

// 활성 세션 목록
router.get('/list', (req: Request, res: Response) => {
  const sessions = sessionManager.getAllSessions();
  res.json({
    success: true,
    sessions,
    count: sessions.length
  });
});

// 특정 세션 정보
router.get('/:deviceId', (req: Request, res: Response) => {
  const { deviceId } = req.params;
  const session = sessionManager.getSessionInfo(deviceId);

  if (!session) {
    return res.status(404).json({
      success: false,
      error: 'Session not found'
    });
  }

  res.json({ success: true, session });
});

// 디바이스별 MJPEG 스트림 프록시 (재연결 지원)
router.get('/:deviceId/mjpeg', (req: Request, res: Response) => {
  const { deviceId } = req.params;
  const session = sessionManager.getSessionInfo(deviceId);

  if (!session) {
    return res.status(404).json({
      success: false,
      error: 'Session not found. Create a session first.'
    });
  }

  const mjpegUrl = `http://127.0.0.1:${session.mjpegPort}`;
  let isClientConnected = true;
  let currentProxyReq: ReturnType<typeof http.get> | null = null;
  let retryCount = 0;
  const maxRetries = 3;
  const retryDelay = 1000;

  const connectToMjpeg = () => {
    if (!isClientConnected || retryCount >= maxRetries) {
      return;
    }

    currentProxyReq = http.get(mjpegUrl, (proxyRes) => {
      retryCount = 0; // 연결 성공 시 재시도 카운트 리셋

      if (!res.headersSent) {
        res.writeHead(proxyRes.statusCode || 200, {
          'Content-Type': 'multipart/x-mixed-replace; boundary=--BoundaryString',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        });
      }

      proxyRes.pipe(res, { end: false });

      // 프록시 연결 종료 시 재연결 시도
      proxyRes.on('close', () => {
        if (isClientConnected && retryCount < maxRetries) {
          retryCount++;
          console.log(`MJPEG stream closed for ${deviceId}, reconnecting (${retryCount}/${maxRetries})...`);
          setTimeout(connectToMjpeg, retryDelay);
        }
      });
    });

    currentProxyReq.on('error', (err) => {
      console.error(`MJPEG proxy error for ${deviceId}:`, err.message);
      if (isClientConnected && retryCount < maxRetries) {
        retryCount++;
        console.log(`MJPEG connection failed for ${deviceId}, retrying (${retryCount}/${maxRetries})...`);
        setTimeout(connectToMjpeg, retryDelay);
      } else if (!res.headersSent) {
        res.status(502).json({
          success: false,
          error: 'Failed to connect to MJPEG stream'
        });
      }
    });
  };

  // 초기 연결
  connectToMjpeg();

  // 클라이언트 연결 종료 시 프록시 연결도 종료
  req.on('close', () => {
    isClientConnected = false;
    if (currentProxyReq) {
      currentProxyReq.destroy();
    }
  });
});

// NOTE: 병렬 실행 관련 레거시 API 삭제됨 (2026-01-13)
// 모든 테스트 실행은 /api/test/* 큐 시스템을 통해 처리
// 리포트 조회는 /api/test-reports/* 엔드포인트 사용

export default router;
