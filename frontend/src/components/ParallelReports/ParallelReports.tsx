// frontend/src/components/ParallelReports/ParallelReports.tsx

import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import {
  ParallelReport,
  ParallelReportListItem,
  StepResult,
} from '../../types';
import './ParallelReports.css';

const API_BASE = 'http://localhost:3001';

export default function ParallelReports() {
  const [reports, setReports] = useState<ParallelReportListItem[]>([]);
  const [selectedReport, setSelectedReport] = useState<ParallelReport | null>(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportLoading, setExportLoading] = useState<'html' | 'pdf' | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [r2Enabled, setR2Enabled] = useState(false);

  // 비디오 타임라인 관련
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [hoveredStep, setHoveredStep] = useState<StepResult | null>(null);

  // 리포트 목록 조회
  const fetchReports = useCallback(async () => {
    try {
      const res = await axios.get<{
        success: boolean;
        reports: ParallelReportListItem[];
      }>(`${API_BASE}/api/session/parallel/reports`);

      if (res.data.success) {
        setReports(res.data.reports);
      }
    } catch (err) {
      console.error('리포트 목록 조회 실패:', err);
      setError('리포트 목록을 불러올 수 없습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  // R2 상태 확인
  const checkR2Status = useCallback(async () => {
    try {
      const res = await axios.get<{
        success: boolean;
        enabled: boolean;
      }>(`${API_BASE}/api/session/parallel/r2/status`);

      if (res.data.success) {
        setR2Enabled(res.data.enabled);
      }
    } catch (err) {
      console.error('R2 상태 확인 실패:', err);
      setR2Enabled(false);
    }
  }, []);

  // 초기 로드
  useEffect(() => {
    fetchReports();
    checkR2Status();
  }, [fetchReports, checkR2Status]);

  // 리포트 상세 조회
  const handleSelectReport = async (id: string) => {
    if (selectedReport?.id === id) {
      setSelectedReport(null);
      setSelectedDeviceId(null);
      setShareUrl(null);
      return;
    }

    setLoadingDetail(true);
    setSelectedDeviceId(null);
    setShareUrl(null);

    try {
      const res = await axios.get<{
        success: boolean;
        report: ParallelReport;
      }>(`${API_BASE}/api/session/parallel/reports/${id}`);

      if (res.data.success) {
        setSelectedReport(res.data.report);
      }
    } catch (err) {
      console.error('리포트 상세 조회 실패:', err);
      setError('리포트 상세 정보를 불러올 수 없습니다.');
    } finally {
      setLoadingDetail(false);
    }
  };

  // 리포트 삭제
  const handleDeleteReport = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (!confirm('이 리포트를 삭제하시겠습니까?')) {
      return;
    }

    try {
      await axios.delete(`${API_BASE}/api/session/parallel/reports/${id}`);
      setReports(prev => prev.filter(r => r.id !== id));
      if (selectedReport?.id === id) {
        setSelectedReport(null);
        setSelectedDeviceId(null);
      }
    } catch (err) {
      console.error('리포트 삭제 실패:', err);
      alert('리포트 삭제에 실패했습니다.');
    }
  };

  // 모든 리포트 삭제
  const handleDeleteAllReports = async () => {
    if (!confirm('모든 리포트를 삭제하시겠습니까?')) {
      return;
    }

    try {
      await axios.delete(`${API_BASE}/api/session/parallel/reports`);
      setReports([]);
      setSelectedReport(null);
      setSelectedDeviceId(null);
    } catch (err) {
      console.error('전체 리포트 삭제 실패:', err);
      alert('전체 리포트 삭제에 실패했습니다.');
    }
  };

  // 날짜 포맷
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 소요 시간 포맷
  const formatDuration = (ms: number | undefined) => {
    if (ms === undefined || isNaN(ms)) return '-';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const min = Math.floor(ms / 60000);
    const sec = Math.round((ms % 60000) / 1000);
    return `${min}m ${sec}s`;
  };

  // startTime, endTime으로 duration 계산
  const calculateDuration = (startTime: string, endTime?: string): number | undefined => {
    if (!endTime) return undefined;
    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();
    if (isNaN(start) || isNaN(end)) return undefined;
    return end - start;
  };

  // 성공률 계산
  const getSuccessRate = (stats: ParallelReportListItem['stats']) => {
    if (stats.totalDevices === 0) return 0;
    return Math.round((stats.successDevices / stats.totalDevices) * 100);
  };

  // 스크린샷 URL 생성
  const getScreenshotUrl = (screenshotPath: string) => {
    // path 형식: screenshots/{reportId}/{deviceId}/{filename}
    // Windows 백슬래시도 처리
    const normalizedPath = screenshotPath.replace(/\\/g, '/');
    const parts = normalizedPath.split('/');

    if (parts.length >= 4 && parts[0] === 'screenshots') {
      const [, reportId, deviceId, filename] = parts;
      return `${API_BASE}/api/session/parallel/screenshots/${reportId}/${deviceId}/${filename}`;
    }

    // fallback - screenshots/ 접두사 제거
    const relativePath = normalizedPath.replace(/^screenshots\//, '');
    return `${API_BASE}/api/session/parallel/screenshots/${relativePath}`;
  };

  // 비디오 URL 생성
  const getVideoUrl = (videoPath: string) => {
    // path 형식: videos/{reportId}/{filename}
    const normalizedPath = videoPath.replace(/\\/g, '/');
    const parts = normalizedPath.split('/');

    if (parts.length >= 3 && parts[0] === 'videos') {
      const [, reportId, filename] = parts;
      return `${API_BASE}/api/session/parallel/videos/${reportId}/${filename}`;
    }

    // fallback
    const relativePath = normalizedPath.replace(/^videos\//, '');
    return `${API_BASE}/api/session/parallel/videos/${relativePath}`;
  };

  // 파일 크기 포맷
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
  };

  // 리포트 내보내기
  const handleExport = async (format: 'html' | 'pdf') => {
    if (!selectedReport) return;

    setExportLoading(format);

    try {
      const params = new URLSearchParams({
        screenshots: 'true',
      });

      if (format === 'pdf') {
        params.append('paper', 'A4');
        params.append('orientation', 'portrait');
      }

      const url = `${API_BASE}/api/session/parallel/reports/${selectedReport.id}/export/${format}?${params}`;

      // 다운로드 트리거
      const link = document.createElement('a');
      link.href = url;
      link.download = `report-${selectedReport.id}.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error(`${format.toUpperCase()} 내보내기 실패:`, err);
      alert(`${format.toUpperCase()} 내보내기에 실패했습니다.`);
    } finally {
      // 약간의 지연 후 로딩 상태 해제 (다운로드 시작 확인)
      setTimeout(() => {
        setExportLoading(null);
      }, 1000);
    }
  };

  // 리포트 공유 링크 생성
  const handleShare = async () => {
    if (!selectedReport) return;

    setShareLoading(true);
    setShareUrl(null);

    try {
      const res = await axios.post<{
        success: boolean;
        url: string;
        uploadedAt: string;
        error?: string;
      }>(`${API_BASE}/api/session/parallel/reports/${selectedReport.id}/share`);

      if (res.data.success) {
        setShareUrl(res.data.url);
        // 클립보드에 복사
        await navigator.clipboard.writeText(res.data.url);
        alert('공유 링크가 클립보드에 복사되었습니다.');
      } else {
        alert(res.data.error || '공유 링크 생성에 실패했습니다.');
      }
    } catch (err) {
      console.error('공유 링크 생성 실패:', err);
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        alert(err.response.data.error);
      } else {
        alert('공유 링크 생성에 실패했습니다.');
      }
    } finally {
      setShareLoading(false);
    }
  };

  // 공유 URL 복사
  const handleCopyShareUrl = async () => {
    if (!shareUrl) return;

    try {
      await navigator.clipboard.writeText(shareUrl);
      alert('링크가 클립보드에 복사되었습니다.');
    } catch (err) {
      console.error('복사 실패:', err);
    }
  };

  // 비디오 타임라인: 스텝 위치 계산 (0-100%)
  const getStepPosition = (step: StepResult, videoStartTime: string, totalDuration: number): number => {
    if (!step.startTime || totalDuration === 0) return 0;
    const stepTime = new Date(step.startTime).getTime();
    const videoStart = new Date(videoStartTime).getTime();
    const offsetMs = stepTime - videoStart;
    const position = (offsetMs / totalDuration) * 100;
    return Math.max(0, Math.min(100, position));
  };

  // 비디오 타임라인: 마커 클릭 시 해당 시점으로 이동
  const handleTimelineMarkerClick = (step: StepResult, videoStartTime: string, totalDuration: number) => {
    if (!videoRef.current || totalDuration === 0) return;
    const stepTime = new Date(step.startTime).getTime();
    const videoStart = new Date(videoStartTime).getTime();
    const offsetMs = stepTime - videoStart;
    const seekTime = Math.max(0, offsetMs / 1000);
    videoRef.current.currentTime = seekTime;
  };

  // 비디오 메타데이터 로드 (placeholder for future use)
  const handleVideoLoadedMetadata = () => {
    // 비디오 duration은 deviceResult.video.duration을 사용하므로 여기서는 별도 처리 불필요
  };

  // 비디오 재생 시간 업데이트
  const handleVideoTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  // 타임라인 클릭으로 비디오 시크
  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>, videoDurationMs: number) => {
    if (!videoRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = x / rect.width;
    // videoDurationMs는 ms 단위, currentTime은 초 단위
    videoRef.current.currentTime = (videoDurationMs / 1000) * percent;
  };

  if (loading) {
    return (
      <div className="parallel-reports">
        <div className="reports-loading">
          <div className="spinner-large" />
          <p>리포트 로딩 중...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="parallel-reports">
        <div className="reports-error">
          <p>{error}</p>
          <button onClick={() => { setError(null); fetchReports(); }}>
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="parallel-reports">
      {/* 헤더 */}
      <div className="reports-header">
        <div className="header-left">
          <h2>병렬 실행 리포트</h2>
          <span className="report-count">{reports.length}개 리포트</span>
        </div>
        <div className="header-right">
          <button
            className="btn-refresh"
            onClick={() => { setLoading(true); fetchReports(); }}
          >
            새로고침
          </button>
          {reports.length > 0 && (
            <button
              className="btn-delete-all"
              onClick={handleDeleteAllReports}
            >
              전체 삭제
            </button>
          )}
        </div>
      </div>

      <div className="reports-content">
        {/* 리포트 목록 */}
        <div className="reports-list">
          {reports.length === 0 ? (
            <div className="no-reports">
              <p>리포트가 없습니다.</p>
              <small>병렬 실행을 진행하면 리포트가 생성됩니다.</small>
            </div>
          ) : (
            reports.map(report => (
              <div
                key={report.id}
                className={`report-item ${selectedReport?.id === report.id ? 'selected' : ''}`}
                onClick={() => handleSelectReport(report.id)}
              >
                <div className="report-header">
                  <span className="report-id">{report.id}</span>
                  <button
                    className="btn-delete"
                    onClick={(e) => handleDeleteReport(report.id, e)}
                    title="삭제"
                  >
                    X
                  </button>
                </div>
                <div className="report-name">{report.scenarioName}</div>
                <div className="report-date">{formatDate(report.createdAt)}</div>
                <div className="report-stats">
                  <span
                    className={`success-rate ${
                      getSuccessRate(report.stats) === 100 ? 'perfect' :
                      getSuccessRate(report.stats) >= 50 ? 'partial' : 'failed'
                    }`}
                  >
                    {getSuccessRate(report.stats)}% 성공
                  </span>
                  <span className="device-count">
                    {report.stats.successDevices}/{report.stats.totalDevices} 디바이스
                  </span>
                  <span className="duration">
                    {formatDuration(report.stats.totalDuration)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* 리포트 상세 */}
        <div className="report-detail">
          {loadingDetail ? (
            <div className="detail-loading">
              <div className="spinner" />
              <p>로딩 중...</p>
            </div>
          ) : selectedReport ? (
            <>
              {/* 리포트 정보 */}
              <div className="detail-header">
                <div className="header-top">
                  <h3>{selectedReport.scenarioName}</h3>
                  <div className="export-buttons">
                    <button
                      className="btn-export btn-export-html"
                      onClick={() => handleExport('html')}
                      disabled={exportLoading !== null}
                    >
                      {exportLoading === 'html' ? 'Exporting...' : 'HTML'}
                    </button>
                    <button
                      className="btn-export btn-export-pdf"
                      onClick={() => handleExport('pdf')}
                      disabled={exportLoading !== null}
                    >
                      {exportLoading === 'pdf' ? 'Exporting...' : 'PDF'}
                    </button>
                    {r2Enabled && (
                      <button
                        className="btn-export btn-export-share"
                        onClick={handleShare}
                        disabled={shareLoading}
                      >
                        {shareLoading ? 'Uploading...' : 'Share'}
                      </button>
                    )}
                  </div>
                </div>
                {shareUrl && (
                  <div className="share-url-container">
                    <input
                      type="text"
                      value={shareUrl}
                      readOnly
                      className="share-url-input"
                    />
                    <button
                      className="btn-copy-url"
                      onClick={handleCopyShareUrl}
                    >
                      Copy
                    </button>
                  </div>
                )}
                <div className="detail-meta">
                  <span>ID: {selectedReport.id}</span>
                  <span>시나리오: {selectedReport.scenarioId}</span>
                  <span>시작: {formatDate(selectedReport.startedAt)}</span>
                  <span>완료: {formatDate(selectedReport.completedAt)}</span>
                </div>
              </div>

              {/* 통계 요약 */}
              <div className="detail-stats">
                <div className="stat-card">
                  <span className="stat-label">디바이스</span>
                  <span className="stat-value">
                    <span className="stat-success">{selectedReport.stats.successDevices}</span>
                    {' / '}
                    <span className="stat-total">{selectedReport.stats.totalDevices}</span>
                  </span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">단계</span>
                  <span className="stat-value">
                    <span className="stat-success">{selectedReport.stats.passedSteps}</span>
                    {' / '}
                    <span className="stat-total">{selectedReport.stats.totalSteps}</span>
                  </span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">총 소요시간</span>
                  <span className="stat-value">
                    {formatDuration(selectedReport.stats.totalDuration)}
                  </span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">평균 소요시간</span>
                  <span className="stat-value">
                    {formatDuration(selectedReport.stats.avgDuration)}
                  </span>
                </div>
              </div>

              {/* 디바이스별 결과 탭 */}
              <div className="device-tabs">
                {selectedReport.deviceResults.map(result => (
                  <button
                    key={result.deviceId}
                    className={`device-tab ${
                      selectedDeviceId === result.deviceId ? 'active' : ''
                    } ${result.success ? 'tab-success' : 'tab-failed'}`}
                    onClick={() => setSelectedDeviceId(
                      selectedDeviceId === result.deviceId ? null : result.deviceId
                    )}
                  >
                    <span className="tab-icon">{result.success ? 'O' : 'X'}</span>
                    <span className="tab-name">{result.deviceName || result.deviceId}</span>
                    <span className="tab-duration">{formatDuration(result.duration)}</span>
                  </button>
                ))}
              </div>

              {/* 선택된 디바이스 상세 */}
              {selectedDeviceId && (
                <div className="device-detail">
                  {(() => {
                    const deviceResult = selectedReport.deviceResults.find(
                      r => r.deviceId === selectedDeviceId
                    );
                    if (!deviceResult) return null;

                    return (
                      <>
                        <div className="device-header">
                          <h4>
                            {deviceResult.deviceName || deviceResult.deviceId}
                            <span className={`status ${deviceResult.success ? 'status-success' : 'status-failed'}`}>
                              {deviceResult.success ? '성공' : '실패'}
                            </span>
                          </h4>
                          {deviceResult.error && (
                            <div className="device-error">
                              {deviceResult.error}
                            </div>
                          )}
                        </div>

                        {/* 단계별 결과 */}
                        <div className="steps-list">
                          <h5>실행 단계</h5>
                          {deviceResult.steps.length === 0 ? (
                            <p className="no-steps">실행된 단계가 없습니다.</p>
                          ) : (
                            <table className="steps-table">
                              <thead>
                                <tr>
                                  <th>노드</th>
                                  <th>액션</th>
                                  <th>상태</th>
                                  <th>소요시간</th>
                                  <th>에러</th>
                                </tr>
                              </thead>
                              <tbody>
                                {deviceResult.steps.map((step, idx) => {
                                  const duration = step.duration ?? calculateDuration(step.startTime, step.endTime);
                                  return (
                                    <tr
                                      key={`${step.nodeId}-${idx}`}
                                      className={`step-row ${step.status}`}
                                    >
                                      <td className="step-node">{step.nodeId}</td>
                                      <td className="step-action">{step.nodeName || step.nodeType}</td>
                                      <td className={`step-status ${step.status}`}>
                                        {step.status === 'passed' ? 'O' :
                                        step.status === 'failed' ? 'X' :
                                        step.status === 'error' ? '!' :
                                        step.status === 'waiting' ? '...' : step.status}
                                      </td>
                                      <td className="step-duration">{formatDuration(duration)}</td>
                                      <td className="step-error">{step.error || '-'}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          )}
                        </div>

                        {/* 비디오 */}
                        {deviceResult.video && (
                          <div className="video-section">
                            <h5>실행 영상</h5>
                            <div className="video-container">
                              {/* key를 추가하여 디바이스 변경 시 비디오 요소를 강제로 다시 마운트 */}
                              <video
                                ref={videoRef}
                                key={`video-${deviceResult.deviceId}-${deviceResult.video.path}`}
                                controls
                                preload="metadata"
                                className="video-player"
                                onLoadedMetadata={handleVideoLoadedMetadata}
                                onTimeUpdate={handleVideoTimeUpdate}
                              >
                                <source
                                  src={getVideoUrl(deviceResult.video.path)}
                                  type="video/mp4"
                                />
                                브라우저가 비디오를 지원하지 않습니다.
                              </video>

                              {/* 비디오 타임라인 - 스텝 마커 */}
                              {deviceResult.video.duration > 0 && deviceResult.steps.length > 0 && (
                                <div className="video-timeline" onClick={(e) => handleTimelineClick(e, deviceResult.video!.duration)}>
                                  {/* 진행 바 - currentTime은 초 단위, video.duration은 ms 단위 */}
                                  <div
                                    className="timeline-progress"
                                    style={{ width: `${(currentTime / (deviceResult.video.duration / 1000)) * 100}%` }}
                                  />

                                  {/* 스텝 마커 */}
                                  {deviceResult.steps.map((step, idx) => {
                                    const position = getStepPosition(
                                      step,
                                      selectedReport.startedAt,
                                      deviceResult.video!.duration
                                    );
                                    if (position < 0 || position > 100) return null;

                                    return (
                                      <div
                                        key={`marker-${step.nodeId}-${idx}`}
                                        className={`timeline-marker ${step.status}`}
                                        style={{ left: `${position}%` }}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleTimelineMarkerClick(
                                            step,
                                            selectedReport.startedAt,
                                            deviceResult.video!.duration
                                          );
                                        }}
                                        onMouseEnter={() => setHoveredStep(step)}
                                        onMouseLeave={() => setHoveredStep(null)}
                                      >
                                        {hoveredStep?.nodeId === step.nodeId && hoveredStep?.status === step.status && (
                                          <div className="marker-tooltip">
                                            <span className="tooltip-node">{step.nodeId}</span>
                                            <span className="tooltip-action">
                                              {step.nodeName || step.nodeType}
                                            </span>
                                            <span className={`tooltip-status ${step.status}`}>
                                              {step.status === 'passed' ? '성공' :
                                               step.status === 'failed' ? '실패' :
                                               step.status === 'error' ? '에러' :
                                               step.status === 'waiting' ? '대기' : step.status}
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}

                              <div className="video-info">
                                <span>재생시간: {formatDuration(deviceResult.video.duration)}</span>
                                <span>파일크기: {formatFileSize(deviceResult.video.size)}</span>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* 스크린샷 */}
                        {deviceResult.screenshots.length > 0 && (
                          <div className="screenshots-section">
                            <h5>스크린샷 ({deviceResult.screenshots.length})</h5>
                            <div className="screenshots-grid">
                              {deviceResult.screenshots.map((screenshot, idx) => (
                                <div
                                  key={`${screenshot.nodeId}-${idx}`}
                                  className={`screenshot-item ${screenshot.type}`}
                                >
                                  <img
                                    src={getScreenshotUrl(screenshot.path)}
                                    alt={`${screenshot.nodeId} - ${screenshot.type}`}
                                    loading="lazy"
                                    onClick={() => window.open(getScreenshotUrl(screenshot.path), '_blank')}
                                  />
                                  <div className="screenshot-info">
                                    <span className="screenshot-node">{screenshot.nodeId}</span>
                                    <span className={`screenshot-type ${screenshot.type}`}>
                                      {screenshot.type === 'step' ? '단계' :
                                       screenshot.type === 'error' ? '에러' :
                                       screenshot.type === 'highlight' ? '이미지인식' : '최종'}
                                    </span>
                                    {screenshot.type === 'highlight' && screenshot.confidence && (
                                      <span className="screenshot-confidence">
                                        {(screenshot.confidence * 100).toFixed(1)}%
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </>
          ) : (
            <div className="no-selection">
              <p>리포트를 선택하세요</p>
              <small>왼쪽 목록에서 리포트를 클릭하면 상세 내용을 볼 수 있습니다.</small>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
