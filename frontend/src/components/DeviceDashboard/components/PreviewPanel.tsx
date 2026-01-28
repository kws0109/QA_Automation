// frontend/src/components/DeviceDashboard/components/PreviewPanel.tsx

import React from 'react';
import type { DeviceDetailedInfo, SessionInfo } from '../../../types';

interface ScreenshotData {
  image: string;
  timestamp: number;
}

interface PreviewPanelProps {
  deviceIds: string[];
  devices: DeviceDetailedInfo[];
  sessions: SessionInfo[];
  screenshots: Map<string, ScreenshotData>;
  screenshotConnected: boolean;
  height: number;
  isResizing: boolean;
  maxPreviews: number;
  onResizeStart: (e: React.MouseEvent) => void;
  onRemovePreview: (deviceId: string) => void;
  onCloseAll: () => void;
}

const PreviewPanel: React.FC<PreviewPanelProps> = ({
  deviceIds,
  devices,
  sessions,
  screenshots,
  screenshotConnected,
  height,
  isResizing,
  maxPreviews,
  onResizeStart,
  onRemovePreview,
  onCloseAll,
}) => {
  if (deviceIds.length === 0) {
    return null;
  }

  return (
    <div
      className={`preview-panel ${isResizing ? 'resizing' : ''}`}
      style={{ height }}
    >
      {/* 리사이즈 핸들 */}
      <div className="preview-resize-handle" onMouseDown={onResizeStart}>
        <div className="resize-bar" />
      </div>

      {/* 프리뷰 헤더 */}
      <div className="preview-panel-header">
        <span>실시간 프리뷰 ({deviceIds.length}/{maxPreviews})</span>
        <button
          className="btn-close-all-previews"
          onClick={onCloseAll}
        >
          모두 닫기
        </button>
      </div>

      {/* 프리뷰 그리드 */}
      <div className="preview-grid">
        {deviceIds.map(deviceId => {
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
                  onClick={() => onRemovePreview(deviceId)}
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
  );
};

export default PreviewPanel;
