// frontend/src/components/TestReports/TestReports.tsx
// 통합 테스트 리포트 뷰어 (다중 시나리오 지원)

import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { Socket } from 'socket.io-client';
import {
  TestReport,
  TestReportListItem,
  ScenarioReportResult,
  DeviceScenarioResult,
  StepResult,
} from '../../types';
import './TestReports.css';

const API_BASE = 'http://127.0.0.1:3001';

interface TestReportsProps {
  socket: Socket | null;
}

export default function TestReports({ socket }: TestReportsProps) {
  const [reports, setReports] = useState<TestReportListItem[]>([]);
  const [selectedReport, setSelectedReport] = useState<TestReport | null>(null);
  const [expandedScenarios, setExpandedScenarios] = useState<Set<string>>(new Set());
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportLoading, setExportLoading] = useState<'html' | 'pdf' | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [includeSuccessVideos, setIncludeSuccessVideos] = useState(true);

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

  // Socket.IO: 새 리포트 생성 시 자동 새로고침
  useEffect(() => {
    if (!socket) return;

    const handleReportCreated = () => {
      console.log('[TestReports] 새 리포트 생성됨 - 목록 새로고침');
      fetchReports();
    };

    socket.on('report:created', handleReportCreated);

    return () => {
      socket.off('report:created', handleReportCreated);
    };
  }, [socket, fetchReports]);

  // 리포트 상세 조회
  const handleSelectReport = async (id: string) => {
    if (selectedReport?.id === id) {
      setSelectedReport(null);
      setExpandedScenarios(new Set());
      setSelectedDeviceIds({});
      return;
    }

    setLoadingDetail(true);
    setExpandedScenarios(new Set());
    setSelectedDeviceIds({});

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
        setSelectedDeviceIds({});
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
      setSelectedDeviceIds({});
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
        // 닫을 때만 해당 시나리오의 디바이스 선택 해제
        setSelectedDeviceIds(prevDevices => {
          const updated = { ...prevDevices };
          delete updated[key];
          return updated;
        });
      } else {
        next.add(key);
      }
      return next;
    });
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

      // fetch로 파일 다운로드 (에러 처리 개선)
      const response = await fetch(url);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: '알 수 없는 오류' }));
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }

      // Blob으로 변환 후 다운로드
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `report-${selectedReport.id}.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      console.error(`${format.toUpperCase()} 내보내기 실패:`, err);
      alert(`${format.toUpperCase()} 내보내기에 실패했습니다.\n${err instanceof Error ? err.message : ''}`);
    } finally {
      setExportLoading(null);
    }
  };

  // R2 업로드
  const handleUpload = async () => {
    if (!selectedReport) return;

    setUploadLoading(true);

    try {
      const params = new URLSearchParams();
      if (includeSuccessVideos) {
        params.append('includeSuccessVideos', 'true');
      }

      const res = await axios.post<{
        success: boolean;
        urls: {
          html: string;
          pdf: string;
          videos: { deviceId: string; deviceName: string; url: string; success: boolean }[];
        };
        summary: {
          videosUploaded: number;
          videosSkipped: number;
          includeSuccessVideos: boolean;
        };
        message?: string;
      }>(`${API_BASE}/api/test-reports/${selectedReport.id}/upload?${params}`);

      if (res.data.success) {
        const { urls, summary } = res.data;
        alert(
          '✅ R2 업로드 완료!\n\n' +
            `HTML: ${urls.html}\n` +
            `PDF: ${urls.pdf}\n\n` +
            `비디오: ${summary.videosUploaded}개 업로드, ${summary.videosSkipped}개 건너뜀`,
        );
      } else {
        throw new Error(res.data.message || '업로드 실패');
      }
    } catch (err) {
      console.error('R2 업로드 실패:', err);
      const message = axios.isAxiosError(err) && err.response?.data?.message
        ? err.response.data.message
        : err instanceof Error ? err.message : '알 수 없는 오류';
      alert(`R2 업로드에 실패했습니다.\n${message}`);
    } finally {
      setUploadLoading(false);
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

  // duration 정규화: 초 단위(오래된 리포트)와 ms 단위(새 리포트) 모두 지원
  // 1000 미만이면 초 단위로 간주
  const normalizeDurationToMs = (duration: number): number => {
    if (duration < 1000) {
      return duration * 1000; // 초 → ms
    }
    return duration; // 이미 ms
  };

  // 비디오 타임라인: 스텝 위치 계산 (2-98% 범위로 제한하여 가장자리 마커가 잘리지 않도록 함)
  const getStepPosition = (step: StepResult, videoStartTime: string, totalDuration: number): number => {
    if (!step.startTime || totalDuration === 0) return 2;
    const normalizedDuration = normalizeDurationToMs(totalDuration);
    const stepTime = new Date(step.startTime).getTime();
    const videoStart = new Date(videoStartTime).getTime();
    const offsetMs = stepTime - videoStart;
    const position = (offsetMs / normalizedDuration) * 100;
    // 2-98% 범위로 제한하여 마커가 가장자리에서 잘리지 않도록 함
    return Math.max(2, Math.min(98, position));
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
                      disabled={exportLoading !== null || uploadLoading}
                    >
                      {exportLoading === 'html' ? '...' : 'HTML'}
                    </button>
                    <button
                      className="btn-export btn-export-pdf"
                      onClick={() => handleExport('pdf')}
                      disabled={exportLoading !== null || uploadLoading}
                    >
                      {exportLoading === 'pdf' ? '...' : 'PDF'}
                    </button>
                    <div className="upload-section">
                      <button
                        className="btn-export btn-export-cloud"
                        onClick={handleUpload}
                        disabled={exportLoading !== null || uploadLoading}
                        title="Cloudflare R2에 업로드"
                      >
                        {uploadLoading ? '업로드 중...' : '☁️ R2'}
                      </button>
                      <label className="upload-checkbox" title="성공한 테스트 비디오도 업로드">
                        <input
                          type="checkbox"
                          checked={includeSuccessVideos}
                          onChange={(e) => setIncludeSuccessVideos(e.target.checked)}
                          disabled={uploadLoading}
                        />
                        <span>성공 비디오</span>
                      </label>
                    </div>
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
                  <span className="stat-label">평균 소요시간</span>
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
                                  selectedDeviceIds[key] === device.deviceId ? 'active' : ''
                                } ${device.status === 'skipped' ? 'tab-skipped' :
                                    device.success ? 'tab-success' : 'tab-failed'}`}
                                onClick={() => setSelectedDeviceIds(prev => ({
                                  ...prev,
                                  [key]: prev[key] === device.deviceId ? null : device.deviceId,
                                }))}
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
                          {selectedDeviceIds[key] && (
                            <DeviceDetail
                              key={`${key}-${selectedDeviceIds[key]}`}
                              device={scenario.deviceResults.find(d => d.deviceId === selectedDeviceIds[key])}
                              scenario={scenario}
                              formatDuration={formatDuration}
                              formatFileSize={formatFileSize}
                              getScreenshotUrl={getScreenshotUrl}
                              getVideoUrl={getVideoUrl}
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

// 디바이스 상세 컴포넌트 (각 인스턴스가 독립적인 비디오 상태를 가짐)
function DeviceDetail({
  device,
  scenario,
  formatDuration,
  formatFileSize,
  getScreenshotUrl,
  getVideoUrl,
  getStepPosition,
}: {
  device?: DeviceScenarioResult;
  scenario: ScenarioReportResult | null;
  formatDuration: (ms: number | undefined) => string;
  formatFileSize: (bytes: number) => string;
  getScreenshotUrl: (path: string) => string;
  getVideoUrl: (path: string) => string;
  getStepPosition: (step: StepResult, videoStartTime: string, totalDuration: number) => number;
}) {
  // 각 DeviceDetail 인스턴스가 독립적인 비디오 상태를 가짐
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [hoveredStep, setHoveredStep] = useState<StepResult | null>(null);

  // duration을 ms로 정규화하는 헬퍼 함수
  const normalizeDurationToMs = (duration: number): number => {
    return duration < 1000 ? duration * 1000 : duration;
  };

  // 비디오 시점 이동 (마커 클릭, 테이블 행 클릭 공용)
  // offsetSeconds: 추가 오프셋 (대기 완료 마커는 -1초)
  const seekToTime = (startTime: string | undefined, videoStartTime: string | undefined, offsetSeconds: number = 0) => {
    if (!videoRef.current || !startTime || !videoStartTime) return;
    const stepTime = new Date(startTime).getTime();
    const videoStart = new Date(videoStartTime).getTime();
    if (isNaN(stepTime) || isNaN(videoStart)) return;
    const offsetMs = stepTime - videoStart;
    const seekTime = Math.max(0, (offsetMs / 1000) + offsetSeconds);
    videoRef.current.currentTime = seekTime;
  };

  // 비디오 타임라인: 마커 클릭 시 해당 시점으로 이동
  const handleTimelineMarkerClick = (step: StepResult, videoStartTime: string, _totalDuration: number) => {
    seekToTime(step.startTime, videoStartTime);
  };

  // 비디오 재생 시간 업데이트
  const handleVideoTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  // 타임라인 클릭으로 비디오 시크
  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>, videoDuration: number) => {
    if (!videoRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = x / rect.width;
    // duration을 ms로 정규화 후 초로 변환
    const normalizedDurationMs = normalizeDurationToMs(videoDuration);
    videoRef.current.currentTime = (normalizedDurationMs / 1000) * percent;
  };

  if (!device) return null;

  // 같은 nodeId를 가진 연속된 스텝들을 하나의 그룹으로 병합
  // (대기 액션의 waiting + passed/failed 스텝을 하나로 표시)
  interface StepGroup {
    nodeId: string;
    nodeName: string;
    nodeType: string;
    steps: StepResult[];  // 원본 스텝들 (타임라인용)
    status: string;       // 최종 상태
    startTime: string;    // 첫 번째 스텝의 시작 시간
    endTime?: string;     // 마지막 스텝의 종료 시간
    duration?: number;    // 전체 소요 시간
    error?: string;       // 에러 메시지
    hasWaiting: boolean;  // 대기 단계가 있는지 여부
  }

  const groupStepsByNode = (steps: StepResult[]): StepGroup[] => {
    const groups: StepGroup[] = [];
    let currentGroup: StepGroup | null = null;

    for (const step of steps) {
      if (currentGroup && currentGroup.nodeId === step.nodeId) {
        // 같은 노드 -> 기존 그룹에 추가
        currentGroup.steps.push(step);
        currentGroup.status = step.status;
        currentGroup.endTime = step.endTime;
        if (step.error) currentGroup.error = step.error;
        if (step.status === 'waiting') currentGroup.hasWaiting = true;
      } else {
        // 새 노드 -> 새 그룹 시작
        if (currentGroup) groups.push(currentGroup);
        currentGroup = {
          nodeId: step.nodeId,
          nodeName: step.nodeName,
          nodeType: step.nodeType,
          steps: [step],
          status: step.status,
          startTime: step.startTime,
          endTime: step.endTime,
          error: step.error,
          hasWaiting: step.status === 'waiting',
        };
      }
    }
    if (currentGroup) groups.push(currentGroup);

    // duration 계산
    for (const group of groups) {
      if (group.startTime && group.endTime) {
        group.duration = new Date(group.endTime).getTime() - new Date(group.startTime).getTime();
      } else if (group.steps.length > 0) {
        // endTime이 없으면 각 스텝의 duration 합산
        group.duration = group.steps.reduce((sum, s) => sum + (s.duration || 0), 0);
      }
    }

    return groups;
  };

  const stepGroups = groupStepsByNode(device.steps);

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

      {/* QA 확장: 환경 정보 */}
      {(device.environment || device.appInfo) && (
        <div className="qa-environment-section">
          <h6>환경 정보</h6>
          <div className="environment-grid">
            {device.environment && (
              <div className="env-group">
                <div className="env-group-title">디바이스</div>
                <div className="env-item"><span>모델:</span> {device.environment.brand} {device.environment.model}</div>
                <div className="env-item"><span>Android:</span> {device.environment.androidVersion} (SDK {device.environment.sdkVersion})</div>
                <div className="env-item"><span>해상도:</span> {device.environment.screenResolution}</div>
                <div className="env-item"><span>배터리:</span> {device.environment.batteryLevel}% ({device.environment.batteryStatus})</div>
                <div className="env-item"><span>메모리:</span> {device.environment.availableMemory}MB / {device.environment.totalMemory}MB</div>
                <div className="env-item"><span>네트워크:</span> {device.environment.networkType}</div>
              </div>
            )}
            {device.appInfo && (
              <div className="env-group">
                <div className="env-group-title">앱 정보</div>
                <div className="env-item"><span>패키지:</span> {device.appInfo.packageName}</div>
                {device.appInfo.appName && <div className="env-item"><span>앱 이름:</span> {device.appInfo.appName}</div>}
                {device.appInfo.versionName && <div className="env-item"><span>버전:</span> {device.appInfo.versionName} ({device.appInfo.versionCode})</div>}
                {device.appInfo.targetSdk && <div className="env-item"><span>Target SDK:</span> {device.appInfo.targetSdk}</div>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* QA 확장: 성능 요약 */}
      {device.performanceSummary && (
        <div className="qa-performance-section">
          <h6>성능 메트릭</h6>
          <div className="performance-grid">
            <div className="perf-item">
              <span className="perf-label">평균 단계 시간</span>
              <span className="perf-value">{formatDuration(device.performanceSummary.avgStepDuration)}</span>
            </div>
            <div className="perf-item">
              <span className="perf-label">최대 단계 시간</span>
              <span className="perf-value">{formatDuration(device.performanceSummary.maxStepDuration)}</span>
            </div>
            <div className="perf-item">
              <span className="perf-label">총 대기 시간</span>
              <span className="perf-value">{formatDuration(device.performanceSummary.totalWaitTime)}</span>
            </div>
            <div className="perf-item">
              <span className="perf-label">총 액션 시간</span>
              <span className="perf-value">{formatDuration(device.performanceSummary.totalActionTime)}</span>
            </div>
            {device.performanceSummary.imageMatchCount && device.performanceSummary.imageMatchCount > 0 && (
              <div className="perf-item">
                <span className="perf-label">이미지 매칭</span>
                <span className="perf-value">{device.performanceSummary.imageMatchCount}회 (평균 {formatDuration(device.performanceSummary.imageMatchAvgTime || 0)})</span>
              </div>
            )}
          </div>
        </div>
      )}

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
              {stepGroups.map((group, idx) => (
                // 대기 액션인 경우 그룹 내 모든 스텝을 개별 행으로 표시
                group.hasWaiting && group.steps.length > 1 ? (
                  group.steps.map((step, stepIdx) => {
                    // 대기 완료(waiting이 아닌 스텝)는 -1초 오프셋 적용 (마커와 동일)
                    const isWaitingEnd = step.status !== 'waiting' && stepIdx > 0;
                    return (
                    <tr
                      key={`${group.nodeId}-${idx}-${stepIdx}`}
                      className={`step-row ${step.status} clickable ${step.status === 'waiting' ? 'waiting-start' : 'waiting-end'}`}
                      onClick={() => scenario && device.video && seekToTime(step.startTime, device.video.startedAt, isWaitingEnd ? -1 : 0)}
                      title="클릭하면 해당 시점으로 영상 이동"
                    >
                      <td className="step-node">
                        {stepIdx === 0 ? group.nodeId : ''}
                      </td>
                      <td className="step-action">
                        {step.nodeName || step.nodeType}
                        <span className="waiting-phase">
                          {step.status === 'waiting' ? ' (시작)' : ' (완료)'}
                        </span>
                      </td>
                      <td className={`step-status ${step.status}`}>
                        {step.status === 'passed' ? 'O' :
                         step.status === 'failed' ? 'X' :
                         step.status === 'error' ? '!' :
                         step.status === 'waiting' ? '...' : step.status}
                      </td>
                      <td className="step-duration">
                        {step.status === 'waiting' ? '-' : formatDuration(step.duration)}
                      </td>
                      <td className="step-error">{step.error || '-'}</td>
                    </tr>
                  );})
                ) : (
                  <tr
                    key={`${group.nodeId}-${idx}`}
                    className={`step-row ${group.status} clickable`}
                    onClick={() => scenario && device.video && seekToTime(group.startTime, device.video.startedAt)}
                    title="클릭하면 해당 시점으로 영상 이동"
                  >
                    <td className="step-node">
                      {group.nodeId}
                      {group.hasWaiting && <span className="waiting-indicator" title="대기 포함">⏳</span>}
                    </td>
                    <td className="step-action">{group.nodeName || group.nodeType}</td>
                    <td className={`step-status ${group.status}`}>
                      {group.status === 'passed' ? 'O' :
                       group.status === 'failed' ? 'X' :
                       group.status === 'error' ? '!' :
                       group.status === 'waiting' ? '...' : group.status}
                    </td>
                    <td className="step-duration">{formatDuration(group.duration)}</td>
                    <td className="step-error">{group.error || '-'}</td>
                  </tr>
                )
              ))}
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
            {device.video.duration > 0 && device.steps.length > 0 && scenario && (() => {
              // duration 정규화: 1000 미만이면 초 단위로 간주
              const videoDurationMs = device.video!.duration < 1000
                ? device.video!.duration * 1000
                : device.video!.duration;
              const videoDurationSec = videoDurationMs / 1000;

              return (
              <div
                className="video-timeline"
                onClick={(e) => handleTimelineClick(e, device.video!.duration)}
              >
                {/* 진행 바 */}
                <div
                  className="timeline-progress"
                  style={{ width: `${Math.min(100, (currentTime / videoDurationSec) * 100)}%` }}
                />

                {/* 스텝 마커 */}
                {device.steps.map((step, idx) => {
                  // 대기 완료 마커인지 확인 (이전 스텝이 같은 nodeId의 waiting)
                  const prevStep = idx > 0 ? device.steps[idx - 1] : null;
                  const isWaitCompletion = prevStep &&
                    prevStep.nodeId === step.nodeId &&
                    prevStep.status === 'waiting' &&
                    (step.status === 'passed' || step.status === 'failed');

                  // 비디오 시작 시간: video.startedAt 사용 (녹화 시작 시점)
                  const videoStartTime = device.video!.startedAt;
                  let position = getStepPosition(
                    step,
                    videoStartTime,
                    device.video!.duration,
                  );

                  // 대기 완료 마커는 1초 앞당겨서 겹침 방지
                  if (isWaitCompletion) {
                    const offsetPercent = (1000 / videoDurationMs) * 100;
                    position = Math.max(2, position - offsetPercent);
                  }

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
                          videoStartTime,
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
              );
            })()}

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
