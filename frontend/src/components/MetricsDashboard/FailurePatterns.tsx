// frontend/src/components/MetricsDashboard/FailurePatterns.tsx
// 실패 패턴 분석 (도넛 차트 + 리스트)

import React, { useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import type { FailurePattern } from '../../types';

interface FailurePatternsProps {
  data: FailurePattern[];
  loading: boolean;
}

const COLORS = ['#f87171', '#fbbf24', '#60a5fa', '#c084fc', '#4ade80', '#f472b6', '#a78bfa'];

const categoryLabels: Record<string, string> = {
  timeout: '타임아웃',
  element: '요소 검색',
  image: '이미지 매칭',
  app: '앱 오류',
  system: '시스템 오류',
  unknown: '미분류',
};

const FailurePatterns: React.FC<FailurePatternsProps> = ({ data, loading }) => {
  const [selectedPattern, setSelectedPattern] = useState<FailurePattern | null>(null);

  if (loading) {
    return (
      <div className="chart-card">
        <h3 className="chart-title">실패 패턴 분석</h3>
        <div className="chart-loading">
          <div className="spinner" />
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="chart-card">
        <h3 className="chart-title">실패 패턴 분석</h3>
        <div className="chart-empty">실패 데이터가 없습니다</div>
      </div>
    );
  }

  const chartData = data.map((item) => ({
    name: categoryLabels[item.failureCategory] || item.failureCategory,
    value: item.count,
    pattern: item,
  }));

  const totalFailures = data.reduce((sum, p) => sum + p.count, 0);

  return (
    <div className="chart-card failure-patterns">
      <h3 className="chart-title">실패 패턴 분석</h3>
      <div className="failure-content">
        <div className="failure-chart">
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
                onClick={(_, index) => setSelectedPattern(data[index])}
                style={{ cursor: 'pointer' }}
              >
                {chartData.map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[index % COLORS.length]}
                    stroke="#1e1e1e"
                    strokeWidth={2}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: '#2d2d2d',
                  border: '1px solid #3c3c3c',
                  borderRadius: '4px',
                  color: '#e0e0e0',
                }}
                formatter={(value: number) => [`${value}건`, '발생 횟수']}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="total-failures">
            <span className="total-value">{totalFailures}</span>
            <span className="total-label">총 실패</span>
          </div>
        </div>

        <div className="failure-list">
          {data.slice(0, 5).map((pattern, index) => (
            <div
              key={`${pattern.failureCategory}-${index}`}
              className={`failure-item ${selectedPattern === pattern ? 'selected' : ''}`}
              onClick={() => setSelectedPattern(pattern)}
            >
              <div
                className="failure-color"
                style={{ backgroundColor: COLORS[index % COLORS.length] }}
              />
              <div className="failure-info">
                <span className="failure-name">
                  {categoryLabels[pattern.failureCategory] || pattern.failureCategory}
                </span>
                <span className="failure-type">{pattern.failureType}</span>
              </div>
              <div className="failure-stats">
                <span className="failure-count">{pattern.count}건</span>
                <span className="failure-percent">{pattern.percentage.toFixed(1)}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {selectedPattern && (
        <div className="failure-detail">
          <h4>최근 발생</h4>
          <div className="recent-occurrences">
            {selectedPattern.recentOccurrences.slice(0, 3).map((occ, idx) => (
              <div key={idx} className="occurrence-item">
                <span className="occ-scenario">{occ.scenarioName}</span>
                <span className="occ-device">{occ.deviceName}</span>
                <span className="occ-time">
                  {new Date(occ.occurredAt).toLocaleString('ko-KR', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default FailurePatterns;
