// frontend/src/components/TestReports/TestReports.tsx
// 통합 테스트 리포트 뷰어 (시나리오 + Suite 통합)

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import axios from 'axios';
import { Socket } from 'socket.io-client';
import {
  TestReport,
  TestReportListItem,
  ScenarioReportResult,
  DeviceScenarioResult,
  StepResult,
  SuiteExecutionResult,
  StepSuiteResult,
  ScenarioSuiteResult,
} from '../../types';
import VideoTimeline from './VideoTimeline';
import './TestReports.css';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:3001';

// 통합 리포트 아이템 타입
interface UnifiedReportItem {
  id: string;
  type: 'scenario' | 'suite';
  name: string;
  requesterName?: string;
  createdAt: string;
  status: 'completed' | 'partial' | 'failed' | 'stopped';
  scenarioCount: number;
  deviceCount: number;
  successRate: number;
  duration: number;
  // 원본 데이터 참조
  originalId: string;
}

interface TestReportsProps {
  socket: Socket | null;
  initialReportId?: string;  // 대시보드에서 클릭 시 자동 선택
  onReportIdConsumed?: () => void;  // initialReportId 사용 후 초기화
}

export default function TestReports({ socket, initialReportId, onReportIdConsumed }: TestReportsProps) {
  const [reports, setReports] = useState<TestReportListItem[]>([]);
  const [suiteReports, setSuiteReports] = useState<SuiteExecutionResult[]>([]);
  const [selectedSuiteReport, setSelectedSuiteReport] = useState<SuiteExecutionResult | null>(null);
  const [selectedReport, setSelectedReport] = useState<TestReport | null>(null);
  const [selectedReportType, setSelectedReportType] = useState<'scenario' | 'suite' | null>(null);
  const [expandedScenarios, setExpandedScenarios] = useState<Set<string>>(new Set());
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportLoading, setExportLoading] = useState<'html' | 'pdf' | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [includeSuccessVideos, setIncludeSuccessVideos] = useState(true);
  const [processedInitialId, setProcessedInitialId] = useState<string | null>(null);
  // Suite 내보내기 상태
  const [suiteExportLoading, setSuiteExportLoading] = useState<'html' | 'pdf' | null>(null);
  const [suiteUploadLoading, setSuiteUploadLoading] = useState(false);

  // 시나리오 리포트 목록 조회
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

  // Suite 리포트 목록 조회
  const fetchSuiteReports = useCallback(async () => {
    try {
      const res = await axios.get<SuiteExecutionResult[]>(`${API_BASE}/api/suites/reports/list`);
      setSuiteReports(res.data);
    } catch (err) {
      console.error('Suite 리포트 목록 조회 실패:', err);
    }
  }, []);

  // 초기 로드
  useEffect(() => {
    fetchReports();
    fetchSuiteReports();
  }, [fetchReports, fetchSuiteReports]);

  // Socket.IO: 새 리포트 생성 시 자동 새로고침
  useEffect(() => {
    if (!socket) return;

    const handleReportCreated = () => {
      console.log('[TestReports] 새 리포트 생성됨 - 목록 새로고침');
      fetchReports();
    };

    const handleSuiteComplete = () => {
      console.log('[TestReports] Suite 실행 완료 - Suite 리포트 새로고침');
      fetchSuiteReports();
    };

    socket.on('report:created', handleReportCreated);
    socket.on('suite:complete', handleSuiteComplete);

    return () => {
      socket.off('report:created', handleReportCreated);
      socket.off('suite:complete', handleSuiteComplete);
    };
  }, [socket, fetchReports, fetchSuiteReports]);

  // 통합 리포트 목록 생성 (시나리오 + Suite, 날짜순 정렬)
  const unifiedReports = useMemo((): UnifiedReportItem[] => {
    const scenarioItems: UnifiedReportItem[] = reports.map(r => ({
      id: `scenario-${r.id}`,
      type: 'scenario' as const,
      name: r.testName || `테스트 ${r.scenarioCount}개 시나리오`,
      requesterName: r.requesterName,
      createdAt: r.createdAt,
      status: r.status,
      scenarioCount: r.scenarioCount,
      deviceCount: r.deviceCount,
      successRate: r.stats.totalScenarios > 0
        ? Math.round((r.stats.passedScenarios / r.stats.totalScenarios) * 100)
        : 0,
      duration: r.stats.totalDuration,
      originalId: r.id,
    }));

    const suiteItems: UnifiedReportItem[] = suiteReports.map(r => {
      const status = r.stats.failed === 0 ? 'completed' :
                     r.stats.passed === 0 ? 'failed' : 'partial';
      return {
        id: `suite-${r.id}`,
        type: 'suite' as const,
        name: r.suiteName,
        createdAt: r.startedAt,
        status: status as 'completed' | 'partial' | 'failed',
        scenarioCount: r.stats.totalScenarios,
        deviceCount: r.stats.totalDevices,
        successRate: r.stats.totalExecutions > 0
          ? Math.round((r.stats.passed / r.stats.totalExecutions) * 100)
          : 0,
        duration: r.totalDuration,
        originalId: r.id,
      };
    });

    // 합치고 날짜순 정렬 (최신 먼저)
    return [...scenarioItems, ...suiteItems].sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [reports, suiteReports]);

  // initialReportId가 있으면 해당 리포트 자동 선택
  useEffect(() => {
    if (!initialReportId || loading) return;
    if (processedInitialId === initialReportId) return;

    // 시나리오 리포트에서 검색 (id 또는 executionId로 매칭)
    const targetScenarioReport = reports.find(
      r => r.id === initialReportId || r.executionId === initialReportId
    );
    if (targetScenarioReport) {
      console.log('[TestReports] 시나리오 리포트 자동 선택:', targetScenarioReport.id);
      handleSelectReport(targetScenarioReport.id, 'scenario');
      setProcessedInitialId(initialReportId);
      onReportIdConsumed?.();
      return;
    }

    // Suite 리포트에서 검색
    const targetSuiteReport = suiteReports.find(r => r.id === initialReportId);
    if (targetSuiteReport) {
      console.log('[TestReports] Suite 리포트 자동 선택:', targetSuiteReport.id);
      handleSelectReport(targetSuiteReport.id, 'suite');
      setProcessedInitialId(initialReportId);
      onReportIdConsumed?.();
      return;
    }

    console.log('[TestReports] 리포트를 찾을 수 없음:', initialReportId);
  }, [initialReportId, reports, suiteReports, loading, processedInitialId, onReportIdConsumed]);

  // 리포트 상세 조회 (시나리오)
  const handleSelectReport = async (id: string, type: 'scenario' | 'suite') => {
    // 이미 선택된 리포트 클릭 시 해제
    if (selectedReportType === type) {
      if (type === 'scenario' && selectedReport?.id === id) {
        setSelectedReport(null);
        setSelectedReportType(null);
        setExpandedScenarios(new Set());
        setSelectedDeviceIds({});
        return;
      }
      if (type === 'suite' && selectedSuiteReport?.id === id) {
        setSelectedSuiteReport(null);
        setSelectedReportType(null);
        return;
      }
    }

    setLoadingDetail(true);
    setExpandedScenarios(new Set());
    setSelectedDeviceIds({});

    if (type === 'scenario') {
      try {
        const res = await axios.get<{
          success: boolean;
          report: TestReport;
        }>(`${API_BASE}/api/test-reports/${id}`);

        if (res.data.success) {
          setSelectedReport(res.data.report);
          setSelectedSuiteReport(null);
          setSelectedReportType('scenario');
          // 첫 번째 시나리오 자동 펼침
          if (res.data.report.scenarioResults.length > 0) {
            const firstKey = `${res.data.report.scenarioResults[0].scenarioId}-${res.data.report.scenarioResults[0].repeatIndex}`;
            setExpandedScenarios(new Set([firstKey]));
          }
        }
      } catch (err) {
        console.error('리포트 상세 조회 실패:', err);
        setError('리포트 상세 정보를 불러올 수 없습니다.');
      }
    } else {
      // Suite 리포트는 이미 전체 데이터가 있음
      const suiteReport = suiteReports.find(r => r.id === id);
      if (suiteReport) {
        setSelectedSuiteReport(suiteReport);
        setSelectedReport(null);
        setSelectedReportType('suite');
      }
    }

    setLoadingDetail(false);
  };

  // 리포트 삭제
  const handleDeleteReport = async (id: string, type: 'scenario' | 'suite', e: React.MouseEvent) => {
    e.stopPropagation();

    if (!confirm('이 리포트를 삭제하시겠습니까?')) {
      return;
    }

    try {
      if (type === 'scenario') {
        await axios.delete(`${API_BASE}/api/test-reports/${id}`);
        setReports(prev => prev.filter(r => r.id !== id));
        if (selectedReport?.id === id) {
          setSelectedReport(null);
          setSelectedReportType(null);
          setExpandedScenarios(new Set());
          setSelectedDeviceIds({});
        }
      } else {
        await axios.delete(`${API_BASE}/api/suites/reports/${id}`);
        setSuiteReports(prev => prev.filter(r => r.id !== id));
        if (selectedSuiteReport?.id === id) {
          setSelectedSuiteReport(null);
          setSelectedReportType(null);
        }
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
      await Promise.all([
        axios.delete(`${API_BASE}/api/test-reports`),
        // Suite 리포트도 전체 삭제 (API가 있다면)
      ]);
      setReports([]);
      setSuiteReports([]);
      setSelectedReport(null);
      setSelectedSuiteReport(null);
      setSelectedReportType(null);
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

      const response = await fetch(url);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: '알 수 없는 오류' }));
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }

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

  // Suite 내보내기 (HTML/PDF)
  const handleSuiteExport = async (format: 'html' | 'pdf') => {
    if (!selectedSuiteReport) return;

    setSuiteExportLoading(format);

    try {
      const params = new URLSearchParams({
        screenshots: 'true',
      });

      if (format === 'pdf') {
        params.append('paperSize', 'A4');
        params.append('orientation', 'portrait');
      }

      const url = `${API_BASE}/api/suites/reports/${selectedSuiteReport.id}/export/${format}?${params}`;

      const response = await fetch(url);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: '알 수 없는 오류' }));
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `suite-report-${selectedSuiteReport.id}.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      console.error(`Suite ${format.toUpperCase()} 내보내기 실패:`, err);
      alert(`${format.toUpperCase()} 내보내기에 실패했습니다.\n${err instanceof Error ? err.message : ''}`);
    } finally {
      setSuiteExportLoading(null);
    }
  };

  // Suite R2 업로드
  const handleSuiteUpload = async () => {
    if (!selectedSuiteReport) return;

    setSuiteUploadLoading(true);

    try {
      const res = await axios.post<{
        success: boolean;
        reportId: string;
        suiteName: string;
        htmlUrl?: string;
        pdfUrl?: string;
        error?: string;
      }>(`${API_BASE}/api/suites/reports/${selectedSuiteReport.id}/share`, {
        includeScreenshots: true,
        format: 'both', // HTML과 PDF 모두 업로드
      });

      if (res.data.success) {
        const { htmlUrl, pdfUrl } = res.data;
        alert(
          '✅ R2 업로드 완료!\n\n' +
          (htmlUrl ? `HTML: ${htmlUrl}\n` : '') +
          (pdfUrl ? `PDF: ${pdfUrl}` : '')
        );
      } else {
        throw new Error(res.data.error || '업로드 실패');
      }
    } catch (err) {
      console.error('Suite R2 업로드 실패:', err);
      const message = axios.isAxiosError(err) && err.response?.data?.error
        ? err.response.data.error
        : err instanceof Error ? err.message : '알 수 없는 오류';
      alert(`R2 업로드에 실패했습니다.\n${message}`);
    } finally {
      setSuiteUploadLoading(false);
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
          <button onClick={() => { setError(null); fetchReports(); fetchSuiteReports(); }}>
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
          <h2>실행 이력</h2>
          <span className="report-count">{unifiedReports.length}개</span>
        </div>
        <div className="header-right">
          <button
            className="btn-refresh"
            onClick={() => {
              setLoading(true);
              Promise.all([fetchReports(), fetchSuiteReports()]).finally(() => setLoading(false));
            }}
          >
            새로고침
          </button>
          {unifiedReports.length > 0 && (
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
        {/* 통합 리포트 목록 */}
        <div className="reports-list">
          {unifiedReports.length === 0 ? (
            <div className="no-reports">
              <p>리포트가 없습니다.</p>
              <small>테스트를 실행하면 리포트가 생성됩니다.</small>
            </div>
          ) : (
            unifiedReports.map(item => {
              const isSelected =
                (item.type === 'scenario' && selectedReport?.id === item.originalId) ||
                (item.type === 'suite' && selectedSuiteReport?.id === item.originalId);

              return (
                <div
                  key={item.id}
                  className={`report-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => handleSelectReport(item.originalId, item.type)}
                >
                  <div className="report-header">
                    <span className="report-type-icon">
                      {item.type === 'suite' ? '📦' : '📋'}
                    </span>
                    <span className="report-id">{item.originalId.slice(0, 8)}</span>
                    <button
                      className="report-delete-btn"
                      onClick={(e) => handleDeleteReport(item.originalId, item.type, e)}
                      title="삭제"
                    >
                      ×
                    </button>
                  </div>
                  <div className="report-name">{item.name}</div>
                  {item.requesterName && (
                    <div className="report-requester">요청자: {item.requesterName}</div>
                  )}
                  <div className="report-date">{formatDate(item.createdAt)}</div>
                  <div className="report-stats">
                    <span className={`status-badge ${item.status}`}>
                      {item.status === 'completed' ? '완료' :
                       item.status === 'partial' ? '부분완료' :
                       item.status === 'failed' ? '실패' : '중지'}
                    </span>
                    <span className="scenario-count">
                      {item.scenarioCount}개 시나리오
                    </span>
                    <span className="device-count">
                      {item.deviceCount}대 디바이스
                    </span>
                    <span className="duration">
                      {formatDuration(item.duration)}
                    </span>
                  </div>
                  <div className="report-progress">
                    <div className="progress-bar-mini">
                      <div
                        className="progress-fill-mini"
                        style={{ width: `${item.successRate}%` }}
                      />
                    </div>
                    <span className="progress-text">{item.successRate}%</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* 리포트 상세 */}
        <div className="report-detail">
          {loadingDetail ? (
            <div className="detail-loading">
              <div className="spinner" />
              <p>로딩 중...</p>
            </div>
          ) : selectedReportType === 'suite' && selectedSuiteReport ? (
            /* Suite 리포트 상세 (시나리오 중심 뷰) */
            <SuiteReportDetailScenarioCentric
              report={selectedSuiteReport}
              formatDate={formatDate}
              formatDuration={formatDuration}
              formatFileSize={formatFileSize}
              getScreenshotUrl={getScreenshotUrl}
              onExport={handleSuiteExport}
              onUpload={handleSuiteUpload}
              exportLoading={suiteExportLoading}
              uploadLoading={suiteUploadLoading}
            />
          ) : selectedReportType === 'scenario' && selectedReport ? (
            <>
              {/* 리포트 정보 */}
              <div className="detail-header">
                <div className="header-top">
                  <h3>📋 {selectedReport.executionInfo.testName || '테스트 리포트'}</h3>
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
}: {
  device?: DeviceScenarioResult;
  scenario: ScenarioReportResult | null;
  formatDuration: (ms: number | undefined) => string;
  formatFileSize: (bytes: number) => string;
  getScreenshotUrl: (path: string) => string;
  getVideoUrl: (path: string) => string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);

  const seekToTime = (startTime: string | undefined, videoStartTime: string | undefined, offsetSeconds: number = 0) => {
    if (!videoRef.current || !startTime || !videoStartTime) return;
    const stepTime = new Date(startTime).getTime();
    const videoStart = new Date(videoStartTime).getTime();
    if (isNaN(stepTime) || isNaN(videoStart)) return;
    const offsetMs = stepTime - videoStart;
    const seekTime = Math.max(0, offsetMs / 1000 + offsetSeconds);
    videoRef.current.currentTime = seekTime;
  };

  const handleVideoTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  if (!device) return null;

  interface StepGroup {
    nodeId: string;
    nodeName: string;
    nodeType: string;
    steps: StepResult[];
    status: string;
    startTime: string;
    endTime?: string;
    duration?: number;
    error?: string;
    hasWaiting: boolean;
  }

  const groupStepsByNode = (steps: StepResult[]): StepGroup[] => {
    const groups: StepGroup[] = [];
    let currentGroup: StepGroup | null = null;

    for (const step of steps) {
      if (currentGroup && currentGroup.nodeId === step.nodeId) {
        currentGroup.steps.push(step);
        currentGroup.status = step.status;
        currentGroup.endTime = step.endTime;
        if (step.error) currentGroup.error = step.error;
        if (step.status === 'waiting') currentGroup.hasWaiting = true;
      } else {
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

    for (const group of groups) {
      if (group.startTime && group.endTime) {
        group.duration = new Date(group.endTime).getTime() - new Date(group.startTime).getTime();
      } else if (group.steps.length > 0) {
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
              <div className="perf-item perf-item-full">
                <span className="perf-label">이미지 매칭</span>
                <span className="perf-value">{device.performanceSummary.imageMatchCount}회 (평균 {formatDuration(device.performanceSummary.imageMatchAvgTime || 0)})</span>
              </div>
            )}
            {(device.performanceSummary.deviceMatchCount || device.performanceSummary.backendMatchCount) && (
              <>
                {device.performanceSummary.deviceMatchCount && device.performanceSummary.deviceMatchCount > 0 && (
                  <div className="perf-item">
                    <span className="perf-label">📱 디바이스 매칭</span>
                    <span className="perf-value perf-device">{device.performanceSummary.deviceMatchCount}회 (평균 {formatDuration(device.performanceSummary.deviceMatchAvgTime || 0)})</span>
                  </div>
                )}
                {device.performanceSummary.backendMatchCount && device.performanceSummary.backendMatchCount > 0 && (
                  <div className="perf-item">
                    <span className="perf-label">💻 백엔드 매칭</span>
                    <span className="perf-value perf-backend">{device.performanceSummary.backendMatchCount}회 (평균 {formatDuration(device.performanceSummary.backendMatchAvgTime || 0)})</span>
                  </div>
                )}
              </>
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
                group.hasWaiting && group.steps.length > 1 ? (
                  group.steps.map((step, stepIdx) => {
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

            <VideoTimeline
              videoRef={videoRef as React.RefObject<HTMLVideoElement>}
              steps={device.steps.map(s => ({
                nodeId: s.nodeId,
                nodeName: s.nodeName || s.nodeType,
                status: s.status,
                startTime: s.startTime,
              }))}
              videoStartTime={device.video.startedAt}
              videoDuration={device.video.duration}
              currentTime={currentTime}
            />

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
                    <span className={`screenshot-type ${screenshot.type}${screenshot.type === 'highlight' && screenshot.templateId?.startsWith('ocr:') ? ' ocr' : ''}`}>
                      {screenshot.type === 'step' ? '단계' :
                       screenshot.type === 'failed' ? '실패' :
                       screenshot.type === 'highlight'
                         ? (screenshot.templateId?.startsWith('ocr:') ? '텍스트인식' : '이미지인식')
                         : '최종'}
                    </span>
                    {screenshot.type === 'highlight' && screenshot.confidence && (
                      <span className="screenshot-confidence">
                        {(screenshot.confidence * 100).toFixed(2)}%
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

// Suite 시나리오 비디오 컴포넌트
interface SuiteScenarioVideoProps {
  videoUrl: string;
  videoStartTime: string;
  steps: StepSuiteResult[];
}

function SuiteScenarioVideo({ videoUrl, videoStartTime, steps }: SuiteScenarioVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);

  const handleVideoTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleVideoLoadedMetadata = () => {
    if (videoRef.current) {
      setVideoDuration(videoRef.current.duration * 1000);
    }
  };

  const timelineSteps = steps.map(s => ({
    nodeId: s.nodeId,
    nodeName: s.nodeName || s.actionType,
    status: s.status,
    timestamp: s.timestamp,
  }));

  return (
    <div className="suite-scenario-video">
      <h6>실행 영상</h6>
      <video
        ref={videoRef}
        controls
        preload="metadata"
        className="suite-video-player"
        onTimeUpdate={handleVideoTimeUpdate}
        onLoadedMetadata={handleVideoLoadedMetadata}
      >
        <source src={videoUrl} type="video/mp4" />
        브라우저가 비디오를 지원하지 않습니다.
      </video>

      {videoDuration > 0 && steps.length > 0 && (
        <VideoTimeline
          videoRef={videoRef as React.RefObject<HTMLVideoElement>}
          steps={timelineSteps}
          videoStartTime={videoStartTime}
          videoDuration={videoDuration}
          currentTime={currentTime}
        />
      )}
    </div>
  );
}

// Suite 리포트 상세 컴포넌트 (시나리오 중심 뷰)
function SuiteReportDetailScenarioCentric({
  report,
  formatDate,
  formatDuration,
  formatFileSize,
  getScreenshotUrl,
  onExport,
  onUpload,
  exportLoading,
  uploadLoading,
}: {
  report: SuiteExecutionResult;
  formatDate: (dateStr: string) => string;
  formatDuration: (ms: number | undefined) => string;
  formatFileSize: (bytes: number) => string;
  getScreenshotUrl: (path: string) => string;
  onExport: (format: 'html' | 'pdf') => void;
  onUpload: () => void;
  exportLoading: 'html' | 'pdf' | null;
  uploadLoading: boolean;
}) {
  const [expandedScenarios, setExpandedScenarios] = useState<Set<string>>(new Set());
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<Record<string, string | null>>({});

  const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:3001';

  // Suite 비디오 URL 생성
  const getSuiteVideoUrl = (videoPath: string) => {
    const normalizedPath = videoPath.replace(/\\/g, '/');
    const filename = normalizedPath.split('/').pop() || '';
    return `${API_BASE}/api/suites/videos/${filename}`;
  };

  const successRate = report.stats.totalExecutions > 0
    ? Math.round((report.stats.passed / report.stats.totalExecutions) * 100)
    : 0;

  // Suite 데이터를 시나리오 중심으로 변환
  // deviceResults[].scenarioResults[] → scenarioResults[].deviceResults[]
  interface ConvertedScenarioResult {
    scenarioId: string;
    scenarioName: string;
    deviceResults: {
      deviceId: string;
      deviceName: string;
      status: string;
      duration: number;
      error?: string;
      stepResults: StepSuiteResult[];
      screenshots: ScenarioSuiteResult['screenshots'];
      videoPath?: string;
      startedAt: string;
      environment?: {
        brand: string;
        model: string;
        androidVersion: string;
        sdkVersion: number;
        screenResolution: string;
        batteryLevel: number;
        batteryStatus: string;
        availableMemory: number;
        totalMemory: number;
        networkType: string;
      };
      appInfo?: {
        packageName: string;
        appName?: string;
        versionName?: string;
        versionCode?: number;
        targetSdk?: number;
      };
    }[];
    overallStatus: 'passed' | 'failed' | 'partial' | 'skipped';
    totalDuration: number;
  }

  const convertedScenarios = useMemo((): ConvertedScenarioResult[] => {
    const scenarioMap = new Map<string, ConvertedScenarioResult>();

    for (const device of report.deviceResults) {
      for (const scenario of device.scenarioResults) {
        if (!scenarioMap.has(scenario.scenarioId)) {
          scenarioMap.set(scenario.scenarioId, {
            scenarioId: scenario.scenarioId,
            scenarioName: scenario.scenarioName,
            deviceResults: [],
            overallStatus: 'passed',
            totalDuration: 0,
          });
        }

        const converted = scenarioMap.get(scenario.scenarioId)!;
        converted.deviceResults.push({
          deviceId: device.deviceId,
          deviceName: device.deviceName,
          status: scenario.status,
          duration: scenario.duration,
          error: scenario.error,
          stepResults: scenario.stepResults || [],
          screenshots: scenario.screenshots || [],
          videoPath: scenario.videoPath,
          startedAt: scenario.startedAt,
          environment: device.environment,
          appInfo: device.appInfo,
        });
        converted.totalDuration += scenario.duration;
      }
    }

    // 각 시나리오의 전체 상태 계산
    for (const scenario of scenarioMap.values()) {
      const statuses = scenario.deviceResults.map(d => d.status);
      if (statuses.every(s => s === 'passed')) {
        scenario.overallStatus = 'passed';
      } else if (statuses.every(s => s === 'failed')) {
        scenario.overallStatus = 'failed';
      } else if (statuses.every(s => s === 'skipped')) {
        scenario.overallStatus = 'skipped';
      } else {
        scenario.overallStatus = 'partial';
      }
    }

    return Array.from(scenarioMap.values());
  }, [report]);

  const toggleScenario = (scenarioId: string) => {
    setExpandedScenarios(prev => {
      const next = new Set(prev);
      if (next.has(scenarioId)) {
        next.delete(scenarioId);
        setSelectedDeviceIds(prevDevices => {
          const updated = { ...prevDevices };
          delete updated[scenarioId];
          return updated;
        });
      } else {
        next.add(scenarioId);
      }
      return next;
    });
  };

  const getStatusClass = (status: string) => {
    switch (status) {
      case 'passed': return 'status-passed';
      case 'failed': return 'status-failed';
      case 'partial': return 'status-partial';
      case 'skipped': return 'status-skipped';
      default: return '';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'passed': return '성공';
      case 'failed': return '실패';
      case 'partial': return '부분성공';
      case 'skipped': return '건너뜀';
      default: return status;
    }
  };

  return (
    <>
      {/* Suite 리포트 헤더 */}
      <div className="detail-header">
        <div className="header-top">
          <h3>📦 {report.suiteName}</h3>
          <div className="export-buttons">
            <button
              className="btn-export btn-export-html"
              onClick={() => onExport('html')}
              disabled={exportLoading !== null || uploadLoading}
            >
              {exportLoading === 'html' ? '...' : 'HTML'}
            </button>
            <button
              className="btn-export btn-export-pdf"
              onClick={() => onExport('pdf')}
              disabled={exportLoading !== null || uploadLoading}
            >
              {exportLoading === 'pdf' ? '...' : 'PDF'}
            </button>
            <button
              className="btn-export btn-export-cloud"
              onClick={onUpload}
              disabled={exportLoading !== null || uploadLoading}
              title="Cloudflare R2에 업로드"
            >
              {uploadLoading ? '업로드 중...' : '☁️ R2'}
            </button>
          </div>
        </div>
        <div className="detail-meta">
          <span>ID: {report.id}</span>
          <span>시작: {formatDate(report.startedAt)}</span>
          <span>완료: {formatDate(report.completedAt)}</span>
        </div>
      </div>

      {/* 통계 요약 */}
      <div className="detail-stats">
        <div className="stat-card">
          <span className="stat-label">시나리오</span>
          <span className="stat-value">
            <span className="stat-total">{report.stats.totalScenarios}</span>개
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-label">디바이스</span>
          <span className="stat-value">
            <span className="stat-total">{report.stats.totalDevices}</span>대
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-label">성공률</span>
          <span className="stat-value">
            <span className="stat-success">{report.stats.passed}</span>
            {' / '}
            <span className="stat-total">{report.stats.totalExecutions}</span>
            <span className="stat-partial"> ({successRate}%)</span>
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-label">총 소요시간</span>
          <span className="stat-value">
            {formatDuration(report.totalDuration)}
          </span>
        </div>
      </div>

      {/* 성공률 프로그레스 바 */}
      <div className="suite-progress-section">
        <div className="suite-progress-bar">
          <div
            className="suite-progress-fill passed"
            style={{ width: `${(report.stats.passed / report.stats.totalExecutions) * 100}%` }}
          />
          <div
            className="suite-progress-fill failed"
            style={{ width: `${(report.stats.failed / report.stats.totalExecutions) * 100}%` }}
          />
          <div
            className="suite-progress-fill skipped"
            style={{ width: `${(report.stats.skipped / report.stats.totalExecutions) * 100}%` }}
          />
        </div>
        <div className="suite-progress-legend">
          <span className="legend-item passed">성공: {report.stats.passed}</span>
          <span className="legend-item failed">실패: {report.stats.failed}</span>
          {report.stats.skipped > 0 && (
            <span className="legend-item skipped">건너뜀: {report.stats.skipped}</span>
          )}
        </div>
      </div>

      {/* 시나리오별 결과 (시나리오 중심) */}
      <div className="scenarios-accordion">
        <h4>시나리오별 결과</h4>
        {convertedScenarios.map((scenario, idx) => {
          const isExpanded = expandedScenarios.has(scenario.scenarioId);

          return (
            <div key={scenario.scenarioId} className="scenario-item">
              {/* 시나리오 헤더 */}
              <div
                className={`scenario-header ${getStatusClass(scenario.overallStatus)}`}
                onClick={() => toggleScenario(scenario.scenarioId)}
              >
                <span className="scenario-expand">{isExpanded ? '▼' : '▶'}</span>
                <span className="scenario-order">#{idx + 1}</span>
                <span className="scenario-name">{scenario.scenarioName}</span>
                <span className={`scenario-status ${getStatusClass(scenario.overallStatus)}`}>
                  {getStatusText(scenario.overallStatus)}
                </span>
                <span className="scenario-duration">
                  {formatDuration(scenario.totalDuration / scenario.deviceResults.length)}
                </span>
                <span className="device-count-badge">
                  {scenario.deviceResults.filter(d => d.status === 'passed').length}/{scenario.deviceResults.length} 디바이스
                </span>
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
                          selectedDeviceIds[scenario.scenarioId] === device.deviceId ? 'active' : ''
                        } ${device.status === 'skipped' ? 'tab-skipped' :
                            device.status === 'passed' ? 'tab-success' : 'tab-failed'}`}
                        onClick={() => setSelectedDeviceIds(prev => ({
                          ...prev,
                          [scenario.scenarioId]: prev[scenario.scenarioId] === device.deviceId ? null : device.deviceId,
                        }))}
                      >
                        <span className="tab-icon">
                          {device.status === 'skipped' ? '-' :
                           device.status === 'passed' ? 'O' : 'X'}
                        </span>
                        <span className="tab-name">{device.deviceName}</span>
                        <span className="tab-duration">
                          {device.status === 'skipped' ? '건너뜀' : formatDuration(device.duration)}
                        </span>
                      </button>
                    ))}
                  </div>

                  {/* 선택된 디바이스 상세 */}
                  {selectedDeviceIds[scenario.scenarioId] && (
                    <SuiteDeviceDetail
                      device={scenario.deviceResults.find(d => d.deviceId === selectedDeviceIds[scenario.scenarioId])!}
                      formatDuration={formatDuration}
                      formatFileSize={formatFileSize}
                      getScreenshotUrl={getScreenshotUrl}
                      getSuiteVideoUrl={getSuiteVideoUrl}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

// Suite 디바이스 상세 컴포넌트
function SuiteDeviceDetail({
  device,
  formatDuration,
  formatFileSize,
  getScreenshotUrl,
  getSuiteVideoUrl,
}: {
  device: {
    deviceId: string;
    deviceName: string;
    status: string;
    duration: number;
    error?: string;
    stepResults: StepSuiteResult[];
    screenshots: ScenarioSuiteResult['screenshots'];
    videoPath?: string;
    startedAt: string;
    environment?: {
      brand: string;
      model: string;
      androidVersion: string;
      sdkVersion: number;
      screenResolution: string;
      batteryLevel: number;
      batteryStatus: string;
      availableMemory: number;
      totalMemory: number;
      networkType: string;
    };
    appInfo?: {
      packageName: string;
      appName?: string;
      versionName?: string;
      versionCode?: number;
      targetSdk?: number;
    };
  };
  formatDuration: (ms: number | undefined) => string;
  formatFileSize: (bytes: number) => string;
  getScreenshotUrl: (path: string) => string;
  getSuiteVideoUrl: (path: string) => string;
}) {
  return (
    <div className="device-detail">
      <div className="device-header">
        <h5>
          {device.deviceName}
          <span className={`status ${
            device.status === 'skipped' ? 'status-skipped' :
            device.status === 'passed' ? 'status-success' : 'status-failed'
          }`}>
            {device.status === 'skipped' ? '건너뜀' : device.status === 'passed' ? '성공' : '실패'}
          </span>
        </h5>
        {device.error && (
          <div className="device-error">{device.error}</div>
        )}
      </div>

      {/* 환경 정보 */}
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

      {/* 성능 메트릭 요약 */}
      {device.stepResults && device.stepResults.length > 0 && (() => {
        // 성능 데이터 집계
        const stepsWithPerf = device.stepResults.filter(s => s.performance);
        const imageMatches = stepsWithPerf.filter(s => s.performance?.imageMatch);
        const ocrMatches = stepsWithPerf.filter(s => s.performance?.ocrMatch);

        const avgImageMatchTime = imageMatches.length > 0
          ? imageMatches.reduce((sum, s) => sum + (s.performance?.imageMatch?.matchTime || 0), 0) / imageMatches.length
          : 0;
        const avgOcrTime = ocrMatches.length > 0
          ? ocrMatches.reduce((sum, s) => sum + (s.performance?.ocrMatch?.ocrTime || 0), 0) / ocrMatches.length
          : 0;
        const avgImageConfidence = imageMatches.filter(s => s.performance?.imageMatch?.matched).length > 0
          ? imageMatches.filter(s => s.performance?.imageMatch?.matched)
              .reduce((sum, s) => sum + (s.performance?.imageMatch?.confidence || 0), 0)
            / imageMatches.filter(s => s.performance?.imageMatch?.matched).length
          : 0;
        const avgOcrConfidence = ocrMatches.filter(s => s.performance?.ocrMatch?.matched).length > 0
          ? ocrMatches.filter(s => s.performance?.ocrMatch?.matched)
              .reduce((sum, s) => sum + (s.performance?.ocrMatch?.confidence || 0), 0)
            / ocrMatches.filter(s => s.performance?.ocrMatch?.matched).length
          : 0;

        if (imageMatches.length === 0 && ocrMatches.length === 0) return null;

        return (
          <div className="qa-performance-section">
            <h6>성능 메트릭</h6>
            <div className="performance-grid">
              {imageMatches.length > 0 && (
                <>
                  <div className="perf-item">
                    <span className="perf-label">이미지 매칭</span>
                    <span className="perf-value">{imageMatches.length}회</span>
                  </div>
                  <div className="perf-item">
                    <span className="perf-label">평균 매칭 시간</span>
                    <span className="perf-value">{formatDuration(avgImageMatchTime)}</span>
                  </div>
                  <div className="perf-item">
                    <span className="perf-label">평균 신뢰도</span>
                    <span className="perf-value">{(avgImageConfidence * 100).toFixed(1)}%</span>
                  </div>
                </>
              )}
              {ocrMatches.length > 0 && (
                <>
                  <div className="perf-item">
                    <span className="perf-label">OCR 매칭</span>
                    <span className="perf-value">{ocrMatches.length}회</span>
                  </div>
                  <div className="perf-item">
                    <span className="perf-label">평균 OCR 시간</span>
                    <span className="perf-value">{formatDuration(avgOcrTime)}</span>
                  </div>
                  <div className="perf-item">
                    <span className="perf-label">평균 OCR 신뢰도</span>
                    <span className="perf-value">{(avgOcrConfidence * 100).toFixed(1)}%</span>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* 실행 단계 */}
      {device.stepResults && device.stepResults.length > 0 && (
        <div className="steps-list">
          <h6>실행 단계</h6>
          <table className="steps-table">
            <thead>
              <tr>
                <th>노드</th>
                <th>액션</th>
                <th>상태</th>
                <th>소요시간</th>
                <th>매칭 시간</th>
                <th>신뢰도</th>
                <th>에러</th>
              </tr>
            </thead>
            <tbody>
              {device.stepResults.map((step, idx) => {
                const perf = step.performance;
                const matchTime = perf?.imageMatch?.matchTime || perf?.ocrMatch?.ocrTime;
                const confidence = perf?.imageMatch?.confidence ?? perf?.ocrMatch?.confidence;
                const matchType = perf?.imageMatch ? 'image' : perf?.ocrMatch ? 'ocr' : null;

                return (
                  <tr key={`${step.nodeId}-${idx}`} className={`step-row ${step.status}`}>
                    <td className="step-node">{step.nodeId}</td>
                    <td className="step-action">{step.nodeName || step.actionType}</td>
                    <td className={`step-status ${step.status}`}>
                      {step.status === 'passed' ? 'O' :
                       step.status === 'failed' ? 'X' :
                       step.status === 'waiting' ? '...' : step.status}
                    </td>
                    <td className="step-duration">{formatDuration(step.duration)}</td>
                    <td className="step-match-time">
                      {matchTime !== undefined ? (
                        <span className={`match-type-${matchType}`}>
                          {matchType === 'ocr' ? '🔤 ' : '🖼️ '}
                          {formatDuration(matchTime)}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="step-confidence">
                      {confidence !== undefined ? (
                        <span className={confidence >= 0.8 ? 'confidence-high' : confidence >= 0.5 ? 'confidence-medium' : 'confidence-low'}>
                          {(confidence * 100).toFixed(1)}%
                        </span>
                      ) : '-'}
                    </td>
                    <td className="step-error">{step.error || '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 비디오 */}
      {device.videoPath && (
        <SuiteScenarioVideo
          videoUrl={getSuiteVideoUrl(device.videoPath)}
          videoStartTime={device.startedAt}
          steps={device.stepResults}
        />
      )}

      {/* 스크린샷 */}
      {device.screenshots && device.screenshots.length > 0 && (
        <div className="screenshots-section">
          <h6>스크린샷 ({device.screenshots.length})</h6>
          <div className="screenshots-grid">
            {device.screenshots.map((screenshot, idx) => (
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
                  <span className={`screenshot-type ${screenshot.type}${screenshot.type === 'highlight' && screenshot.templateId?.startsWith('ocr:') ? ' ocr' : ''}`}>
                    {screenshot.type === 'step' ? '단계' :
                     screenshot.type === 'failed' ? '실패' :
                     screenshot.type === 'highlight'
                       ? (screenshot.templateId?.startsWith('ocr:') ? '텍스트인식' : '이미지인식')
                       : '최종'}
                  </span>
                  {screenshot.type === 'highlight' && screenshot.confidence && (
                    <span className="screenshot-confidence">
                      {(screenshot.confidence * 100).toFixed(2)}%
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
