// frontend/src/components/DevicePreview/DevicePreview.tsx

import { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import type { DeviceElement, DeviceDetailedInfo } from '../../types';
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
  onSelectCoordinate?: (x: number, y: number) => void;
  onSelectElement?: (element: DeviceElement) => void;
  onTemplateCreated?: () => void;
}

function DevicePreview({ onSelectCoordinate, onSelectElement, onTemplateCreated }: DevicePreviewProps) {
  // 기본 상태
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [clickPos, setClickPos] = useState<ClickPosition | null>(null);
  const [deviceSize, setDeviceSize] = useState<DeviceSize>({ width: 1080, height: 1920 });
  const [elementInfo, setElementInfo] = useState<ElementInfo | null>(null);
  const [elementLoading, setElementLoading] = useState<boolean>(false);

  // 디바이스 선택 상태
  const [devices, setDevices] = useState<DeviceDetailedInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [devicesLoading, setDevicesLoading] = useState<boolean>(false);
  const [hasSession, setHasSession] = useState<boolean>(false);
  const [creatingSession, setCreatingSession] = useState<boolean>(false);

  // 실시간 모드 상태
  const [liveMode, setLiveMode] = useState<boolean>(true);
  const [mjpegUrl, setMjpegUrl] = useState<string | null>(null);
  const [mjpegError, setMjpegError] = useState<boolean>(false);

  // 화면 방향 상태 (자동 감지)
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');

  // 캡처 모드 상태
  const [captureMode, setCaptureMode] = useState<boolean>(false);
  const [isSelecting, setIsSelecting] = useState<boolean>(false);
  const [selectionRegion, setSelectionRegion] = useState<SelectionRegion | null>(null);
  const [templateName, setTemplateName] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);

  const imageRef = useRef<HTMLImageElement>(null);
  const liveImageRef = useRef<HTMLImageElement>(null);

  // 디바이스 목록 조회
  const fetchDevices = useCallback(async (autoSelectFirst = false) => {
    setDevicesLoading(true);
    try {
      const res = await axios.get<{ success: boolean; devices: DeviceDetailedInfo[] }>(
        `${API_BASE}/api/device/list/detailed`
      );
      if (res.data.success) {
        const connectedDevices = res.data.devices.filter(d => d.status === 'connected');
        setDevices(connectedDevices);

        // 첫 번째 디바이스 자동 선택 (초기 로드 시에만)
        if (autoSelectFirst && connectedDevices.length > 0) {
          setSelectedDeviceId(connectedDevices[0].id);
        }
      }
    } catch (err) {
      console.error('디바이스 목록 조회 실패:', err);
    } finally {
      setDevicesLoading(false);
    }
  }, []);

  // 세션 존재 여부 확인
  const checkExistingSession = useCallback(async (deviceId: string) => {
    if (!deviceId) {
      setHasSession(false);
      setMjpegUrl(null);
      return;
    }

    try {
      const res = await axios.get<{ success: boolean; sessions: { deviceId: string; mjpegPort: number }[] }>(
        `${API_BASE}/api/session/list`
      );
      if (res.data.success) {
        const existingSession = res.data.sessions.find(s => s.deviceId === deviceId);
        if (existingSession) {
          // 이미 세션이 있으면 바로 연결
          setHasSession(true);
          setMjpegUrl(`${API_BASE}/api/session/${deviceId}/mjpeg?t=${Date.now()}`);
          return true;
        }
      }
    } catch (err) {
      console.error('세션 목록 조회 실패:', err);
    }

    setHasSession(false);
    setMjpegUrl(null);
    return false;
  }, []);

  // 세션 생성 및 MJPEG 연결
  const connectSession = useCallback(async (deviceId: string) => {
    if (!deviceId) {
      setHasSession(false);
      setMjpegUrl(null);
      return;
    }

    setCreatingSession(true);
    setMjpegError(false);

    try {
      // 세션 생성 (이미 존재하면 기존 세션 반환)
      const res = await axios.post(`${API_BASE}/api/session/create`, { deviceId });
      if (res.data.success) {
        setHasSession(true);
        // 세션 생성 후 MJPEG URL 설정
        setMjpegUrl(`${API_BASE}/api/session/${deviceId}/mjpeg?t=${Date.now()}`);
      } else {
        setHasSession(false);
        setMjpegError(true);
      }
    } catch (err) {
      console.error('세션 생성 실패:', err);
      setHasSession(false);
      setMjpegError(true);
    } finally {
      setCreatingSession(false);
    }
  }, []);

  // 초기 로드 및 주기적 갱신
  useEffect(() => {
    fetchDevices(true); // 초기 로드 시 첫 번째 디바이스 자동 선택
    const interval = setInterval(() => fetchDevices(false), 30000); // 30초마다 갱신
    return () => clearInterval(interval);
  }, [fetchDevices]);

  // 디바이스 변경 시 기존 세션 확인 (있으면 자동 연결, 없으면 버튼 표시)
  useEffect(() => {
    if (selectedDeviceId) {
      setMjpegError(false);
      checkExistingSession(selectedDeviceId);
    } else {
      setHasSession(false);
      setMjpegUrl(null);
    }
  }, [selectedDeviceId, checkExistingSession]);

  // 선택된 디바이스 정보
  const selectedDevice = devices.find(d => d.id === selectedDeviceId);

  // 디바이스 변경 시 상태 초기화 (MJPEG URL은 useEffect에서 자동 설정됨)
  const handleDeviceChange = (deviceId: string) => {
    if (deviceId === selectedDeviceId) return;

    // 상태 초기화
    setScreenshot(null);
    setClickPos(null);
    setElementInfo(null);

    // 디바이스 ID 변경 (이후 useEffect에서 MJPEG URL 자동 설정)
    setSelectedDeviceId(deviceId);
  };

  // 세션 연결 (버튼 클릭 시)
  const handleConnectSession = async () => {
    if (!selectedDeviceId) return;
    await connectSession(selectedDeviceId);
  };


  // 디바이스 정보 가져오기
  const fetchDeviceInfo = useCallback(async () => {
    if (!selectedDeviceId) return;

    try {
      const res = await axios.get<{ windowSize?: DeviceSize }>(
        `${API_BASE}/api/device/info?deviceId=${selectedDeviceId}`
      );
      if (res.data.windowSize) {
        setDeviceSize({
          width: res.data.windowSize.width,
          height: res.data.windowSize.height,
        });
      }
    } catch (err) {
      console.error('디바이스 정보 가져오기 실패:', err);
    }
  }, [selectedDeviceId]);

  // 스크린샷 캡처 (캡처 모드용)
  const captureScreen = useCallback(async () => {
    if (!selectedDeviceId) return;

    setLoading(true);
    try {
      await fetchDeviceInfo();

      const res = await axios.get<{ screenshot?: string }>(
        `${API_BASE}/api/device/screenshot?deviceId=${selectedDeviceId}`
      );
      if (res.data.screenshot) {
        setScreenshot(res.data.screenshot);
      }
    } catch (err) {
      console.error('스크린샷 캡처 실패:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedDeviceId, fetchDeviceInfo]);

  // 세션 연결 시 디바이스 정보 가져오기
  useEffect(() => {
    if (hasSession && selectedDeviceId) {
      fetchDeviceInfo();
    }
  }, [hasSession, selectedDeviceId, fetchDeviceInfo]);

  // 캡처 모드 진입 시 스크린샷 캡처
  useEffect(() => {
    if (captureMode && hasSession) {
      captureScreen();
    }
  }, [captureMode, hasSession, captureScreen]);

  // 캡처 모드 토글
  const toggleCaptureMode = () => {
    const newCaptureMode = !captureMode;
    setCaptureMode(newCaptureMode);
    setSelectionRegion(null);
    setTemplateName('');
    setClickPos(null);
    setElementInfo(null);
    
    // 캡처 모드 해제 시 실시간 모드로
    if (!newCaptureMode) {
      setLiveMode(true);
    }
  };

  // 실시간/정지 모드 토글
  const toggleLiveMode = () => {
    if (captureMode) return;
    
    const newLiveMode = !liveMode;
    setLiveMode(newLiveMode);
    
    // 정지 모드 진입 시 스크린샷 캡처
    if (!newLiveMode) {
      captureScreen();
    }
  };

  // MJPEG 에러 처리
  const handleMjpegError = () => {
    setMjpegError(true);
    setLiveMode(false);
    captureScreen();
  };

  // 이미지 크기/방향 업데이트 함수
  const updateImageSize = useCallback((img: HTMLImageElement) => {
    const { naturalWidth, naturalHeight } = img;

    if (naturalWidth > 0 && naturalHeight > 0) {
      // 방향 감지
      const newOrientation = naturalWidth > naturalHeight ? 'landscape' : 'portrait';

      if (newOrientation !== orientation) {
        setOrientation(newOrientation);
        console.log(`📱 화면 방향 변경: ${newOrientation} (${naturalWidth}x${naturalHeight})`);
      }

      // deviceSize 업데이트 (실제 디바이스 해상도)
      if (deviceSize.width !== naturalWidth || deviceSize.height !== naturalHeight) {
        setDeviceSize({ width: naturalWidth, height: naturalHeight });
        console.log(`📐 디바이스 크기 업데이트: ${naturalWidth}x${naturalHeight}`);
      }
    }
  }, [orientation, deviceSize.width, deviceSize.height]);

  // 이미지 로드 시 방향 자동 감지
  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    updateImageSize(e.currentTarget);
  };

  // 실시간 모드에서 주기적으로 이미지 크기 체크 (방향 변경 감지)
  useEffect(() => {
    if (!liveMode || !liveImageRef.current) return;

    const checkInterval = setInterval(() => {
      if (liveImageRef.current) {
        updateImageSize(liveImageRef.current);
      }
    }, 1000); // 1초마다 체크

    return () => clearInterval(checkInterval);
  }, [liveMode, updateImageSize]);

  // 이미지 클릭 핸들러 (비율 변환)
  const handleImageClick = async (e: React.MouseEvent<HTMLImageElement>) => {
    if (captureMode) return;

    const imgElement = liveMode ? liveImageRef.current : imageRef.current;
    if (!imgElement || !selectedDeviceId) return;

    const rect = imgElement.getBoundingClientRect();

    // 표시 좌표
    const displayX = e.clientX - rect.left;
    const displayY = e.clientY - rect.top;

    // 비율 계산 (원본 해상도 / 표시 크기)
    const scaleX = imgElement.naturalWidth / imgElement.clientWidth;
    const scaleY = imgElement.naturalHeight / imgElement.clientHeight;

    // 디바이스 좌표로 변환
    const deviceX = Math.round(displayX * scaleX);
    const deviceY = Math.round(displayY * scaleY);

    setClickPos({
      x: deviceX,
      y: deviceY,
      displayX,
      displayY,
    });

    // 요소 정보 찾기
    setElementLoading(true);
    try {
      const res = await axios.post<{ element: ElementInfo }>(`${API_BASE}/api/device/find-element`, {
        x: deviceX,
        y: deviceY,
        deviceId: selectedDeviceId,
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

  // 디바이스 좌표로 변환 (비율 적용)
  const getDeviceRegion = () => {
    if (!selectionRegion || !imageRef.current) return null;

    // 비율 계산
    const scaleX = imageRef.current.naturalWidth / imageRef.current.clientWidth;
    const scaleY = imageRef.current.naturalHeight / imageRef.current.clientHeight;

    const x = Math.min(selectionRegion.startX, selectionRegion.endX);
    const y = Math.min(selectionRegion.startY, selectionRegion.endY);
    const width = Math.abs(selectionRegion.endX - selectionRegion.startX);
    const height = Math.abs(selectionRegion.endY - selectionRegion.startY);

    return {
      x: Math.round(x * scaleX),
      y: Math.round(y * scaleY),
      width: Math.round(width * scaleX),
      height: Math.round(height * scaleY),
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
        deviceId: selectedDeviceId,
        ...deviceRegion,
      });

      alert('템플릿이 저장되었습니다!');
      setSelectionRegion(null);
      setTemplateName('');
      setCaptureMode(false);
      setLiveMode(true);
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

  // 선택 영역 스타일 (1:1 매핑)
  const selectionStyle = selectionRegion ? {
    left: Math.min(selectionRegion.startX, selectionRegion.endX),
    top: Math.min(selectionRegion.startY, selectionRegion.endY),
    width: Math.abs(selectionRegion.endX - selectionRegion.startX),
    height: Math.abs(selectionRegion.endY - selectionRegion.startY),
  } : null;

  return (
    <div className="device-preview">
      <div className="preview-header">
        <div className="header-top">
          <h2>📱 디바이스</h2>
          <div className="header-buttons">
            {/* 캡처 모드 버튼 */}
            <button
              className={`btn-mode ${captureMode ? 'active' : ''}`}
              onClick={toggleCaptureMode}
              title={captureMode ? '캡처 모드 해제' : '템플릿 캡처'}
              disabled={!selectedDeviceId}
            >
              ✂️
            </button>
            {/* 실시간/정지 토글 */}
            {!captureMode && (
              <button
                className={`btn-mode ${liveMode ? 'active' : ''}`}
                onClick={toggleLiveMode}
                title={liveMode ? '정지 (클릭 가능)' : '실시간'}
                disabled={mjpegError || !selectedDeviceId}
              >
                {liveMode ? '⏸️' : '▶️'}
              </button>
            )}
            {/* 새로고침 (정지 모드에서만) */}
            {(!liveMode || captureMode) && (
              <button
                className="btn-refresh"
                onClick={captureScreen}
                disabled={!hasSession || loading || !selectedDeviceId}
              >
                🔄
              </button>
            )}
          </div>
        </div>
        {/* 디바이스 선택 드롭다운 */}
        <div className="header-device-select">
          <select
            className="device-selector"
            value={selectedDeviceId}
            onChange={(e) => handleDeviceChange(e.target.value)}
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

      <div className={`preview-content ${orientation}`}>
        {/* 스크린샷 영역 */}
        <div className={`screenshot-container ${orientation}`}>
          {devices.length === 0 ? (
            <div className="screenshot-empty">
              <p>📱 연결된 디바이스가 없습니다</p>
              <small>ADB로 디바이스를 연결하세요</small>
            </div>
          ) : !selectedDeviceId ? (
            <div className="screenshot-empty">
              <p>📱 디바이스를 선택하세요</p>
            </div>
          ) : creatingSession ? (
            <div className="screenshot-empty">
              <div className="loading-spinner"></div>
              <p>세션 연결 중...</p>
              <small>{selectedDevice?.brand} {selectedDevice?.model}</small>
            </div>
          ) : !hasSession ? (
            <div className="screenshot-empty session-connect">
              <div className="connect-icon">📱</div>
              <p className="connect-title">{selectedDevice?.brand} {selectedDevice?.model}</p>
              <small className="connect-desc">디바이스 프리뷰를 사용하려면 세션을 연결하세요</small>
              <button
                className="btn-connect-session"
                onClick={handleConnectSession}
              >
                세션 연결하기
              </button>
            </div>
          ) : captureMode ? (
            // 캡처 모드: 정적 스크린샷
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
                    className="screenshot-image capture-mode"
                    onLoad={handleImageLoad}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    draggable={false}
                  />
                  {selectionStyle && selectionStyle.width > 0 && (
                    <div className="selection-box" style={selectionStyle} />
                  )}
                  <div className="capture-mode-badge">✂️ 캡처 모드</div>
                </>
              ) : (
                <div className="screenshot-empty">
                  <p>🔄 새로고침을 눌러주세요</p>
                </div>
              )}
            </div>
          ) : liveMode && mjpegUrl && !mjpegError ? (
            // 실시간 모드: MJPEG 스트림
            <div className="screenshot-wrapper">
              <img
                ref={liveImageRef}
                src={mjpegUrl}
                alt="Live Stream"
                className="screenshot-image live-mode"
                onClick={handleImageClick}
                onLoad={handleImageLoad}
                onError={handleMjpegError}
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
                {orientation === 'landscape' ? '↔️' : '↕️'} {deviceSize.width}x{deviceSize.height}
              </div>
            </div>
          ) : (
            // 정지 모드: 정적 스크린샷
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
                    onClick={handleImageClick}
                    onLoad={handleImageLoad}
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

              {!clickPos && hasSession && (
                <div className="info-hint">
                  <p>💡 화면을 클릭하여 좌표/요소 선택</p>
                  <p>✂️ 캡처 버튼으로 템플릿 저장</p>
                  {liveMode && <p>🔴 실시간 스트리밍 중</p>}
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