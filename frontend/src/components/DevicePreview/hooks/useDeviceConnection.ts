// frontend/src/components/DevicePreview/hooks/useDeviceConnection.ts

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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

  // MJPEG 자동 재연결 관련 상태
  const mjpegRetryCount = useRef<number>(0);
  const mjpegRetryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxMjpegRetries = 5;
  const baseRetryDelay = 1000; // 1초

  // 연결된 디바이스만 필터링
  const devices = useMemo(() => {
    return allDevices.filter(d => d.status === 'connected');
  }, [allDevices]);

  // MJPEG 재연결 타이머 정리
  const clearMjpegRetryTimer = useCallback(() => {
    if (mjpegRetryTimer.current) {
      clearTimeout(mjpegRetryTimer.current);
      mjpegRetryTimer.current = null;
    }
  }, []);

  // MJPEG URL 갱신 (재연결용)
  const refreshMjpegUrl = useCallback((deviceId: string) => {
    setMjpegUrl(`${API_BASE_URL}/api/session/${deviceId}/mjpeg?t=${Date.now()}`);
    setMjpegError(false);
  }, []);

  // MJPEG 에러 처리 및 자동 재연결
  const handleMjpegError = useCallback(() => {
    if (mjpegRetryCount.current >= maxMjpegRetries) {
      console.warn(`[MJPEG] 최대 재시도 횟수(${maxMjpegRetries}) 도달, 재연결 중단`);
      setMjpegError(true);
      mjpegRetryCount.current = 0;
      return;
    }

    mjpegRetryCount.current++;
    const delay = baseRetryDelay * Math.pow(2, mjpegRetryCount.current - 1); // 지수 백오프: 1s, 2s, 4s, 8s, 16s
    console.log(`[MJPEG] 에러 발생, ${delay}ms 후 재연결 시도 (${mjpegRetryCount.current}/${maxMjpegRetries})`);

    clearMjpegRetryTimer();
    mjpegRetryTimer.current = setTimeout(() => {
      if (selectedDeviceId) {
        refreshMjpegUrl(selectedDeviceId);
      }
    }, delay);
  }, [selectedDeviceId, clearMjpegRetryTimer, refreshMjpegUrl]);

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
      mjpegRetryCount.current = 0; // 재시도 카운트 리셋
      clearMjpegRetryTimer();
      setMjpegUrl(`${API_BASE_URL}/api/session/${deviceId}/mjpeg?t=${Date.now()}`);
      return true;
    }

    setHasSession(false);
    setMjpegUrl(null);
    return false;
  }, [sessions, clearMjpegRetryTimer]);

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
    mjpegRetryCount.current = 0;
    clearMjpegRetryTimer();
  }, [clearMjpegRetryTimer]);

  // 컴포넌트 언마운트 시 타이머 정리
  useEffect(() => {
    return () => {
      clearMjpegRetryTimer();
    };
  }, [clearMjpegRetryTimer]);

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
    handleMjpegError, // 자동 재연결용
    handleDeviceChange,
    handleConnectSession,
    resetScreenState,
  };
}
