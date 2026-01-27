// frontend/src/components/MetricsDashboard/DevicePerformance.tsx
// 디바이스별 성능 타임라인 스타일

import React from 'react';
import type { DevicePerformanceMetric } from '../../types';

interface DevicePerformanceProps {
  data: DevicePerformanceMetric[];
  loading: boolean;
}

const getStatusColor = (successRate: number): string => {
  if (successRate >= 90) return 'success';
  if (successRate >= 70) return 'warning';
  return 'danger';
};

const DevicePerformance: React.FC<DevicePerformanceProps> = ({ data, loading }) => {
  if (loading) {
    return (
      <div className="device-performance-card">
        <h3 className="card-title">디바이스별 성능</h3>
        <div className="executions-loading">
          <div className="spinner" />
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="device-performance-card">
        <h3 className="card-title">디바이스별 성능</h3>
        <div className="executions-empty">데이터가 없습니다</div>
      </div>
    );
  }

  return (
    <div className="device-performance-card">
      <h3 className="card-title">디바이스별 성능</h3>
      <div className="timeline-list">
        {data.map((device, index) => {
          const statusColor = getStatusColor(device.successRate);
          const deviceName = device.deviceName || device.model || device.deviceId.slice(0, 10);
          const fullName = `${device.brand || ''} ${device.model || ''}`.trim();
          const passedTests = Math.round(device.totalTests * device.successRate / 100);

          return (
            <div key={device.deviceId} className="timeline-item">
              <div className="timeline-rate">
                <span className={`rate-value rate-${statusColor}`}>
                  {device.successRate.toFixed(0)}%
                </span>
              </div>
              <div className="timeline-indicator">
                <div className={`timeline-dot dot-${statusColor}`} />
                {index < data.length - 1 && <div className="timeline-line" />}
              </div>
              <div className="timeline-content">
                <div className="timeline-title">{deviceName}</div>
                <div className="timeline-meta">
                  {fullName && <span>{fullName}</span>}
                  {fullName && <span className="meta-separator">·</span>}
                  <span>{device.totalTests}회 실행</span>
                  <span className="meta-separator">·</span>
                  <span className={`meta-result result-${statusColor}`}>
                    {passedTests}/{device.totalTests} 성공
                  </span>
                </div>
                <div className="device-progress-bar">
                  <div
                    className={`device-progress-fill progress-${statusColor}`}
                    style={{ width: `${device.successRate}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DevicePerformance;
