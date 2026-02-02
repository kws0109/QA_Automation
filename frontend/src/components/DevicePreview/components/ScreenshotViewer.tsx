// frontend/src/components/DevicePreview/components/ScreenshotViewer.tsx
// 모드별 렌더 함수로 분리하여 가독성 향상

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
  swipeSelectMode,
  // WebSocket 스트리밍
  streamCanvasRef,
  streamConnected,
  isStreaming,
  streamError,
  onReconnectStream,
  // scrcpy H.264 스트리밍
  scrcpyMode,
  scrcpyVideoRef,
  scrcpyConnected,
  scrcpyStreaming,
  scrcpyError,
  onScrcpyStart,
  onScrcpyStop,
  clickPos,
  selectionRegion,
  swipeStart,
  swipeEnd,
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

  // ========== 빈 상태 렌더링 ==========
  const renderEmptyContainer = (content: React.ReactNode) => (
    <div className={`screenshot-container ${orientation}`}>
      <div className="screenshot-empty">
        {content}
      </div>
    </div>
  );

  // 연결된 디바이스 없음
  const renderNoDevices = () => renderEmptyContainer(
    <>
      <p>📱 연결된 디바이스가 없습니다</p>
      <small>ADB로 디바이스를 연결하세요</small>
    </>
  );

  // 디바이스 미선택
  const renderNoSelection = () => renderEmptyContainer(
    <p>📱 디바이스를 선택하세요</p>
  );

  // 세션 생성 중
  const renderCreatingSession = () => renderEmptyContainer(
    <>
      <div className="loading-spinner"></div>
      <p>세션 연결 중...</p>
      <small>{selectedDevice?.brand} {selectedDevice?.model}</small>
    </>
  );

  // 세션 없음 - 연결 버튼 표시
  const renderNoSession = () => (
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

  // ========== 영역 선택 모드 렌더링 ==========
  const renderSelectionMode = () => {
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
  };

  // ========== 스와이프 선택 모드 렌더링 ==========
  const renderSwipeMode = () => (
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
              className="screenshot-image swipe-select-mode"
              onLoad={onImageLoad}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseUp}
              draggable={false}
            />
            {/* 스와이프 화살표 오버레이 */}
            {swipeStart && swipeEnd && (
              <svg
                className="swipe-arrow-overlay"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  pointerEvents: 'none',
                }}
              >
                <defs>
                  <marker
                    id="arrowhead"
                    markerWidth="10"
                    markerHeight="7"
                    refX="9"
                    refY="3.5"
                    orient="auto"
                  >
                    <polygon points="0 0, 10 3.5, 0 7" fill="#00ff88" />
                  </marker>
                </defs>
                {/* 시작점 원 */}
                <circle
                  cx={swipeStart.x}
                  cy={swipeStart.y}
                  r="8"
                  fill="#00ff88"
                  stroke="#ffffff"
                  strokeWidth="2"
                />
                {/* 화살표 선 */}
                <line
                  x1={swipeStart.x}
                  y1={swipeStart.y}
                  x2={swipeEnd.x}
                  y2={swipeEnd.y}
                  stroke="#00ff88"
                  strokeWidth="3"
                  strokeDasharray="8,4"
                  markerEnd="url(#arrowhead)"
                />
                {/* 끝점 원 */}
                <circle
                  cx={swipeEnd.x}
                  cy={swipeEnd.y}
                  r="6"
                  fill="#ff4488"
                  stroke="#ffffff"
                  strokeWidth="2"
                />
              </svg>
            )}
            <div className="capture-mode-badge">🖱️ 스와이프 선택</div>
          </>
        ) : (
          <div className="screenshot-empty">
            <p>🔄 새로고침을 눌러주세요</p>
          </div>
        )}
      </div>
    </div>
  );

  // Canvas 클릭 핸들러 (좌표 계산)
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = streamCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = Math.round((e.clientX - rect.left) * scaleX);
    const y = Math.round((e.clientY - rect.top) * scaleY);

    // 가상 이미지 이벤트 생성하여 기존 핸들러 호출
    const fakeEvent = {
      ...e,
      currentTarget: {
        ...e.currentTarget,
        naturalWidth: canvas.width,
        naturalHeight: canvas.height,
        getBoundingClientRect: () => rect,
      },
    } as unknown as React.MouseEvent<HTMLImageElement>;

    onImageClick(fakeEvent);
  };

  // ========== scrcpy H.264 스트리밍 모드 렌더링 ==========
  const renderScrcpyMode = () => {
    // Video 클릭 핸들러
    const handleVideoClick = (e: React.MouseEvent<HTMLVideoElement>) => {
      const video = scrcpyVideoRef.current;
      if (!video) return;

      const rect = video.getBoundingClientRect();
      const scaleX = video.videoWidth / rect.width;
      const scaleY = video.videoHeight / rect.height;

      const x = Math.round((e.clientX - rect.left) * scaleX);
      const y = Math.round((e.clientY - rect.top) * scaleY);

      // 가상 이미지 이벤트 생성
      const fakeEvent = {
        ...e,
        currentTarget: {
          ...e.currentTarget,
          naturalWidth: video.videoWidth,
          naturalHeight: video.videoHeight,
          getBoundingClientRect: () => rect,
        },
      } as unknown as React.MouseEvent<HTMLImageElement>;

      onImageClick(fakeEvent);
    };

    // 스트리밍 준비 상태 (연결 완료 + 스트리밍 중)
    const isReady = scrcpyConnected && scrcpyStreaming && !scrcpyError;

    return (
      <div className={`screenshot-container ${orientation}`}>
        <div className="screenshot-wrapper">
          {/* video 엘리먼트는 항상 렌더링 (ref 연결을 위해), 준비되면 표시 */}
          <video
            ref={scrcpyVideoRef}
            className="screenshot-image live-mode scrcpy-video"
            onClick={handleVideoClick}
            autoPlay
            muted
            playsInline
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain',
              background: '#000',
              display: isReady ? 'block' : 'none',
            }}
          />
          {/* 에러 상태 오버레이 */}
          {scrcpyError && (
            <div className="screenshot-empty" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <p>scrcpy 연결 실패</p>
              <small>{scrcpyError}</small>
              <button
                className="btn-connect-session"
                onClick={onScrcpyStart}
                style={{ marginTop: '12px' }}
              >
                재연결
              </button>
            </div>
          )}
          {/* 연결 중 오버레이 */}
          {!scrcpyError && (!scrcpyConnected || !scrcpyStreaming) && (
            <div className="screenshot-empty" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div className="loading-spinner"></div>
              <p>scrcpy 스트리밍 연결 중...</p>
              <small>H.264 하드웨어 인코딩</small>
            </div>
          )}
          {/* 스트리밍 중일 때만 클릭 마커 표시 */}
          {isReady && clickPos && (
            <div
              className="click-marker"
              style={{
                left: clickPos.displayX,
                top: clickPos.displayY,
              }}
            />
          )}
          {isReady && (
            <>
              <div className="live-mode-badge scrcpy-badge">🎬 LIVE (scrcpy 30fps)</div>
              <div className="orientation-badge">
                {orientation === 'landscape' ? '↔️' : '↕️'} {Math.max(deviceSize.width, deviceSize.height)}x{Math.min(deviceSize.width, deviceSize.height)}
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  // ========== 실시간 스트리밍 모드 렌더링 (WebSocket) ==========
  const renderLiveMode = () => {
    // 스트림 에러 시 재연결 버튼 표시
    if (streamError) {
      return (
        <div className={`screenshot-container ${orientation}`}>
          <div className="screenshot-empty">
            <p>스트리밍 연결 실패</p>
            <small>{streamError}</small>
            <button
              className="btn-connect-session"
              onClick={onReconnectStream}
              style={{ marginTop: '12px' }}
            >
              재연결
            </button>
          </div>
        </div>
      );
    }

    // 연결 중
    if (!streamConnected || !isStreaming) {
      return (
        <div className={`screenshot-container ${orientation}`}>
          <div className="screenshot-empty">
            <div className="loading-spinner"></div>
            <p>스트리밍 연결 중...</p>
          </div>
        </div>
      );
    }

    return (
      <div className={`screenshot-container ${orientation}`}>
        <div className="screenshot-wrapper">
          <canvas
            ref={streamCanvasRef}
            className="screenshot-image live-mode"
            onClick={handleCanvasClick}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
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
          <div className="live-mode-badge">🔴 LIVE (WS)</div>
          <div className="orientation-badge">
            {orientation === 'landscape' ? '↔️' : '↕️'} {Math.max(deviceSize.width, deviceSize.height)}x{Math.min(deviceSize.width, deviceSize.height)}
          </div>
        </div>
      </div>
    );
  };

  // ========== 정지 모드 렌더링 ==========
  const renderStaticMode = () => (
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

  // ========== 메인 렌더링 로직 ==========

  // 빈 상태 체크
  if (devices.length === 0) return renderNoDevices();
  if (!selectedDeviceId) return renderNoSelection();
  if (creatingSession) return renderCreatingSession();
  if (!hasSession) return renderNoSession();

  // 모드별 렌더링
  if (captureMode || textExtractMode || regionSelectMode) return renderSelectionMode();
  if (swipeSelectMode) return renderSwipeMode();
  // scrcpy H.264 스트리밍 모드 (최고 품질)
  if (scrcpyMode) return renderScrcpyMode();
  // WebSocket 스트리밍 모드 (기존 MJPEG 대체)
  if (liveMode) return renderLiveMode();

  // 기본: 정지 모드
  return renderStaticMode();
};

export default ScreenshotViewer;
