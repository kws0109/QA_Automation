/**
 * 비디오 분석 API 라우트
 *
 * 비디오 업로드 및 분석 기능을 제공합니다.
 *
 * 이 모듈은 격리되어 있어 삭제 시 다른 부분에 영향을 주지 않습니다.
 *
 * 삭제 방법:
 * 1. 이 파일 삭제
 * 2. backend/src/services/videoAnalyzer/ 폴더 삭제
 * 3. backend/src/index.ts에서 관련 import 및 라우트 제거
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { videoParser, screenRecorder } from '../services/videoAnalyzer';
import type {
  VideoAnalysisResult,
  ScenarioGenerationResult,
  AnalysisProgress,
} from '../services/videoAnalyzer/types';

const router = Router();

// ========================================
// 파일 업로드 설정
// ========================================

const UPLOAD_DIR = path.join(__dirname, '../../uploads/videos');

// 업로드 폴더 생성
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `video-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB 제한
  },
  fileFilter: (_req, file, cb) => {
    const allowedMimes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('지원하지 않는 비디오 형식입니다. (MP4, WebM, MOV, AVI만 가능)'));
    }
  },
});

// ========================================
// 분석 진행 상태 저장 (메모리)
// ========================================

const analysisProgress = new Map<string, AnalysisProgress>();

// ========================================
// API 엔드포인트
// ========================================

/**
 * 비디오 업로드
 * POST /api/video/upload
 */
router.post('/upload', upload.single('video'), (req: Request, res: Response): void => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, error: '비디오 파일이 필요합니다.' });
      return;
    }

    const videoId = path.basename(req.file.filename, path.extname(req.file.filename));

    // 비디오 정보 추출
    const videoInfo = videoParser.getVideoInfo(req.file.path);

    res.json({
      success: true,
      videoId,
      filename: req.file.originalname,
      size: req.file.size,
      path: req.file.path,
      duration: videoInfo?.duration,
      fps: videoInfo?.fps,
      width: videoInfo?.width,
      height: videoInfo?.height,
    });
  } catch (error) {
    console.error('[Video API] Upload error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed',
    });
  }
});

/**
 * 비디오 분석 시작
 * POST /api/video/analyze/:videoId
 */
router.post('/analyze/:videoId', async (req: Request, res: Response): Promise<void> => {
  const { videoId } = req.params;
  const { fps, doubleTapThreshold, longPressThreshold, swipeMinDistance } = req.body;

  // 비디오 파일 찾기
  const files = fs.readdirSync(UPLOAD_DIR);
  const videoFile = files.find((f) => f.startsWith(videoId));

  if (!videoFile) {
    res.status(404).json({ success: false, error: '비디오를 찾을 수 없습니다.' });
    return;
  }

  const videoPath = path.join(UPLOAD_DIR, videoFile);

  // 분석 상태 초기화
  analysisProgress.set(videoId, {
    videoId,
    status: 'pending',
    progress: 0,
    currentStep: '분석 준비 중...',
  });

  try {
    // 진행 상태 이벤트 리스너
    videoParser.on('progress', (progress: { status: string; progress: number; step: string }) => {
      analysisProgress.set(videoId, {
        videoId,
        status: progress.status as AnalysisProgress['status'],
        progress: progress.progress,
        currentStep: progress.step,
      });
    });

    // 분석 실행
    const result: VideoAnalysisResult = await videoParser.analyzeVideo(videoPath, {
      fps,
      doubleTapThreshold,
      longPressThreshold,
      swipeMinDistance,
    });

    // 완료 상태 업데이트
    analysisProgress.set(videoId, {
      videoId,
      status: result.success ? 'completed' : 'error',
      progress: 100,
      currentStep: result.success ? '분석 완료' : result.error || '분석 실패',
      error: result.error,
    });

    res.json(result);
  } catch (error) {
    console.error('[Video API] Analysis error:', error);

    analysisProgress.set(videoId, {
      videoId,
      status: 'error',
      progress: 0,
      currentStep: '분석 실패',
      error: error instanceof Error ? error.message : 'Analysis failed',
    });

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Analysis failed',
    });
  }
});

/**
 * 분석 진행 상태 조회
 * GET /api/video/analyze/:videoId/progress
 */
router.get('/analyze/:videoId/progress', (req: Request, res: Response): void => {
  const { videoId } = req.params;
  const progress = analysisProgress.get(videoId);

  if (!progress) {
    res.status(404).json({ success: false, error: '분석 상태를 찾을 수 없습니다.' });
    return;
  }

  res.json(progress);
});

/**
 * 시나리오 생성
 * POST /api/video/generate-scenario
 */
router.post('/generate-scenario', async (req: Request, res: Response): Promise<void> => {
  try {
    const { detectedTaps, frames, options } = req.body;

    if (!detectedTaps || !Array.isArray(detectedTaps)) {
      res.status(400).json({ success: false, error: '감지된 탭 데이터가 필요합니다.' });
      return;
    }

    const result: ScenarioGenerationResult = videoParser.generateScenario(
      detectedTaps,
      frames || [],
      options || {}
    );

    res.json(result);
  } catch (error) {
    console.error('[Video API] Scenario generation error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Generation failed',
    });
  }
});

/**
 * 업로드된 비디오 목록
 * GET /api/video/list
 */
router.get('/list', (_req: Request, res: Response): void => {
  try {
    const files = fs.readdirSync(UPLOAD_DIR);
    const videos = files
      .filter((f) => /\.(mp4|webm|mov|avi)$/i.test(f))
      .map((f) => {
        const filePath = path.join(UPLOAD_DIR, f);
        const stats = fs.statSync(filePath);
        const videoId = path.basename(f, path.extname(f));
        const info = videoParser.getVideoInfo(filePath);

        return {
          videoId,
          filename: f,
          size: stats.size,
          createdAt: stats.birthtime,
          duration: info?.duration,
          fps: info?.fps,
          width: info?.width,
          height: info?.height,
        };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json({ success: true, videos });
  } catch (error) {
    console.error('[Video API] List error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list videos',
    });
  }
});

/**
 * 비디오 삭제
 * DELETE /api/video/:videoId
 */
router.delete('/:videoId', (req: Request, res: Response): void => {
  const { videoId } = req.params;

  try {
    const files = fs.readdirSync(UPLOAD_DIR);
    const videoFile = files.find((f) => f.startsWith(videoId));

    if (!videoFile) {
      res.status(404).json({ success: false, error: '비디오를 찾을 수 없습니다.' });
      return;
    }

    // 비디오 파일 삭제
    fs.unlinkSync(path.join(UPLOAD_DIR, videoFile));

    // 임시 파일 정리
    videoParser.cleanupTempFiles(videoId);

    // 분석 상태 제거
    analysisProgress.delete(videoId);

    res.json({ success: true, message: '비디오가 삭제되었습니다.' });
  } catch (error) {
    console.error('[Video API] Delete error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete video',
    });
  }
});

/**
 * 임시 파일 전체 정리
 * POST /api/video/cleanup
 */
router.post('/cleanup', (_req: Request, res: Response): void => {
  try {
    videoParser.cleanupAllTempFiles();
    res.json({ success: true, message: '임시 파일이 정리되었습니다.' });
  } catch (error) {
    console.error('[Video API] Cleanup error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Cleanup failed',
    });
  }
});

// ========================================
// 화면 녹화 API
// ========================================

/**
 * 녹화 시작
 * POST /api/video/record/start
 */
router.post('/record/start', async (req: Request, res: Response): Promise<void> => {
  try {
    const { deviceId, maxDuration, bitrate, resolution, bugReport, useScrcpy } = req.body;

    if (!deviceId) {
      res.status(400).json({ success: false, error: 'deviceId가 필요합니다.' });
      return;
    }

    const result = await screenRecorder.startRecording(deviceId, {
      maxDuration,
      bitrate,
      resolution,
      bugReport,
      useScrcpy,
    });

    res.json(result);
  } catch (error) {
    console.error('[Video API] Record start error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to start recording',
    });
  }
});

/**
 * scrcpy 설치 여부 확인
 * GET /api/video/record/scrcpy-available
 */
router.get('/record/scrcpy-available', async (_req: Request, res: Response): Promise<void> => {
  try {
    const available = await screenRecorder.isScrcpyAvailable();
    res.json({ success: true, available });
  } catch (error) {
    console.error('[Video API] scrcpy check error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to check scrcpy',
    });
  }
});

/**
 * 녹화 중지 및 파일 저장
 * POST /api/video/record/stop
 */
router.post('/record/stop', async (req: Request, res: Response): Promise<void> => {
  try {
    const { deviceId } = req.body;

    if (!deviceId) {
      res.status(400).json({ success: false, error: 'deviceId가 필요합니다.' });
      return;
    }

    const result = await screenRecorder.stopRecording(deviceId);
    res.json(result);
  } catch (error) {
    console.error('[Video API] Record stop error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to stop recording',
    });
  }
});

/**
 * 녹화 취소 (파일 저장 없이)
 * POST /api/video/record/cancel
 */
router.post('/record/cancel', async (req: Request, res: Response): Promise<void> => {
  try {
    const { deviceId } = req.body;

    if (!deviceId) {
      res.status(400).json({ success: false, error: 'deviceId가 필요합니다.' });
      return;
    }

    const result = await screenRecorder.cancelRecording(deviceId);
    res.json(result);
  } catch (error) {
    console.error('[Video API] Record cancel error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to cancel recording',
    });
  }
});

/**
 * 녹화 상태 조회
 * GET /api/video/record/status/:deviceId
 */
router.get('/record/status/:deviceId', (req: Request, res: Response): void => {
  try {
    const { deviceId } = req.params;
    const status = screenRecorder.getRecordingStatus(deviceId);

    res.json({
      success: true,
      recording: status !== null,
      status,
    });
  } catch (error) {
    console.error('[Video API] Record status error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get status',
    });
  }
});

/**
 * 모든 활성 녹화 목록
 * GET /api/video/record/active
 */
router.get('/record/active', (_req: Request, res: Response): void => {
  try {
    const recordings = screenRecorder.getActiveRecordings();
    res.json({ success: true, recordings });
  } catch (error) {
    console.error('[Video API] Active recordings error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get active recordings',
    });
  }
});

/**
 * 탭 표시 설정
 * POST /api/video/show-taps
 */
router.post('/show-taps', async (req: Request, res: Response): Promise<void> => {
  try {
    const { deviceId, enabled } = req.body;

    if (!deviceId || enabled === undefined) {
      res.status(400).json({ success: false, error: 'deviceId와 enabled가 필요합니다.' });
      return;
    }

    const result = await screenRecorder.setShowTaps(deviceId, enabled);
    res.json(result);
  } catch (error) {
    console.error('[Video API] Show taps error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to set show taps',
    });
  }
});

/**
 * 탭 표시 상태 조회
 * GET /api/video/show-taps/:deviceId
 */
router.get('/show-taps/:deviceId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { deviceId } = req.params;
    const result = await screenRecorder.getShowTaps(deviceId);
    res.json(result);
  } catch (error) {
    console.error('[Video API] Get show taps error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get show taps status',
    });
  }
});

export default router;
