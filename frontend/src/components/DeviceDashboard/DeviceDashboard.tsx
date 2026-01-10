// frontend/src/components/DeviceDashboard/DeviceDashboard.tsx

import { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import {
  DeviceDetailedInfo,
  SessionInfo,
} from '../../types';
import './DeviceDashboard.css';

const API_BASE = 'http://localhost:3001';

export default function DeviceDashboard() {
  const [devices, setDevices] = useState<DeviceDetailedInfo[]>([]);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creatingSession, setCreatingSession] = useState<string | null>(null);

  // 검색/필터 상태
  const [searchText, setSearchText] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterBrand, setFilterBrand] = useState<string>('all');
  const [filterOS, setFilterOS] = useState<string>('all');

  // 별칭 편집 상태
  const [editingAliasId, setEditingAliasId] = useState<string | null>(null);
  const [editingAliasValue, setEditingAliasValue] = useState<string>('');

  // 디바이스 목록 조회
  const fetchDevices = useCallback(async () => {
    try {
      const res = await axios.get<{ success: boolean; devices: DeviceDetailedInfo[] }>(
        `${API_BASE}/api/device/list/detailed`
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
        `${API_BASE}/api/session/list`
      );
      if (res.data.success) {
        setSessions(res.data.sessions);
      }
    } catch (err) {
      console.error('세션 목록 조회 실패:', err);
    }
  }, []);

  // 초기 로드
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchDevices(), fetchSessions()]);
      setLoading(false);
    };
    loadData();

    // 10초마다 갱신
    const interval = setInterval(() => {
      fetchDevices();
      fetchSessions();
    }, 10000);

    return () => clearInterval(interval);
  }, [fetchDevices, fetchSessions]);

  // 수동 새로고침
  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchDevices(), fetchSessions()]);
    setRefreshing(false);
  };

  // 세션 생성
  const handleCreateSession = async (deviceId: string) => {
    setCreatingSession(deviceId);
    try {
      await axios.post(`${API_BASE}/api/session/create`, { deviceId });
      await fetchSessions();
      await fetchDevices();
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
    } catch (err) {
      const error = err as Error;
      alert(`세션 종료 실패: ${error.message}`);
    }
  };

  // 세션 여부 확인
  const hasSession = (deviceId: string) => sessions.some(s => s.deviceId === deviceId);

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
        alias: editingAliasValue.trim()
      });
      await fetchDevices();
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
      await fetchDevices();
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
      minute: '2-digit'
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
            className="btn-refresh"
            onClick={handleRefresh}
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
                  className={`device-card ${device.status !== 'connected' ? 'offline' : ''}`}
                >
                  {/* 상태 표시 */}
                  <div className={`status-badge ${device.status}`}>
                    {device.status === 'connected' ? (hasSession(device.id) ? '세션 활성' : '연결됨') : device.status}
                  </div>

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
                    <span className="device-id">{device.id}</span>
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

                  {/* 세션/삭제 버튼 */}
                  <div className="card-actions">
                    {device.status === 'connected' ? (
                      hasSession(device.id) ? (
                        <button
                          className="btn-destroy"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDestroySession(device.id);
                          }}
                        >
                          세션 종료
                        </button>
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
                      )
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
    </div>
  );
}
