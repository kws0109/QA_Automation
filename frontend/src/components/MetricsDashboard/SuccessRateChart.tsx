// frontend/src/components/MetricsDashboard/SuccessRateChart.tsx
// 성공률 추이 차트 (라인 + 바 복합 차트)

import React from 'react';
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { SuccessRateTrend } from '../../types';

interface SuccessRateChartProps {
  data: SuccessRateTrend[];
  loading: boolean;
}

const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  return `${date.getMonth() + 1}/${date.getDate()}`;
};

const SuccessRateChart: React.FC<SuccessRateChartProps> = ({ data, loading }) => {
  if (loading) {
    return (
      <div className="chart-card">
        <h3 className="chart-title">성공률 추이</h3>
        <div className="chart-loading">
          <div className="spinner" />
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="chart-card">
        <h3 className="chart-title">성공률 추이</h3>
        <div className="chart-empty">데이터가 없습니다</div>
      </div>
    );
  }

  const chartData = data.map((item) => ({
    ...item,
    date: formatDate(item.date),
  }));

  return (
    <div className="chart-card">
      <h3 className="chart-title">성공률 추이</h3>
      <div className="chart-container">
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#3c3c3c" />
            <XAxis
              dataKey="date"
              stroke="#888"
              tick={{ fill: '#888', fontSize: 12 }}
            />
            <YAxis
              yAxisId="left"
              stroke="#4ade80"
              tick={{ fill: '#888', fontSize: 12 }}
              domain={[0, 100]}
              tickFormatter={(value) => `${value}%`}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke="#60a5fa"
              tick={{ fill: '#888', fontSize: 12 }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#2d2d2d',
                border: '1px solid #3c3c3c',
                borderRadius: '4px',
                color: '#e0e0e0',
              }}
              formatter={(value: number, name: string) => {
                if (name === '성공률') return [`${value.toFixed(1)}%`, name];
                return [value, name];
              }}
            />
            <Legend
              wrapperStyle={{ paddingTop: '10px' }}
              formatter={(value) => <span style={{ color: '#e0e0e0' }}>{value}</span>}
            />
            <Area
              yAxisId="right"
              type="monotone"
              dataKey="totalExecutions"
              name="실행 수"
              fill="#60a5fa"
              fillOpacity={0.15}
              stroke="#60a5fa"
              strokeWidth={1}
              strokeOpacity={0.5}
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="successRate"
              name="성공률"
              stroke="#4ade80"
              strokeWidth={2}
              dot={{ fill: '#4ade80', strokeWidth: 2, r: 4 }}
              activeDot={{ r: 6, stroke: '#4ade80', strokeWidth: 2 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default SuccessRateChart;
