import { Router, Request, Response } from 'express';
import { Server as SocketIOServer } from 'socket.io';
import http from 'http';
import { sessionManager } from '../services/sessionManager';
import { deviceManager } from '../services/deviceManager';
import { parallelExecutor } from '../services/parallelExecutor';
import { parallelReportService } from '../services/parallelReport';
import { reportExporter } from '../services/reportExporter';

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

// =====================
// 병렬 실행 리포트 API
// =====================

// 모든 통합 리포트 목록 조회
router.get('/parallel/reports', async (_req: Request, res: Response) => {
  try {
    const reports = await parallelReportService.getAll();
    res.json({
      success: true,
      reports,
      count: reports.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      success: false,
      error: message,
    });
  }
});

// 특정 통합 리포트 조회
router.get('/parallel/reports/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const report = await parallelReportService.getById(id);
    res.json({
      success: true,
      report,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('찾을 수 없습니다') ? 404 : 500;
    res.status(status).json({
      success: false,
      error: message,
    });
  }
});

// 통합 리포트 삭제
router.delete('/parallel/reports/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await parallelReportService.delete(id);
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('찾을 수 없습니다') ? 404 : 500;
    res.status(status).json({
      success: false,
      error: message,
    });
  }
});

// 모든 통합 리포트 삭제
router.delete('/parallel/reports', async (_req: Request, res: Response) => {
  try {
    const result = await parallelReportService.deleteAll();
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      success: false,
      error: message,
    });
  }
});

// 스크린샷 파일 서빙
// /parallel/screenshots/:reportId/:deviceId/:filename 형식
router.get('/parallel/screenshots/:reportId/:deviceId/:filename', async (req: Request, res: Response) => {
  try {
    const { reportId, deviceId, filename } = req.params;
    const fullRelativePath = `screenshots/${reportId}/${deviceId}/${filename}`;

    const buffer = await parallelReportService.getScreenshot(fullRelativePath);

    res.set({
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400', // 24시간 캐시
    });
    res.send(buffer);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('찾을 수 없습니다') ? 404 : 500;
    res.status(status).json({
      success: false,
      error: message,
    });
  }
});

// 비디오 파일 서빙
// /parallel/videos/:reportId/:filename 형식
router.get('/parallel/videos/:reportId/:filename', async (req: Request, res: Response) => {
  try {
    const { reportId, filename } = req.params;
    const fullRelativePath = `videos/${reportId}/${filename}`;

    const buffer = await parallelReportService.getVideo(fullRelativePath);

    res.set({
      'Content-Type': 'video/mp4',
      'Cache-Control': 'public, max-age=86400', // 24시간 캐시
      'Accept-Ranges': 'bytes',
    });
    res.send(buffer);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('찾을 수 없습니다') ? 404 : 500;
    res.status(status).json({
      success: false,
      error: message,
    });
  }
});

// =====================
// 리포트 내보내기 API
// =====================

// HTML 내보내기
router.get('/parallel/reports/:id/export/html', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const includeScreenshots = req.query.screenshots !== 'false';

    const report = await parallelReportService.getById(id);
    const html = await reportExporter.generateHTML(report, { includeScreenshots });

    const filename = `report-${id}-${Date.now()}.html`;
    res.set({
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    res.send(html);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('찾을 수 없습니다') ? 404 : 500;
    res.status(status).json({
      success: false,
      error: message,
    });
  }
});

// PDF 내보내기
router.get('/parallel/reports/:id/export/pdf', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const includeScreenshots = req.query.screenshots !== 'false';
    const paperSize = (req.query.paper as 'A4' | 'Letter') || 'A4';
    const orientation = (req.query.orientation as 'portrait' | 'landscape') || 'portrait';

    const report = await parallelReportService.getById(id);
    const pdfBuffer = await reportExporter.generatePDF(report, {
      includeScreenshots,
      paperSize,
      orientation,
    });

    const filename = `report-${id}-${Date.now()}.pdf`;
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': pdfBuffer.length.toString(),
    });
    res.send(pdfBuffer);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('찾을 수 없습니다') ? 404 : 500;
    res.status(status).json({
      success: false,
      error: message,
    });
  }
});

export default router;