// frontend/src/contexts/ExecutionContext.tsx
// 실행 센터 관련 컨텍스트

import React, { createContext, useContext, useCallback } from 'react';
import type { Socket } from 'socket.io-client';
import type { DeviceDetailedInfo, SessionInfo, Scenario } from '../types';
import { useAuth } from './AuthContext';
import { useDevices } from './DeviceContext';
import { useAppState } from './AppStateContext';
import { useUI } from './UIContext';

export interface ExecutionContextValue {
  // 디바이스 관련
  devices: DeviceDetailedInfo[];
  sessions: SessionInfo[];
  onSessionChange: () => void;

  // 시나리오 관련
  scenarios: Scenario[];

  // 소켓
  socket: Socket | null;

  // 사용자 정보
  userName: string;
  slackUserId: string;

  // 네비게이션
  onNavigateToReport: (reportId: string) => void;
}

const ExecutionContext = createContext<ExecutionContextValue | undefined>(undefined);

export function ExecutionProvider({ children }: { children: React.ReactNode }) {
  const { userName, slackUserId, socket } = useAuth();
  const { devices, sessions, fetchSessions } = useDevices();
  const { scenarios } = useAppState();
  const { setActiveTab, setPendingReportId } = useUI();

  // 테스트용 디바이스 필터링 (편집용 제외)
  const testDevices = devices.filter(d => d.role !== 'editing');

  const handleNavigateToReport = useCallback((reportId: string) => {
    setPendingReportId(reportId);
    setActiveTab('reports');
  }, [setPendingReportId, setActiveTab]);

  const value: ExecutionContextValue = {
    devices: testDevices,
    sessions,
    onSessionChange: fetchSessions,
    scenarios,
    socket,
    userName,
    slackUserId,
    onNavigateToReport: handleNavigateToReport,
  };

  return (
    <ExecutionContext.Provider value={value}>
      {children}
    </ExecutionContext.Provider>
  );
}

export function useExecution(): ExecutionContextValue {
  const context = useContext(ExecutionContext);
  if (!context) {
    throw new Error('useExecution must be used within an ExecutionProvider');
  }
  return context;
}
