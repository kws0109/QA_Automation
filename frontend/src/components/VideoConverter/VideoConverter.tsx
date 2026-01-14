/**
 * 비디오 시나리오 변환기 컴포넌트
 *
 * 녹화된 비디오에서 탭 동작을 감지하여 시나리오로 변환합니다.
 * Android "탭한 항목 표시" 개발자 옵션을 활용합니다.
 *
 * 이 컴포넌트는 격리되어 있어 삭제 시 다른 부분에 영향을 주지 않습니다.
 *
 * 삭제 방법:
 * 1. frontend/src/components/VideoConverter/ 폴더 삭제
 * 2. App.tsx에서 관련 import 및 탭 제거
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import './VideoConverter.css';

const API_BASE = 'http://127.0.0.1:3001';

// ========================================
// 타입 정의
// ========================================

interface DetectedTap {
  frameNumber: number;
  timestamp: number;
  x: number;
  y: number;
  confidence: number;
  type: 'tap' | 'longPress' | 'swipe';
  endX?: number;
  endY?: number;
  direction?: 'up' | 'down' | 'left' | 'right';
}

interface VideoInfo {
  filename: string;
  duration: number;
  fps: number;
  width: number;
  height: number;
  totalFrames: number;
}

interface AnalysisResult {
  success: boolean;
  videoInfo: VideoInfo;
  detectedTaps: DetectedTap[];
  stats: {
    analyzedFrames: number;
    tapCount: number;
    longPressCount: number;
    swipeCount: number;
    processingTime: number;
  };
  error?: string;
}

interface UploadedVideo {
  videoId: string;
  filename: string;
  size: number;
  createdAt: string;
  duration?: number;
  fps?: number;
  width?: number;
  height?: number;
}

interface AnalysisProgress {
  videoId: string;
  status: 'pending' | 'extracting' | 'analyzing' | 'generating' | 'completed' | 'error';
  progress: number;
  currentStep: string;
  error?: string;
}

interface ScenarioNode {
  id: string;
  type: string;
  action?: string;
  label?: string;
  data?: Record<string, unknown>;
}

interface ScenarioEdge {
  id: string;
  source: string;
  target: string;
}

interface ScenarioOutput {
  nodes: ScenarioNode[];
  edges: ScenarioEdge[];
}

interface VideoConverterProps {
  onApplyScenario?: (scenario: ScenarioOutput) => void;
}

// ========================================
// 메인 컴포넌트
// ========================================

export default function VideoConverter({ onApplyScenario }: VideoConverterProps) {
  // 업로드 상태
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 비디오 목록
  const [videos, setVideos] = useState<UploadedVideo[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<UploadedVideo | null>(null);

  // 분석 상태
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgress | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);

  // 분석 옵션
  const [fps, setFps] = useState(10);
  const [doubleTapThreshold, setDoubleTapThreshold] = useState(300);
  const [longPressThreshold, setLongPressThreshold] = useState(500);
  const [swipeMinDistance, setSwipeMinDistance] = useState(50);

  // 에러
  const [error, setError] = useState<string | null>(null);

  // 초기 로드
  useEffect(() => {
    loadVideos();
  }, []);

  // 비디오 목록 로드
  const loadVideos = async () => {
    try {
      const res = await axios.get<{ success: boolean; videos: UploadedVideo[] }>(
        `${API_BASE}/api/video/list`,
      );
      if (res.data.success) {
        setVideos(res.data.videos);
      }
    } catch (err) {
      console.error('[VideoConverter] Failed to load videos:', err);
    }
  };

  // 파일 업로드
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadProgress(0);
    setError(null);

    const formData = new FormData();
    formData.append('video', file);

    try {
      const res = await axios.post(`${API_BASE}/api/video/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          const percent = Math.round(
            (progressEvent.loaded * 100) / (progressEvent.total || 1),
          );
          setUploadProgress(percent);
        },
      });

      if (res.data.success) {
        await loadVideos();
        // 업로드된 비디오 자동 선택
        const uploaded: UploadedVideo = {
          videoId: res.data.videoId,
          filename: res.data.filename,
          size: res.data.size,
          createdAt: new Date().toISOString(),
          duration: res.data.duration,
          fps: res.data.fps,
          width: res.data.width,
          height: res.data.height,
        };
        setSelectedVideo(uploaded);
      }
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.error || '업로드에 실패했습니다.');
      }
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // 분석 시작
  const handleAnalyze = useCallback(async () => {
    if (!selectedVideo) {
      setError('비디오를 선택해주세요.');
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setAnalysisResult(null);
    setAnalysisProgress({
      videoId: selectedVideo.videoId,
      status: 'pending',
      progress: 0,
      currentStep: '분석 시작...',
    });

    try {
      const res = await axios.post<AnalysisResult>(
        `${API_BASE}/api/video/analyze/${selectedVideo.videoId}`,
        {
          fps,
          doubleTapThreshold,
          longPressThreshold,
          swipeMinDistance,
        },
      );

      if (res.data.success) {
        setAnalysisResult(res.data);
        setAnalysisProgress({
          videoId: selectedVideo.videoId,
          status: 'completed',
          progress: 100,
          currentStep: '분석 완료',
        });
      } else {
        setError(res.data.error || '분석에 실패했습니다.');
        setAnalysisProgress({
          videoId: selectedVideo.videoId,
          status: 'error',
          progress: 0,
          currentStep: res.data.error || '분석 실패',
        });
      }
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.error || '분석에 실패했습니다.');
      }
      setAnalysisProgress(null);
    } finally {
      setIsAnalyzing(false);
    }
  }, [selectedVideo, fps, doubleTapThreshold, longPressThreshold, swipeMinDistance]);

  // 시나리오 생성 및 적용
  const handleApply = async () => {
    if (!analysisResult?.detectedTaps.length) return;

    try {
      const res = await axios.post<{
        success: boolean;
        nodes: ScenarioNode[];
        edges: ScenarioEdge[];
        error?: string;
      }>(`${API_BASE}/api/video/generate-scenario`, {
        detectedTaps: analysisResult.detectedTaps,
        frames: [],
        options: {
          insertWaitSteps: true,
        },
      });

      if (res.data.success && onApplyScenario) {
        onApplyScenario({
          nodes: res.data.nodes,
          edges: res.data.edges,
        });
      } else {
        setError(res.data.error || '시나리오 생성에 실패했습니다.');
      }
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.error || '시나리오 생성에 실패했습니다.');
      }
    }
  };

  // 비디오 삭제
  const handleDelete = async (videoId: string) => {
    if (!confirm('이 비디오를 삭제하시겠습니까?')) return;

    try {
      await axios.delete(`${API_BASE}/api/video/${videoId}`);
      await loadVideos();
      if (selectedVideo?.videoId === videoId) {
        setSelectedVideo(null);
        setAnalysisResult(null);
      }
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.error || '삭제에 실패했습니다.');
      }
    }
  };

  // 파일 크기 포맷
  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // 시간 포맷
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // 탭 타입 아이콘
  const getTapIcon = (type: string): string => {
    const icons: Record<string, string> = {
      tap: '👆',
      longPress: '👇',
      swipe: '↔️',
    };
    return icons[type] || '❓';
  };

  return (
    <div className="video-converter">
      {/* 헤더 */}
      <div className="vc-header">
        <div className="vc-title">
          <h2>비디오 시나리오 변환</h2>
          <span className="vc-badge">Beta</span>
        </div>
        <p className="vc-description">
          Android 개발자 옵션의 &quot;탭한 항목 표시&quot;를 활성화하고 녹화한 비디오에서
          터치 동작을 자동으로 감지합니다.
        </p>
      </div>

      {/* 에러 메시지 */}
      {error && (
        <div className="vc-error">
          {error}
        </div>
      )}

      <div className="vc-content">
        {/* 좌측: 비디오 목록 */}
        <div className="vc-sidebar">
          <div className="vc-upload-section">
            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,video/webm,video/quicktime,video/x-msvideo"
              onChange={handleUpload}
              disabled={isUploading}
              hidden
            />
            <button
              className="vc-upload-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              {isUploading ? `업로드 중... ${uploadProgress}%` : '비디오 업로드'}
            </button>
          </div>

          <div className="vc-video-list">
            <h3>업로드된 비디오</h3>
            {videos.length === 0 ? (
              <p className="vc-empty">업로드된 비디오가 없습니다.</p>
            ) : (
              videos.map((video) => (
                <div
                  key={video.videoId}
                  className={`vc-video-item ${selectedVideo?.videoId === video.videoId ? 'selected' : ''}`}
                  onClick={() => {
                    setSelectedVideo(video);
                    setAnalysisResult(null);
                  }}
                >
                  <div className="vc-video-info">
                    <span className="vc-video-name">{video.filename}</span>
                    <span className="vc-video-meta">
                      {formatSize(video.size)}
                      {video.duration && ` | ${formatDuration(video.duration)}`}
                      {video.width && video.height && ` | ${video.width}x${video.height}`}
                    </span>
                  </div>
                  <button
                    className="vc-delete-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(video.videoId);
                    }}
                  >
                    X
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 우측: 분석 영역 */}
        <div className="vc-main">
          {selectedVideo ? (
            <>
              {/* 분석 옵션 */}
              <div className="vc-options">
                <h3>분석 옵션</h3>
                <div className="vc-options-grid">
                  <div className="vc-option">
                    <label>분석 FPS</label>
                    <input
                      type="number"
                      value={fps}
                      onChange={(e) => setFps(Number(e.target.value))}
                      min={1}
                      max={30}
                    />
                    <span className="vc-option-hint">초당 분석할 프레임 수</span>
                  </div>
                  <div className="vc-option">
                    <label>더블탭 임계값 (ms)</label>
                    <input
                      type="number"
                      value={doubleTapThreshold}
                      onChange={(e) => setDoubleTapThreshold(Number(e.target.value))}
                      min={100}
                      max={1000}
                    />
                    <span className="vc-option-hint">연속 탭 간격</span>
                  </div>
                  <div className="vc-option">
                    <label>롱프레스 임계값 (ms)</label>
                    <input
                      type="number"
                      value={longPressThreshold}
                      onChange={(e) => setLongPressThreshold(Number(e.target.value))}
                      min={200}
                      max={2000}
                    />
                    <span className="vc-option-hint">길게 누르기 판정 시간</span>
                  </div>
                  <div className="vc-option">
                    <label>스와이프 최소 거리 (px)</label>
                    <input
                      type="number"
                      value={swipeMinDistance}
                      onChange={(e) => setSwipeMinDistance(Number(e.target.value))}
                      min={20}
                      max={200}
                    />
                    <span className="vc-option-hint">스와이프로 판정할 최소 이동 거리</span>
                  </div>
                </div>

                <button
                  className="vc-analyze-btn"
                  onClick={handleAnalyze}
                  disabled={isAnalyzing}
                >
                  {isAnalyzing ? '분석 중...' : '분석 시작'}
                </button>

                {/* 진행 상태 */}
                {analysisProgress && isAnalyzing && (
                  <div className="vc-progress">
                    <div className="vc-progress-bar">
                      <div
                        className="vc-progress-fill"
                        style={{ width: `${analysisProgress.progress}%` }}
                      />
                    </div>
                    <span className="vc-progress-text">
                      {analysisProgress.currentStep} ({analysisProgress.progress}%)
                    </span>
                  </div>
                )}
              </div>

              {/* 분석 결과 */}
              {analysisResult && (
                <div className="vc-result">
                  {/* 요약 */}
                  <div className="vc-summary">
                    <div className="vc-summary-item">
                      <span className="vc-summary-label">분석 프레임</span>
                      <span className="vc-summary-value">{analysisResult.stats.analyzedFrames}</span>
                    </div>
                    <div className="vc-summary-item">
                      <span className="vc-summary-label">탭</span>
                      <span className="vc-summary-value">{analysisResult.stats.tapCount}</span>
                    </div>
                    <div className="vc-summary-item">
                      <span className="vc-summary-label">롱프레스</span>
                      <span className="vc-summary-value">{analysisResult.stats.longPressCount}</span>
                    </div>
                    <div className="vc-summary-item">
                      <span className="vc-summary-label">스와이프</span>
                      <span className="vc-summary-value">{analysisResult.stats.swipeCount}</span>
                    </div>
                    <div className="vc-summary-item">
                      <span className="vc-summary-label">처리 시간</span>
                      <span className="vc-summary-value">{analysisResult.stats.processingTime}ms</span>
                    </div>
                  </div>

                  {/* 감지된 탭 목록 */}
                  <div className="vc-taps">
                    <h3>감지된 터치 동작</h3>
                    {analysisResult.detectedTaps.length === 0 ? (
                      <p className="vc-empty">감지된 터치가 없습니다.</p>
                    ) : (
                      <div className="vc-taps-list">
                        {analysisResult.detectedTaps.map((tap, index) => (
                          <div key={index} className="vc-tap-item">
                            <span className="vc-tap-icon">{getTapIcon(tap.type)}</span>
                            <span className="vc-tap-index">{index + 1}</span>
                            <span className="vc-tap-type">{tap.type}</span>
                            <span className="vc-tap-coords">
                              ({tap.x}, {tap.y})
                              {tap.type === 'swipe' && tap.endX !== undefined && (
                                <> → ({tap.endX}, {tap.endY})</>
                              )}
                            </span>
                            <span className="vc-tap-time">
                              {formatDuration(tap.timestamp / 1000)}
                            </span>
                            <span className="vc-tap-confidence">
                              {Math.round(tap.confidence * 100)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 적용 버튼 */}
                  <div className="vc-apply-section">
                    <button
                      className="vc-apply-btn"
                      onClick={handleApply}
                      disabled={!onApplyScenario || analysisResult.detectedTaps.length === 0}
                    >
                      시나리오에 적용
                    </button>
                    <span className="vc-apply-hint">
                      {analysisResult.detectedTaps.length}개의 터치 동작이 시나리오 노드로 변환됩니다.
                    </span>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="vc-placeholder">
              <p>비디오를 업로드하거나 선택해주세요.</p>
              <div className="vc-instructions">
                <h4>사용 방법</h4>
                <ol>
                  <li>Android 기기에서 개발자 옵션 → &quot;탭한 항목 표시&quot; 활성화</li>
                  <li>화면을 녹화하며 테스트 시나리오 수행</li>
                  <li>녹화된 비디오 업로드</li>
                  <li>분석 시작 → 터치 동작 자동 감지</li>
                  <li>시나리오에 적용</li>
                </ol>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
