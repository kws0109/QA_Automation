// frontend/src/components/DevicePreview/hooks/useDeviceConnection.ts

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useDevices } from '../../../contexts/DeviceContext';
import { apiClient, API_BASE_URL } from '../../../config/api';
import type { UseDeviceConnectionReturn } from '../types';

export function useDeviceConnection(
  onDeviceIdChange?: (deviceId: string) => void,
): UseDeviceConnectionReturn {
  // DeviceContext에서 데이터 가져오기 (10초 폴링 단일 소스)
  const { devices: allDevices, sessions, devicesLoading } = useDevices();

  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [hasSession, setHasSession] = useState<boolean>(false);
  const [creatingSession, setCreatingSession] = useState<boolean>(false);
  const [mjpegUrl, setMjpegUrl] = useState<string | null>(null);
  const [mjpegError, setMjpegError] = useState<boolean>(false);

  // 연결된 디바이스만 필터링
  const devices = useMemo(() => {
    return allDevices.filter(d => d.status === 'connected');
  }, [allDevices]);

  // 세션 존재 여부 확인 (세션 목록에서 확인)
  const checkExistingSession = useCallback((deviceId: string) => {
    if (!deviceId) {
      setHasSession(false);
      setMjpegUrl(null);
      return false;
    }

    const existingSession = sessions.find(s => s.deviceId === deviceId);
    if (existingSession) {
      setHasSession(true);
      setMjpegUrl(`${API_BASE_URL}/api/session/${deviceId}/mjpeg?t=${Date.now()}`);
      return true;
    }

    setHasSession(false);
    setMjpegUrl(null);
    return false;
  }, [sessions]);

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

  // 초기 디바이스 선택 (첫 번째 연결된 디바이스)
  useEffect(() => {
    if (!selectedDeviceId && devices.length > 0) {
      setSelectedDeviceId(devices[0].id);
    }
  }, [devices, selectedDeviceId]);

  // 디바이스 변경 시 기존 세션 확인 (sessions 변경 시 자동 업데이트)
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

  const selectedDevice = useMemo(() => {
    return devices.find(d => d.id === selectedDeviceId);
  }, [devices, selectedDeviceId]);

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
