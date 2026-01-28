// frontend/src/components/DeviceDashboard/components/DashboardHeader.tsx

import React from 'react';
import type { DashboardHeaderProps } from './types';

const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  connectedCount,
  sessionCount,
  devicesWithoutSessionCount,
  creatingAllSessions,
  syncingTemplates,
  refreshing,
  lastSyncResult,
  onCreateAllSessions,
  onSyncTemplates,
  onRefresh,
}) => {
  return (
    <div className="dashboard-header">
      <div className="header-left">
        <h2>디바이스 관리</h2>
        <span className="device-count">
          {connectedCount}개 연결됨 / {sessionCount}개 세션 활성
        </span>
      </div>
      <div className="header-right">
        <button
          className="btn-connect-all"
          onClick={onCreateAllSessions}
          disabled={creatingAllSessions || devicesWithoutSessionCount === 0}
        >
          {creatingAllSessions ? '연결 중...' : `전체 세션 연결 (${devicesWithoutSessionCount})`}
        </button>
        <button
          className="btn-sync-templates"
          onClick={onSyncTemplates}
          disabled={syncingTemplates}
          title="모든 디바이스에 템플릿 동기화"
        >
          {syncingTemplates ? '동기화 중...' : '템플릿 동기화'}
        </button>
        {lastSyncResult && <span className="sync-result">{lastSyncResult}</span>}
        <button className="btn-refresh" onClick={onRefresh} disabled={refreshing}>
          {refreshing ? '갱신 중...' : '새로고침'}
        </button>
      </div>
    </div>
  );
};

export default DashboardHeader;
