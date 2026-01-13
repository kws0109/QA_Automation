// frontend/src/components/MetricsDashboard/DevicePerformance.tsx
// 디바이스별 성능 수평 막대 차트

import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import type { DevicePerformanceMetric } from '../../types';

interface DevicePerformanceProps {
  data: DevicePerformanceMetric[];
  loading: boolean;
}

const getBarColor = (successRate: number): string => {
  if (successRate >= 90) return '#4ade80';
  if (successRate >= 70) return '#fbbf24';
  return '#f87171';
};

const DevicePerformance: React.FC<DevicePerformanceProps> = ({ data, loading }) => {
  if (loading) {
    return (
      <div className="chart-card">
        <h3 className="chart-title">디바이스별 성능</h3>
        <div className="chart-loading">
          <div className="spinner" />
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="chart-card">
        <h3 className="chart-title">디바이스별 성능</h3>
        <div className="chart-empty">데이터가 없습니다</div>
      </div>
    );
  }

  const chartData = data.map((d) => ({
    name: d.deviceName || d.model || d.deviceId.slice(0, 10),
    successRate: d.successRate,
    totalTests: d.totalTests,
    fullName: `${d.brand || ''} ${d.model || d.deviceId}`.trim(),
  }));

  return (
    <div className="chart-card">
      <h3 className="chart-title">디바이스별 성능</h3>
      <div className="chart-container device-chart">
        <ResponsiveContainer width="100%" height={250}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#3c3c3c" horizontal={false} />
            <XAxis
              type="number"
              domain={[0, 100]}
              stroke="#888"
              tick={{ fill: '#888', fontSize: 12 }}
              tickFormatter={(value) => `${value}%`}
            />
            <YAxis
              type="category"
              dataKey="name"
              stroke="#888"
              tick={{ fill: '#e0e0e0', fontSize: 12 }}
              width={75}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#2d2d2d',
                border: '1px solid #3c3c3c',
                borderRadius: '4px',
                color: '#e0e0e0',
              }}
              formatter={(value: number, name: string, props: { payload: { totalTests: number; fullName: string } }) => {
                if (name === 'successRate') {
                  return [`${value.toFixed(1)}% (${props.payload.totalTests}회 실행)`, props.payload.fullName];
                }
                return [value, name];
              }}
            />
            <Bar dataKey="successRate" name="성공률" barSize={20} radius={[0, 4, 4, 0]}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={getBarColor(entry.successRate)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default DevicePerformance;
