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
import { asyncHandler, syncHandler, BadRequestError, NotFoundError } from '../utils/asyncHandler';

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
router.post('/upload', upload.single('video'), syncHandler((req: Request, res: Response): void => {
  if (!req.file) {
    throw new BadRequestError('비디오 파일이 필요합니다.');
  }

  const videoId = path.basename(req.file.filename, path.extname(req.file.filename));

  // 비디오 정보 추출 (손상된 파일 예외 처리)
  let videoInfo = null;
  try {
    videoInfo = videoParser.getVideoInfo(req.file.path);
  } catch (err) {
    console.warn('[Video API] Could not read video info (file may be corrupted):', err instanceof Error ? err.message : err);
  }

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
    corrupted: videoInfo === null,
  });
}));

/**
 * 비디오 분석 시작
 * POST /api/video/analyze/:videoId
 */
router.post('/analyze/:videoId', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { videoId } = req.params;
  const { fps, doubleTapThreshold, longPressThreshold, swipeMinDistance } = req.body;

  // 비디오 파일 찾기
  const files = fs.readdirSync(UPLOAD_DIR);
  const videoFile = files.find((f) => f.startsWith(videoId));

  if (!videoFile) {
    throw new NotFoundError('비디오를 찾을 수 없습니다.');
  }

  const videoPath = path.join(UPLOAD_DIR, videoFile);

  // 분석 상태 초기화
  analysisProgress.set(videoId, {
    videoId,
    status: 'pending',
    progress: 0,
    currentStep: '분석 준비 중...',
  });

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
}));

/**
 * 분석 진행 상태 조회
 * GET /api/video/analyze/:videoId/progress
 */
router.get('/analyze/:videoId/progress', syncHandler((req: Request, res: Response): void => {
  const { videoId } = req.params;
  const progress = analysisProgress.get(videoId);

  if (!progress) {
    throw new NotFoundError('분석 상태를 찾을 수 없습니다.');
  }

  res.json(progress);
}));

/**
 * 시나리오 생성
 * POST /api/video/generate-scenario
 */
router.post('/generate-scenario', syncHandler((req: Request, res: Response): void => {
  const { detectedTaps, frames, options } = req.body;

  if (!detectedTaps || !Array.isArray(detectedTaps)) {
    throw new BadRequestError('감지된 탭 데이터가 필요합니다.');
  }

  const result: ScenarioGenerationResult = videoParser.generateScenario(
    detectedTaps,
    frames || [],
    options || {}
  );

  res.json(result);
}));

/**
 * 업로드된 비디오 목록
 * GET /api/video/list
 */
router.get('/list', syncHandler((_req: Request, res: Response): void => {
  const files = fs.readdirSync(UPLOAD_DIR);
  const videos = files
    .filter((f) => /\.(mp4|webm|mov|avi)$/i.test(f))
    .map((f) => {
      const filePath = path.join(UPLOAD_DIR, f);
      const stats = fs.statSync(filePath);
      const videoId = path.basename(f, path.extname(f));

      // 손상된 파일에 대한 예외 처리
      let info = null;
      let corrupted = false;
      try {
        info = videoParser.getVideoInfo(filePath);
      } catch (err) {
        console.warn(`[Video API] Corrupted video file: ${f}`, err instanceof Error ? err.message : err);
        corrupted = true;
      }

      return {
        videoId,
        filename: f,
        size: stats.size,
        createdAt: stats.birthtime,
        duration: info?.duration,
        fps: info?.fps,
        width: info?.width,
        height: info?.height,
        corrupted,
      };
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  res.json({ success: true, videos });
}));

/**
 * 비디오 삭제
 * DELETE /api/video/:videoId
 */
router.delete('/:videoId', syncHandler((req: Request, res: Response): void => {
  const { videoId } = req.params;

  const files = fs.readdirSync(UPLOAD_DIR);
  const videoFile = files.find((f) => f.startsWith(videoId));

  if (!videoFile) {
    throw new NotFoundError('비디오를 찾을 수 없습니다.');
  }

  // 비디오 파일 삭제
  fs.unlinkSync(path.join(UPLOAD_DIR, videoFile));

  // 임시 파일 정리
  videoParser.cleanupTempFiles(videoId);

  // 분석 상태 제거
  analysisProgress.delete(videoId);

  res.json({ success: true, message: '비디오가 삭제되었습니다.' });
}));

/**
 * 임시 파일 전체 정리
 * POST /api/video/cleanup
 */
router.post('/cleanup', syncHandler((_req: Request, res: Response): void => {
  videoParser.cleanupAllTempFiles();
  res.json({ success: true, message: '임시 파일이 정리되었습니다.' });
}));

// ========================================
// 화면 녹화 API
// ========================================

/**
 * 녹화 시작
 * POST /api/video/record/start
 * @body deviceId - 디바이스 ID
 * @body maxDuration - 최대 녹화 시간 (초)
 * @body bitrate - 비트레이트 (Mbps)
 * @body resolution - 해상도 (예: "720x1280")
 * @body bugReport - 버그 리포트 모드
 * @body useDeviceApp - Device App 사용 여부
 */
router.post('/record/start', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { deviceId, maxDuration, bitrate, resolution, bugReport, useDeviceApp } = req.body;

  if (!deviceId) {
    throw new BadRequestError('deviceId가 필요합니다.');
  }

  const result = await screenRecorder.startRecording(deviceId, {
    maxDuration,
    bitrate,
    resolution,
    bugReport,
    useDeviceApp,
  });

  res.json(result);
}));

/**
 * Device App (QA Recorder) 설치 여부 확인 (Beta)
 * GET /api/video/record/device-app-available/:deviceId
 */
router.get('/record/device-app-available/:deviceId', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { deviceId } = req.params;
  const installed = await screenRecorder.isDeviceAppAvailable(deviceId);
  const serviceRunning = installed ? await screenRecorder.isDeviceAppServiceRunning(deviceId) : false;

  res.json({
    success: true,
    installed,
    serviceRunning,
    message: !installed
      ? 'QA Recorder 앱이 설치되어 있지 않습니다.'
      : !serviceRunning
        ? '앱을 실행하고 서비스를 시작해주세요.'
        : '사용 가능합니다.',
  });
}));

/**
 * 녹화 중지 및 파일 저장
 * POST /api/video/record/stop
 */
router.post('/record/stop', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { deviceId } = req.body;

  if (!deviceId) {
    throw new BadRequestError('deviceId가 필요합니다.');
  }

  const result = await screenRecorder.stopRecording(deviceId);
  res.json(result);
}));

/**
 * 녹화 취소 (파일 저장 없이)
 * POST /api/video/record/cancel
 */
router.post('/record/cancel', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { deviceId } = req.body;

  if (!deviceId) {
    throw new BadRequestError('deviceId가 필요합니다.');
  }

  const result = await screenRecorder.cancelRecording(deviceId);
  res.json(result);
}));

/**
 * 녹화 상태 조회
 * GET /api/video/record/status/:deviceId
 */
router.get('/record/status/:deviceId', syncHandler((req: Request, res: Response): void => {
  const { deviceId } = req.params;
  const status = screenRecorder.getRecordingStatus(deviceId);

  res.json({
    success: true,
    recording: status !== null,
    status,
  });
}));

/**
 * 모든 활성 녹화 목록
 * GET /api/video/record/active
 */
router.get('/record/active', syncHandler((_req: Request, res: Response): void => {
  const recordings = screenRecorder.getActiveRecordings();
  res.json({ success: true, recordings });
}));

/**
 * 탭 표시 설정
 * POST /api/video/show-taps
 */
router.post('/show-taps', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { deviceId, enabled } = req.body;

  if (!deviceId || enabled === undefined) {
    throw new BadRequestError('deviceId와 enabled가 필요합니다.');
  }

  const result = await screenRecorder.setShowTaps(deviceId, enabled);
  res.json(result);
}));

/**
 * 탭 표시 상태 조회
 * GET /api/video/show-taps/:deviceId
 */
router.get('/show-taps/:deviceId', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { deviceId } = req.params;
  const result = await screenRecorder.getShowTaps(deviceId);
  res.json(result);
}));

export default router;
