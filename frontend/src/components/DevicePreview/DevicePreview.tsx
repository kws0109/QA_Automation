// frontend/src/components/DevicePreview/DevicePreview.tsx

import { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import type { DeviceElement } from '../../types';
import './DevicePreview.css';

const API_BASE = 'http://localhost:3001';

// ========== 타입 정의 ==========
interface ClickPosition {
  x: number;
  y: number;
  displayX: number;
  displayY: number;
}

interface DeviceSize {
  width: number;
  height: number;
}

interface ElementInfo extends DeviceElement {
  className?: string;
  clickable?: boolean;
  enabled?: boolean;
}

interface SelectionRegion {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

interface DevicePreviewProps {
  isConnected: boolean;
  onSelectCoordinate?: (x: number, y: number) => void;
  onSelectElement?: (element: DeviceElement) => void;
  onTemplateCreated?: () => void;
}

function DevicePreview({ isConnected, onSelectCoordinate, onSelectElement, onTemplateCreated }: DevicePreviewProps) {
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [clickPos, setClickPos] = useState<ClickPosition | null>(null);
  const [deviceSize, setDeviceSize] = useState<DeviceSize>({ width: 1080, height: 1920 });
  const [elementInfo, setElementInfo] = useState<ElementInfo | null>(null);
  const [elementLoading, setElementLoading] = useState<boolean>(false);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 캡처 모드 상태
  const [captureMode, setCaptureMode] = useState<boolean>(false);
  const [isSelecting, setIsSelecting] = useState<boolean>(false);
  const [selectionRegion, setSelectionRegion] = useState<SelectionRegion | null>(null);
  const [templateName, setTemplateName] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);

  // 스크린샷 캡처
  const captureScreen = useCallback(async () => {
    if (!isConnected) return;
    
    setLoading(true);
    try {
      const infoRes = await axios.get<{ windowSize?: DeviceSize }>(`${API_BASE}/api/device/info`);
      if (infoRes.data.windowSize) {
        setDeviceSize({
          width: infoRes.data.windowSize.width,
          height: infoRes.data.windowSize.height,
        });
      }

      const res = await axios.get<{ screenshot?: string }>(`${API_BASE}/api/device/screenshot`);
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
    if (autoRefresh && isConnected && !captureMode) {
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
  }, [autoRefresh, isConnected, captureScreen, captureMode]);

  // 캡처 모드 토글
  const toggleCaptureMode = () => {
    setCaptureMode(!captureMode);
    setSelectionRegion(null);
    setTemplateName('');
    setClickPos(null);
    setElementInfo(null);
  };

  // 이미지 클릭 (일반 모드)
  const handleImageClick = async (e: React.MouseEvent<HTMLImageElement>) => {
    if (captureMode || !imageRef.current || !isConnected) return;

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
      const res = await axios.post<{ element: ElementInfo }>(`${API_BASE}/api/device/find-element`, {
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

  // 영역 선택 시작 (캡처 모드)
  const handleMouseDown = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!captureMode || !imageRef.current) return;

    const rect = imageRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setIsSelecting(true);
    setSelectionRegion({ startX: x, startY: y, endX: x, endY: y });
  };

  // 영역 선택 중 (캡처 모드)
  const handleMouseMove = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!captureMode || !isSelecting || !imageRef.current || !selectionRegion) return;

    const rect = imageRef.current.getBoundingClientRect();
    const x = Math.min(Math.max(0, e.clientX - rect.left), rect.width);
    const y = Math.min(Math.max(0, e.clientY - rect.top), rect.height);

    setSelectionRegion({ ...selectionRegion, endX: x, endY: y });
  };

  // 영역 선택 완료 (캡처 모드)
  const handleMouseUp = () => {
    setIsSelecting(false);
  };

  // 디바이스 좌표로 변환
  const getDeviceRegion = () => {
    if (!selectionRegion || !imageRef.current) return null;

    const imgWidth = imageRef.current.clientWidth;
    const imgHeight = imageRef.current.clientHeight;

    const x = Math.min(selectionRegion.startX, selectionRegion.endX);
    const y = Math.min(selectionRegion.startY, selectionRegion.endY);
    const width = Math.abs(selectionRegion.endX - selectionRegion.startX);
    const height = Math.abs(selectionRegion.endY - selectionRegion.startY);

    return {
      x: Math.round((x / imgWidth) * deviceSize.width),
      y: Math.round((y / imgHeight) * deviceSize.height),
      width: Math.round((width / imgWidth) * deviceSize.width),
      height: Math.round((height / imgHeight) * deviceSize.height),
    };
  };

  // 템플릿 저장
  const handleSaveTemplate = async () => {
    if (!templateName.trim()) {
      alert('템플릿 이름을 입력해주세요.');
      return;
    }

    const deviceRegion = getDeviceRegion();
    if (!deviceRegion || deviceRegion.width < 10 || deviceRegion.height < 10) {
      alert('영역을 선택해주세요 (최소 10x10 픽셀).');
      return;
    }

    setSaving(true);
    try {
      await axios.post(`${API_BASE}/api/image/capture-template`, {
        name: templateName,
        ...deviceRegion,
      });

      alert('템플릿이 저장되었습니다!');
      setSelectionRegion(null);
      setTemplateName('');
      setCaptureMode(false);
      onTemplateCreated?.();
    } catch (err) {
      const error = err as Error;
      alert('저장 실패: ' + error.message);
    } finally {
      setSaving(false);
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
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  // 선택 영역 스타일
  const selectionStyle = selectionRegion ? {
    left: Math.min(selectionRegion.startX, selectionRegion.endX),
    top: Math.min(selectionRegion.startY, selectionRegion.endY),
    width: Math.abs(selectionRegion.endX - selectionRegion.startX),
    height: Math.abs(selectionRegion.endY - selectionRegion.startY),
  } : null;

  return (
    <div className="device-preview">
      <div className="preview-header">
        <h2>📱 디바이스</h2>
        <div className="preview-controls">
          <button
            className={`btn-capture-mode ${captureMode ? 'active' : ''}`}
            onClick={toggleCaptureMode}
            title={captureMode ? '캡처 모드 해제' : '템플릿 캡처'}
          >
            {captureMode ? '✂️' : '📷'}
          </button>
          <label className="auto-refresh">
            <input 
              type="checkbox" 
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              disabled={captureMode}
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
                className={`screenshot-image ${captureMode ? 'capture-mode' : ''}`}
                onClick={handleImageClick}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                draggable={false}
              />
              {/* 일반 모드: 클릭 마커 */}
              {!captureMode && clickPos && (
                <div 
                  className="click-marker"
                  style={{
                    left: clickPos.displayX,
                    top: clickPos.displayY,
                  }}
                />
              )}
              {/* 캡처 모드: 선택 영역 */}
              {captureMode && selectionStyle && selectionStyle.width > 0 && (
                <div className="selection-box" style={selectionStyle} />
              )}
              {loading && <div className="screenshot-overlay">갱신 중...</div>}
              {captureMode && (
                <div className="capture-mode-badge">✂️ 캡처 모드</div>
              )}
            </div>
          ) : (
            <div className="screenshot-empty">
              <p>🔄 새로고침을 눌러주세요</p>
            </div>
          )}
        </div>

        {/* 정보 패널 */}
        <div className="selection-info">
          {/* 캡처 모드 UI */}
          {captureMode ? (
            <div className="capture-panel">
              <h4>📷 템플릿 캡처</h4>
              <p className="capture-hint">드래그하여 영역 선택</p>
              
              {selectionRegion && getDeviceRegion() && (
                <div className="region-info">
                  선택: {getDeviceRegion()?.width}x{getDeviceRegion()?.height}
                </div>
              )}

              <div className="template-name-input">
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="템플릿 이름"
                />
              </div>

              <div className="capture-buttons">
                <button
                  className="btn-save-template"
                  onClick={handleSaveTemplate}
                  disabled={saving || !templateName.trim() || !selectionRegion}
                >
                  {saving ? '저장 중...' : '💾 저장'}
                </button>
                <button
                  className="btn-cancel-capture"
                  onClick={toggleCaptureMode}
                >
                  취소
                </button>
              </div>
            </div>
          ) : (
            <>
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
                      <code onClick={() => copyToClipboard(elementInfo.resourceId!)}>
                        {elementInfo.resourceId}
                      </code>
                    </div>
                  )}
                  
                  {elementInfo.text && (
                    <div className="info-row">
                      <label>Text</label>
                      <code onClick={() => copyToClipboard(elementInfo.text!)}>
                        {elementInfo.text}
                      </code>
                    </div>
                  )}
                  
                  {elementInfo.contentDesc && (
                    <div className="info-row">
                      <label>Desc</label>
                      <code onClick={() => copyToClipboard(elementInfo.contentDesc!)}>
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
                  <p>📷 캡처 버튼으로 템플릿 저장</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default DevicePreview;