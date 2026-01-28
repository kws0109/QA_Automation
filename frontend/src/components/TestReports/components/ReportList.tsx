// frontend/src/components/TestReports/components/ReportList.tsx
// 리포트 목록 컴포넌트

import { UnifiedReportItem, TestReport, SuiteExecutionResult } from './types';
import { formatDate, formatDuration } from '../../../utils/formatters';

interface ReportListProps {
  unifiedReports: UnifiedReportItem[];
  selectedReport: TestReport | null;
  selectedSuiteReport: SuiteExecutionResult | null;
  onSelectReport: (id: string, type: 'scenario' | 'suite') => void;
  onDeleteReport: (id: string, type: 'scenario' | 'suite', e: React.MouseEvent) => void;
}

export default function ReportList({
  unifiedReports,
  selectedReport,
  selectedSuiteReport,
  onSelectReport,
  onDeleteReport,
}: ReportListProps) {
  if (unifiedReports.length === 0) {
    return (
      <div className="reports-list">
        <div className="no-reports">
          <p>리포트가 없습니다.</p>
          <small>테스트를 실행하면 리포트가 생성됩니다.</small>
        </div>
      </div>
    );
  }

  return (
    <div className="reports-list">
      {unifiedReports.map(item => {
        const isSelected =
          (item.type === 'scenario' && selectedReport?.id === item.originalId) ||
          (item.type === 'suite' && selectedSuiteReport?.id === item.originalId);

        return (
          <div
            key={item.id}
            className={`report-item ${isSelected ? 'selected' : ''}`}
            onClick={() => onSelectReport(item.originalId, item.type)}
          >
            <div className="report-header">
              <span className="report-type-icon">
                {item.type === 'suite' ? '📦' : '📋'}
              </span>
              <span className="report-id">{item.originalId.slice(0, 8)}</span>
              <button
                className="report-delete-btn"
                onClick={(e) => onDeleteReport(item.originalId, item.type, e)}
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
      })}
    </div>
  );
}
