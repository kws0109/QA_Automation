// frontend/src/components/TestExecutionPanel/DeviceSelector.tsx
// WHO 섹션: 테스트할 디바이스 선택 (디바이스 관리 기능 통합)

import React, { useState, useMemo } from 'react';
import axios from 'axios';
import type { DeviceDetailedInfo, SessionInfo, DeviceQueueStatus } from '../../types';

const API_BASE = 'http://127.0.0.1:3001';

interface DeviceSelectorProps {
  devices: DeviceDetailedInfo[];
  sessions: SessionInfo[];
  selectedDeviceIds: string[];
  onSelectionChange: (deviceIds: string[]) => void;
  onSessionChange: () => void;
  disabled?: boolean;
  deviceQueueStatus?: DeviceQueueStatus[];  // 디바이스 큐 상태 (잠금 상태)
}

const DeviceSelector: React.FC<DeviceSelectorProps> = ({
  devices,
  sessions,
  selectedDeviceIds,
  onSelectionChange,
  onSessionChange,
  disabled = false,
  deviceQueueStatus = [],
}) => {
  // 필터 상태
  const [searchText, setSearchText] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterBrand, setFilterBrand] = useState<string>('all');
  const [filterOS, setFilterOS] = useState<string>('all');

  // 세션 생성 중 상태
  const [creatingSessions, setCreatingSessions] = useState<Set<string>>(new Set());

  // 세션 유무 확인
  const hasSession = (deviceId: string) => {
    return sessions.some(s => s.deviceId === deviceId && s.status === 'active');
  };

  // 디바이스 큐 상태 조회
  const getDeviceQueueStatus = (deviceId: string): DeviceQueueStatus | undefined => {
    return deviceQueueStatus.find(s => s.deviceId === deviceId);
  };

  // 디바이스 사용 가능 여부 확인 (표시용 - 선택은 항상 가능)
  const isDeviceBusy = (deviceId: string): 'available' | 'busy_mine' | 'busy_other' => {
    const status = getDeviceQueueStatus(deviceId);
    if (!status || status.status === 'available') return 'available';
    return status.status;
  };

  // 연결된 디바이스만 필터링
  const connectedDevices = devices.filter(d => d.status === 'connected');

  // 필터 옵션 (디바이스 목록에서 고유값 추출)
  const filterOptions = useMemo(() => {
    const brands = [...new Set(connectedDevices.map(d => d.brand).filter(Boolean))].sort();
    const osList = [...new Set(connectedDevices.map(d => d.os).filter(Boolean))].sort();
    return { brands, osList };
  }, [connectedDevices]);

  // 필터링된 디바이스 목록
  const filteredDevices = useMemo(() => {
    return connectedDevices.filter(device => {
      // 텍스트 검색
      if (searchText) {
        const search = searchText.toLowerCase();
        const matchesSearch =
          device.id.toLowerCase().includes(search) ||
          (device.alias || '').toLowerCase().includes(search) ||
          device.model.toLowerCase().includes(search) ||
          device.brand.toLowerCase().includes(search);
        if (!matchesSearch) return false;
      }

      // 상태 필터
      if (filterStatus !== 'all') {
        if (filterStatus === 'session' && !hasSession(device.id)) return false;
        if (filterStatus === 'no-session' && hasSession(device.id)) return false;
      }

      // 브랜드 필터
      if (filterBrand !== 'all' && device.brand !== filterBrand) return false;

      // OS 필터
      if (filterOS !== 'all' && device.os !== filterOS) return false;

      return true;
    });
  }, [connectedDevices, searchText, filterStatus, filterBrand, filterOS, sessions]);

  // 필터 초기화
  const resetFilters = () => {
    setSearchText('');
    setFilterStatus('all');
    setFilterBrand('all');
    setFilterOS('all');
  };

  // 전체 선택 (필터된 목록 기준)
  const handleSelectAll = () => {
    const allIds = filteredDevices.map(d => d.id);
    const newSelection = new Set([...selectedDeviceIds, ...allIds]);
    onSelectionChange(Array.from(newSelection));
  };

  // 전체 해제
  const handleDeselectAll = () => {
    onSelectionChange([]);
  };

  // 개별 선택
  const handleToggle = (deviceId: string) => {
    if (selectedDeviceIds.includes(deviceId)) {
      onSelectionChange(selectedDeviceIds.filter(id => id !== deviceId));
    } else {
      onSelectionChange([...selectedDeviceIds, deviceId]);
    }
  };

  // 세션 있는 디바이스만 선택
  const handleSelectWithSession = () => {
    const withSession = filteredDevices
      .filter(d => hasSession(d.id))
      .map(d => d.id);
    onSelectionChange(withSession);
  };

  // 세션 생성
  const handleCreateSession = async (deviceId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCreatingSessions(prev => new Set(prev).add(deviceId));
    try {
      await axios.post(`${API_BASE}/api/session/create`, { deviceId });
      onSessionChange();
    } catch (err) {
      const error = err as Error;
      alert(`세션 생성 실패: ${error.message}`);
    } finally {
      setCreatingSessions(prev => {
        const next = new Set(prev);
        next.delete(deviceId);
        return next;
      });
    }
  };

  // 세션 종료
  const handleDestroySession = async (deviceId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await axios.post(`${API_BASE}/api/session/destroy`, { deviceId });
      onSessionChange();
    } catch (err) {
      const error = err as Error;
      alert(`세션 종료 실패: ${error.message}`);
    }
  };

  // 전체 세션 생성 (필터된 목록 중 세션 없는 것)
  const devicesWithoutSession = filteredDevices.filter(d => !hasSession(d.id));
  const handleCreateAllSessions = async () => {
    if (devicesWithoutSession.length === 0) return;

    for (const device of devicesWithoutSession) {
      setCreatingSessions(prev => new Set(prev).add(device.id));
      try {
        await axios.post(`${API_BASE}/api/session/create`, { deviceId: device.id });
      } catch (err) {
        console.error(`세션 생성 실패 (${device.id}):`, err);
      }
    }
    setCreatingSessions(new Set());
    onSessionChange();
  };

  // 디바이스 표시명
  const getDeviceDisplayName = (device: DeviceDetailedInfo) => {
    return device.alias || `${device.brand} ${device.model}`;
  };

  const sessionCount = sessions.filter(s =>
    connectedDevices.some(d => d.id === s.deviceId),
  ).length;

  const isFiltered = searchText || filterStatus !== 'all' || filterBrand !== 'all' || filterOS !== 'all';

  return (
    <div className="device-selector execution-section">
      <div className="section-header">
        <h3>
          테스트 디바이스
          <span className="device-stats">
            {connectedDevices.length}개 연결 / {sessionCount}개 세션
          </span>
        </h3>
        <div className="section-actions">
          <button
            type="button"
            onClick={handleCreateAllSessions}
            disabled={disabled || devicesWithoutSession.length === 0 || creatingSessions.size > 0}
            className="btn-connect-all"
          >
            {creatingSessions.size > 0 ? '연결 중...' : `전체 세션 연결 (${devicesWithoutSession.length})`}
          </button>
        </div>
      </div>

      <div className="section-content">
        {/* 필터 바 */}
        <div className="device-filter-bar">
          <div className="filter-search">
            <input
              type="text"
              placeholder="디바이스 검색 (ID, 이름, 모델, 브랜드)"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              disabled={disabled}
            />
          </div>
          <div className="filter-selects">
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              disabled={disabled}
            >
              <option value="all">모든 상태</option>
              <option value="session">세션 활성</option>
              <option value="no-session">세션 없음</option>
            </select>
            <select
              value={filterBrand}
              onChange={e => setFilterBrand(e.target.value)}
              disabled={disabled}
            >
              <option value="all">모든 브랜드</option>
              {filterOptions.brands.map(brand => (
                <option key={brand} value={brand}>{brand}</option>
              ))}
            </select>
            <select
              value={filterOS}
              onChange={e => setFilterOS(e.target.value)}
              disabled={disabled}
            >
              <option value="all">모든 OS</option>
              {filterOptions.osList.map(os => (
                <option key={os} value={os}>{os}</option>
              ))}
            </select>
            {isFiltered && (
              <button
                className="btn-reset-filter"
                onClick={resetFilters}
                disabled={disabled}
              >
                초기화
              </button>
            )}
          </div>
        </div>

        {/* 선택 컨트롤 */}
        <div className="selection-controls">
          <div className="selection-buttons">
            <button
              type="button"
              onClick={handleSelectAll}
              disabled={disabled || filteredDevices.length === 0}
            >
              전체 선택
            </button>
            <button
              type="button"
              onClick={handleSelectWithSession}
              disabled={disabled || filteredDevices.length === 0}
            >
              세션 있는 것만
            </button>
            <button
              type="button"
              onClick={handleDeselectAll}
              disabled={disabled || selectedDeviceIds.length === 0}
            >
              전체 해제
            </button>
          </div>
          <div className="selection-info">
            {isFiltered && (
              <span className="filter-result">
                {connectedDevices.length}개 중 {filteredDevices.length}개 표시
              </span>
            )}
            <span className="selected-count">
              선택: <strong>{selectedDeviceIds.length}</strong>개
            </span>
          </div>
        </div>

        {/* 디바이스 그리드 */}
        <div className="device-grid">
          {filteredDevices.length === 0 ? (
            <div className="empty-message">
              {connectedDevices.length === 0
                ? '연결된 디바이스가 없습니다. 디바이스 관리 탭에서 디바이스를 연결해주세요.'
                : '검색 결과가 없습니다. 필터 조건을 변경해보세요.'}
            </div>
          ) : (
            filteredDevices.map(device => {
              const sessionActive = hasSession(device.id);
              const isSelected = selectedDeviceIds.includes(device.id);
              const isCreating = creatingSessions.has(device.id);
              const queueStatus = getDeviceQueueStatus(device.id);
              const busyStatus = isDeviceBusy(device.id);
              const isBusyOther = busyStatus === 'busy_other';
              const isBusyMine = queueStatus?.status === 'busy_mine';

              return (
                <div
                  key={device.id}
                  className={`device-card ${isSelected ? 'selected' : ''} ${!sessionActive ? 'no-session' : ''} ${isBusyOther ? 'busy-other' : ''} ${isBusyMine ? 'busy-mine' : ''}`}
                  onClick={() => !disabled && handleToggle(device.id)}
                  title={isBusyOther ? `${queueStatus?.lockedBy}님이 사용 중` : undefined}
                >
                  {/* 체크박스 */}
                  <div className="card-checkbox">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggle(device.id)}
                      disabled={disabled}
                      onClick={e => e.stopPropagation()}
                    />
                  </div>

                  {/* 상태 뱃지 */}
                  <div className={`status-badge ${isBusyOther ? 'busy-other' : isBusyMine ? 'busy-mine' : sessionActive ? 'available' : 'connected'}`}>
                    {isBusyOther ? `🔒 ${queueStatus?.lockedBy}` : isBusyMine ? '🔓 내가 사용 중' : sessionActive ? '세션 활성' : '연결됨'}
                  </div>

                  {/* 디바이스 기본 정보 */}
                  <div className="card-header">
                    <h4 className="device-name">{getDeviceDisplayName(device)}</h4>
                    <span className="device-id">{device.id}</span>
                  </div>

                  {/* 시스템 정보 */}
                  <div className="card-info">
                    <span className="info-value">
                      {device.os} {device.osVersion}
                    </span>
                  </div>

                  {/* 실행 중인 테스트 정보 (잠금 시) */}
                  {(isBusyOther || isBusyMine) && queueStatus?.testName && (
                    <div className="card-test-info">
                      <span className="test-label">실행 중:</span>
                      <span className="test-name">{queueStatus.testName}</span>
                    </div>
                  )}

                  {/* 세션 버튼 */}
                  <div className="card-actions">
                    {sessionActive ? (
                      <button
                        className="btn-destroy"
                        onClick={(e) => handleDestroySession(device.id, e)}
                        disabled={disabled || isBusyOther}
                      >
                        세션 종료
                      </button>
                    ) : (
                      <button
                        className="btn-create"
                        onClick={(e) => handleCreateSession(device.id, e)}
                        disabled={disabled || isCreating}
                      >
                        {isCreating ? '연결 중...' : '세션 시작'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* 선택 요약 */}
        {selectedDeviceIds.length > 0 && (
          <div className="selection-summary">
            선택된 디바이스: <strong>{selectedDeviceIds.length}</strong>개
            {!selectedDeviceIds.every(id => hasSession(id)) && (
              <span className="warning">
                (세션 없는 디바이스는 실행 시 자동 생성됩니다)
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default DeviceSelector;
