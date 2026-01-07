// frontend/src/components/DevicePreview/DevicePreview.jsx

import { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import './DevicePreview.css';

const API_BASE = 'http://localhost:3001';

function DevicePreview({ isConnected, onSelectCoordinate, onSelectElement }) {
  const [screenshot, setScreenshot] = useState(null);
  const [loading, setLoading] = useState(false);
  const [clickPos, setClickPos] = useState(null);
  const [deviceSize, setDeviceSize] = useState({ width: 1080, height: 1920 });
  const [elementInfo, setElementInfo] = useState(null);
  const [elementLoading, setElementLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const imageRef = useRef(null);
  const intervalRef = useRef(null);

  // 스크린샷 캡처
  const captureScreen = useCallback(async () => {
    if (!isConnected) return;
    
    setLoading(true);
    try {
      const infoRes = await axios.get(`${API_BASE}/api/device/info`);
      if (infoRes.data.windowSize) {
        setDeviceSize({
          width: infoRes.data.windowSize.width,
          height: infoRes.data.windowSize.height,
        });
      }

      const res = await axios.get(`${API_BASE}/api/device/screenshot`);
      if (res.data.screenshot) {
        setScreenshot(res.data.screenshot);
      }
    } catch (err) {
      console.error('스크린샷 캡처 실패:', err);
    } finally {
      setLoading(false);
    }
  }, [isConnected]);

  // 연결 시 첫 캡처
  useEffect(() => {
    if (isConnected) {
      captureScreen();
    } else {
      setScreenshot(null);
      setClickPos(null);
      setElementInfo(null);
    }
  }, [isConnected, captureScreen]);

  // 자동 새로고침
  useEffect(() => {
    if (autoRefresh && isConnected) {
      intervalRef.current = setInterval(captureScreen, 3000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [autoRefresh, isConnected, captureScreen]);

  // 이미지 클릭
  const handleImageClick = async (e) => {
    if (!imageRef.current || !isConnected) return;

    const rect = imageRef.current.getBoundingClientRect();
    const imgWidth = imageRef.current.clientWidth;
    const imgHeight = imageRef.current.clientHeight;

    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const deviceX = Math.round((clickX / imgWidth) * deviceSize.width);
    const deviceY = Math.round((clickY / imgHeight) * deviceSize.height);

    setClickPos({ 
      x: deviceX, 
      y: deviceY,
      displayX: clickX,
      displayY: clickY,
    });

    // 요소 정보 찾기
    setElementLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/api/device/find-element`, {
        x: deviceX,
        y: deviceY,
      });
      setElementInfo(res.data.element);
    } catch (err) {
      console.error('요소 찾기 실패:', err);
      setElementInfo(null);
    } finally {
      setElementLoading(false);
    }
  };

  // 좌표 적용
  const handleApplyCoordinate = () => {
    if (clickPos && onSelectCoordinate) {
      onSelectCoordinate(clickPos.x, clickPos.y);
    }
  };

  // 요소 적용
  const handleApplyElement = () => {
    if (elementInfo && onSelectElement) {
      onSelectElement(elementInfo);
    }
  };

  // 복사
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="device-preview">
      <div className="preview-header">
        <h2>📱 디바이스</h2>
        <div className="preview-controls">
          <label className="auto-refresh">
            <input 
              type="checkbox" 
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            자동
          </label>
          <button 
            className="btn-refresh"
            onClick={captureScreen}
            disabled={!isConnected || loading}
          >
            🔄
          </button>
        </div>
      </div>

      <div className="preview-content">
        {/* 스크린샷 영역 */}
        <div className="screenshot-container">
          {!isConnected ? (
            <div className="screenshot-empty">
              <p>📱 디바이스를 연결하세요</p>
            </div>
          ) : loading && !screenshot ? (
            <div className="screenshot-loading">
              <p>캡처 중...</p>
            </div>
          ) : screenshot ? (
            <div className="screenshot-wrapper">
              <img
                ref={imageRef}
                src={screenshot}
                alt="Device"
                className="screenshot-image"
                onClick={handleImageClick}
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
              {loading && <div className="screenshot-overlay">갱신 중...</div>}
            </div>
          ) : (
            <div className="screenshot-empty">
              <p>🔄 새로고침을 눌러주세요</p>
            </div>
          )}
        </div>

        {/* 선택 정보 */}
        <div className="selection-info">
          {/* 좌표 정보 */}
          {clickPos && (
            <div className="info-section">
              <div className="info-title">
                <span>📍 좌표</span>
                <button className="btn-apply" onClick={handleApplyCoordinate}>
                  적용
                </button>
              </div>
              <div className="coord-display">
                <span>X: {clickPos.x}</span>
                <span>Y: {clickPos.y}</span>
              </div>
            </div>
          )}

          {/* 요소 정보 */}
          {elementLoading ? (
            <div className="info-section">
              <p className="info-loading">요소 검색 중...</p>
            </div>
          ) : elementInfo ? (
            <div className="info-section">
              <div className="info-title">
                <span>🔍 요소</span>
                {(elementInfo.resourceId || elementInfo.text) && (
                  <button className="btn-apply" onClick={handleApplyElement}>
                    적용
                  </button>
                )}
              </div>
              
              {elementInfo.resourceId && (
                <div className="info-row">
                  <label>ID</label>
                  <code onClick={() => copyToClipboard(elementInfo.resourceId)}>
                    {elementInfo.resourceId}
                  </code>
                </div>
              )}
              
              {elementInfo.text && (
                <div className="info-row">
                  <label>Text</label>
                  <code onClick={() => copyToClipboard(elementInfo.text)}>
                    {elementInfo.text}
                  </code>
                </div>
              )}
              
              {elementInfo.contentDesc && (
                <div className="info-row">
                  <label>Desc</label>
                  <code onClick={() => copyToClipboard(elementInfo.contentDesc)}>
                    {elementInfo.contentDesc}
                  </code>
                </div>
              )}
              
              <div className="info-row">
                <label>Class</label>
                <code>{elementInfo.className}</code>
              </div>

              <div className="info-badges">
                <span className={elementInfo.clickable ? 'badge-yes' : 'badge-no'}>
                  {elementInfo.clickable ? '✓ Clickable' : '✗ Clickable'}
                </span>
                <span className={elementInfo.enabled ? 'badge-yes' : 'badge-no'}>
                  {elementInfo.enabled ? '✓ Enabled' : '✗ Enabled'}
                </span>
              </div>
            </div>
          ) : clickPos ? (
            <div className="info-section">
              <p className="info-empty">해당 위치에 요소 없음</p>
            </div>
          ) : null}

          {!clickPos && isConnected && (
            <div className="info-hint">
              <p>💡 화면을 클릭하여 좌표/요소 선택</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default DevicePreview;