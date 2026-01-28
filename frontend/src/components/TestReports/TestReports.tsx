// frontend/src/components/TestReports/TestReports.tsx
// 통합 테스트 리포트 뷰어 (시나리오 + Suite 통합)

import { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { Socket } from 'socket.io-client';
import {
  ReportList,
  ReportDetail,
  SuiteReportDetail,
  UnifiedReportItem,
  TestReport,
  TestReportListItem,
  SuiteExecutionResult,
} from './components';
import { apiClient, API_BASE_URL } from '../../config/api';
import './TestReports.css';

// authFetch 헬퍼 함수
const authFetch = (url: string, options: RequestInit = {}) => {
  const token = localStorage.getItem('authToken');
  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
};

interface TestReportsProps {
  socket: Socket | null;
  initialReportId?: string;
  onReportIdConsumed?: () => void;
}

export default function TestReports({ socket, initialReportId, onReportIdConsumed }: TestReportsProps) {
  const [reports, setReports] = useState<TestReportListItem[]>([]);
  const [suiteReports, setSuiteReports] = useState<SuiteExecutionResult[]>([]);
  const [selectedSuiteReport, setSelectedSuiteReport] = useState<SuiteExecutionResult | null>(null);
  const [selectedReport, setSelectedReport] = useState<TestReport | null>(null);
  const [selectedReportType, setSelectedReportType] = useState<'scenario' | 'suite' | null>(null);
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
      const res = await apiClient.get<{
        success: boolean;
        reports: TestReportListItem[];
      }>('/api/test-reports');

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
      const res = await apiClient.get<SuiteExecutionResult[]>('/api/suites/reports/list');
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

  // 리포트 상세 조회
  const handleSelectReport = async (id: string, type: 'scenario' | 'suite') => {
    // 이미 선택된 리포트 클릭 시 해제
    if (selectedReportType === type) {
      if (type === 'scenario' && selectedReport?.id === id) {
        setSelectedReport(null);
        setSelectedReportType(null);
        return;
      }
      if (type === 'suite' && selectedSuiteReport?.id === id) {
        setSelectedSuiteReport(null);
        setSelectedReportType(null);
        return;
      }
    }

    setLoadingDetail(true);

    if (type === 'scenario') {
      try {
        const res = await apiClient.get<{
          success: boolean;
          report: TestReport;
        }>(`/api/test-reports/${id}`);

        if (res.data.success) {
          setSelectedReport(res.data.report);
          setSelectedSuiteReport(null);
          setSelectedReportType('scenario');
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
        await apiClient.delete(`/api/test-reports/${id}`);
        setReports(prev => prev.filter(r => r.id !== id));
        if (selectedReport?.id === id) {
          setSelectedReport(null);
          setSelectedReportType(null);
        }
      } else {
        await apiClient.delete(`/api/suites/reports/${id}`);
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
        apiClient.delete('/api/test-reports'),
      ]);
      setReports([]);
      setSuiteReports([]);
      setSelectedReport(null);
      setSelectedSuiteReport(null);
      setSelectedReportType(null);
    } catch (err) {
      console.error('전체 리포트 삭제 실패:', err);
      alert('전체 리포트 삭제에 실패했습니다.');
    }
  };

  // 시나리오 리포트 내보내기
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

      const url = `${API_BASE_URL}/api/test-reports/${selectedReport.id}/export/${format}?${params}`;

      const response = await authFetch(url);

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

      const res = await apiClient.post<{
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
      }>(`/api/test-reports/${selectedReport.id}/upload?${params}`);

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

      const url = `${API_BASE_URL}/api/suites/reports/${selectedSuiteReport.id}/export/${format}?${params}`;

      const response = await authFetch(url);

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
      const res = await apiClient.post<{
        success: boolean;
        reportId: string;
        suiteName: string;
        htmlUrl?: string;
        pdfUrl?: string;
        error?: string;
      }>(`/api/suites/reports/${selectedSuiteReport.id}/share`, {
        includeScreenshots: true,
        format: 'both',
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
        <ReportList
          unifiedReports={unifiedReports}
          selectedReport={selectedReport}
          selectedSuiteReport={selectedSuiteReport}
          onSelectReport={handleSelectReport}
          onDeleteReport={handleDeleteReport}
        />

        {/* 리포트 상세 */}
        <div className="report-detail">
          {loadingDetail ? (
            <div className="detail-loading">
              <div className="spinner" />
              <p>로딩 중...</p>
            </div>
          ) : selectedReportType === 'suite' && selectedSuiteReport ? (
            <SuiteReportDetail
              report={selectedSuiteReport}
              onExport={handleSuiteExport}
              onUpload={handleSuiteUpload}
              exportLoading={suiteExportLoading}
              uploadLoading={suiteUploadLoading}
            />
          ) : selectedReportType === 'scenario' && selectedReport ? (
            <ReportDetail
              report={selectedReport}
              onExport={handleExport}
              onUpload={handleUpload}
              exportLoading={exportLoading}
              uploadLoading={uploadLoading}
              includeSuccessVideos={includeSuccessVideos}
              onIncludeSuccessVideosChange={setIncludeSuccessVideos}
            />
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
