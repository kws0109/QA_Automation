// frontend/src/components/DevicePreview/hooks/useDeviceConnection.ts

import { useState, useEffect, useCallback } from 'react';
import type { DeviceDetailedInfo } from '../../../types';
import { apiClient, API_BASE_URL } from '../../../config/api';
import type { UseDeviceConnectionReturn } from '../types';

interface SessionListResponse {
  success: boolean;
  sessions: { deviceId: string; mjpegPort: number }[];
}

interface DeviceListResponse {
  success: boolean;
  devices: DeviceDetailedInfo[];
}

export function useDeviceConnection(
  onDeviceIdChange?: (deviceId: string) => void,
): UseDeviceConnectionReturn {
  const [devices, setDevices] = useState<DeviceDetailedInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [devicesLoading, setDevicesLoading] = useState<boolean>(false);
  const [hasSession, setHasSession] = useState<boolean>(false);
  const [creatingSession, setCreatingSession] = useState<boolean>(false);
  const [mjpegUrl, setMjpegUrl] = useState<string | null>(null);
  const [mjpegError, setMjpegError] = useState<boolean>(false);

  // 디바이스 목록 조회
  const fetchDevices = useCallback(async (autoSelectFirst = false) => {
    setDevicesLoading(true);
    try {
      const res = await apiClient.get<DeviceListResponse>(
        `${API_BASE_URL}/api/device/list/detailed`,
      );
      if (res.data.success) {
        const connectedDevices = res.data.devices.filter(d => d.status === 'connected');
        setDevices(connectedDevices);

        if (autoSelectFirst && connectedDevices.length > 0) {
          setSelectedDeviceId(connectedDevices[0].id);
        }
      }
    } catch (err) {
      console.error('디바이스 목록 조회 실패:', err);
    } finally {
      setDevicesLoading(false);
    }
  }, []);

  // 세션 존재 여부 확인
  const checkExistingSession = useCallback(async (deviceId: string) => {
    if (!deviceId) {
      setHasSession(false);
      setMjpegUrl(null);
      return false;
    }

    try {
      const res = await apiClient.get<SessionListResponse>(
        `${API_BASE_URL}/api/session/list`,
      );
      if (res.data.success) {
        const existingSession = res.data.sessions.find(s => s.deviceId === deviceId);
        if (existingSession) {
          setHasSession(true);
          setMjpegUrl(`${API_BASE_URL}/api/session/${deviceId}/mjpeg?t=${Date.now()}`);
          return true;
        }
      }
    } catch (err) {
      console.error('세션 목록 조회 실패:', err);
    }

    setHasSession(false);
    setMjpegUrl(null);
    return false;
  }, []);

  // 세션 생성
  const connectSession = useCallback(async (deviceId: string) => {
    if (!deviceId) {
      setHasSession(false);
      setMjpegUrl(null);
      return;
    }

    setCreatingSession(true);
    setMjpegError(false);

    try {
      const res = await apiClient.post(`${API_BASE_URL}/api/session/create`, { deviceId });
      if (res.data.success) {
        setHasSession(true);
        setMjpegUrl(`${API_BASE_URL}/api/session/${deviceId}/mjpeg?t=${Date.now()}`);
      } else {
        setHasSession(false);
        setMjpegError(true);
      }
    } catch (err) {
      console.error('세션 생성 실패:', err);
      setHasSession(false);
      setMjpegError(true);
    } finally {
      setCreatingSession(false);
    }
  }, []);

  // 초기 로드 및 주기적 갱신
  useEffect(() => {
    fetchDevices(true);
    const interval = setInterval(() => fetchDevices(false), 30000);
    return () => clearInterval(interval);
  }, [fetchDevices]);

  // 디바이스 변경 시 기존 세션 확인
  useEffect(() => {
    if (selectedDeviceId) {
      setMjpegError(false);
      checkExistingSession(selectedDeviceId);
    } else {
      setHasSession(false);
      setMjpegUrl(null);
    }
  }, [selectedDeviceId, checkExistingSession]);

  // 선택된 디바이스 ID 변경 시 부모 컴포넌트에 알림
  useEffect(() => {
    onDeviceIdChange?.(selectedDeviceId);
  }, [selectedDeviceId, onDeviceIdChange]);

  const selectedDevice = devices.find(d => d.id === selectedDeviceId);

  const handleDeviceChange = useCallback((deviceId: string) => {
    if (deviceId === selectedDeviceId) return;
    setSelectedDeviceId(deviceId);
  }, [selectedDeviceId]);

  const handleConnectSession = useCallback(async () => {
    if (!selectedDeviceId) return;
    await connectSession(selectedDeviceId);
  }, [selectedDeviceId, connectSession]);

  const resetScreenState = useCallback(() => {
    // 외부에서 호출할 수 있는 상태 리셋 함수
  }, []);

  return {
    devices,
    selectedDeviceId,
    selectedDevice,
    devicesLoading,
    hasSession,
    creatingSession,
    mjpegUrl,
    mjpegError,
    setMjpegError,
    handleDeviceChange,
    handleConnectSession,
    resetScreenState,
  };
}
