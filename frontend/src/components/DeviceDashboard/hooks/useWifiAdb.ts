// frontend/src/components/DeviceDashboard/hooks/useWifiAdb.ts

import { useState, useCallback, useEffect } from 'react';
import { apiClient } from '../../../config/api';
import type { WifiDeviceConfig } from '../../../types';

interface UseWifiAdbOptions {
  onRefresh: () => void;
}

export function useWifiAdb({ onRefresh }: UseWifiAdbOptions) {
  // WiFi ADB 관리 상태
  const [wifiPanelOpen, setWifiPanelOpen] = useState(false);
  const [wifiConfigs, setWifiConfigs] = useState<WifiDeviceConfig[]>([]);
  const [wifiConnectedIds, setWifiConnectedIds] = useState<string[]>([]);
  const [wifiLoading, setWifiLoading] = useState(false);
  const [wifiConnecting, setWifiConnecting] = useState<string | null>(null);
  const [newWifiIp, setNewWifiIp] = useState('');
  const [newWifiPort, setNewWifiPort] = useState('5555');
  const [selectedUsbDevice, setSelectedUsbDevice] = useState('');
  const [switchingToWifi, setSwitchingToWifi] = useState(false);

  // WiFi 설정 목록 조회
  const fetchWifiConfigs = useCallback(async () => {
    try {
      const res = await apiClient.get(`/api/device/wifi/configs`);
      setWifiConfigs(res.data.configs || []);
    } catch (err) {
      console.error('WiFi 설정 조회 실패:', err);
    }
  }, []);

  // 연결된 WiFi 디바이스 조회
  const fetchWifiConnected = useCallback(async () => {
    try {
      const res = await apiClient.get(`/api/device/wifi/connected`);
      const connectedIds = (res.data.devices || []).map((d: { id: string }) => d.id);
      setWifiConnectedIds(connectedIds);
    } catch (err) {
      console.error('연결된 WiFi 디바이스 조회 실패:', err);
    }
  }, []);

  // WiFi 패널 열릴 때 데이터 로드
  useEffect(() => {
    if (wifiPanelOpen) {
      setWifiLoading(true);
      Promise.all([fetchWifiConfigs(), fetchWifiConnected()])
        .finally(() => setWifiLoading(false));
    }
  }, [wifiPanelOpen, fetchWifiConfigs, fetchWifiConnected]);

  // WiFi 연결
  const handleWifiConnect = useCallback(async (ip: string, port: number) => {
    const deviceId = `${ip}:${port}`;
    setWifiConnecting(deviceId);
    try {
      const res = await apiClient.post(`/api/device/wifi/connect`, { ip, port });
      if (res.data.success) {
        await Promise.all([fetchWifiConfigs(), fetchWifiConnected()]);
        onRefresh();
      } else {
        alert(`연결 실패: ${res.data.message}`);
      }
    } catch (err) {
      const error = err as Error;
      alert(`연결 실패: ${error.message}`);
    } finally {
      setWifiConnecting(null);
    }
  }, [fetchWifiConfigs, fetchWifiConnected, onRefresh]);

  // WiFi 연결 해제
  const handleWifiDisconnect = useCallback(async (deviceId: string) => {
    setWifiConnecting(deviceId);
    try {
      const res = await apiClient.post(`/api/device/wifi/disconnect`, { deviceId });
      if (res.data.success) {
        await fetchWifiConnected();
        onRefresh();
      } else {
        alert(`연결 해제 실패: ${res.data.message}`);
      }
    } catch (err) {
      const error = err as Error;
      alert(`연결 해제 실패: ${error.message}`);
    } finally {
      setWifiConnecting(null);
    }
  }, [fetchWifiConnected, onRefresh]);

  // WiFi 설정 삭제
  const handleWifiDelete = useCallback(async (ip: string, port: number) => {
    if (!confirm('이 WiFi 설정을 삭제하시겠습니까?')) return;
    try {
      await apiClient.delete(`/api/device/wifi/config`, { data: { ip, port } });
      await fetchWifiConfigs();
    } catch (err) {
      const error = err as Error;
      alert(`삭제 실패: ${error.message}`);
    }
  }, [fetchWifiConfigs]);

  // 새 WiFi 연결
  const handleNewWifiConnect = useCallback(async () => {
    const ip = newWifiIp.trim();
    const port = parseInt(newWifiPort, 10) || 5555;
    if (!ip) {
      alert('IP 주소를 입력하세요.');
      return;
    }
    const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipPattern.test(ip)) {
      alert('올바른 IP 주소 형식이 아닙니다.');
      return;
    }
    await handleWifiConnect(ip, port);
    setNewWifiIp('');
    setNewWifiPort('5555');
  }, [newWifiIp, newWifiPort, handleWifiConnect]);

  // USB → WiFi 전환
  const handleSwitchToWifi = useCallback(async () => {
    if (!selectedUsbDevice) {
      alert('USB 디바이스를 선택하세요.');
      return;
    }
    setSwitchingToWifi(true);
    try {
      const res = await apiClient.post(`/api/device/wifi/switch`, { deviceId: selectedUsbDevice });
      if (res.data.success) {
        alert(`WiFi ADB로 전환 성공!\n새 디바이스 ID: ${res.data.deviceId}\n\nUSB 케이블을 분리해도 연결이 유지됩니다.`);
        await Promise.all([fetchWifiConfigs(), fetchWifiConnected()]);
        onRefresh();
        setSelectedUsbDevice('');
      } else {
        alert(`전환 실패: ${res.data.message}`);
      }
    } catch (err) {
      const error = err as Error;
      alert(`전환 실패: ${error.message}`);
    } finally {
      setSwitchingToWifi(false);
    }
  }, [selectedUsbDevice, fetchWifiConfigs, fetchWifiConnected, onRefresh]);

  // 전체 재연결
  const handleReconnectAll = useCallback(async () => {
    setWifiLoading(true);
    try {
      const res = await apiClient.post(`/api/device/wifi/reconnect-all`);
      alert(`재연결 완료: ${res.data.success}개 성공, ${res.data.failed}개 실패`);
      await Promise.all([fetchWifiConfigs(), fetchWifiConnected()]);
      onRefresh();
    } catch (err) {
      const error = err as Error;
      alert(`재연결 실패: ${error.message}`);
    } finally {
      setWifiLoading(false);
    }
  }, [fetchWifiConfigs, fetchWifiConnected, onRefresh]);

  // 자동 재연결 토글
  const handleAutoReconnectToggle = useCallback(async (ip: string, port: number, autoReconnect: boolean) => {
    try {
      await apiClient.put(`/api/device/wifi/auto-reconnect`, { ip, port, autoReconnect });
      await fetchWifiConfigs();
    } catch (err) {
      console.error('자동 재연결 설정 실패:', err);
    }
  }, [fetchWifiConfigs]);

  return {
    // 상태
    wifiPanelOpen,
    wifiConfigs,
    wifiConnectedIds,
    wifiLoading,
    wifiConnecting,
    newWifiIp,
    newWifiPort,
    selectedUsbDevice,
    switchingToWifi,
    // 상태 설정자
    setWifiPanelOpen,
    setNewWifiIp,
    setNewWifiPort,
    setSelectedUsbDevice,
    // 핸들러
    handleWifiConnect,
    handleWifiDisconnect,
    handleWifiDelete,
    handleNewWifiConnect,
    handleSwitchToWifi,
    handleReconnectAll,
    handleAutoReconnectToggle,
  };
}
