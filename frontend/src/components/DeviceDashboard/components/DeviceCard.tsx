// frontend/src/components/DeviceDashboard/components/DeviceCard.tsx

import React, { useState } from 'react';
import type { DeviceDetailedInfo, DeviceExecutionStatus } from '../../../types';
import {
  getDeviceDisplayName,
  formatLastConnected,
  getBatteryIcon,
  getMemoryUsagePercent,
  getStorageUsagePercent,
  isWifiDevice,
} from '../utils';

interface DeviceCardProps {
  device: DeviceDetailedInfo;
  hasSession: boolean;
  executionStatus?: DeviceExecutionStatus;
  creatingSession: boolean;
  onCreateSession: () => void;
  onDestroySession: () => void;
  onToggleRole: () => void;
  onDeleteDevice: () => void;
  onSaveAlias: (alias: string) => void;
  updatingRole: boolean;
}

const DeviceCard: React.FC<DeviceCardProps> = ({
  device,
  hasSession,
  executionStatus,
  creatingSession,
  onCreateSession,
  onDestroySession,
  onToggleRole,
  onDeleteDevice,
  onSaveAlias,
  updatingRole,
}) => {
  const [editingAlias, setEditingAlias] = useState(false);
  const [aliasValue, setAliasValue] = useState('');

  const startEditingAlias = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingAlias(true);
    setAliasValue(device.alias || '');
  };

  const handleSaveAlias = () => {
    onSaveAlias(aliasValue.trim());
    setEditingAlias(false);
    setAliasValue('');
  };

  const handleAliasKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveAlias();
    } else if (e.key === 'Escape') {
      setEditingAlias(false);
      setAliasValue('');
    }
  };

  const isExecuting = !!executionStatus;

  return (
    <div
      className={`device-card ${device.status !== 'connected' ? 'offline' : ''} ${isExecuting ? 'executing' : ''}`}
    >
      {/* 상태 표시 */}
      <div className="badges-row">
        {/* 연결 타입 뱃지 (WiFi/USB) */}
        <span className={`badge connection-type ${isWifiDevice(device.id) ? 'wifi' : 'usb'}`}>
          {isWifiDevice(device.id) ? '📶 WiFi' : '🔌 USB'}
        </span>

        {/* 연결 상태 뱃지 */}
        <span className={`badge status ${
          isExecuting
            ? 'executing'
            : device.status === 'connected' && hasSession
              ? 'available'
              : device.status
        }`}>
          {isExecuting
            ? '실행 중'
            : device.status === 'connected'
              ? (hasSession ? '사용 가능' : '연결됨')
              : device.status}
        </span>

        {/* 역할 뱃지 (편집용/테스트용) */}
        <button
          className={`badge role ${device.role === 'editing' ? 'editing' : 'testing'}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleRole();
          }}
          disabled={updatingRole}
          title={`클릭하여 ${device.role === 'editing' ? '테스트용' : '편집용'}으로 변경`}
        >
          {updatingRole
            ? '...'
            : device.role === 'editing'
              ? '✏️ 편집용'
              : '🧪 테스트용'}
        </button>
      </div>

      {/* 시나리오 실행 상태 */}
      {executionStatus && (() => {
        const progressPercent = executionStatus.totalSteps > 0
          ? Math.round((executionStatus.currentStep / executionStatus.totalSteps) * 100)
          : 0;
        return (
          <div className="execution-status">
            <div className="execution-scenario">
              <span className="execution-icon">▶</span>
              <span className="execution-name">{executionStatus.scenarioName}</span>
              <span className="execution-progress-text">
                {executionStatus.currentStep}/{executionStatus.totalSteps}
              </span>
            </div>
            <div className="execution-progress-bar">
              <div
                className="execution-progress-fill"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="execution-node">
              <span className={`execution-status-dot ${executionStatus.status}`} />
              <span className="execution-message">{executionStatus.message}</span>
            </div>
          </div>
        );
      })()}

      {/* 디바이스 기본 정보 */}
      <div className="card-header">
        {editingAlias ? (
          <input
            type="text"
            className="alias-input"
            value={aliasValue}
            onChange={e => setAliasValue(e.target.value)}
            onKeyDown={handleAliasKeyDown}
            onBlur={handleSaveAlias}
            autoFocus
            placeholder="별칭 입력"
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <h4
            className="device-name editable"
            onClick={startEditingAlias}
            title="클릭하여 별칭 편집"
          >
            {getDeviceDisplayName(device)}
            {device.alias && <span className="alias-indicator">(별칭)</span>}
          </h4>
        )}
        <span className="device-model-sub">{device.brand} {device.model}</span>
        <span className="device-id">{device.id}</span>
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
          <>
            {hasSession ? (
              <button
                className="btn-destroy"
                onClick={(e) => {
                  e.stopPropagation();
                  onDestroySession();
                }}
              >
                세션 종료
              </button>
            ) : (
              <button
                className="btn-create"
                onClick={(e) => {
                  e.stopPropagation();
                  onCreateSession();
                }}
                disabled={creatingSession}
              >
                {creatingSession ? '연결 중...' : '세션 시작'}
              </button>
            )}
          </>
        ) : (
          <button
            className="btn-delete"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteDevice();
            }}
            title="목록에서 삭제"
          >
            삭제
          </button>
        )}
      </div>
    </div>
  );
};

export default DeviceCard;
