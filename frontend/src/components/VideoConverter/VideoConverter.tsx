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
import { apiClient, API_BASE_URL } from '../../config/api';
import {
  RecordingSection,
  VideoUploader,
  VideoList,
  SettingsPanel,
  ConversionProgress,
  ResultPreview,
  Placeholder,
} from './components';
import type {
  VideoConverterProps,
  UploadedVideo,
  AnalysisResult,
  AnalysisProgress,
  RecordingStatus,
  AnalysisOptions,
  ScenarioNode,
  ScenarioEdge,
} from './components/types';
import './VideoConverter.css';

export default function VideoConverter({ onApplyScenario, devices = [] }: VideoConverterProps) {
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
  const [analysisOptions, setAnalysisOptions] = useState<AnalysisOptions>({
    fps: 10,
    doubleTapThreshold: 300,
    longPressThreshold: 500,
    swipeMinDistance: 50,
    detectionMethod: 'pointerLocation',
  });

  // 녹화 상태
  const [selectedDevice, setSelectedDevice] = useState<string>('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus | null>(null);
  const [showTaps, setShowTaps] = useState(false);
  const [recordingElapsed, setRecordingElapsed] = useState(0);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [useDeviceApp, setUseDeviceApp] = useState(false);
  const [deviceAppAvailable, setDeviceAppAvailable] = useState<boolean | null>(null);

  // 에러
  const [error, setError] = useState<string | null>(null);

  // Device App 설치 여부 확인
  const checkDeviceAppAvailable = async (deviceId: string) => {
    if (!deviceId) {
      setDeviceAppAvailable(null);
      return;
    }
    try {
      const res = await apiClient.get<{ success: boolean; installed: boolean; serviceRunning: boolean }>(
        `${API_BASE_URL}/api/video/record/device-app-available/${deviceId}`,
      );
      if (res.data.success) {
        setDeviceAppAvailable(res.data.serviceRunning);
      }
    } catch (err) {
      console.error('[VideoConverter] Failed to check Device App:', err);
      setDeviceAppAvailable(false);
    }
  };

  // 초기 로드
  useEffect(() => {
    loadVideos();
  }, []);

  // 디바이스 선택 시 Device App 확인
  useEffect(() => {
    checkDeviceAppAvailable(selectedDevice);
  }, [selectedDevice]);

  // 녹화 타이머
  useEffect(() => {
    if (isRecording) {
      recordingTimerRef.current = setInterval(() => {
        setRecordingElapsed((prev) => prev + 1);
      }, 1000);
    } else {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      setRecordingElapsed(0);
    }

    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    };
  }, [isRecording]);

  // 디바이스 변경 시 탭 표시 상태 확인
  useEffect(() => {
    if (selectedDevice) {
      checkShowTaps(selectedDevice);
    }
  }, [selectedDevice]);

  // 비디오 목록 로드
  const loadVideos = async () => {
    try {
      const res = await apiClient.get<{ success: boolean; videos: UploadedVideo[] }>(
        `${API_BASE_URL}/api/video/list`,
      );
      if (res.data.success) {
        setVideos(res.data.videos);
      }
    } catch (err) {
      console.error('[VideoConverter] Failed to load videos:', err);
    }
  };

  // 탭 표시 상태 확인
  const checkShowTaps = async (deviceId: string) => {
    try {
      const res = await apiClient.get<{ success: boolean; enabled?: boolean }>(
        `${API_BASE_URL}/api/video/show-taps/${deviceId}`,
      );
      if (res.data.success) {
        setShowTaps(res.data.enabled || false);
      }
    } catch (err) {
      console.error('[VideoConverter] Failed to check show taps:', err);
    }
  };

  // 탭 표시 토글
  const handleToggleShowTaps = async () => {
    if (!selectedDevice) return;

    try {
      const res = await apiClient.post<{ success: boolean; error?: string }>(
        `${API_BASE_URL}/api/video/show-taps`,
        { deviceId: selectedDevice, enabled: !showTaps },
      );
      if (res.data.success) {
        setShowTaps(!showTaps);
      } else {
        setError(res.data.error || '탭 표시 설정에 실패했습니다.');
      }
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.error || '탭 표시 설정에 실패했습니다.');
      }
    }
  };

  // 녹화 시작
  const handleStartRecording = async () => {
    if (!selectedDevice) {
      setError('디바이스를 선택해주세요.');
      return;
    }

    setError(null);

    try {
      const res = await apiClient.post<{
        success: boolean;
        sessionId?: string;
        method?: 'adb' | 'deviceApp';
        error?: string;
      }>(`${API_BASE_URL}/api/video/record/start`, {
        deviceId: selectedDevice,
        maxDuration: useDeviceApp ? undefined : 180,
        bugReport: showTaps,
        useDeviceApp,
      });

      if (res.data.success) {
        setIsRecording(true);
        setRecordingStatus({
          deviceId: selectedDevice,
          status: 'recording',
          startedAt: new Date().toISOString(),
        });
      } else {
        setError(res.data.error || '녹화 시작에 실패했습니다.');
      }
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.error || '녹화 시작에 실패했습니다.');
      }
    }
  };

  // 녹화 중지
  const handleStopRecording = async () => {
    if (!selectedDevice) return;

    setRecordingStatus((prev) =>
      prev ? { ...prev, status: 'stopping' } : null,
    );

    try {
      const res = await apiClient.post<{
        success: boolean;
        videoId?: string;
        localPath?: string;
        duration?: number;
        error?: string;
      }>(`${API_BASE_URL}/api/video/record/stop`, {
        deviceId: selectedDevice,
      });

      if (res.data.success) {
        setIsRecording(false);
        setRecordingStatus(null);
        await loadVideos();
      } else {
        setError(res.data.error || '녹화 중지에 실패했습니다.');
        setRecordingStatus((prev) =>
          prev ? { ...prev, status: 'error', error: res.data.error } : null,
        );
      }
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.error || '녹화 중지에 실패했습니다.');
      }
      setIsRecording(false);
    }
  };

  // 녹화 취소
  const handleCancelRecording = async () => {
    if (!selectedDevice) return;

    try {
      await apiClient.post(`${API_BASE_URL}/api/video/record/cancel`, {
        deviceId: selectedDevice,
      });
      setIsRecording(false);
      setRecordingStatus(null);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.error || '녹화 취소에 실패했습니다.');
      }
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
      const res = await apiClient.post(`${API_BASE_URL}/api/video/upload`, formData, {
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

  // 분석 옵션 변경
  const handleOptionsChange = (updates: Partial<AnalysisOptions>) => {
    setAnalysisOptions((prev) => ({ ...prev, ...updates }));
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
      const res = await apiClient.post<AnalysisResult>(
        `${API_BASE_URL}/api/video/analyze/${selectedVideo.videoId}`,
        {
          fps: analysisOptions.fps,
          doubleTapThreshold: analysisOptions.doubleTapThreshold,
          longPressThreshold: analysisOptions.longPressThreshold,
          swipeMinDistance: analysisOptions.swipeMinDistance,
          detectionMethod: analysisOptions.detectionMethod,
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
  }, [selectedVideo, analysisOptions]);

  // 시나리오 생성 및 적용
  const handleApply = async () => {
    if (!analysisResult?.detectedTaps.length) return;

    try {
      const res = await apiClient.post<{
        success: boolean;
        nodes: ScenarioNode[];
        edges: ScenarioEdge[];
        error?: string;
      }>(`${API_BASE_URL}/api/video/generate-scenario`, {
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
      await apiClient.delete(`${API_BASE_URL}/api/video/${videoId}`);
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

  // 비디오 선택
  const handleVideoSelect = (video: UploadedVideo) => {
    setSelectedVideo(video);
    setAnalysisResult(null);
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
        {/* 좌측: 녹화 + 비디오 목록 */}
        <div className="vc-sidebar">
          {/* 화면 녹화 섹션 */}
          <RecordingSection
            devices={devices}
            selectedDevice={selectedDevice}
            onDeviceChange={setSelectedDevice}
            isRecording={isRecording}
            recordingStatus={recordingStatus}
            recordingElapsed={recordingElapsed}
            showTaps={showTaps}
            onToggleShowTaps={handleToggleShowTaps}
            useDeviceApp={useDeviceApp}
            onToggleDeviceApp={setUseDeviceApp}
            deviceAppAvailable={deviceAppAvailable}
            onStartRecording={handleStartRecording}
            onStopRecording={handleStopRecording}
            onCancelRecording={handleCancelRecording}
          />

          <div className="vc-divider"></div>

          {/* 업로드 섹션 */}
          <VideoUploader
            isUploading={isUploading}
            uploadProgress={uploadProgress}
            onUpload={handleUpload}
          />

          {/* 비디오 목록 */}
          <VideoList
            videos={videos}
            selectedVideo={selectedVideo}
            onSelect={handleVideoSelect}
            onDelete={handleDelete}
          />
        </div>

        {/* 우측: 분석 영역 */}
        <div className="vc-main">
          {selectedVideo ? (
            <>
              {/* 분석 옵션 */}
              <SettingsPanel
                options={analysisOptions}
                onOptionsChange={handleOptionsChange}
                isAnalyzing={isAnalyzing}
                onAnalyze={handleAnalyze}
              />

              {/* 진행 상태 */}
              {analysisProgress && (
                <ConversionProgress
                  progress={analysisProgress}
                  isAnalyzing={isAnalyzing}
                />
              )}

              {/* 분석 결과 */}
              {analysisResult && (
                <ResultPreview
                  result={analysisResult}
                  onApply={handleApply}
                  canApply={!!onApplyScenario}
                />
              )}
            </>
          ) : (
            <Placeholder />
          )}
        </div>
      </div>
    </div>
  );
}
