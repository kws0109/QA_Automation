// frontend/src/components/ParallelReports/ParallelReports.tsx

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  ParallelReport,
  ParallelReportListItem,
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

  // 초기 로드
  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  // 리포트 상세 조회
  const handleSelectReport = async (id: string) => {
    if (selectedReport?.id === id) {
      setSelectedReport(null);
      setSelectedDeviceId(null);
      return;
    }

    setLoadingDetail(true);
    setSelectedDeviceId(null);

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
                <h3>{selectedReport.scenarioName}</h3>
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
                                        step.status === 'skipped' ? '-' : '!'}
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
                                key={`video-${deviceResult.deviceId}-${deviceResult.video.path}`}
                                controls
                                preload="metadata"
                                className="video-player"
                              >
                                <source
                                  src={getVideoUrl(deviceResult.video.path)}
                                  type="video/mp4"
                                />
                                브라우저가 비디오를 지원하지 않습니다.
                              </video>
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
                                       screenshot.type === 'error' ? '에러' : '최종'}
                                    </span>
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
