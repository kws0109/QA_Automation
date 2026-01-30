// frontend/src/contexts/DeviceContext.tsx

import { createContext, useContext, useState, useEffect, useCallback, ReactNode, useMemo } from 'react';
import { apiClient, API_BASE_URL } from '../config/api';
import type { DeviceDetailedInfo, SessionInfo, DeviceExecutionStatus } from '../types';
import { useAuth } from './AuthContext';

interface DeviceContextType {
  // State
  devices: DeviceDetailedInfo[];
  sessions: SessionInfo[];
  devicesLoading: boolean;
  devicesRefreshing: boolean;
  previewDeviceId: string;

  // Computed
  deviceExecutionStatus: Map<string, DeviceExecutionStatus>;

  // Actions
  fetchDevices: () => Promise<void>;
  fetchSessions: () => Promise<void>;
  handleRefreshDevices: () => Promise<void>;
  setPreviewDeviceId: (id: string) => void;
}

const DeviceContext = createContext<DeviceContextType | null>(null);

interface DeviceProviderProps {
  children: ReactNode;
}

export function DeviceProvider({ children }: DeviceProviderProps) {
  const { isAuthenticated, authLoading } = useAuth();

  const [devices, setDevices] = useState<DeviceDetailedInfo[]>([]);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(true);
  const [devicesRefreshing, setDevicesRefreshing] = useState(false);
  const [previewDeviceId, setPreviewDeviceId] = useState<string>('');

  // Fetch devices
  const fetchDevices = useCallback(async () => {
    try {
      const res = await apiClient.get<{ success: boolean; devices: DeviceDetailedInfo[] }>(
        `${API_BASE_URL}/api/device/list/detailed`,
      );
      if (res.data.success && Array.isArray(res.data.devices)) {
        setDevices(res.data.devices);
      } else {
        setDevices([]);
      }
    } catch (err) {
      console.error('Failed to fetch devices:', err);
      setDevices([]);
    }
  }, []);

  // Fetch sessions
  const fetchSessions = useCallback(async () => {
    try {
      const res = await apiClient.get<{ success: boolean; sessions: SessionInfo[] }>(
        `${API_BASE_URL}/api/session/list`,
      );
      if (res.data.success && Array.isArray(res.data.sessions)) {
        setSessions(res.data.sessions);
      } else {
        setSessions([]);
      }
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
      setSessions([]);
    }
  }, []);

  // Manual refresh
  const handleRefreshDevices = useCallback(async () => {
    setDevicesRefreshing(true);
    await Promise.all([fetchDevices(), fetchSessions()]);
    setDevicesRefreshing(false);
  }, [fetchDevices, fetchSessions]);

  // Initial load and polling - only when authenticated
  useEffect(() => {
    // Don't poll if auth is still loading or user is not authenticated
    if (authLoading || !isAuthenticated) {
      setDevicesLoading(false);
      return;
    }

    const loadData = async () => {
      setDevicesLoading(true);
      await Promise.all([fetchDevices(), fetchSessions()]);
      setDevicesLoading(false);
    };
    loadData();

    // Refresh every 10 seconds
    const interval = setInterval(() => {
      fetchDevices();
      fetchSessions();
    }, 10000);

    return () => clearInterval(interval);
  }, [fetchDevices, fetchSessions, isAuthenticated, authLoading]);

  // Device execution status (currently unused - placeholder for future implementation)
  const deviceExecutionStatus = useMemo(() => {
    return new Map<string, DeviceExecutionStatus>();
  }, []);

  const value: DeviceContextType = {
    devices,
    sessions,
    devicesLoading,
    devicesRefreshing,
    previewDeviceId,
    deviceExecutionStatus,
    fetchDevices,
    fetchSessions,
    handleRefreshDevices,
    setPreviewDeviceId,
  };

  return (
    <DeviceContext.Provider value={value}>
      {children}
    </DeviceContext.Provider>
  );
}

export function useDevices(): DeviceContextType {
  const context = useContext(DeviceContext);
  if (!context) {
    throw new Error('useDevices must be used within a DeviceProvider');
  }
  return context;
}
