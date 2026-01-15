// frontend/src/components/DevicePreview/DevicePreview.tsx

import { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import type { DeviceElement, DeviceDetailedInfo } from '../../types';
import './DevicePreview.css';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:3001';

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
  packageId?: string;  // 템플릿 저장 시 사용할 패키지 ID
  onDeviceIdChange?: (deviceId: string) => void;  // 선택된 디바이스 ID 변경 콜백
  // 영역 선택 모드 (Panel에서 ROI 영역 선택 시 사용)
  regionSelectMode?: boolean;
  onRegionSelectModeChange?: (active: boolean) => void;
  onSelectRegion?: (region: { x: number; y: number; width: number; height: number }) => void;
}

function DevicePreview({
  onSelectCoordinate,
  onSelectElement,
  onTemplateCreated,
  packageId,
  onDeviceIdChange,
  regionSelectMode = false,
  onRegionSelectModeChange,
  onSelectRegion,
}: DevicePreviewProps) {
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
  const [selectionPreview, setSelectionPreview] = useState<string | null>(null);

  // 텍스트 추출 모드 상태
  const [textExtractMode, setTextExtractMode] = useState<boolean>(false);
  const [extractedText, setExtractedText] = useState<{ combinedText: string; lines: string[]; processingTime: number } | null>(null);
  const [extracting, setExtracting] = useState<boolean>(false);

  const imageRef = useRef<HTMLImageElement>(null);
  const liveImageRef = useRef<HTMLImageElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  // 디바이스 목록 조회
  const fetchDevices = useCallback(async (autoSelectFirst = false) => {
    setDevicesLoading(true);
    try {
      const res = await axios.get<{ success: boolean; devices: DeviceDetailedInfo[] }>(
        `${API_BASE}/api/device/list/detailed`,
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
        `${API_BASE}/api/session/list`,
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

  // 선택된 디바이스 ID 변경 시 부모 컴포넌트에 알림
  useEffect(() => {
    onDeviceIdChange?.(selectedDeviceId);
  }, [selectedDeviceId, onDeviceIdChange]);

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
        `${API_BASE}/api/device/info?deviceId=${selectedDeviceId}`,
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
        `${API_BASE}/api/device/screenshot?deviceId=${selectedDeviceId}`,
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

  // 캡처 모드 또는 텍스트 추출 모드 진입 시 스크린샷 캡처
  useEffect(() => {
    if ((captureMode || textExtractMode) && hasSession) {
      captureScreen();
    }
  }, [captureMode, textExtractMode, hasSession, captureScreen]);

  // 외부에서 영역 선택 모드가 활성화되면 스크린샷 캡처 및 모드 초기화
  useEffect(() => {
    if (regionSelectMode && hasSession) {
      // 다른 모드 해제
      setCaptureMode(false);
      setTextExtractMode(false);
      setLiveMode(false);
      setSelectionRegion(null);
      setSelectionPreview(null);
      setClickPos(null);
      setElementInfo(null);
      // 스크린샷 캡처
      captureScreen();
    }
  }, [regionSelectMode, hasSession, captureScreen]);

  // 선택 영역 미리보기 생성
  useEffect(() => {
    if (!selectionRegion || !imageRef.current || !screenshot) {
      setSelectionPreview(null);
      return;
    }

    const img = imageRef.current;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 선택 영역 계산 (display 좌표)
    const x = Math.min(selectionRegion.startX, selectionRegion.endX);
    const y = Math.min(selectionRegion.startY, selectionRegion.endY);
    const width = Math.abs(selectionRegion.endX - selectionRegion.startX);
    const height = Math.abs(selectionRegion.endY - selectionRegion.startY);

    if (width < 5 || height < 5) {
      setSelectionPreview(null);
      return;
    }

    // 비율 계산
    const scaleX = img.naturalWidth / img.clientWidth;
    const scaleY = img.naturalHeight / img.clientHeight;

    // 원본 이미지 좌표로 변환
    const srcX = x * scaleX;
    const srcY = y * scaleY;
    const srcW = width * scaleX;
    const srcH = height * scaleY;

    canvas.width = srcW;
    canvas.height = srcH;

    // 이미지에서 선택 영역 잘라내기
    const tempImg = new Image();
    tempImg.onload = () => {
      ctx.drawImage(tempImg, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);
      setSelectionPreview(canvas.toDataURL('image/png'));
    };
    tempImg.src = screenshot;
  }, [selectionRegion, screenshot]);

  // 캡처 모드 토글
  const toggleCaptureMode = () => {
    const newCaptureMode = !captureMode;
    setCaptureMode(newCaptureMode);
    setTextExtractMode(false); // 텍스트 추출 모드 해제
    setSelectionRegion(null);
    setSelectionPreview(null);
    setTemplateName('');
    setClickPos(null);
    setElementInfo(null);
    setExtractedText(null);

    // 캡처 모드 해제 시 실시간 모드로
    if (!newCaptureMode) {
      setLiveMode(true);
    }
  };

  // 텍스트 추출 모드 토글
  const toggleTextExtractMode = () => {
    const newTextExtractMode = !textExtractMode;
    setTextExtractMode(newTextExtractMode);
    setCaptureMode(false); // 캡처 모드 해제
    setSelectionRegion(null);
    setSelectionPreview(null);
    setExtractedText(null);
    setClickPos(null);
    setElementInfo(null);

    // 텍스트 추출 모드 해제 시 실시간 모드로
    if (!newTextExtractMode) {
      setLiveMode(true);
    }
  };

  // 텍스트 추출 실행
  const handleExtractText = async () => {
    const deviceRegion = getDeviceRegion();
    if (!deviceRegion || deviceRegion.width < 10 || deviceRegion.height < 10) {
      alert('영역을 선택해주세요 (최소 10x10 픽셀).');
      return;
    }

    setExtracting(true);
    try {
      const res = await axios.post<{
        success: boolean;
        data: {
          combinedText: string;
          lines: string[];
          processingTime: number;
        };
        error?: string;
      }>(`${API_BASE}/api/ocr/extract`, {
        deviceId: selectedDeviceId,
        region: deviceRegion,
      });

      if (res.data.success) {
        setExtractedText({
          combinedText: res.data.data.combinedText,
          lines: res.data.data.lines,
          processingTime: res.data.data.processingTime,
        });
      } else {
        alert('텍스트 추출 실패: ' + (res.data.error || '알 수 없는 오류'));
      }
    } catch (err) {
      const error = err as Error;
      alert('텍스트 추출 실패: ' + error.message);
    } finally {
      setExtracting(false);
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

  // 영역 선택 시작 (캡처 모드 / 텍스트 추출 모드 / 영역 선택 모드)
  const handleMouseDown = (e: React.MouseEvent<HTMLImageElement>) => {
    if ((!captureMode && !textExtractMode && !regionSelectMode) || !imageRef.current) return;

    const rect = imageRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setIsSelecting(true);
    setSelectionRegion({ startX: x, startY: y, endX: x, endY: y });
    setExtractedText(null); // 새 선택 시 이전 결과 초기화
  };

  // 영역 선택 중 (캡처 모드 / 텍스트 추출 모드 / 영역 선택 모드)
  const handleMouseMove = (e: React.MouseEvent<HTMLImageElement>) => {
    if ((!captureMode && !textExtractMode && !regionSelectMode) || !isSelecting || !imageRef.current || !selectionRegion) return;

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

  // 정규화된 좌표로 변환 (0~1 범위)
  const getNormalizedRegion = () => {
    if (!selectionRegion || !imageRef.current) return null;

    const x = Math.min(selectionRegion.startX, selectionRegion.endX);
    const y = Math.min(selectionRegion.startY, selectionRegion.endY);
    const width = Math.abs(selectionRegion.endX - selectionRegion.startX);
    const height = Math.abs(selectionRegion.endY - selectionRegion.startY);

    // 이미지 표시 크기로 정규화 (0~1)
    const imgWidth = imageRef.current.clientWidth;
    const imgHeight = imageRef.current.clientHeight;

    return {
      x: parseFloat((x / imgWidth).toFixed(4)),
      y: parseFloat((y / imgHeight).toFixed(4)),
      width: parseFloat((width / imgWidth).toFixed(4)),
      height: parseFloat((height / imgHeight).toFixed(4)),
    };
  };

  // 영역 선택 적용 (Panel의 ROI로 전달)
  const handleApplyRegion = () => {
    const normalizedRegion = getNormalizedRegion();
    if (!normalizedRegion || normalizedRegion.width < 0.01 || normalizedRegion.height < 0.01) {
      alert('영역을 선택해주세요 (최소 1% 크기).');
      return;
    }

    onSelectRegion?.(normalizedRegion);
    handleCancelRegionSelect();
  };

  // 영역 선택 취소
  const handleCancelRegionSelect = () => {
    setSelectionRegion(null);
    setSelectionPreview(null);
    setLiveMode(true);
    onRegionSelectModeChange?.(false);
  };

  // 템플릿 저장
  const handleSaveTemplate = async () => {
    if (!templateName.trim()) {
      alert('템플릿 이름을 입력해주세요.');
      return;
    }

    if (!packageId) {
      alert('패키지를 먼저 선택해주세요.');
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
        packageId,
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
          {/* 텍스트 추출 모드 버튼 */}
          <button
            className={`btn-mode ${textExtractMode ? 'active' : ''}`}
            onClick={toggleTextExtractMode}
            title={textExtractMode ? '텍스트 추출 모드 해제' : '텍스트 추출 (OCR)'}
            disabled={!selectedDeviceId}
          >
            🔤
          </button>
          {/* 실시간/정지 토글 */}
          {!captureMode && !textExtractMode && (
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
          {(!liveMode || captureMode || textExtractMode) && (
            <button
              className="btn-refresh"
              onClick={captureScreen}
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
          ) : captureMode || textExtractMode || regionSelectMode ? (
            // 캡처 모드 / 텍스트 추출 모드 / 영역 선택 모드: 정적 스크린샷
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
                    className={`screenshot-image ${captureMode ? 'capture-mode' : textExtractMode ? 'text-extract-mode' : 'region-select-mode'}`}
                    onLoad={handleImageLoad}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    draggable={false}
                  />
                  {selectionStyle && selectionStyle.width > 0 && (
                    <div className={`selection-box ${textExtractMode ? 'text-extract' : regionSelectMode ? 'region-select' : ''}`} style={selectionStyle} />
                  )}
                  <div className="capture-mode-badge">
                    {captureMode ? '✂️ 캡처 모드' : textExtractMode ? '🔤 텍스트 추출' : '📐 영역 선택'}
                  </div>
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
                {orientation === 'landscape' ? '↔️' : '↕️'} {Math.max(deviceSize.width, deviceSize.height)}x{Math.min(deviceSize.width, deviceSize.height)}
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

              {/* 선택 영역 미리보기 */}
              <div className="selection-preview">
                {selectionPreview ? (
                  <img src={selectionPreview} alt="선택 영역" />
                ) : (
                  <span className="preview-placeholder">영역을 선택하세요</span>
                )}
              </div>

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
          ) : textExtractMode ? (
            /* 텍스트 추출 모드 UI */
            <div className="capture-panel text-extract-panel">
              <h4>🔤 텍스트 추출</h4>
              <p className="capture-hint">드래그하여 영역 선택</p>

              {/* 선택 영역 미리보기 */}
              <div className="selection-preview">
                {selectionPreview ? (
                  <img src={selectionPreview} alt="선택 영역" />
                ) : (
                  <span className="preview-placeholder">영역을 선택하세요</span>
                )}
              </div>

              {selectionRegion && getDeviceRegion() && (
                <div className="region-info">
                  선택: {getDeviceRegion()?.width}x{getDeviceRegion()?.height}
                </div>
              )}

              <div className="capture-buttons">
                <button
                  className="btn-extract-text"
                  onClick={handleExtractText}
                  disabled={extracting || !selectionRegion}
                >
                  {extracting ? '추출 중...' : '📝 텍스트 추출'}
                </button>
                <button
                  className="btn-cancel-capture"
                  onClick={toggleTextExtractMode}
                >
                  취소
                </button>
              </div>

              {/* 추출 결과 */}
              {extractedText && (
                <div className="extracted-text-result">
                  <div className="result-header">
                    <span>추출 결과</span>
                    <small>{extractedText.processingTime}ms</small>
                  </div>
                  {extractedText.combinedText ? (
                    <>
                      <div
                        className="result-text"
                        onClick={() => copyToClipboard(extractedText.combinedText)}
                        title="클릭하여 복사"
                      >
                        {extractedText.combinedText}
                      </div>
                      <small className="result-hint">클릭하여 복사</small>
                    </>
                  ) : (
                    <div className="result-empty">텍스트 없음</div>
                  )}
                </div>
              )}
            </div>
          ) : regionSelectMode ? (
            /* 영역 선택 모드 UI (Panel에서 ROI 설정용) */
            <div className="capture-panel region-select-panel">
              <h4>📐 검색 영역 선택</h4>
              <p className="capture-hint">드래그하여 ROI 영역 선택</p>

              {/* 선택 영역 미리보기 */}
              <div className="selection-preview">
                {selectionPreview ? (
                  <img src={selectionPreview} alt="선택 영역" />
                ) : (
                  <span className="preview-placeholder">영역을 선택하세요</span>
                )}
              </div>

              {selectionRegion && getNormalizedRegion() && (
                <div className="region-info">
                  <div>선택: {getDeviceRegion()?.width}x{getDeviceRegion()?.height}px</div>
                  <div className="region-normalized">
                    ({(getNormalizedRegion()?.x ?? 0).toFixed(2)}, {(getNormalizedRegion()?.y ?? 0).toFixed(2)}) ~
                    ({((getNormalizedRegion()?.x ?? 0) + (getNormalizedRegion()?.width ?? 0)).toFixed(2)}, {((getNormalizedRegion()?.y ?? 0) + (getNormalizedRegion()?.height ?? 0)).toFixed(2)})
                  </div>
                </div>
              )}

              <div className="capture-buttons">
                <button
                  className="btn-apply-region"
                  onClick={handleApplyRegion}
                  disabled={!selectionRegion}
                >
                  ✓ 적용
                </button>
                <button
                  className="btn-cancel-capture"
                  onClick={handleCancelRegionSelect}
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

            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default DevicePreview;