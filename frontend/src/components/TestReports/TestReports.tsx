// frontend/src/components/TestReports/TestReports.tsx
// 통합 테스트 리포트 뷰어 (다중 시나리오 지원)

import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import {
  TestReport,
  TestReportListItem,
  ScenarioReportResult,
  DeviceScenarioResult,
  StepResult,
} from '../../types';
import './TestReports.css';

const API_BASE = 'http://127.0.0.1:3001';

export default function TestReports() {
  const [reports, setReports] = useState<TestReportListItem[]>([]);
  const [selectedReport, setSelectedReport] = useState<TestReport | null>(null);
  const [expandedScenarios, setExpandedScenarios] = useState<Set<string>>(new Set());
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [selectedScenarioKey, setSelectedScenarioKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportLoading, setExportLoading] = useState<'html' | 'pdf' | null>(null);

  // 비디오 타임라인 관련
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [hoveredStep, setHoveredStep] = useState<StepResult | null>(null);

  // 리포트 목록 조회
  const fetchReports = useCallback(async () => {
    try {
      const res = await axios.get<{
        success: boolean;
        reports: TestReportListItem[];
      }>(`${API_BASE}/api/test-reports`);

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
      setExpandedScenarios(new Set());
      setSelectedDeviceId(null);
      setSelectedScenarioKey(null);
      return;
    }

    setLoadingDetail(true);
    setExpandedScenarios(new Set());
    setSelectedDeviceId(null);
    setSelectedScenarioKey(null);

    try {
      const res = await axios.get<{
        success: boolean;
        report: TestReport;
      }>(`${API_BASE}/api/test-reports/${id}`);

      if (res.data.success) {
        setSelectedReport(res.data.report);
        // 첫 번째 시나리오 자동 펼침
        if (res.data.report.scenarioResults.length > 0) {
          const firstKey = `${res.data.report.scenarioResults[0].scenarioId}-${res.data.report.scenarioResults[0].repeatIndex}`;
          setExpandedScenarios(new Set([firstKey]));
          setSelectedScenarioKey(firstKey);
        }
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
      await axios.delete(`${API_BASE}/api/test-reports/${id}`);
      setReports(prev => prev.filter(r => r.id !== id));
      if (selectedReport?.id === id) {
        setSelectedReport(null);
        setExpandedScenarios(new Set());
        setSelectedDeviceId(null);
        setSelectedScenarioKey(null);
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
      await axios.delete(`${API_BASE}/api/test-reports`);
      setReports([]);
      setSelectedReport(null);
      setExpandedScenarios(new Set());
      setSelectedDeviceId(null);
      setSelectedScenarioKey(null);
    } catch (err) {
      console.error('전체 리포트 삭제 실패:', err);
      alert('전체 리포트 삭제에 실패했습니다.');
    }
  };

  // 시나리오 아코디언 토글
  const toggleScenario = (scenarioId: string, repeatIndex: number) => {
    const key = `${scenarioId}-${repeatIndex}`;
    setExpandedScenarios(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
    setSelectedDeviceId(null);
    setSelectedScenarioKey(key);
  };

  // 내보내기
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

      const url = `${API_BASE}/api/test-reports/${selectedReport.id}/export/${format}?${params}`;

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
      setTimeout(() => {
        setExportLoading(null);
      }, 1000);
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

  // 파일 크기 포맷
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
  };

  // 스크린샷 URL 생성
  const getScreenshotUrl = (screenshotPath: string) => {
    const normalizedPath = screenshotPath.replace(/\\/g, '/');
    const parts = normalizedPath.split('/');
    if (parts.length >= 4 && parts[0] === 'screenshots') {
      const [, reportId, deviceId, filename] = parts;
      return `${API_BASE}/api/test-reports/screenshots/${reportId}/${deviceId}/${filename}`;
    }
    const relativePath = normalizedPath.replace(/^screenshots\//, '');
    return `${API_BASE}/api/test-reports/screenshots/${relativePath}`;
  };

  // 비디오 URL 생성
  const getVideoUrl = (videoPath: string) => {
    const normalizedPath = videoPath.replace(/\\/g, '/');
    const parts = normalizedPath.split('/');
    if (parts.length >= 3 && parts[0] === 'videos') {
      const [, reportId, filename] = parts;
      return `${API_BASE}/api/test-reports/videos/${reportId}/${filename}`;
    }
    const relativePath = normalizedPath.replace(/^videos\//, '');
    return `${API_BASE}/api/test-reports/videos/${relativePath}`;
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
    videoRef.current.currentTime = (videoDurationMs / 1000) * percent;
  };

  // 시나리오 상태 아이콘/색상
  const getScenarioStatusClass = (status: ScenarioReportResult['status']) => {
    switch (status) {
      case 'passed': return 'status-passed';
      case 'failed': return 'status-failed';
      case 'partial': return 'status-partial';
      case 'skipped': return 'status-skipped';
      default: return '';
    }
  };

  const getScenarioStatusText = (status: ScenarioReportResult['status']) => {
    switch (status) {
      case 'passed': return '성공';
      case 'failed': return '실패';
      case 'partial': return '부분성공';
      case 'skipped': return '건너뜀';
      default: return status;
    }
  };

  // 디바이스 상태 아이콘
  const getDeviceStatusIcon = (result: DeviceScenarioResult) => {
    if (result.status === 'skipped') return '-';
    return result.success ? 'O' : 'X';
  };

  // 현재 선택된 시나리오 가져오기
  const getSelectedScenario = (): ScenarioReportResult | null => {
    if (!selectedReport || !selectedScenarioKey) return null;
    return selectedReport.scenarioResults.find(s =>
      `${s.scenarioId}-${s.repeatIndex}` === selectedScenarioKey,
    ) || null;
  };

  if (loading) {
    return (
      <div className="test-reports">
        <div className="reports-loading">
          <div className="spinner-large" />
          <p>리포트 로딩 중...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="test-reports">
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
    <div className="test-reports">
      {/* 헤더 */}
      <div className="reports-header">
        <div className="header-left">
          <h2>통합 테스트 리포트</h2>
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
              <small>테스트를 실행하면 리포트가 생성됩니다.</small>
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
                    className="report-delete-btn"
                    onClick={(e) => handleDeleteReport(report.id, e)}
                    title="삭제"
                  >
                    ×
                  </button>
                </div>
                <div className="report-name">
                  {report.testName || `테스트 ${report.scenarioCount}개 시나리오`}
                </div>
                {report.requesterName && (
                  <div className="report-requester">요청자: {report.requesterName}</div>
                )}
                <div className="report-date">{formatDate(report.createdAt)}</div>
                <div className="report-stats">
                  <span className={`status-badge ${report.status}`}>
                    {report.status === 'completed' ? '완료' :
                     report.status === 'partial' ? '부분완료' :
                     report.status === 'failed' ? '실패' : '중지'}
                  </span>
                  <span className="scenario-count">
                    {report.stats.passedScenarios}/{report.stats.totalScenarios} 시나리오
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
                  <h3>{selectedReport.executionInfo.testName || '테스트 리포트'}</h3>
                  <div className="export-buttons">
                    <button
                      className="btn-export btn-export-html"
                      onClick={() => handleExport('html')}
                      disabled={exportLoading !== null}
                    >
                      {exportLoading === 'html' ? '...' : 'HTML'}
                    </button>
                    <button
                      className="btn-export btn-export-pdf"
                      onClick={() => handleExport('pdf')}
                      disabled={exportLoading !== null}
                    >
                      {exportLoading === 'pdf' ? '...' : 'PDF'}
                    </button>
                  </div>
                </div>
                <div className="detail-meta">
                  <span>ID: {selectedReport.id}</span>
                  {selectedReport.executionInfo.requesterName && (
                    <span>요청자: {selectedReport.executionInfo.requesterName}</span>
                  )}
                  <span>시작: {formatDate(selectedReport.startedAt)}</span>
                  <span>완료: {formatDate(selectedReport.completedAt)}</span>
                </div>
                {selectedReport.executionInfo.forceCompleted && (
                  <div className="execution-warning">
                    부분 완료 (일부 디바이스 대기 포기)
                  </div>
                )}
              </div>

              {/* 통계 요약 */}
              <div className="detail-stats">
                <div className="stat-card">
                  <span className="stat-label">시나리오</span>
                  <span className="stat-value">
                    <span className="stat-success">{selectedReport.stats.passedScenarios}</span>
                    {' / '}
                    <span className="stat-total">{selectedReport.stats.totalScenarios}</span>
                    {selectedReport.stats.partialScenarios > 0 && (
                      <span className="stat-partial"> ({selectedReport.stats.partialScenarios} 부분)</span>
                    )}
                  </span>
                </div>
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
              </div>

              {/* 시나리오별 아코디언 */}
              <div className="scenarios-accordion">
                <h4>시나리오별 결과</h4>
                {selectedReport.scenarioResults.map(scenario => {
                  const key = `${scenario.scenarioId}-${scenario.repeatIndex}`;
                  const isExpanded = expandedScenarios.has(key);

                  return (
                    <div key={key} className="scenario-item">
                      {/* 시나리오 헤더 */}
                      <div
                        className={`scenario-header ${getScenarioStatusClass(scenario.status)}`}
                        onClick={() => toggleScenario(scenario.scenarioId, scenario.repeatIndex)}
                      >
                        <span className="scenario-expand">{isExpanded ? '▼' : '▶'}</span>
                        <span className="scenario-order">#{scenario.order}</span>
                        <span className="scenario-name">{scenario.scenarioName}</span>
                        {scenario.repeatIndex > 1 && (
                          <span className="scenario-repeat">반복 {scenario.repeatIndex}</span>
                        )}
                        <span className={`scenario-status ${getScenarioStatusClass(scenario.status)}`}>
                          {getScenarioStatusText(scenario.status)}
                        </span>
                        <span className="scenario-duration">
                          {formatDuration(scenario.duration)}
                        </span>
                        <span className="scenario-package">{scenario.packageName}</span>
                      </div>

                      {/* 시나리오 내용 (펼침 시) */}
                      {isExpanded && (
                        <div className="scenario-content">
                          {/* 디바이스 탭 */}
                          <div className="device-tabs">
                            {scenario.deviceResults.map(device => (
                              <button
                                key={device.deviceId}
                                className={`device-tab ${
                                  selectedDeviceId === device.deviceId ? 'active' : ''
                                } ${device.status === 'skipped' ? 'tab-skipped' :
                                    device.success ? 'tab-success' : 'tab-failed'}`}
                                onClick={() => setSelectedDeviceId(
                                  selectedDeviceId === device.deviceId ? null : device.deviceId,
                                )}
                              >
                                <span className="tab-icon">{getDeviceStatusIcon(device)}</span>
                                <span className="tab-name">{device.deviceName || device.deviceId}</span>
                                <span className="tab-duration">
                                  {device.status === 'skipped' ? '건너뜀' : formatDuration(device.duration)}
                                </span>
                              </button>
                            ))}
                          </div>

                          {/* 선택된 디바이스 상세 */}
                          {selectedDeviceId && (
                            <DeviceDetail
                              device={scenario.deviceResults.find(d => d.deviceId === selectedDeviceId)}
                              scenario={getSelectedScenario()}
                              formatDuration={formatDuration}
                              formatFileSize={formatFileSize}
                              getScreenshotUrl={getScreenshotUrl}
                              getVideoUrl={getVideoUrl}
                              videoRef={videoRef}
                              currentTime={currentTime}
                              hoveredStep={hoveredStep}
                              setHoveredStep={setHoveredStep}
                              handleVideoTimeUpdate={handleVideoTimeUpdate}
                              handleTimelineClick={handleTimelineClick}
                              handleTimelineMarkerClick={handleTimelineMarkerClick}
                              getStepPosition={getStepPosition}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
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

// 디바이스 상세 컴포넌트
function DeviceDetail({
  device,
  scenario,
  formatDuration,
  formatFileSize,
  getScreenshotUrl,
  getVideoUrl,
  videoRef,
  currentTime,
  hoveredStep,
  setHoveredStep,
  handleVideoTimeUpdate,
  handleTimelineClick,
  handleTimelineMarkerClick,
  getStepPosition,
}: {
  device?: DeviceScenarioResult;
  scenario: ScenarioReportResult | null;
  formatDuration: (ms: number | undefined) => string;
  formatFileSize: (bytes: number) => string;
  getScreenshotUrl: (path: string) => string;
  getVideoUrl: (path: string) => string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  currentTime: number;
  hoveredStep: StepResult | null;
  setHoveredStep: (step: StepResult | null) => void;
  handleVideoTimeUpdate: () => void;
  handleTimelineClick: (e: React.MouseEvent<HTMLDivElement>, videoDurationMs: number) => void;
  handleTimelineMarkerClick: (step: StepResult, videoStartTime: string, totalDuration: number) => void;
  getStepPosition: (step: StepResult, videoStartTime: string, totalDuration: number) => number;
}) {
  if (!device) return null;

  const calculateDuration = (startTime: string, endTime?: string): number | undefined => {
    if (!endTime) return undefined;
    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();
    if (isNaN(start) || isNaN(end)) return undefined;
    return end - start;
  };

  return (
    <div className="device-detail">
      <div className="device-header">
        <h5>
          {device.deviceName || device.deviceId}
          <span className={`status ${
            device.status === 'skipped' ? 'status-skipped' :
            device.success ? 'status-success' : 'status-failed'
          }`}>
            {device.status === 'skipped' ? '건너뜀' : device.success ? '성공' : '실패'}
          </span>
        </h5>
        {device.status === 'skipped' && device.skippedReason && (
          <div className="device-skipped-reason">사유: {device.skippedReason}</div>
        )}
        {device.error && (
          <div className="device-error">{device.error}</div>
        )}
      </div>

      {/* 단계별 결과 */}
      <div className="steps-list">
        <h6>실행 단계</h6>
        {device.status === 'skipped' ? (
          <p className="no-steps">이 디바이스는 실행되지 않았습니다.</p>
        ) : device.steps.length === 0 ? (
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
              {device.steps.map((step, idx) => {
                const duration = step.duration ?? calculateDuration(step.startTime, step.endTime);
                return (
                  <tr key={`${step.nodeId}-${idx}`} className={`step-row ${step.status}`}>
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
      {device.video && (
        <div className="video-section">
          <h6>실행 영상</h6>
          <div className="video-container">
            <video
              ref={videoRef}
              key={`video-${device.deviceId}-${device.video.path}`}
              controls
              preload="metadata"
              className="video-player"
              onTimeUpdate={handleVideoTimeUpdate}
            >
              <source
                src={getVideoUrl(device.video.path)}
                type="video/mp4"
              />
              브라우저가 비디오를 지원하지 않습니다.
            </video>

            {/* 비디오 타임라인 - 스텝 마커 */}
            {device.video.duration > 0 && device.steps.length > 0 && scenario && (
              <div
                className="video-timeline"
                onClick={(e) => handleTimelineClick(e, device.video!.duration)}
              >
                {/* 진행 바 */}
                <div
                  className="timeline-progress"
                  style={{ width: `${(currentTime / (device.video.duration / 1000)) * 100}%` }}
                />

                {/* 스텝 마커 */}
                {device.steps.map((step, idx) => {
                  const position = getStepPosition(
                    step,
                    scenario.startedAt,
                    device.video!.duration,
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
                          scenario.startedAt,
                          device.video!.duration,
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
              <span>재생시간: {formatDuration(device.video.duration)}</span>
              <span>파일크기: {formatFileSize(device.video.size)}</span>
            </div>
          </div>
        </div>
      )}

      {/* 스크린샷 */}
      {device.screenshots.length > 0 && (
        <div className="screenshots-section">
          <h6>스크린샷 ({device.screenshots.length})</h6>
          <div className="screenshots-grid">
            {device.screenshots.map((screenshot, idx) => {
              const matchingStep = device.steps.find(s => s.nodeId === screenshot.nodeId);
              const actionName = matchingStep?.nodeName || screenshot.nodeId;

              return (
                <div
                  key={`${screenshot.nodeId}-${idx}`}
                  className={`screenshot-item ${screenshot.type}`}
                >
                  <img
                    src={getScreenshotUrl(screenshot.path)}
                    alt={`${actionName} - ${screenshot.type}`}
                    loading="lazy"
                    onClick={() => window.open(getScreenshotUrl(screenshot.path), '_blank')}
                  />
                  <div className="screenshot-info">
                    <span className="screenshot-node">{actionName}</span>
                    <span className={`screenshot-type ${screenshot.type}`}>
                      {screenshot.type === 'step' ? '단계' :
                       screenshot.type === 'failed' ? '실패' :
                       screenshot.type === 'highlight' ? '이미지인식' : '최종'}
                    </span>
                    {screenshot.type === 'highlight' && screenshot.confidence && (
                      <span className="screenshot-confidence">
                        {(screenshot.confidence * 100).toFixed(1)}%
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
