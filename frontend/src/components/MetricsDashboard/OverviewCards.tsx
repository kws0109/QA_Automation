// frontend/src/components/MetricsDashboard/OverviewCards.tsx
// KPI 카드 섹션

import React from 'react';
import type { DashboardOverview } from '../../types';

interface OverviewCardsProps {
  data: DashboardOverview | null;
  loading: boolean;
}

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSec = Math.round(seconds % 60);
  return `${minutes}m ${remainingSec}s`;
};

const OverviewCards: React.FC<OverviewCardsProps> = ({ data, loading }) => {
  if (loading || !data) {
    return (
      <div className="overview-cards">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="overview-card skeleton">
            <div className="skeleton-icon" />
            <div className="skeleton-value" />
            <div className="skeleton-label" />
          </div>
        ))}
      </div>
    );
  }

  const cards = [
    {
      key: 'totalExecutions',
      label: '총 실행',
      value: data.totalExecutions.toLocaleString(),
      color: 'blue',
    },
    {
      key: 'overallSuccessRate',
      label: '성공률',
      value: `${data.overallSuccessRate?.toFixed(1) || 0}%`,
      color: data.overallSuccessRate >= 90 ? 'green' : data.overallSuccessRate >= 70 ? 'yellow' : 'red',
    },
    {
      key: 'todayExecutions',
      label: '오늘 실행',
      value: data.todayExecutions.toLocaleString(),
      color: 'purple',
    },
    {
      key: 'recentFailures',
      label: '최근 실패 (7일)',
      value: data.recentFailures.toLocaleString(),
      color: data.recentFailures > 10 ? 'red' : data.recentFailures > 0 ? 'yellow' : 'green',
    },
    {
      key: 'avgExecutionTime',
      label: '평균 실행 시간',
      value: formatDuration(data.avgExecutionTime),
      color: 'cyan',
    },
  ];

  return (
    <div className="overview-cards">
      {cards.map((card) => (
        <div key={card.key} className={`overview-card card-${card.color}`}>
          <div className="card-value">{card.value}</div>
          <div className="card-label">{card.label}</div>
        </div>
      ))}
    </div>
  );
};

export default OverviewCards;
