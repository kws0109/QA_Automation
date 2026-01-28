// frontend/src/components/DeviceDashboard/components/EmptyState.tsx

import React from 'react';

interface EmptyStateProps {
  type: 'no-devices' | 'no-results' | 'loading';
}

const EmptyState: React.FC<EmptyStateProps> = ({ type }) => {
  if (type === 'loading') {
    return (
      <div className="device-dashboard">
        <div className="dashboard-loading">
          <div className="spinner-large" />
          <p>디바이스 정보 로딩 중...</p>
        </div>
      </div>
    );
  }

  if (type === 'no-devices') {
    return (
      <div className="no-devices">
        <p>연결된 디바이스가 없습니다.</p>
        <small>ADB로 디바이스를 연결하세요.</small>
      </div>
    );
  }

  // no-results
  return (
    <div className="no-devices">
      <p>검색 결과가 없습니다.</p>
      <small>필터 조건을 변경해보세요.</small>
    </div>
  );
};

export default EmptyState;
