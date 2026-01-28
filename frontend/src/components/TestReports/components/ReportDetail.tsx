// frontend/src/components/TestReports/components/ReportDetail.tsx
// 시나리오 리포트 상세 컴포넌트

import { useState } from 'react';
import { TestReport, ScenarioReportResult, DeviceScenarioResult } from './types';
import DeviceDetail from './DeviceDetail';
import { formatDate, formatDuration } from '../../../utils/formatters';

interface ReportDetailProps {
  report: TestReport;
  onExport: (format: 'html' | 'pdf') => void;
  onUpload: () => void;
  exportLoading: 'html' | 'pdf' | null;
  uploadLoading: boolean;
  includeSuccessVideos: boolean;
  onIncludeSuccessVideosChange: (checked: boolean) => void;
}

// 시나리오 상태 클래스
function getScenarioStatusClass(status: ScenarioReportResult['status']) {
  switch (status) {
    case 'passed': return 'status-passed';
    case 'failed': return 'status-failed';
    case 'partial': return 'status-partial';
    case 'skipped': return 'status-skipped';
    default: return '';
  }
}

// 시나리오 상태 텍스트
function getScenarioStatusText(status: ScenarioReportResult['status']) {
  switch (status) {
    case 'passed': return '성공';
    case 'failed': return '실패';
    case 'partial': return '부분성공';
    case 'skipped': return '건너뜀';
    default: return status;
  }
}

// 디바이스 상태 아이콘
function getDeviceStatusIcon(result: DeviceScenarioResult) {
  if (result.status === 'skipped') return '-';
  return result.success ? 'O' : 'X';
}

export default function ReportDetail({
  report,
  onExport,
  onUpload,
  exportLoading,
  uploadLoading,
  includeSuccessVideos,
  onIncludeSuccessVideosChange,
}: ReportDetailProps) {
  const [expandedScenarios, setExpandedScenarios] = useState<Set<string>>(() => {
    // 첫 번째 시나리오 자동 펼침
    if (report.scenarioResults.length > 0) {
      const firstKey = `${report.scenarioResults[0].scenarioId}-${report.scenarioResults[0].repeatIndex}`;
      return new Set([firstKey]);
    }
    return new Set();
  });
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<Record<string, string | null>>({});

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

  return (
    <>
      {/* 리포트 정보 */}
      <div className="detail-header">
        <div className="header-top">
          <h3>📋 {report.executionInfo.testName || '테스트 리포트'}</h3>
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
            <div className="upload-section">
              <button
                className="btn-export btn-export-cloud"
                onClick={onUpload}
                disabled={exportLoading !== null || uploadLoading}
                title="Cloudflare R2에 업로드"
              >
                {uploadLoading ? '업로드 중...' : '☁️ R2'}
              </button>
              <label className="upload-checkbox" title="성공한 테스트 비디오도 업로드">
                <input
                  type="checkbox"
                  checked={includeSuccessVideos}
                  onChange={(e) => onIncludeSuccessVideosChange(e.target.checked)}
                  disabled={uploadLoading}
                />
                <span>성공 비디오</span>
              </label>
            </div>
          </div>
        </div>
        <div className="detail-meta">
          <span>ID: {report.id}</span>
          {report.executionInfo.requesterName && (
            <span>요청자: {report.executionInfo.requesterName}</span>
          )}
          <span>시작: {formatDate(report.startedAt)}</span>
          <span>완료: {formatDate(report.completedAt)}</span>
        </div>
        {report.executionInfo.forceCompleted && (
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
            <span className="stat-success">{report.stats.passedScenarios}</span>
            {' / '}
            <span className="stat-total">{report.stats.totalScenarios}</span>
            {report.stats.partialScenarios > 0 && (
              <span className="stat-partial"> ({report.stats.partialScenarios} 부분)</span>
            )}
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-label">디바이스</span>
          <span className="stat-value">
            <span className="stat-success">{report.stats.successDevices}</span>
            {' / '}
            <span className="stat-total">{report.stats.totalDevices}</span>
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-label">단계</span>
          <span className="stat-value">
            <span className="stat-success">{report.stats.passedSteps}</span>
            {' / '}
            <span className="stat-total">{report.stats.totalSteps}</span>
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-label">평균 소요시간</span>
          <span className="stat-value">
            {formatDuration(report.stats.totalDuration)}
          </span>
        </div>
      </div>

      {/* 시나리오별 아코디언 */}
      <div className="scenarios-accordion">
        <h4>시나리오별 결과</h4>
        {report.scenarioResults.map(scenario => {
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
