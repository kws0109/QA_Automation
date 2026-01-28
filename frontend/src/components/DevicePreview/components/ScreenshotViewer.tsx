// frontend/src/components/DevicePreview/components/ScreenshotViewer.tsx

import React from 'react';
import type { ScreenshotViewerProps } from '../types';

const ScreenshotViewer: React.FC<ScreenshotViewerProps> = ({
  devices,
  selectedDeviceId,
  selectedDevice,
  hasSession,
  creatingSession,
  onConnectSession,
  screenshot,
  loading,
  orientation,
  deviceSize,
  liveMode,
  mjpegUrl,
  mjpegError,
  onMjpegError,
  captureMode,
  textExtractMode,
  regionSelectMode,
  clickPos,
  selectionRegion,
  imageRef,
  liveImageRef,
  onImageClick,
  onImageLoad,
  onMouseDown,
  onMouseMove,
  onMouseUp,
}) => {
  // 선택 영역 스타일 계산
  const selectionStyle = selectionRegion ? {
    left: Math.min(selectionRegion.startX, selectionRegion.endX),
    top: Math.min(selectionRegion.startY, selectionRegion.endY),
    width: Math.abs(selectionRegion.endX - selectionRegion.startX),
    height: Math.abs(selectionRegion.endY - selectionRegion.startY),
  } : null;

  // 연결된 디바이스 없음
  if (devices.length === 0) {
    return (
      <div className={`screenshot-container ${orientation}`}>
        <div className="screenshot-empty">
          <p>📱 연결된 디바이스가 없습니다</p>
          <small>ADB로 디바이스를 연결하세요</small>
        </div>
      </div>
    );
  }

  // 디바이스 미선택
  if (!selectedDeviceId) {
    return (
      <div className={`screenshot-container ${orientation}`}>
        <div className="screenshot-empty">
          <p>📱 디바이스를 선택하세요</p>
        </div>
      </div>
    );
  }

  // 세션 생성 중
  if (creatingSession) {
    return (
      <div className={`screenshot-container ${orientation}`}>
        <div className="screenshot-empty">
          <div className="loading-spinner"></div>
          <p>세션 연결 중...</p>
          <small>{selectedDevice?.brand} {selectedDevice?.model}</small>
        </div>
      </div>
    );
  }

  // 세션 없음
  if (!hasSession) {
    return (
      <div className={`screenshot-container ${orientation}`}>
        <div className="screenshot-empty session-connect">
          <div className="connect-icon">📱</div>
          <p className="connect-title">{selectedDevice?.brand} {selectedDevice?.model}</p>
          <small className="connect-desc">디바이스 프리뷰를 사용하려면 세션을 연결하세요</small>
          <button
            className="btn-connect-session"
            onClick={onConnectSession}
          >
            세션 연결하기
          </button>
        </div>
      </div>
    );
  }

  // 캡처/텍스트 추출/영역 선택 모드
  if (captureMode || textExtractMode || regionSelectMode) {
    const modeClass = captureMode ? 'capture-mode' : textExtractMode ? 'text-extract-mode' : 'region-select-mode';
    const modeBadge = captureMode ? '✂️ 캡처 모드' : textExtractMode ? '🔤 텍스트 추출' : '📐 영역 선택';
    const selectionBoxClass = textExtractMode ? 'text-extract' : regionSelectMode ? 'region-select' : '';

    return (
      <div className={`screenshot-container ${orientation}`}>
        <div className="screenshot-wrapper">
          {loading ? (
            <div className="screenshot-loading">
              <p>캡처 중...</p>
            </div>
          ) : screenshot ? (
            <>
              <img
                ref={imageRef}
                src={screenshot}
                alt="Device"
                className={`screenshot-image ${modeClass}`}
                onLoad={onImageLoad}
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onMouseLeave={onMouseUp}
                draggable={false}
              />
              {selectionStyle && selectionStyle.width > 0 && (
                <div className={`selection-box ${selectionBoxClass}`} style={selectionStyle} />
              )}
              <div className="capture-mode-badge">{modeBadge}</div>
            </>
          ) : (
            <div className="screenshot-empty">
              <p>🔄 새로고침을 눌러주세요</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 실시간 모드
  if (liveMode && mjpegUrl && !mjpegError) {
    return (
      <div className={`screenshot-container ${orientation}`}>
        <div className="screenshot-wrapper">
          <img
            ref={liveImageRef}
            src={mjpegUrl}
            alt="Live Stream"
            className="screenshot-image live-mode"
            onClick={onImageClick}
            onLoad={onImageLoad}
            onError={onMjpegError}
            draggable={false}
          />
          {clickPos && (
            <div
              className="click-marker"
              style={{
                left: clickPos.displayX,
                top: clickPos.displayY,
              }}
            />
          )}
          <div className="live-mode-badge">🔴 LIVE</div>
          <div className="orientation-badge">
            {orientation === 'landscape' ? '↔️' : '↕️'} {Math.max(deviceSize.width, deviceSize.height)}x{Math.min(deviceSize.width, deviceSize.height)}
          </div>
        </div>
      </div>
    );
  }

  // 정지 모드
  return (
    <div className={`screenshot-container ${orientation}`}>
      <div className="screenshot-wrapper">
        {loading ? (
          <div className="screenshot-loading">
            <p>캡처 중...</p>
          </div>
        ) : screenshot ? (
          <>
            <img
              ref={imageRef}
              src={screenshot}
              alt="Device"
              className="screenshot-image"
              onClick={onImageClick}
              onLoad={onImageLoad}
              draggable={false}
            />
            {clickPos && (
              <div
                className="click-marker"
                style={{
                  left: clickPos.displayX,
                  top: clickPos.displayY,
                }}
              />
            )}
          </>
        ) : (
          <div className="screenshot-empty">
            <p>🔄 새로고침을 눌러주세요</p>
          </div>
        )}
        {loading && <div className="screenshot-overlay">갱신 중...</div>}
      </div>
    </div>
  );
};

export default ScreenshotViewer;
