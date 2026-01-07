// frontend/src/components/ScreenCapture/ScreenCapture.jsx

import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import './ScreenCapture.css';

const API_BASE = 'http://localhost:3001';

function ScreenCapture({ isOpen, onClose, onSelectCoordinate, onSelectElement }) {
  const [screenshot, setScreenshot] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [clickPos, setClickPos] = useState(null);
  const [deviceSize, setDeviceSize] = useState({ width: 1080, height: 1920 });
  const [elementInfo, setElementInfo] = useState(null);
  const [elementLoading, setElementLoading] = useState(false);
  const imageRef = useRef(null);

  const captureScreen = async () => {
    setLoading(true);
    setError(null);
    setClickPos(null);
    setElementInfo(null);

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
      setError('스크린샷 캡처 실패: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      captureScreen();
    }
  }, [isOpen]);

  // 이미지 클릭 시 좌표 계산 + 요소 찾기
  const handleImageClick = async (e) => {
    if (!imageRef.current) return;

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

  // 좌표 선택 확정
  const handleConfirmCoordinate = () => {
    if (clickPos) {
      onSelectCoordinate && onSelectCoordinate(clickPos.x, clickPos.y);
      onClose();
    }
  };

  // 요소 선택 확정
  const handleConfirmElement = () => {
    if (elementInfo) {
      onSelectElement && onSelectElement(elementInfo);
      onClose();
    }
  };

  // 셀렉터 값 복사
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    alert('복사되었습니다!');
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="screen-capture-modal wide" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>📱 요소 검색 / 좌표 선택</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div className="capture-layout">
            {/* 왼쪽: 스크린샷 */}
            <div className="capture-container">
              {loading ? (
                <div className="capture-loading">
                  <p>📷 스크린샷 캡처 중...</p>
                </div>
              ) : error ? (
                <div className="capture-error">
                  <p>❌ {error}</p>
                  <button onClick={captureScreen}>다시 시도</button>
                </div>
              ) : screenshot ? (
                <div className="capture-image-wrapper">
                  <img
                    ref={imageRef}
                    src={screenshot}
                    alt="Device Screenshot"
                    className="capture-image"
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
                </div>
              ) : (
                <div className="capture-empty">
                  <p>스크린샷이 없습니다</p>
                </div>
              )}
            </div>

            {/* 오른쪽: 요소 정보 */}
            <div className="element-info-panel">
              <h3>📋 요소 정보</h3>
              
              {elementLoading ? (
                <div className="element-loading">요소 검색 중...</div>
              ) : elementInfo ? (
                <div className="element-details">
                  {elementInfo.resourceId && (
                    <div className="info-item">
                      <label>Resource ID</label>
                      <div className="info-value-row">
                        <code>{elementInfo.resourceId}</code>
                        <button 
                          className="btn-copy"
                          onClick={() => copyToClipboard(elementInfo.resourceId)}
                        >
                          📋
                        </button>
                      </div>
                    </div>
                  )}
                  
                  {elementInfo.text && (
                    <div className="info-item">
                      <label>Text</label>
                      <div className="info-value-row">
                        <code>{elementInfo.text}</code>
                        <button 
                          className="btn-copy"
                          onClick={() => copyToClipboard(elementInfo.text)}
                        >
                          📋
                        </button>
                      </div>
                    </div>
                  )}
                  
                  {elementInfo.contentDesc && (
                    <div className="info-item">
                      <label>Content Description</label>
                      <div className="info-value-row">
                        <code>{elementInfo.contentDesc}</code>
                        <button 
                          className="btn-copy"
                          onClick={() => copyToClipboard(elementInfo.contentDesc)}
                        >
                          📋
                        </button>
                      </div>
                    </div>
                  )}
                  
                  <div className="info-item">
                    <label>Class</label>
                    <code>{elementInfo.className}</code>
                  </div>
                  
                  <div className="info-item">
                    <label>Bounds</label>
                    <code>
                      [{elementInfo.bounds.left},{elementInfo.bounds.top}]
                      [{elementInfo.bounds.right},{elementInfo.bounds.bottom}]
                    </code>
                  </div>
                  
                  <div className="info-item-row">
                    <div className="info-badge">
                      {elementInfo.clickable ? '✅ Clickable' : '❌ Not Clickable'}
                    </div>
                    <div className="info-badge">
                      {elementInfo.enabled ? '✅ Enabled' : '❌ Disabled'}
                    </div>
                  </div>

                  {/* 요소 선택 버튼 */}
                  {onSelectElement && elementInfo.resourceId && (
                    <button 
                      className="btn-select-element"
                      onClick={handleConfirmElement}
                    >
                      ✅ 이 요소 선택
                    </button>
                  )}
                </div>
              ) : clickPos ? (
                <div className="element-empty">
                  <p>해당 위치에 요소가 없습니다.</p>
                </div>
              ) : (
                <div className="element-empty">
                  <p>화면을 클릭하여 요소를 검색하세요.</p>
                </div>
              )}

              {/* 좌표 정보 */}
              {clickPos && (
                <div className="coordinate-info">
                  <h4>📍 선택한 좌표</h4>
                  <div className="coord-values">
                    <span>X: {clickPos.x}</span>
                    <span>Y: {clickPos.y}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-refresh" onClick={captureScreen} disabled={loading}>
            🔄 새로고침
          </button>
          <div className="footer-right">
            <button className="btn-cancel" onClick={onClose}>
              취소
            </button>
            <button 
              className="btn-primary" 
              onClick={handleConfirmCoordinate}
              disabled={!clickPos}
            >
              ✅ 좌표 선택
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ScreenCapture;