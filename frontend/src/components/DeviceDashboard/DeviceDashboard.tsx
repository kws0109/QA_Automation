// frontend/src/components/DeviceDashboard/DeviceDashboard.tsx

import { useState, useMemo, useCallback } from 'react';
import {
  DeviceDetailedInfo,
  SessionInfo,
  DeviceExecutionStatus,
} from '../../types';
import { apiClient } from '../../config/api';
import { useWifiAdb } from './hooks';
import {
  FilterBar,
  DeviceCard,
  WifiPanel,
  DashboardHeader,
  EmptyState,
} from './components';
import './DeviceDashboard.css';

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
  // 세션 생성 상태
  const [creatingSession, setCreatingSession] = useState<string | null>(null);
  const [creatingAllSessions, setCreatingAllSessions] = useState(false);

  // 검색/필터 상태
  const [searchText, setSearchText] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterBrand, setFilterBrand] = useState<string>('all');
  const [filterOS, setFilterOS] = useState<string>('all');

  // 템플릿 동기화 상태
  const [syncingTemplates, setSyncingTemplates] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<string | null>(null);

  // 디바이스 역할 변경 상태
  const [updatingRole, setUpdatingRole] = useState<string | null>(null);

  // WiFi ADB 커스텀 훅
  const wifiAdb = useWifiAdb({ onRefresh });

  // USB 디바이스 목록 (WiFi 전환용)
  const usbDevices = useMemo(() => {
    return devices.filter(d => d.status === 'connected' && !d.id.includes(':'));
  }, [devices]);

  // 세션 여부 확인
  const hasSession = useCallback((deviceId: string) => {
    return sessions.some(s => s.deviceId === deviceId);
  }, [sessions]);

  // 세션 생성
  const handleCreateSession = async (deviceId: string) => {
    setCreatingSession(deviceId);
    try {
      await apiClient.post(`/api/session/create`, { deviceId });
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
      await apiClient.post(`/api/session/destroy`, { deviceId });
      onSessionChange();
    } catch (err) {
      const error = err as Error;
      alert(`세션 종료 실패: ${error.message}`);
    }
  };

  // 디바이스 역할 변경
  const handleToggleRole = async (deviceId: string, currentRole?: string) => {
    setUpdatingRole(deviceId);
    const newRole = currentRole === 'editing' ? 'testing' : 'editing';
    try {
      await apiClient.put(`/api/device/${encodeURIComponent(deviceId)}/role`, { role: newRole });
      onRefresh();
    } catch (err) {
      const error = err as Error;
      alert(`역할 변경 실패: ${error.message}`);
    } finally {
      setUpdatingRole(null);
    }
  };

  // 별칭 저장
  const handleSaveAlias = async (deviceId: string, alias: string) => {
    try {
      await apiClient.put(`/api/device/${deviceId}/alias`, { alias });
      onRefresh();
    } catch (err) {
      console.error('별칭 저장 실패:', err);
    }
  };

  // 디바이스 삭제
  const handleDeleteDevice = async (deviceId: string) => {
    if (!confirm('이 디바이스를 목록에서 삭제하시겠습니까?')) return;
    try {
      await apiClient.delete(`/api/device/${deviceId}`);
      onRefresh();
    } catch (err) {
      const error = err as Error;
      alert(`삭제 실패: ${error.message}`);
    }
  };

  // 세션 없는 연결된 디바이스 목록
  const devicesWithoutSession = useMemo(() => {
    return devices.filter(d => d.status === 'connected' && !hasSession(d.id));
  }, [devices, hasSession]);

  // 전체 세션 생성
  const handleCreateAllSessions = async () => {
    if (devicesWithoutSession.length === 0) return;
    setCreatingAllSessions(true);
    try {
      for (const device of devicesWithoutSession) {
        try {
          await apiClient.post(`/api/session/create`, { deviceId: device.id });
        } catch (err) {
          console.error(`세션 생성 실패 (${device.id}):`, err);
        }
      }
      onSessionChange();
    } finally {
      setCreatingAllSessions(false);
    }
  };

  // 템플릿 동기화
  const handleSyncTemplates = async () => {
    setSyncingTemplates(true);
    setLastSyncResult(null);
    try {
      const response = await apiClient.post(`/api/device/templates/sync-all`);
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

  // 필터 옵션
  const filterOptions = useMemo(() => {
    const brands = [...new Set(devices.map(d => d.brand).filter(Boolean))].sort();
    const osVersions = [...new Set(devices.map(d => `${d.os} ${d.osVersion}`).filter(v => !v.includes('Unknown')))].sort();
    return { brands, osVersions };
  }, [devices]);

  // 필터링된 디바이스 목록
  const filteredDevices = useMemo(() => {
    return devices.filter(device => {
      if (searchText) {
        const search = searchText.toLowerCase();
        const matchesSearch =
          device.id.toLowerCase().includes(search) ||
          device.name.toLowerCase().includes(search) ||
          device.model.toLowerCase().includes(search) ||
          device.brand.toLowerCase().includes(search);
        if (!matchesSearch) return false;
      }
      if (filterStatus !== 'all') {
        if (filterStatus === 'session' && !hasSession(device.id)) return false;
        if (filterStatus === 'connected' && device.status !== 'connected') return false;
        if (filterStatus === 'offline' && device.status !== 'offline') return false;
      }
      if (filterBrand !== 'all' && device.brand !== filterBrand) return false;
      if (filterOS !== 'all') {
        const deviceOSVersion = `${device.os} ${device.osVersion}`;
        if (deviceOSVersion !== filterOS) return false;
      }
      return true;
    });
  }, [devices, searchText, filterStatus, filterBrand, filterOS, hasSession]);

  // 필터 초기화
  const resetFilters = () => {
    setSearchText('');
    setFilterStatus('all');
    setFilterBrand('all');
    setFilterOS('all');
  };

  const showResetButton = searchText || filterStatus !== 'all' || filterBrand !== 'all' || filterOS !== 'all';

  // 로딩 상태
  if (loading) {
    return <EmptyState type="loading" />;
  }

  const connectedDevices = devices.filter(d => d.status === 'connected');

  // 디바이스 목록 렌더링
  const renderDeviceList = () => {
    if (devices.length === 0) {
      return <EmptyState type="no-devices" />;
    }

    if (filteredDevices.length === 0) {
      return <EmptyState type="no-results" />;
    }

    return (
      <div className="devices-grid">
        {filteredDevices.map(device => (
          <DeviceCard
            key={device.id}
            device={device}
            hasSession={hasSession(device.id)}
            executionStatus={executionStatus.get(device.id)}
            creatingSession={creatingSession === device.id}
            onCreateSession={() => handleCreateSession(device.id)}
            onDestroySession={() => handleDestroySession(device.id)}
            onToggleRole={() => handleToggleRole(device.id, device.role)}
            onDeleteDevice={() => handleDeleteDevice(device.id)}
            onSaveAlias={(alias) => handleSaveAlias(device.id, alias)}
            updatingRole={updatingRole === device.id}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="device-dashboard">
      {/* 헤더 */}
      <DashboardHeader
        connectedCount={connectedDevices.length}
        sessionCount={sessions.length}
        devicesWithoutSessionCount={devicesWithoutSession.length}
        creatingAllSessions={creatingAllSessions}
        syncingTemplates={syncingTemplates}
        refreshing={refreshing}
        lastSyncResult={lastSyncResult}
        onCreateAllSessions={handleCreateAllSessions}
        onSyncTemplates={handleSyncTemplates}
        onRefresh={onRefresh}
      />

      <div className="dashboard-content">
        <div className="devices-section devices-section-full">
          <div className="section-header">
            <h3>디바이스 목록</h3>
          </div>

          {/* WiFi ADB 관리 패널 */}
          <WifiPanel
            isOpen={wifiAdb.wifiPanelOpen}
            onToggle={() => wifiAdb.setWifiPanelOpen(!wifiAdb.wifiPanelOpen)}
            loading={wifiAdb.wifiLoading}
            configs={wifiAdb.wifiConfigs}
            connectedIds={wifiAdb.wifiConnectedIds}
            connecting={wifiAdb.wifiConnecting}
            usbDevices={usbDevices}
            newWifiIp={wifiAdb.newWifiIp}
            onNewWifiIpChange={wifiAdb.setNewWifiIp}
            newWifiPort={wifiAdb.newWifiPort}
            onNewWifiPortChange={wifiAdb.setNewWifiPort}
            selectedUsbDevice={wifiAdb.selectedUsbDevice}
            onSelectedUsbDeviceChange={wifiAdb.setSelectedUsbDevice}
            switchingToWifi={wifiAdb.switchingToWifi}
            onConnect={wifiAdb.handleWifiConnect}
            onDisconnect={wifiAdb.handleWifiDisconnect}
            onDelete={wifiAdb.handleWifiDelete}
            onNewConnect={wifiAdb.handleNewWifiConnect}
            onSwitchToWifi={wifiAdb.handleSwitchToWifi}
            onReconnectAll={wifiAdb.handleReconnectAll}
            onAutoReconnectToggle={wifiAdb.handleAutoReconnectToggle}
          />

          {/* 검색 및 필터 */}
          <FilterBar
            searchText={searchText}
            onSearchChange={setSearchText}
            filterStatus={filterStatus}
            onFilterStatusChange={setFilterStatus}
            filterBrand={filterBrand}
            onFilterBrandChange={setFilterBrand}
            filterOS={filterOS}
            onFilterOSChange={setFilterOS}
            filterOptions={filterOptions}
            onReset={resetFilters}
            showResetButton={showResetButton}
            filteredCount={filteredDevices.length}
            totalCount={devices.length}
          />

          {/* 디바이스 목록 */}
          {renderDeviceList()}
        </div>
      </div>
    </div>
  );
}
