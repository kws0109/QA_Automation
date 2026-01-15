// frontend/src/components/DeviceDashboard/DeviceDashboard.tsx

import { useState, useMemo, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  DeviceDetailedInfo,
  SessionInfo,
  DeviceExecutionStatus,
  WifiDeviceConfig,
  DeviceRole,
} from '../../types';
import { useScreenshotPolling } from '../../hooks/useScreenshotPolling';
import './DeviceDashboard.css';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:3001';

interface DeviceDashboardProps {
  devices: DeviceDetailedInfo[];
  sessions: SessionInfo[];
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onSessionChange: () => void;
  executionStatus: Map<string, DeviceExecutionStatus>;
}

export default function DeviceDashboard({
  devices,
  sessions,
  loading,
  refreshing,
  onRefresh,
  onSessionChange,
  executionStatus,
}: DeviceDashboardProps) {
  const [creatingSession, setCreatingSession] = useState<string | null>(null);
  const [creatingAllSessions, setCreatingAllSessions] = useState(false);

  // 검색/필터 상태
  const [searchText, setSearchText] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterBrand, setFilterBrand] = useState<string>('all');
  const [filterOS, setFilterOS] = useState<string>('all');

  // 별칭 편집 상태
  const [editingAliasId, setEditingAliasId] = useState<string | null>(null);
  const [editingAliasValue, setEditingAliasValue] = useState<string>('');

  // 프리뷰 패널 상태 (최대 4개)
  const MAX_PREVIEWS = 4;
  const [previewDeviceIds, setPreviewDeviceIds] = useState<string[]>([]);
  const [previewPanelHeight, setPreviewPanelHeight] = useState(300);
  const [isResizing, setIsResizing] = useState(false);

  // WiFi ADB 관리 상태
  const [wifiPanelOpen, setWifiPanelOpen] = useState(false);
  const [wifiConfigs, setWifiConfigs] = useState<WifiDeviceConfig[]>([]);
  const [wifiConnectedIds, setWifiConnectedIds] = useState<string[]>([]);
  const [wifiLoading, setWifiLoading] = useState(false);
  const [wifiConnecting, setWifiConnecting] = useState<string | null>(null);

  // 새 WiFi 연결 폼
  const [newWifiIp, setNewWifiIp] = useState('');
  const [newWifiPort, setNewWifiPort] = useState('5555');

  // USB → WiFi 전환
  const [selectedUsbDevice, setSelectedUsbDevice] = useState('');
  const [switchingToWifi, setSwitchingToWifi] = useState(false);

  // 템플릿 동기화 상태
  const [syncingTemplates, setSyncingTemplates] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<string | null>(null);

  // 디바이스 역할 변경 상태
  const [updatingRole, setUpdatingRole] = useState<string | null>(null);

  // 세션이 있는 프리뷰 디바이스만 필터링
  const previewDevicesWithSession = useMemo(() => {
    return previewDeviceIds.filter(id => sessions.some(s => s.deviceId === id));
  }, [previewDeviceIds, sessions]);

  // 스크린샷 폴링 훅 (세션 있는 프리뷰 디바이스만 구독)
  const { screenshots, isConnected: screenshotConnected } = useScreenshotPolling(
    previewDevicesWithSession,
    true,
  );

  // 세션 생성
  const handleCreateSession = async (deviceId: string) => {
    setCreatingSession(deviceId);
    try {
      await axios.post(`${API_BASE}/api/session/create`, { deviceId });
      onSessionChange();
    } catch (err) {
      const error = err as Error;
      alert(`세션 생성 실패: ${error.message}`);
    } finally {
      setCreatingSession(null);
    }
  };

  // 세션 종료
  const handleDestroySession = async (deviceId: string) => {
    try {
      await axios.post(`${API_BASE}/api/session/destroy`, { deviceId });
      onSessionChange();
    } catch (err) {
      const error = err as Error;
      alert(`세션 종료 실패: ${error.message}`);
    }
  };

  // 세션 여부 확인
  const hasSession = (deviceId: string) => sessions.some(s => s.deviceId === deviceId);

  // 디바이스 역할 변경
  const handleToggleRole = async (deviceId: string, currentRole?: DeviceRole) => {
    setUpdatingRole(deviceId);
    const newRole: DeviceRole = currentRole === 'editing' ? 'testing' : 'editing';
    try {
      await axios.put(`${API_BASE}/api/device/${encodeURIComponent(deviceId)}/role`, { role: newRole });
      onRefresh();  // 디바이스 목록 갱신
    } catch (err) {
      const error = err as Error;
      alert(`역할 변경 실패: ${error.message}`);
    } finally {
      setUpdatingRole(null);
    }
  };

  // 세션 없는 연결된 디바이스 목록
  const devicesWithoutSession = devices.filter(
    d => d.status === 'connected' && !hasSession(d.id),
  );

  // 전체 세션 생성
  const handleCreateAllSessions = async () => {
    if (devicesWithoutSession.length === 0) return;

    setCreatingAllSessions(true);
    try {
      // 순차적으로 세션 생성 (병렬로 하면 Appium 서버에 부하)
      for (const device of devicesWithoutSession) {
        try {
          await axios.post(`${API_BASE}/api/session/create`, { deviceId: device.id });
        } catch (err) {
          console.error(`세션 생성 실패 (${device.id}):`, err);
        }
      }
      onSessionChange();
    } finally {
      setCreatingAllSessions(false);
    }
  };

  // 템플릿 동기화 (모든 연결된 디바이스)
  const handleSyncTemplates = async () => {
    setSyncingTemplates(true);
    setLastSyncResult(null);
    try {
      const response = await axios.post(`${API_BASE}/api/device/templates/sync-all`);
      if (response.data.success) {
        setLastSyncResult(response.data.message);
        setTimeout(() => setLastSyncResult(null), 5000);
      } else {
        setLastSyncResult('동기화 실패');
      }
    } catch (error) {
      console.error('Template sync error:', error);
      setLastSyncResult('동기화 오류');
    } finally {
      setSyncingTemplates(false);
    }
  };

  // 프리뷰 추가
  const handleAddPreview = (deviceId: string) => {
    if (previewDeviceIds.includes(deviceId)) {
      // 이미 있으면 제거
      setPreviewDeviceIds(prev => prev.filter(id => id !== deviceId));
    } else if (previewDeviceIds.length < MAX_PREVIEWS) {
      // 최대 4개까지 추가
      setPreviewDeviceIds(prev => [...prev, deviceId]);
    }
  };

  // 프리뷰 제거
  const handleRemovePreview = (deviceId: string) => {
    setPreviewDeviceIds(prev => prev.filter(id => id !== deviceId));
  };

  // WiFi 설정 목록 가져오기
  const fetchWifiConfigs = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/device/wifi/configs`);
      setWifiConfigs(res.data.configs || []);
    } catch (err) {
      console.error('WiFi 설정 조회 실패:', err);
    }
  }, []);

  // 연결된 WiFi 디바이스 목록 가져오기
  const fetchWifiConnected = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/device/wifi/connected`);
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

  // WiFi 디바이스 연결
  const handleWifiConnect = async (ip: string, port: number) => {
    const deviceId = `${ip}:${port}`;
    setWifiConnecting(deviceId);
    try {
      const res = await axios.post(`${API_BASE}/api/device/wifi/connect`, { ip, port });
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
  };

  // WiFi 디바이스 연결 해제
  const handleWifiDisconnect = async (deviceId: string) => {
    setWifiConnecting(deviceId);
    try {
      const res = await axios.post(`${API_BASE}/api/device/wifi/disconnect`, { deviceId });
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
  };

  // WiFi 설정 삭제
  const handleWifiDelete = async (ip: string, port: number) => {
    if (!confirm('이 WiFi 설정을 삭제하시겠습니까?')) return;

    try {
      await axios.delete(`${API_BASE}/api/device/wifi/config`, { data: { ip, port } });
      await fetchWifiConfigs();
    } catch (err) {
      const error = err as Error;
      alert(`삭제 실패: ${error.message}`);
    }
  };

  // 새 WiFi 디바이스 연결 (수동 입력)
  const handleNewWifiConnect = async () => {
    const ip = newWifiIp.trim();
    const port = parseInt(newWifiPort, 10) || 5555;

    if (!ip) {
      alert('IP 주소를 입력하세요.');
      return;
    }

    // IP 형식 검증
    const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipPattern.test(ip)) {
      alert('올바른 IP 주소 형식이 아닙니다.');
      return;
    }

    await handleWifiConnect(ip, port);
    setNewWifiIp('');
    setNewWifiPort('5555');
  };

  // USB → WiFi 전환
  const handleSwitchToWifi = async () => {
    if (!selectedUsbDevice) {
      alert('USB 디바이스를 선택하세요.');
      return;
    }

    setSwitchingToWifi(true);
    try {
      const res = await axios.post(`${API_BASE}/api/device/wifi/switch`, {
        deviceId: selectedUsbDevice,
      });
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
  };

  // 전체 WiFi 재연결
  const handleReconnectAll = async () => {
    setWifiLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/api/device/wifi/reconnect-all`);
      alert(`재연결 완료: ${res.data.success}개 성공, ${res.data.failed}개 실패`);
      await Promise.all([fetchWifiConfigs(), fetchWifiConnected()]);
      onRefresh();
    } catch (err) {
      const error = err as Error;
      alert(`재연결 실패: ${error.message}`);
    } finally {
      setWifiLoading(false);
    }
  };

  // 자동 재연결 설정 토글
  const handleAutoReconnectToggle = async (ip: string, port: number, autoReconnect: boolean) => {
    try {
      await axios.put(`${API_BASE}/api/device/wifi/auto-reconnect`, {
        ip,
        port,
        autoReconnect,
      });
      await fetchWifiConfigs();
    } catch (err) {
      console.error('자동 재연결 설정 실패:', err);
    }
  };

  // USB 디바이스 목록 (WiFi 전환용)
  const usbDevices = useMemo(() => {
    return devices.filter(d =>
      d.status === 'connected' &&
      !d.id.includes(':'),  // WiFi 디바이스는 IP:PORT 형식
    );
  }, [devices]);

  // WiFi 디바이스 여부 확인
  const isWifiDevice = (deviceId: string) => {
    // IP:PORT 형식이면 WiFi 디바이스
    return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d+$/.test(deviceId);
  };

  // 프리뷰 패널 리사이즈
  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);

    const startY = e.clientY;
    const startHeight = previewPanelHeight;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = startY - moveEvent.clientY;
      const newHeight = Math.max(150, Math.min(600, startHeight + deltaY));
      setPreviewPanelHeight(newHeight);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // 필터 옵션 (디바이스 목록에서 고유값 추출)
  const filterOptions = useMemo(() => {
    const brands = [...new Set(devices.map(d => d.brand).filter(Boolean))].sort();
    const osVersions = [...new Set(devices.map(d => `${d.os} ${d.osVersion}`).filter(v => !v.includes('Unknown')))].sort();
    return { brands, osVersions };
  }, [devices]);

  // 필터링된 디바이스 목록
  const filteredDevices = useMemo(() => {
    return devices.filter(device => {
      // 텍스트 검색 (ID, 이름, 모델, 브랜드)
      if (searchText) {
        const search = searchText.toLowerCase();
        const matchesSearch =
          device.id.toLowerCase().includes(search) ||
          device.name.toLowerCase().includes(search) ||
          device.model.toLowerCase().includes(search) ||
          device.brand.toLowerCase().includes(search);
        if (!matchesSearch) return false;
      }

      // 상태 필터
      if (filterStatus !== 'all') {
        if (filterStatus === 'session' && !hasSession(device.id)) return false;
        if (filterStatus === 'connected' && device.status !== 'connected') return false;
        if (filterStatus === 'offline' && device.status !== 'offline') return false;
      }

      // 브랜드 필터
      if (filterBrand !== 'all' && device.brand !== filterBrand) return false;

      // OS 필터
      if (filterOS !== 'all') {
        const deviceOSVersion = `${device.os} ${device.osVersion}`;
        if (deviceOSVersion !== filterOS) return false;
      }

      return true;
    });
  }, [devices, searchText, filterStatus, filterBrand, filterOS, sessions]);

  // 필터 초기화
  const resetFilters = () => {
    setSearchText('');
    setFilterStatus('all');
    setFilterBrand('all');
    setFilterOS('all');
  };

  // 별칭 편집 시작
  const startEditingAlias = (device: DeviceDetailedInfo, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingAliasId(device.id);
    setEditingAliasValue(device.alias || '');
  };

  // 별칭 저장
  const saveAlias = async (deviceId: string) => {
    try {
      await axios.put(`${API_BASE}/api/device/${deviceId}/alias`, {
        alias: editingAliasValue.trim(),
      });
      onRefresh();
    } catch (err) {
      console.error('별칭 저장 실패:', err);
    } finally {
      setEditingAliasId(null);
      setEditingAliasValue('');
    }
  };

  // 별칭 편집 취소
  const cancelEditingAlias = () => {
    setEditingAliasId(null);
    setEditingAliasValue('');
  };

  // 별칭 편집 키 핸들러
  const handleAliasKeyDown = (e: React.KeyboardEvent, deviceId: string) => {
    if (e.key === 'Enter') {
      saveAlias(deviceId);
    } else if (e.key === 'Escape') {
      cancelEditingAlias();
    }
  };

  // 오프라인 디바이스 삭제
  const handleDeleteDevice = async (deviceId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('이 디바이스를 목록에서 삭제하시겠습니까?')) return;

    try {
      await axios.delete(`${API_BASE}/api/device/${deviceId}`);
      onRefresh();
    } catch (err) {
      const error = err as Error;
      alert(`삭제 실패: ${error.message}`);
    }
  };

  // 디바이스 표시명 (alias 우선)
  const getDeviceDisplayName = (device: DeviceDetailedInfo) => {
    return device.alias || `${device.brand} ${device.model}`;
  };

  // 마지막 연결 시간 포맷
  const formatLastConnected = (dateStr?: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('ko-KR', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 배터리 아이콘
  const getBatteryIcon = (level: number, status: string) => {
    if (status === 'charging') return '⚡';
    if (level >= 80) return '🔋';
    if (level >= 50) return '🔋';
    if (level >= 20) return '🪫';
    return '🪫';
  };

  // 메모리 사용률 계산
  const getMemoryUsagePercent = (total: number, available: number) => {
    if (total === 0) return 0;
    return Math.round(((total - available) / total) * 100);
  };

  // 스토리지 사용률 계산
  const getStorageUsagePercent = (total: number, available: number) => {
    if (total === 0) return 0;
    return Math.round(((total - available) / total) * 100);
  };

  if (loading) {
    return (
      <div className="device-dashboard">
        <div className="dashboard-loading">
          <div className="spinner-large" />
          <p>디바이스 정보 로딩 중...</p>
        </div>
      </div>
    );
  }

  const connectedDevices = devices.filter(d => d.status === 'connected');
  const sessionCount = sessions.length;

  return (
    <div className="device-dashboard">
      {/* 헤더 */}
      <div className="dashboard-header">
        <div className="header-left">
          <h2>디바이스 관리</h2>
          <span className="device-count">
            {connectedDevices.length}개 연결됨 / {sessionCount}개 세션 활성
          </span>
        </div>
        <div className="header-right">
          <button
            className="btn-connect-all"
            onClick={handleCreateAllSessions}
            disabled={creatingAllSessions || devicesWithoutSession.length === 0}
          >
            {creatingAllSessions
              ? '연결 중...'
              : `전체 세션 연결 (${devicesWithoutSession.length})`}
          </button>
          <button
            className="btn-sync-templates"
            onClick={handleSyncTemplates}
            disabled={syncingTemplates}
            title="모든 디바이스에 템플릿 동기화"
          >
            {syncingTemplates ? '동기화 중...' : '템플릿 동기화'}
          </button>
          {lastSyncResult && (
            <span className="sync-result">{lastSyncResult}</span>
          )}
          <button
            className="btn-refresh"
            onClick={onRefresh}
            disabled={refreshing}
          >
            {refreshing ? '갱신 중...' : '새로고침'}
          </button>
        </div>
      </div>

      <div className="dashboard-content">
        {/* 디바이스 그리드 */}
        <div className="devices-section devices-section-full">
          <div className="section-header">
            <h3>디바이스 목록</h3>
          </div>

          {/* WiFi ADB 관리 패널 */}
          <div className={`wifi-panel ${wifiPanelOpen ? 'open' : ''}`}>
            <div
              className="wifi-panel-header"
              onClick={() => setWifiPanelOpen(!wifiPanelOpen)}
            >
              <span className="wifi-panel-title">
                <span className="wifi-icon">📶</span>
                WiFi ADB 관리
                {wifiConfigs.length > 0 && (
                  <span className="wifi-count">({wifiConfigs.length})</span>
                )}
              </span>
              <span className={`wifi-panel-toggle ${wifiPanelOpen ? 'open' : ''}`}>
                ▼
              </span>
            </div>

            {wifiPanelOpen && (
              <div className="wifi-panel-content">
                {wifiLoading ? (
                  <div className="wifi-loading">
                    <div className="spinner" />
                    <span>로딩 중...</span>
                  </div>
                ) : (
                  <>
                    {/* 저장된 WiFi 연결 목록 */}
                    <div className="wifi-section">
                      <div className="wifi-section-header">
                        <span>저장된 WiFi 연결</span>
                        {wifiConfigs.length > 0 && (
                          <button
                            className="btn-wifi-reconnect-all"
                            onClick={handleReconnectAll}
                            disabled={wifiLoading}
                          >
                            전체 재연결
                          </button>
                        )}
                      </div>

                      {wifiConfigs.length === 0 ? (
                        <div className="wifi-empty">
                          저장된 WiFi 연결이 없습니다.
                        </div>
                      ) : (
                        <div className="wifi-list">
                          {wifiConfigs.map(config => {
                            const isConnected = wifiConnectedIds.includes(config.deviceId);
                            const isLoading = wifiConnecting === config.deviceId;

                            return (
                              <div key={config.deviceId} className="wifi-item">
                                <div className="wifi-item-info">
                                  <div className="wifi-item-header">
                                    <span className="wifi-device-id">{config.deviceId}</span>
                                    <span className={`wifi-status ${isConnected ? 'connected' : 'disconnected'}`}>
                                      {isConnected ? '● 연결됨' : '○ 연결 안됨'}
                                    </span>
                                  </div>
                                  <div className="wifi-item-details">
                                    {config.alias && (
                                      <span className="wifi-alias">별칭: {config.alias}</span>
                                    )}
                                    <label className="wifi-auto-reconnect">
                                      <input
                                        type="checkbox"
                                        checked={config.autoReconnect}
                                        onChange={(e) => handleAutoReconnectToggle(
                                          config.ip,
                                          config.port,
                                          e.target.checked,
                                        )}
                                      />
                                      자동 재연결
                                    </label>
                                  </div>
                                </div>
                                <div className="wifi-item-actions">
                                  {isConnected ? (
                                    <button
                                      className="btn-wifi-disconnect"
                                      onClick={() => handleWifiDisconnect(config.deviceId)}
                                      disabled={isLoading}
                                    >
                                      {isLoading ? '...' : '연결 끊기'}
                                    </button>
                                  ) : (
                                    <button
                                      className="btn-wifi-connect"
                                      onClick={() => handleWifiConnect(config.ip, config.port)}
                                      disabled={isLoading}
                                    >
                                      {isLoading ? '연결 중...' : '연결'}
                                    </button>
                                  )}
                                  <button
                                    className="btn-wifi-delete"
                                    onClick={() => handleWifiDelete(config.ip, config.port)}
                                    disabled={isLoading}
                                    title="설정 삭제"
                                  >
                                    ✕
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* 새 WiFi 디바이스 연결 */}
                    <div className="wifi-section">
                      <div className="wifi-section-header">
                        <span>새 WiFi 디바이스 연결</span>
                      </div>
                      <div className="wifi-new-form">
                        <input
                          type="text"
                          className="wifi-input-ip"
                          placeholder="IP 주소 (예: 192.168.1.100)"
                          value={newWifiIp}
                          onChange={(e) => setNewWifiIp(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleNewWifiConnect()}
                        />
                        <input
                          type="text"
                          className="wifi-input-port"
                          placeholder="포트"
                          value={newWifiPort}
                          onChange={(e) => setNewWifiPort(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleNewWifiConnect()}
                        />
                        <button
                          className="btn-wifi-new-connect"
                          onClick={handleNewWifiConnect}
                          disabled={!newWifiIp.trim() || wifiConnecting !== null}
                        >
                          연결
                        </button>
                      </div>
                    </div>

                    {/* USB → WiFi 전환 */}
                    <div className="wifi-section">
                      <div className="wifi-section-header">
                        <span>USB → WiFi 전환</span>
                      </div>
                      <div className="wifi-switch-form">
                        <select
                          className="wifi-select-usb"
                          value={selectedUsbDevice}
                          onChange={(e) => setSelectedUsbDevice(e.target.value)}
                        >
                          <option value="">USB 디바이스 선택...</option>
                          {usbDevices.map(device => (
                            <option key={device.id} value={device.id}>
                              {device.alias || `${device.brand} ${device.model}`} ({device.id})
                            </option>
                          ))}
                        </select>
                        <button
                          className="btn-wifi-switch"
                          onClick={handleSwitchToWifi}
                          disabled={!selectedUsbDevice || switchingToWifi}
                        >
                          {switchingToWifi ? '전환 중...' : 'WiFi ADB로 전환'}
                        </button>
                      </div>
                      <div className="wifi-switch-help">
                        USB로 연결된 디바이스를 WiFi ADB로 전환합니다.
                        전환 후 USB 케이블을 분리해도 연결이 유지됩니다.
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* 검색 및 필터 */}
          <div className="filter-bar">
            <div className="filter-search">
              <input
                type="text"
                placeholder="디바이스 검색 (ID, 이름, 모델, 브랜드)"
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
              />
            </div>
            <div className="filter-selects">
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                <option value="all">모든 상태</option>
                <option value="connected">연결됨</option>
                <option value="session">세션 활성</option>
                <option value="offline">오프라인</option>
              </select>
              <select value={filterBrand} onChange={e => setFilterBrand(e.target.value)}>
                <option value="all">모든 브랜드</option>
                {filterOptions.brands.map(brand => (
                  <option key={brand} value={brand}>{brand}</option>
                ))}
              </select>
              <select value={filterOS} onChange={e => setFilterOS(e.target.value)}>
                <option value="all">모든 OS</option>
                {filterOptions.osVersions.map(osVer => (
                  <option key={osVer} value={osVer}>{osVer}</option>
                ))}
              </select>
              {(searchText || filterStatus !== 'all' || filterBrand !== 'all' || filterOS !== 'all') && (
                <button className="btn-reset-filter" onClick={resetFilters}>
                  초기화
                </button>
              )}
            </div>
            <div className="filter-result">
              {filteredDevices.length !== devices.length && (
                <span>{devices.length}개 중 {filteredDevices.length}개 표시</span>
              )}
            </div>
          </div>

          {devices.length === 0 ? (
            <div className="no-devices">
              <p>연결된 디바이스가 없습니다.</p>
              <small>ADB로 디바이스를 연결하세요.</small>
            </div>
          ) : filteredDevices.length === 0 ? (
            <div className="no-devices">
              <p>검색 결과가 없습니다.</p>
              <small>필터 조건을 변경해보세요.</small>
            </div>
          ) : (
            <div className="devices-grid">
              {filteredDevices.map(device => (
                <div
                  key={device.id}
                  className={`device-card ${device.status !== 'connected' ? 'offline' : ''} ${executionStatus.has(device.id) ? 'executing' : ''}`}
                >
                  {/* 상태 표시 */}
                  <div className="badges-row">
                    <div className={`status-badge ${
                      executionStatus.has(device.id)
                        ? 'executing'
                        : device.status === 'connected' && hasSession(device.id)
                          ? 'available'
                          : device.status
                    }`}>
                      {executionStatus.has(device.id)
                        ? '실행 중'
                        : device.status === 'connected'
                          ? (hasSession(device.id) ? '사용 가능' : '연결됨')
                          : device.status}
                    </div>

                    {/* 역할 뱃지 (편집용/테스트용) */}
                    <button
                      className={`role-badge ${device.role === 'editing' ? 'editing' : 'testing'}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleRole(device.id, device.role);
                      }}
                      disabled={updatingRole === device.id}
                      title={`클릭하여 ${device.role === 'editing' ? '테스트용' : '편집용'}으로 변경`}
                    >
                      {updatingRole === device.id
                        ? '...'
                        : device.role === 'editing'
                          ? '✏️ 편집용'
                          : '🧪 테스트용'}
                    </button>
                  </div>

                  {/* 시나리오 실행 상태 */}
                  {executionStatus.has(device.id) && (() => {
                    const status = executionStatus.get(device.id)!;
                    const progressPercent = status.totalSteps > 0
                      ? Math.round((status.currentStep / status.totalSteps) * 100)
                      : 0;
                    return (
                      <div className="execution-status">
                        <div className="execution-scenario">
                          <span className="execution-icon">▶</span>
                          <span className="execution-name">{status.scenarioName}</span>
                          <span className="execution-progress-text">
                            {status.currentStep}/{status.totalSteps}
                          </span>
                        </div>
                        <div className="execution-progress-bar">
                          <div
                            className="execution-progress-fill"
                            style={{ width: `${progressPercent}%` }}
                          />
                        </div>
                        <div className="execution-node">
                          <span className={`execution-status-dot ${status.status}`} />
                          <span className="execution-message">{status.message}</span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* 디바이스 기본 정보 */}
                  <div className="card-header">
                    {editingAliasId === device.id ? (
                      <input
                        type="text"
                        className="alias-input"
                        value={editingAliasValue}
                        onChange={e => setEditingAliasValue(e.target.value)}
                        onKeyDown={e => handleAliasKeyDown(e, device.id)}
                        onBlur={() => saveAlias(device.id)}
                        autoFocus
                        placeholder="별칭 입력"
                        onClick={e => e.stopPropagation()}
                      />
                    ) : (
                      <h4
                        className="device-name editable"
                        onClick={e => startEditingAlias(device, e)}
                        title="클릭하여 별칭 편집"
                      >
                        {getDeviceDisplayName(device)}
                        {device.alias && <span className="alias-indicator">(별칭)</span>}
                      </h4>
                    )}
                    <span className="device-id">
                      {device.id}
                      <span className={`connection-type-badge ${isWifiDevice(device.id) ? 'wifi' : 'usb'}`}>
                        {isWifiDevice(device.id) ? '📶 WiFi' : '🔌 USB'}
                      </span>
                    </span>
                    {!device.alias && (
                      <span className="device-model-sub">{device.brand} {device.model}</span>
                    )}
                  </div>

                  {/* 시스템 정보 */}
                  <div className="card-info">
                    <div className="info-row">
                      <span className="info-label">OS</span>
                      <span className="info-value">{device.os} {device.osVersion} {device.os === 'Android' && device.sdkVersion ? `(SDK ${device.sdkVersion})` : ''}</span>
                    </div>
                    <div className="info-row">
                      <span className="info-label">해상도</span>
                      <span className="info-value">{device.screenResolution}</span>
                    </div>
                    <div className="info-row">
                      <span className="info-label">CPU</span>
                      <span className="info-value">
                        {device.cpuModel}
                        {device.status === 'connected' && device.cpuTemperature > 0 && (
                          <span className={`temp ${device.cpuTemperature >= 50 ? 'high' : ''}`}>
                            {' '}({device.cpuTemperature}°C)
                          </span>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* 실시간 상태 */}
                  {device.status === 'connected' && (
                    <div className="card-status">
                      {/* 배터리 */}
                      <div className="status-item">
                        <span className="status-icon">{getBatteryIcon(device.batteryLevel, device.batteryStatus)}</span>
                        <div className="status-bar-container">
                          <div
                            className={`status-bar battery ${device.batteryLevel < 20 ? 'low' : ''}`}
                            style={{ width: `${device.batteryLevel}%` }}
                          />
                        </div>
                        <span className="status-text">
                          {device.batteryLevel}%
                          {device.batteryTemperature > 0 && (
                            <span className={`temp ${device.batteryTemperature >= 40 ? 'high' : ''}`}>
                              {' '}({device.batteryTemperature}°C)
                            </span>
                          )}
                        </span>
                      </div>

                      {/* 메모리 */}
                      <div className="status-item">
                        <span className="status-icon">💾</span>
                        <div className="status-bar-container">
                          <div
                            className="status-bar memory"
                            style={{ width: `${getMemoryUsagePercent(device.memoryTotal, device.memoryAvailable)}%` }}
                          />
                        </div>
                        <span className="status-text">
                          {Math.round((device.memoryTotal - device.memoryAvailable) / 1024 * 10) / 10}/
                          {Math.round(device.memoryTotal / 1024 * 10) / 10}GB
                        </span>
                      </div>

                      {/* 스토리지 */}
                      <div className="status-item">
                        <span className="status-icon">📁</span>
                        <div className="status-bar-container">
                          <div
                            className="status-bar storage"
                            style={{ width: `${getStorageUsagePercent(device.storageTotal, device.storageAvailable)}%` }}
                          />
                        </div>
                        <span className="status-text">
                          {Math.round((device.storageTotal - device.storageAvailable) * 10) / 10}/
                          {device.storageTotal}GB
                        </span>
                      </div>
                    </div>
                  )}

                  {/* 오프라인 디바이스 추가 정보 */}
                  {device.status === 'offline' && device.lastConnectedAt && (
                    <div className="offline-info">
                      <span className="last-connected">
                        마지막 연결: {formatLastConnected(device.lastConnectedAt)}
                      </span>
                    </div>
                  )}

                  {/* 세션/프리뷰/삭제 버튼 */}
                  <div className="card-actions">
                    {device.status === 'connected' ? (
                      <>
                        {hasSession(device.id) ? (
                          <>
                            <button
                              className={`btn-preview ${previewDeviceIds.includes(device.id) ? 'active' : ''}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAddPreview(device.id);
                              }}
                              disabled={!previewDeviceIds.includes(device.id) && previewDeviceIds.length >= MAX_PREVIEWS}
                              title={previewDeviceIds.includes(device.id) ? '프리뷰 닫기' : '프리뷰 보기'}
                            >
                              👁 {previewDeviceIds.includes(device.id) ? '프리뷰 닫기' : '프리뷰'}
                            </button>
                            <button
                              className="btn-destroy"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDestroySession(device.id);
                              }}
                            >
                              세션 종료
                            </button>
                          </>
                        ) : (
                          <button
                            className="btn-create"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCreateSession(device.id);
                            }}
                            disabled={creatingSession === device.id}
                          >
                            {creatingSession === device.id ? '연결 중...' : '세션 시작'}
                          </button>
                        )}
                      </>
                    ) : (
                      <button
                        className="btn-delete"
                        onClick={(e) => handleDeleteDevice(device.id, e)}
                        title="목록에서 삭제"
                      >
                        삭제
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 프리뷰 패널 */}
      {previewDeviceIds.length > 0 && (
        <div
          className={`preview-panel ${isResizing ? 'resizing' : ''}`}
          style={{ height: previewPanelHeight }}
        >
          {/* 리사이즈 핸들 */}
          <div className="preview-resize-handle" onMouseDown={handleResizeStart}>
            <div className="resize-bar" />
          </div>

          {/* 프리뷰 헤더 */}
          <div className="preview-panel-header">
            <span>실시간 프리뷰 ({previewDeviceIds.length}/{MAX_PREVIEWS})</span>
            <button
              className="btn-close-all-previews"
              onClick={() => setPreviewDeviceIds([])}
            >
              모두 닫기
            </button>
          </div>

          {/* 프리뷰 그리드 */}
          <div className="preview-grid">
            {previewDeviceIds.map(deviceId => {
              const device = devices.find(d => d.id === deviceId);
              const deviceName = device?.alias || `${device?.brand} ${device?.model}` || deviceId;
              const hasDeviceSession = sessions.some(s => s.deviceId === deviceId);
              const screenshotData = screenshots.get(deviceId);

              return (
                <div key={deviceId} className="preview-item">
                  <div className="preview-item-header">
                    <span className="preview-device-name">{deviceName}</span>
                    {screenshotConnected && screenshotData && (
                      <span className="preview-timestamp">
                        {new Date(screenshotData.timestamp).toLocaleTimeString('ko-KR')}
                      </span>
                    )}
                    <button
                      className="btn-close-preview"
                      onClick={() => handleRemovePreview(deviceId)}
                    >
                      ✕
                    </button>
                  </div>
                  <div className="preview-item-content">
                    {hasDeviceSession ? (
                      screenshotData ? (
                        <img
                          src={screenshotData.image}
                          alt={`${deviceName} preview`}
                          className="preview-stream"
                        />
                      ) : (
                        <div className="preview-loading">
                          <div className="spinner" />
                          <p>스크린샷 로딩 중...</p>
                        </div>
                      )
                    ) : (
                      <div className="preview-no-session">
                        <p>세션 없음</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
