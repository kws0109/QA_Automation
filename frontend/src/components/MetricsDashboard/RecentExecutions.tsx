// frontend/src/components/MetricsDashboard/RecentExecutions.tsx
// 최근 실행 목록 (타임라인 스타일)

import React from 'react';
import type { RecentExecution } from '../../types';

interface RecentExecutionsProps {
  data: RecentExecution[];
  loading: boolean;
  onExecutionClick?: (executionId: string) => void;
}

const formatTime = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSec = Math.round(seconds % 60);
  return `${minutes}m ${remainingSec}s`;
};

const getStatusColor = (status: string): string => {
  switch (status) {
    case 'completed':
      return 'success';
    case 'failed':
      return 'danger';
    case 'partial':
      return 'warning';
    case 'stopped':
      return 'muted';
    default:
      return 'muted';
  }
};

const RecentExecutions: React.FC<RecentExecutionsProps> = ({ data, loading, onExecutionClick }) => {
  if (loading) {
    return (
      <div className="recent-executions-card">
        <h3 className="card-title">최근 실행</h3>
        <div className="executions-loading">
          <div className="spinner" />
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="recent-executions-card">
        <h3 className="card-title">최근 실행</h3>
        <div className="executions-empty">실행 기록이 없습니다</div>
      </div>
    );
  }

  return (
    <div className="recent-executions-card">
      <h3 className="card-title">최근 실행</h3>
      <div className="timeline-list">
        {data.map((exec, index) => (
          <div
            key={exec.executionId}
            className={`timeline-item ${onExecutionClick ? 'clickable' : ''}`}
            onClick={() => onExecutionClick?.(exec.executionId)}
          >
            <div className="timeline-time">{formatTime(exec.completedAt)}</div>
            <div className="timeline-indicator">
              <div className={`timeline-dot dot-${getStatusColor(exec.status)}`} />
              {index < data.length - 1 && <div className="timeline-line" />}
            </div>
            <div className="timeline-content">
              <div className="timeline-title">{exec.testName || '테스트'}</div>
              <div className="timeline-meta">
                <span>{exec.deviceCount}대</span>
                <span className="meta-separator">·</span>
                <span className={`meta-result result-${getStatusColor(exec.status)}`}>
                  {exec.passedScenarios}/{exec.scenarioCount} 성공
                </span>
                <span className="meta-separator">·</span>
                <span>{formatDuration(exec.duration)}</span>
              </div>
              {exec.requesterName && (
                <div className="timeline-requester">{exec.requesterName}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RecentExecutions;
