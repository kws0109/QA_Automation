// frontend/src/components/DeviceDashboard/components/WifiPanel.tsx

import React from 'react';
import type { WifiDeviceConfig, DeviceDetailedInfo } from '../../../types';

interface WifiPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  loading: boolean;
  configs: WifiDeviceConfig[];
  connectedIds: string[];
  connecting: string | null;
  usbDevices: DeviceDetailedInfo[];
  // 새 WiFi 연결 폼
  newWifiIp: string;
  onNewWifiIpChange: (value: string) => void;
  newWifiPort: string;
  onNewWifiPortChange: (value: string) => void;
  // USB → WiFi 전환
  selectedUsbDevice: string;
  onSelectedUsbDeviceChange: (value: string) => void;
  switchingToWifi: boolean;
  // 핸들러
  onConnect: (ip: string, port: number) => void;
  onDisconnect: (deviceId: string) => void;
  onDelete: (ip: string, port: number) => void;
  onNewConnect: () => void;
  onSwitchToWifi: () => void;
  onReconnectAll: () => void;
  onAutoReconnectToggle: (ip: string, port: number, autoReconnect: boolean) => void;
}

const WifiPanel: React.FC<WifiPanelProps> = ({
  isOpen,
  onToggle,
  loading,
  configs,
  connectedIds,
  connecting,
  usbDevices,
  newWifiIp,
  onNewWifiIpChange,
  newWifiPort,
  onNewWifiPortChange,
  selectedUsbDevice,
  onSelectedUsbDeviceChange,
  switchingToWifi,
  onConnect,
  onDisconnect,
  onDelete,
  onNewConnect,
  onSwitchToWifi,
  onReconnectAll,
  onAutoReconnectToggle,
}) => {
  return (
    <div className={`wifi-panel ${isOpen ? 'open' : ''}`}>
      <div className="wifi-panel-header" onClick={onToggle}>
        <span className="wifi-panel-title">
          <span className="wifi-icon">📶</span>
          WiFi ADB 관리
          {configs.length > 0 && (
            <span className="wifi-count">({configs.length})</span>
          )}
        </span>
        <span className={`wifi-panel-toggle ${isOpen ? 'open' : ''}`}>
          ▼
        </span>
      </div>

      {isOpen && (
        <div className="wifi-panel-content">
          {loading ? (
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
                  {configs.length > 0 && (
                    <button
                      className="btn-wifi-reconnect-all"
                      onClick={onReconnectAll}
                      disabled={loading}
                    >
                      전체 재연결
                    </button>
                  )}
                </div>

                {configs.length === 0 ? (
                  <div className="wifi-empty">
                    저장된 WiFi 연결이 없습니다.
                  </div>
                ) : (
                  <div className="wifi-list">
                    {configs.map(config => {
                      const isConnected = connectedIds.includes(config.deviceId);
                      const isLoading = connecting === config.deviceId;

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
                                  onChange={(e) => onAutoReconnectToggle(
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
                                onClick={() => onDisconnect(config.deviceId)}
                                disabled={isLoading}
                              >
                                {isLoading ? '...' : '연결 끊기'}
                              </button>
                            ) : (
                              <button
                                className="btn-wifi-connect"
                                onClick={() => onConnect(config.ip, config.port)}
                                disabled={isLoading}
                              >
                                {isLoading ? '연결 중...' : '연결'}
                              </button>
                            )}
                            <button
                              className="btn-wifi-delete"
                              onClick={() => onDelete(config.ip, config.port)}
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
                    onChange={(e) => onNewWifiIpChange(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && onNewConnect()}
                  />
                  <input
                    type="text"
                    className="wifi-input-port"
                    placeholder="포트"
                    value={newWifiPort}
                    onChange={(e) => onNewWifiPortChange(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && onNewConnect()}
                  />
                  <button
                    className="btn-wifi-new-connect"
                    onClick={onNewConnect}
                    disabled={!newWifiIp.trim() || connecting !== null}
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
                    onChange={(e) => onSelectedUsbDeviceChange(e.target.value)}
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
                    onClick={onSwitchToWifi}
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
  );
};

export default WifiPanel;
