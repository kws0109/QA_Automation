// frontend/src/components/ScreenCapture/ScreenCapture.jsx

import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import './ScreenCapture.css';

const API_BASE = 'http://localhost:3001';

function ScreenCapture({ isOpen, onClose, onSelectCoordinate }) {
  const [screenshot, setScreenshot] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [clickPos, setClickPos] = useState(null);
  const [deviceSize, setDeviceSize] = useState({ width: 1080, height: 1920 });
  const imageRef = useRef(null);

  // 스크린샷 캡처
    const captureScreen = async () => {
    setLoading(true);
    setError(null);
    setClickPos(null);

    try {
        // 디바이스 정보 가져오기
        const infoRes = await axios.get(`${API_BASE}/api/device/info`);
        console.log('📱 디바이스 정보:', infoRes.data);  // 디버깅
        
        if (infoRes.data.windowSize) {
        setDeviceSize({
            width: infoRes.data.windowSize.width,
            height: infoRes.data.windowSize.height,
        });
        }

        // 스크린샷 가져오기
        const res = await axios.get(`${API_BASE}/api/device/screenshot`);
        console.log('📷 스크린샷 응답:', res.data);  // 디버깅
        console.log('📷 스크린샷 키:', Object.keys(res.data));  // 디버깅
        
        if (res.data.screenshot) {
        setScreenshot(res.data.screenshot);
        } else if (res.data.data) {
        setScreenshot(res.data.data);
        } else {
        setError('스크린샷 데이터가 없습니다');
        }
    } catch (err) {
        console.error('❌ 스크린샷 에러:', err);  // 디버깅
        setError('스크린샷 캡처 실패: ' + err.message);
    } finally {
        setLoading(false);
    }
};

  // 모달 열릴 때 스크린샷 캡처
  useEffect(() => {
    if (isOpen) {
      captureScreen();
    }
  }, [isOpen]);

  // 이미지 클릭 시 좌표 계산
  const handleImageClick = (e) => {
    if (!imageRef.current) return;

    const rect = imageRef.current.getBoundingClientRect();
    const imgWidth = imageRef.current.clientWidth;
    const imgHeight = imageRef.current.clientHeight;

    // 클릭 위치 (이미지 기준)
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // 실제 디바이스 좌표로 변환
    const deviceX = Math.round((clickX / imgWidth) * deviceSize.width);
    const deviceY = Math.round((clickY / imgHeight) * deviceSize.height);

    setClickPos({ 
      x: deviceX, 
      y: deviceY,
      displayX: clickX,
      displayY: clickY,
    });
  };

  // 좌표 선택 확정
  const handleConfirm = () => {
    if (clickPos) {
      onSelectCoordinate(clickPos.x, clickPos.y);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="screen-capture-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>📱 좌표 선택</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
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

          <div className="capture-info">
            <div className="info-row">
              <span className="info-label">디바이스 해상도:</span>
              <span className="info-value">{deviceSize.width} x {deviceSize.height}</span>
            </div>
            {clickPos && (
              <div className="info-row selected">
                <span className="info-label">선택한 좌표:</span>
                <span className="info-value">X: {clickPos.x}, Y: {clickPos.y}</span>
              </div>
            )}
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
              onClick={handleConfirm}
              disabled={!clickPos}
            >
              ✅ 선택 확정
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ScreenCapture;