// frontend/src/components/DeviceList/DeviceList.tsx

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { DeviceInfo, SessionInfo } from '../../types';
import './DeviceList.css';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:3001';

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
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creatingSession, setCreatingSession] = useState<string | null>(null);

  // 디바이스 목록 조회
  const fetchDevices = useCallback(async () => {
    try {
      const res = await axios.get<{ success: boolean; devices: DeviceInfo[] }>(
        `${API_BASE}/api/device/list`,
      );
      if (res.data.success) {
        setDevices(res.data.devices);
      }
    } catch (err) {
      console.error('디바이스 목록 조회 실패:', err);
    }
  }, []);

  // 세션 목록 조회
  const fetchSessions = useCallback(async () => {
    try {
      const res = await axios.get<{ success: boolean; sessions: SessionInfo[] }>(
        `${API_BASE}/api/session/list`,
      );
      if (res.data.success) {
        setSessions(res.data.sessions);
      }
    } catch (err) {
      console.error('세션 목록 조회 실패:', err);
    }
  }, []);

  // 초기 로드 및 주기적 갱신
  useEffect(() => {
    fetchDevices();
    fetchSessions();

    const interval = setInterval(() => {
      fetchDevices();
      fetchSessions();
    }, 5000);

    return () => clearInterval(interval);
  }, [fetchDevices, fetchSessions]);

  // 디바이스 목록 새로고침
  const handleRefresh = async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([fetchDevices(), fetchSessions()]);
    } catch {
      setError('디바이스 목록 갱신 실패');
    } finally {
      setLoading(false);
    }
  };

  // 세션 생성
  const handleCreateSession = async (deviceId: string) => {
    setCreatingSession(deviceId);
    try {
      const res = await axios.post<{ success: boolean; session: SessionInfo }>(
        `${API_BASE}/api/session/create`,
        { deviceId },
      );
      if (res.data.success) {
        await fetchSessions();
        await fetchDevices();
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
      await axios.post(`${API_BASE}/api/session/destroy`, { deviceId });
      await fetchSessions();
      await fetchDevices();
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
                    {device.name || device.id}
                  </div>
                  <div className="device-details">
                    {device.model} | {device.os} {device.osVersion}
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
