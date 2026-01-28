// frontend/src/components/TestReports/components/SuiteReportDetail.tsx
// Suite 리포트 상세 컴포넌트 (시나리오 중심 뷰)

import { useState, useMemo } from 'react';
import { SuiteExecutionResult, ConvertedScenarioResult } from './types';
import SuiteDeviceDetail from './SuiteDeviceDetail';
import { formatDate, formatDuration } from '../../../utils/formatters';

interface SuiteReportDetailProps {
  report: SuiteExecutionResult;
  onExport: (format: 'html' | 'pdf') => void;
  onUpload: () => void;
  exportLoading: 'html' | 'pdf' | null;
  uploadLoading: boolean;
}

// 상태 클래스
function getStatusClass(status: string) {
  switch (status) {
    case 'passed': return 'status-passed';
    case 'failed': return 'status-failed';
    case 'partial': return 'status-partial';
    case 'skipped': return 'status-skipped';
    default: return '';
  }
}

// 상태 텍스트
function getStatusText(status: string) {
  switch (status) {
    case 'passed': return '성공';
    case 'failed': return '실패';
    case 'partial': return '부분성공';
    case 'skipped': return '건너뜀';
    default: return status;
  }
}

export default function SuiteReportDetail({
  report,
  onExport,
  onUpload,
  exportLoading,
  uploadLoading,
}: SuiteReportDetailProps) {
  const [expandedScenarios, setExpandedScenarios] = useState<Set<string>>(new Set());
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<Record<string, string | null>>({});

  const successRate = report.stats.totalExecutions > 0
    ? Math.round((report.stats.passed / report.stats.totalExecutions) * 100)
    : 0;

  // Suite 데이터를 시나리오 중심으로 변환
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
