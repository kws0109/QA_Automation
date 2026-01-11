// frontend/src/components/DeviceDashboard/DeviceDashboard.tsx

import { useState, useMemo } from 'react';
import axios from 'axios';
import {
  DeviceDetailedInfo,
  SessionInfo,
  DeviceExecutionStatus,
} from '../../types';
import './DeviceDashboard.css';

const API_BASE = 'http://127.0.0.1:3001';

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

  // MJPEG URL 가져오기
  const getMjpegUrl = (deviceId: string) => {
    const session = sessions.find(s => s.deviceId === deviceId);
    if (session) {
      return `${API_BASE}/api/session/${deviceId}/mjpeg?t=${Date.now()}`;
    }
    return null;
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
              const mjpegUrl = getMjpegUrl(deviceId);
              const deviceName = device?.alias || `${device?.brand} ${device?.model}` || deviceId;

              return (
                <div key={deviceId} className="preview-item">
                  <div className="preview-item-header">
                    <span className="preview-device-name">{deviceName}</span>
                    <button
                      className="btn-close-preview"
                      onClick={() => handleRemovePreview(deviceId)}
                    >
                      ✕
                    </button>
                  </div>
                  <div className="preview-item-content">
                    {mjpegUrl ? (
                      <img
                        src={mjpegUrl}
                        alt={`${deviceName} preview`}
                        className="preview-stream"
                      />
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
