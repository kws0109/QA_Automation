// frontend/src/components/DeviceList/DeviceList.tsx

import { useState, useCallback } from 'react';
import { useDevices } from '../../contexts/DeviceContext';
import { apiClient, API_BASE_URL } from '../../config/api';
import type { SessionInfo } from '../../types';
import './DeviceList.css';

interface DeviceListProps {
  selectedDevices: string[];
  onSelectionChange: (deviceIds: string[]) => void;
  isParallelRunning: boolean;
}

export default function DeviceList({
  selectedDevices,
  onSelectionChange,
  isParallelRunning,
}: DeviceListProps) {
  // DeviceContext에서 데이터 가져오기 (10초 폴링 단일 소스)
  const {
    devices,
    sessions,
    devicesLoading,
    devicesRefreshing,
    fetchDevices,
    fetchSessions,
    handleRefreshDevices,
  } = useDevices();

  const [creatingSession, setCreatingSession] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 디바이스 목록 새로고침
  const handleRefresh = useCallback(async () => {
    setError(null);
    try {
      await handleRefreshDevices();
    } catch {
      setError('디바이스 목록 갱신 실패');
    }
  }, [handleRefreshDevices]);

  // 세션 생성
  const handleCreateSession = async (deviceId: string) => {
    setCreatingSession(deviceId);
    try {
      const res = await apiClient.post<{ success: boolean; session: SessionInfo }>(
        `${API_BASE_URL}/api/session/create`,
        { deviceId },
      );
      if (res.data.success) {
        await Promise.all([fetchSessions(), fetchDevices()]);
      }
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
      await apiClient.post(`${API_BASE_URL}/api/session/destroy`, { deviceId });
      await Promise.all([fetchSessions(), fetchDevices()]);
      // 선택 해제
      onSelectionChange(selectedDevices.filter(id => id !== deviceId));
    } catch (err) {
      const error = err as Error;
      alert(`세션 종료 실패: ${error.message}`);
    }
  };

  // 디바이스 선택/해제
  const handleToggleDevice = (deviceId: string) => {
    if (isParallelRunning) return;

    if (selectedDevices.includes(deviceId)) {
      onSelectionChange(selectedDevices.filter(id => id !== deviceId));
    } else {
      onSelectionChange([...selectedDevices, deviceId]);
    }
  };

  // 전체 선택/해제
  const handleToggleAll = () => {
    if (isParallelRunning) return;

    const activeDeviceIds = devices
      .filter(d => d.sessionActive)
      .map(d => d.id);

    if (selectedDevices.length === activeDeviceIds.length) {
      onSelectionChange([]);
    } else {
      onSelectionChange(activeDeviceIds);
    }
  };

  // 세션 존재 여부 확인
  const hasSession = (deviceId: string) => {
    return sessions.some(s => s.deviceId === deviceId);
  };

  // 활성 세션 수
  const activeSessionCount = devices.filter(d => d.sessionActive).length;
  const loading = devicesLoading || devicesRefreshing;

  return (
    <div className="device-list">
      <div className="device-list-header">
        <h3>디바이스 ({devices.length})</h3>
        <button
          className="btn-refresh"
          onClick={handleRefresh}
          disabled={loading}
          title="새로고침"
        >
          {loading ? '...' : '↻'}
        </button>
      </div>

      {error && <div className="device-list-error">{error}</div>}

      {devices.length === 0 ? (
        <div className="device-list-empty">
          연결된 디바이스가 없습니다.
          <br />
          <small>ADB로 디바이스를 연결하세요.</small>
        </div>
      ) : (
        <>
          {activeSessionCount > 0 && (
            <div className="device-select-all">
              <label>
                <input
                  type="checkbox"
                  checked={selectedDevices.length === activeSessionCount && activeSessionCount > 0}
                  onChange={handleToggleAll}
                  disabled={isParallelRunning || activeSessionCount === 0}
                />
                전체 선택 ({selectedDevices.length}/{activeSessionCount})
              </label>
            </div>
          )}

          <div className="device-items">
            {devices.map(device => (
              <div
                key={device.id}
                className={`device-item ${device.status !== 'connected' ? 'offline' : ''} ${
                  selectedDevices.includes(device.id) ? 'selected' : ''
                }`}
              >
                <div className="device-checkbox">
                  {device.sessionActive && (
                    <input
                      type="checkbox"
                      checked={selectedDevices.includes(device.id)}
                      onChange={() => handleToggleDevice(device.id)}
                      disabled={isParallelRunning}
                    />
                  )}
                </div>

                <div className="device-info">
                  <div className="device-name">
                    <span className={`status-dot ${device.status}`} />
                    {device.alias || device.model || device.id}
                  </div>
                  <div className="device-details">
                    {device.model} | Android {device.androidVersion}
                  </div>
                  <div className="device-id">{device.id}</div>
                </div>

                <div className="device-actions">
                  {device.status === 'connected' ? (
                    hasSession(device.id) ? (
                      <button
                        className="btn-session btn-destroy"
                        onClick={() => handleDestroySession(device.id)}
                        disabled={isParallelRunning}
                        title="세션 종료"
                      >
                        종료
                      </button>
                    ) : (
                      <button
                        className="btn-session btn-create"
                        onClick={() => handleCreateSession(device.id)}
                        disabled={creatingSession === device.id}
                        title="세션 생성"
                      >
                        {creatingSession === device.id ? '...' : '연결'}
                      </button>
                    )
                  ) : (
                    <span className="status-text">{device.status}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {sessions.length > 0 && (
        <div className="session-info">
          <small>활성 세션: {sessions.length}개</small>
        </div>
      )}
    </div>
  );
}
