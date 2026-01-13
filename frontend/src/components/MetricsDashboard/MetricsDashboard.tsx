// frontend/src/components/MetricsDashboard/MetricsDashboard.tsx
// 통합 메트릭 대시보드 메인 컴포넌트

import React, { useState } from 'react';
import { useDashboardData } from './useDashboardData';
import OverviewCards from './OverviewCards';
import SuccessRateChart from './SuccessRateChart';
import FailurePatterns from './FailurePatterns';
import ScenarioTable from './ScenarioTable';
import DevicePerformance from './DevicePerformance';
import RecentExecutions from './RecentExecutions';
import './MetricsDashboard.css';

interface MetricsDashboardProps {
  onNavigateToReports?: (executionId?: string) => void;
}

type PeriodOption = 7 | 30 | 90;

const MetricsDashboard: React.FC<MetricsDashboardProps> = ({ onNavigateToReports }) => {
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodOption>(30);
  const {
    overview,
    successTrend,
    failurePatterns,
    scenarioHistory,
    devicePerformance,
    recentExecutions,
    loading,
    error,
    refetch,
  } = useDashboardData(selectedPeriod);

  const handlePeriodChange = (period: PeriodOption) => {
    setSelectedPeriod(period);
  };

  const handleExecutionClick = (executionId: string) => {
    onNavigateToReports?.(executionId);
  };

  if (error) {
    return (
      <div className="metrics-dashboard">
        <div className="dashboard-error">
          <div className="error-icon">⚠️</div>
          <div className="error-message">{error}</div>
          <button className="btn-retry" onClick={refetch}>
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="metrics-dashboard">
      {/* 헤더 */}
      <header className="dashboard-header">
        <div className="header-left">
          <h1 className="dashboard-title">📊 통합 대시보드</h1>
        </div>
        <div className="header-right">
          <div className="period-selector">
            {([7, 30, 90] as PeriodOption[]).map((period) => (
              <button
                key={period}
                className={`period-btn ${selectedPeriod === period ? 'active' : ''}`}
                onClick={() => handlePeriodChange(period)}
              >
                {period}일
              </button>
            ))}
          </div>
          <button className="btn-refresh" onClick={refetch} disabled={loading}>
            {loading ? '⟳' : '🔄'} 새로고침
          </button>
        </div>
      </header>

      {/* KPI 카드 */}
      <section className="section-overview">
        <OverviewCards data={overview} loading={loading} />
      </section>

      {/* 차트 영역 */}
      <section className="section-charts">
        <div className="chart-row">
          <div className="chart-col-large">
            <SuccessRateChart data={successTrend} loading={loading} />
          </div>
          <div className="chart-col-small">
            <FailurePatterns data={failurePatterns} loading={loading} />
          </div>
        </div>
      </section>

      {/* 시나리오 테이블 */}
      <section className="section-table">
        <ScenarioTable data={scenarioHistory} loading={loading} />
      </section>

      {/* 하단 영역 */}
      <section className="section-bottom">
        <div className="bottom-col">
          <DevicePerformance data={devicePerformance} loading={loading} />
        </div>
        <div className="bottom-col">
          <RecentExecutions
            data={recentExecutions}
            loading={loading}
            onExecutionClick={handleExecutionClick}
          />
        </div>
      </section>
    </div>
  );
};

export default MetricsDashboard;
