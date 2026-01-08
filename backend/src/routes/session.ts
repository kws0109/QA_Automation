import { Router, Request, Response } from 'express';
import { Server as SocketIOServer } from 'socket.io';
import http from 'http';
import { sessionManager } from '../services/sessionManager';
import { deviceManager } from '../services/deviceManager';
import { parallelExecutor } from '../services/parallelExecutor';

const router = Router();

// Socket.IO 설정 미들웨어
router.use((req: Request, _res: Response, next) => {
  const io = req.app.get('io') as SocketIOServer;
  if (io) {
    parallelExecutor.setSocketIO(io);
  }
  next();
});

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

// 디바이스별 MJPEG 스트림 프록시
router.get('/:deviceId/mjpeg', (req: Request, res: Response) => {
  const { deviceId } = req.params;
  const session = sessionManager.getSessionInfo(deviceId);

  if (!session) {
    return res.status(404).json({
      success: false,
      error: 'Session not found. Create a session first.'
    });
  }

  const mjpegUrl = `http://localhost:${session.mjpegPort}`;

  // MJPEG 스트림 프록시
  const proxyReq = http.get(mjpegUrl, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 200, {
      'Content-Type': 'multipart/x-mixed-replace; boundary=--BoundaryString',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error(`MJPEG proxy error for ${deviceId}:`, err.message);
    if (!res.headersSent) {
      res.status(502).json({
        success: false,
        error: 'Failed to connect to MJPEG stream'
      });
    }
  });

  // 클라이언트 연결 종료 시 프록시 연결도 종료
  req.on('close', () => {
    proxyReq.destroy();
  });
});

// =====================
// 병렬 실행 API
// =====================

// 병렬 시나리오 실행
router.post('/execute-parallel', async (req: Request, res: Response) => {
  try {
    const { scenarioId, deviceIds } = req.body;

    if (!scenarioId) {
      return res.status(400).json({
        success: false,
        error: 'scenarioId is required',
      });
    }

    if (!deviceIds || !Array.isArray(deviceIds) || deviceIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'deviceIds must be a non-empty array',
      });
    }

    console.log(`[ParallelExecute] 요청: 시나리오 ${scenarioId} → 디바이스 ${deviceIds.join(', ')}`);

    const result = await parallelExecutor.executeParallel(scenarioId, deviceIds);

    res.json({
      success: true,
      result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[ParallelExecute] 오류:', message);
    res.status(500).json({
      success: false,
      error: message,
    });
  }
});

// 병렬 실행 상태 조회
router.get('/parallel/status', (_req: Request, res: Response) => {
  const status = parallelExecutor.getStatus();
  res.json({
    success: true,
    ...status,
  });
});

// 특정 디바이스 실행 중지
router.post('/parallel/stop/:deviceId', (req: Request, res: Response) => {
  const { deviceId } = req.params;
  parallelExecutor.stopDevice(deviceId);
  res.json({
    success: true,
    message: `Stop requested for device: ${deviceId}`,
  });
});

// 모든 병렬 실행 중지
router.post('/parallel/stop-all', (_req: Request, res: Response) => {
  parallelExecutor.stopAll();
  res.json({
    success: true,
    message: 'Stop requested for all devices',
  });
});

export default router;