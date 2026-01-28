// frontend/src/components/DevicePreview/components/PreviewHeader.tsx

import React from 'react';
import type { PreviewHeaderProps } from '../types';

const PreviewHeader: React.FC<PreviewHeaderProps> = ({
  devices,
  selectedDeviceId,
  devicesLoading,
  hasSession,
  loading,
  mjpegError,
  captureMode,
  textExtractMode,
  liveMode,
  onDeviceChange,
  onToggleCaptureMode,
  onToggleTextExtractMode,
  onToggleLiveMode,
  onCaptureScreen,
}) => {
  return (
    <div className="preview-header">
      <h2>📱 디바이스</h2>
      <div className="header-buttons">
        {/* 캡처 모드 버튼 */}
        <button
          className={`btn-mode ${captureMode ? 'active' : ''}`}
          onClick={onToggleCaptureMode}
          title={captureMode ? '캡처 모드 해제' : '템플릿 캡처'}
          disabled={!selectedDeviceId}
        >
          ✂️
        </button>
        {/* 텍스트 추출 모드 버튼 */}
        <button
          className={`btn-mode ${textExtractMode ? 'active' : ''}`}
          onClick={onToggleTextExtractMode}
          title={textExtractMode ? '텍스트 추출 모드 해제' : '텍스트 추출 (OCR)'}
          disabled={!selectedDeviceId}
        >
          🔤
        </button>
        {/* 실시간/정지 토글 */}
        {!captureMode && !textExtractMode && (
          <button
            className={`btn-mode ${liveMode ? 'active' : ''}`}
            onClick={onToggleLiveMode}
            title={liveMode ? '정지 (클릭 가능)' : '실시간'}
            disabled={mjpegError || !selectedDeviceId}
          >
            {liveMode ? '⏸️' : '▶️'}
          </button>
        )}
        {/* 새로고침 (정지 모드에서만) */}
        {(!liveMode || captureMode || textExtractMode) && (
          <button
            className="btn-refresh"
            onClick={onCaptureScreen}
            disabled={!hasSession || loading || !selectedDeviceId}
          >
            🔄
          </button>
        )}
      </div>
      {/* 디바이스 선택 드롭다운 */}
      <div className="header-device-select">
        <select
          className="device-selector"
          value={selectedDeviceId}
          onChange={(e) => onDeviceChange(e.target.value)}
          disabled={devicesLoading || devices.length === 0}
        >
          {devices.length === 0 ? (
            <option value="">연결된 기기 없음</option>
          ) : (
            devices.map(device => (
              <option key={device.id} value={device.id}>
                {device.brand} {device.model}
              </option>
            ))
          )}
        </select>
      </div>
    </div>
  );
};

export default PreviewHeader;
