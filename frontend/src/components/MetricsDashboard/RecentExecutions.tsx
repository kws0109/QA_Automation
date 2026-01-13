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
      return 'green';
    case 'failed':
      return 'red';
    case 'partial':
      return 'yellow';
    case 'stopped':
      return 'gray';
    default:
      return 'gray';
  }
};

const getStatusIcon = (status: string): string => {
  switch (status) {
    case 'completed':
      return '✓';
    case 'failed':
      return '✗';
    case 'partial':
      return '◐';
    case 'stopped':
      return '■';
    default:
      return '?';
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
      <div className="executions-list">
        {data.map((exec) => (
          <div
            key={exec.executionId}
            className={`execution-item ${onExecutionClick ? 'clickable' : ''}`}
            onClick={() => onExecutionClick?.(exec.executionId)}
          >
            <div className="execution-time">{formatTime(exec.completedAt)}</div>
            <div className={`execution-status status-${getStatusColor(exec.status)}`}>
              {getStatusIcon(exec.status)}
            </div>
            <div className="execution-info">
              <div className="execution-name">{exec.testName || '테스트'}</div>
              <div className="execution-meta">
                <span className="meta-item">
                  📱 {exec.deviceCount}대
                </span>
                <span className="meta-item">
                  📋 {exec.passedScenarios}/{exec.scenarioCount}
                </span>
                <span className="meta-item">
                  ⏱️ {formatDuration(exec.duration)}
                </span>
              </div>
            </div>
            {exec.requesterName && (
              <div className="execution-requester">{exec.requesterName}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default RecentExecutions;
