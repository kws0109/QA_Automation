// frontend/src/components/DevicePreview/DevicePreview.tsx

import { useState, useEffect, useCallback } from 'react';
import type { DeviceElement } from '../../types';
import { apiClient, API_BASE_URL } from '../../config/api';
import { useDeviceConnection, useScreenCapture, useSwipeSelect, useScreenStream } from './hooks';
import {
  PreviewHeader,
  ScreenshotViewer,
  InfoPanel,
  CapturePanel,
  TextExtractPanel,
  RegionSelectPanel,
  SwipeSelectPanel,
} from './components';
import type { ClickPosition, ElementInfo, ExtractedTextResult, DevicePreviewProps } from './types';
import './DevicePreview.css';

function DevicePreview({
  onSelectCoordinate,
  onSelectElement,
  onTemplateCreated,
  packageId,
  onDeviceIdChange,
  regionSelectMode = false,
  onRegionSelectModeChange,
  onSelectRegion,
  swipeSelectMode = false,
  onSwipeSelectModeChange,
  onSelectSwipe,
}: DevicePreviewProps) {
  // Device connection hook
  const {
    devices,
    selectedDeviceId,
    selectedDevice,
    devicesLoading,
    hasSession,
    creatingSession,
    mjpegUrl,
    mjpegError,
    setMjpegError,
    handleMjpegError: connectionHandleMjpegError,
    handleDeviceChange: baseHandleDeviceChange,
    handleConnectSession,
  } = useDeviceConnection(onDeviceIdChange);

  // Screen capture hook
  const {
    screenshot,
    loading,
    deviceSize,
    orientation,
    selectionRegion,
    selectionPreview,
    imageRef,
    liveImageRef,
    captureScreen,
    handleImageLoad,
    handleMouseDown: baseMouseDown,
    handleMouseMove: baseMouseMove,
    handleMouseUp,
    getDeviceRegion,
    getNormalizedRegion,
    resetSelection,
    setScreenshot,
    fetchDeviceInfo,
  } = useScreenCapture(selectedDeviceId, hasSession);

  // Click/Element state
  const [clickPos, setClickPos] = useState<ClickPosition | null>(null);
  const [elementInfo, setElementInfo] = useState<ElementInfo | null>(null);
  const [elementLoading, setElementLoading] = useState<boolean>(false);

  // Mode state
  const [liveMode, setLiveMode] = useState<boolean>(true);
  const [captureMode, setCaptureMode] = useState<boolean>(false);
  const [textExtractMode, setTextExtractMode] = useState<boolean>(false);

  // Capture state
  const [templateName, setTemplateName] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);

  // Text extract state
  const [extractedText, setExtractedText] = useState<ExtractedTextResult | null>(null);
  const [extracting, setExtracting] = useState<boolean>(false);

  // Swipe select hook
  const {
    swipeStart,
    swipeEnd,
    isSwipeDragging,
    handleSwipeMouseDown,
    handleSwipeMouseMove,
    handleSwipeMouseUp: swipeMouseUp,
    getDeviceSwipe,
    resetSwipe,
  } = useSwipeSelect(imageRef, swipeSelectMode);

  // WebSocket 스크린 스트리밍 훅 (라이브 모드에서 사용)
  const {
    canvasRef: streamCanvasRef,
    isConnected: streamConnected,
    isStreaming,
    error: streamError,
    reconnect: reconnectStream,
  } = useScreenStream(
    selectedDeviceId,
    liveMode && hasSession && !captureMode && !textExtractMode && !regionSelectMode && !swipeSelectMode
  );

  // 스트리밍 연결 시 실제 디바이스 크기 가져오기 (좌표 계산 정확도를 위해)
  // fetchDeviceInfo는 deviceSize 상태를 업데이트하므로 퍼센트 좌표 계산이 정확해짐
  useEffect(() => {
    if (streamConnected && selectedDeviceId) {
      console.log('📐 스트리밍 연결됨 - 디바이스 크기 갱신 중...');
      fetchDeviceInfo();
    }
  }, [streamConnected, selectedDeviceId, fetchDeviceInfo]);

  // 디바이스 변경 핸들러 (상태 초기화 포함)
  const handleDeviceChange = useCallback((deviceId: string) => {
    if (deviceId === selectedDeviceId) return;
    setScreenshot(null);
    setClickPos(null);
    setElementInfo(null);
    baseHandleDeviceChange(deviceId);
  }, [selectedDeviceId, baseHandleDeviceChange, setScreenshot]);

  // 캡처 모드 또는 텍스트 추출 모드 진입 시 스크린샷 캡처
  useEffect(() => {
    if ((captureMode || textExtractMode) && hasSession) {
      captureScreen();
    }
  }, [captureMode, textExtractMode, hasSession, captureScreen]);

  // 외부에서 영역 선택 모드가 활성화되면 스크린샷 캡처 및 모드 초기화
  useEffect(() => {
    if (regionSelectMode && hasSession) {
      setCaptureMode(false);
      setTextExtractMode(false);
      setLiveMode(false);
      resetSelection();
      setClickPos(null);
      setElementInfo(null);
      captureScreen();
    }
  }, [regionSelectMode, hasSession, captureScreen, resetSelection]);

  // 외부에서 스와이프 선택 모드가 활성화되면 스크린샷 캡처 및 모드 초기화
  useEffect(() => {
    if (swipeSelectMode && hasSession) {
      setCaptureMode(false);
      setTextExtractMode(false);
      setLiveMode(false);
      resetSelection();
      setClickPos(null);
      setElementInfo(null);
      resetSwipe();
      captureScreen();
    }
  }, [swipeSelectMode, hasSession, captureScreen, resetSelection, resetSwipe]);

  // 실시간 모드에서 주기적으로 이미지 크기 체크
  useEffect(() => {
    if (!liveMode || !liveImageRef.current) return;

    const checkInterval = setInterval(() => {
      if (liveImageRef.current) {
        const { naturalWidth, naturalHeight } = liveImageRef.current;
        if (naturalWidth > 0 && naturalHeight > 0) {
          // Size check done in hook
        }
      }
    }, 1000);

    return () => clearInterval(checkInterval);
  }, [liveMode, liveImageRef]);

  // 캡처 모드 토글
  const toggleCaptureMode = useCallback(() => {
    const newCaptureMode = !captureMode;
    setCaptureMode(newCaptureMode);
    setTextExtractMode(false);
    resetSelection();
    setTemplateName('');
    setClickPos(null);
    setElementInfo(null);
    setExtractedText(null);

    if (!newCaptureMode) {
      setLiveMode(true);
    }
  }, [captureMode, resetSelection]);

  // 텍스트 추출 모드 토글
  const toggleTextExtractMode = useCallback(() => {
    const newTextExtractMode = !textExtractMode;
    setTextExtractMode(newTextExtractMode);
    setCaptureMode(false);
    resetSelection();
    setExtractedText(null);
    setClickPos(null);
    setElementInfo(null);

    if (!newTextExtractMode) {
      setLiveMode(true);
    }
  }, [textExtractMode, resetSelection]);

  // 실시간/정지 모드 토글
  const toggleLiveMode = useCallback(() => {
    if (captureMode) return;

    const newLiveMode = !liveMode;
    setLiveMode(newLiveMode);

    if (!newLiveMode) {
      captureScreen();
    }
  }, [captureMode, liveMode, captureScreen]);

  // MJPEG 에러 처리 - 자동 재연결 시도
  const handleMjpegError = useCallback(() => {
    // 자동 재연결 시도 (최대 5회까지 지수 백오프로 재시도)
    connectionHandleMjpegError();
  }, [connectionHandleMjpegError]);

  // mjpegError가 true가 되면 (재시도 실패 시) 정적 모드로 전환
  useEffect(() => {
    if (mjpegError && liveMode) {
      console.log('[DevicePreview] MJPEG 재연결 실패, 정적 모드로 전환');
      setLiveMode(false);
      captureScreen();
    }
  }, [mjpegError, liveMode, captureScreen]);

  // 이미지/캔버스 클릭 핸들러
  const handleImageClick = useCallback(async (e: React.MouseEvent<HTMLImageElement>) => {
    if (captureMode) return;
    if (!selectedDeviceId) return;

    let displayX: number;
    let displayY: number;
    let deviceX: number;
    let deviceY: number;
    let xPercent: number;
    let yPercent: number;

    // WebSocket 스트리밍 모드 (Canvas 사용)
    if (liveMode && streamCanvasRef.current) {
      const canvas = streamCanvasRef.current;
      const rect = canvas.getBoundingClientRect();
      displayX = e.clientX - rect.left;
      displayY = e.clientY - rect.top;

      // deviceSize는 API에서 가져온 실제 디바이스 화면 크기 사용
      // (스트리밍은 고정 너비로 리사이즈하므로 캔버스 크기로 역산 불가)
      const actualDeviceWidth = deviceSize.width;
      const actualDeviceHeight = deviceSize.height;

      // 퍼센트 좌표 계산 (캔버스 표시 영역 기준 - 종횡비가 동일하므로 정확함)
      xPercent = displayX / rect.width;
      yPercent = displayY / rect.height;

      // 절대 좌표는 실제 디바이스 크기 기준으로 계산
      deviceX = Math.round(xPercent * actualDeviceWidth);
      deviceY = Math.round(yPercent * actualDeviceHeight);

      console.log(`📍 클릭 좌표 계산: deviceSize(${actualDeviceWidth}x${actualDeviceHeight}), percent(${xPercent.toFixed(4)}, ${yPercent.toFixed(4)}), device(${deviceX}, ${deviceY})`);
    }
    // 정적 이미지 모드
    else {
      const imgElement = imageRef.current;
      if (!imgElement) return;

      const rect = imgElement.getBoundingClientRect();
      displayX = e.clientX - rect.left;
      displayY = e.clientY - rect.top;

      // 이미지 실제 크기 (naturalWidth/Height)를 디바이스 크기로 사용
      const actualDeviceWidth = imgElement.naturalWidth;
      const actualDeviceHeight = imgElement.naturalHeight;

      const scaleX = actualDeviceWidth / imgElement.clientWidth;
      const scaleY = actualDeviceHeight / imgElement.clientHeight;

      deviceX = Math.round(displayX * scaleX);
      deviceY = Math.round(displayY * scaleY);

      // 퍼센트 좌표 계산
      xPercent = deviceX / actualDeviceWidth;
      yPercent = deviceY / actualDeviceHeight;

      console.log(`📍 클릭 좌표 계산 (정적): 이미지(${actualDeviceWidth}x${actualDeviceHeight}), percent(${xPercent.toFixed(4)}, ${yPercent.toFixed(4)}), device(${deviceX}, ${deviceY})`);
    }

    setClickPos({ x: deviceX, y: deviceY, displayX, displayY, xPercent, yPercent });

    setElementLoading(true);
    try {
      const res = await apiClient.post<{ element: ElementInfo }>(`${API_BASE_URL}/api/device/find-element`, {
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
  }, [captureMode, liveMode, selectedDeviceId, streamCanvasRef, imageRef, deviceSize]);

  // 마우스 다운 핸들러 (모드 체크 추가)
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLImageElement>) => {
    // 스와이프 선택 모드
    if (swipeSelectMode) {
      handleSwipeMouseDown(e);
      return;
    }

    if (!captureMode && !textExtractMode && !regionSelectMode) return;
    setExtractedText(null);
    baseMouseDown(e);
  }, [captureMode, textExtractMode, regionSelectMode, swipeSelectMode, baseMouseDown, handleSwipeMouseDown]);

  // 마우스 무브 핸들러 (모드 체크 추가)
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLImageElement>) => {
    // 스와이프 선택 모드
    if (swipeSelectMode && isSwipeDragging) {
      handleSwipeMouseMove(e);
      return;
    }

    if (!captureMode && !textExtractMode && !regionSelectMode) return;
    baseMouseMove(e);
  }, [captureMode, textExtractMode, regionSelectMode, swipeSelectMode, isSwipeDragging, baseMouseMove, handleSwipeMouseMove]);

  // 마우스 업 핸들러 (스와이프 모드 추가)
  const handleSwipeMouseUpCombined = useCallback(() => {
    if (swipeSelectMode && isSwipeDragging) {
      swipeMouseUp();
      return;
    }
    handleMouseUp();
  }, [swipeSelectMode, isSwipeDragging, handleMouseUp, swipeMouseUp]);

  // 텍스트 추출 실행
  const handleExtractText = useCallback(async () => {
    const deviceRegion = getDeviceRegion();
    if (!deviceRegion || deviceRegion.width < 10 || deviceRegion.height < 10) {
      alert('영역을 선택해주세요 (최소 10x10 픽셀).');
      return;
    }

    setExtracting(true);
    try {
      const res = await apiClient.post<{
        success: boolean;
        data: ExtractedTextResult;
        error?: string;
      }>(`${API_BASE_URL}/api/ocr/extract`, {
        deviceId: selectedDeviceId,
        region: deviceRegion,
      });

      if (res.data.success) {
        setExtractedText(res.data.data);
      } else {
        alert('텍스트 추출 실패: ' + (res.data.error || '알 수 없는 오류'));
      }
    } catch (err) {
      const error = err as Error;
      alert('텍스트 추출 실패: ' + error.message);
    } finally {
      setExtracting(false);
    }
  }, [selectedDeviceId, getDeviceRegion]);

  // 영역 선택 적용
  const handleApplyRegion = useCallback(() => {
    const normalizedRegion = getNormalizedRegion();
    if (!normalizedRegion || normalizedRegion.width < 0.01 || normalizedRegion.height < 0.01) {
      alert('영역을 선택해주세요 (최소 1% 크기).');
      return;
    }

    onSelectRegion?.(normalizedRegion);
    handleCancelRegionSelect();
  }, [getNormalizedRegion, onSelectRegion]);

  // 영역 선택 취소
  const handleCancelRegionSelect = useCallback(() => {
    resetSelection();
    setLiveMode(true);
    onRegionSelectModeChange?.(false);
  }, [resetSelection, onRegionSelectModeChange]);

  // 스와이프 좌표 적용
  const handleApplySwipe = useCallback(() => {
    const deviceSwipe = getDeviceSwipe();
    if (!deviceSwipe) {
      alert('스와이프 좌표를 선택해주세요.');
      return;
    }

    const distance = Math.sqrt(
      Math.pow(deviceSwipe.endX - deviceSwipe.startX, 2) +
      Math.pow(deviceSwipe.endY - deviceSwipe.startY, 2)
    );

    if (distance < 20) {
      alert('스와이프 거리가 너무 짧습니다 (최소 20px).');
      return;
    }

    onSelectSwipe?.(deviceSwipe);
    handleCancelSwipeSelect();
  }, [getDeviceSwipe, onSelectSwipe]);

  // 스와이프 선택 취소
  const handleCancelSwipeSelect = useCallback(() => {
    resetSwipe();
    setLiveMode(true);
    onSwipeSelectModeChange?.(false);
  }, [onSwipeSelectModeChange, resetSwipe]);

  // 템플릿 저장
  const handleSaveTemplate = useCallback(async () => {
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
      await apiClient.post(`${API_BASE_URL}/api/image/capture-template`, {
        name: templateName,
        deviceId: selectedDeviceId,
        packageId,
        ...deviceRegion,
      });

      alert('템플릿이 저장되었습니다!');
      resetSelection();
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
  }, [templateName, packageId, selectedDeviceId, getDeviceRegion, resetSelection, onTemplateCreated]);

  // 좌표 적용
  const handleApplyCoordinate = useCallback(() => {
    if (clickPos && onSelectCoordinate) {
      onSelectCoordinate(clickPos.x, clickPos.y, clickPos.xPercent, clickPos.yPercent);
    }
  }, [clickPos, onSelectCoordinate]);

  // 요소 적용
  const handleApplyElement = useCallback(() => {
    if (elementInfo && onSelectElement) {
      onSelectElement(elementInfo as DeviceElement);
    }
  }, [elementInfo, onSelectElement]);

  // 현재 선택된 영역 정보
  const deviceRegion = getDeviceRegion();
  const normalizedRegion = getNormalizedRegion();

  return (
    <div className="device-preview">
      <PreviewHeader
        devices={devices}
        selectedDeviceId={selectedDeviceId}
        devicesLoading={devicesLoading}
        hasSession={hasSession}
        loading={loading}
        mjpegError={mjpegError}
        captureMode={captureMode}
        textExtractMode={textExtractMode}
        liveMode={liveMode}
        onDeviceChange={handleDeviceChange}
        onToggleCaptureMode={toggleCaptureMode}
        onToggleTextExtractMode={toggleTextExtractMode}
        onToggleLiveMode={toggleLiveMode}
        onCaptureScreen={captureScreen}
      />

      <div className={`preview-content ${orientation}`}>
        <ScreenshotViewer
          devices={devices}
          selectedDeviceId={selectedDeviceId}
          selectedDevice={selectedDevice}
          hasSession={hasSession}
          creatingSession={creatingSession}
          onConnectSession={handleConnectSession}
          screenshot={screenshot}
          loading={loading}
          orientation={orientation}
          deviceSize={deviceSize}
          liveMode={liveMode}
          mjpegUrl={mjpegUrl}
          mjpegError={mjpegError}
          onMjpegError={handleMjpegError}
          captureMode={captureMode}
          textExtractMode={textExtractMode}
          regionSelectMode={regionSelectMode}
          swipeSelectMode={swipeSelectMode}
          streamCanvasRef={streamCanvasRef}
          streamConnected={streamConnected}
          isStreaming={isStreaming}
          streamError={streamError}
          onReconnectStream={reconnectStream}
          clickPos={clickPos}
          selectionRegion={selectionRegion}
          swipeStart={swipeStart}
          swipeEnd={swipeEnd}
          imageRef={imageRef}
          liveImageRef={liveImageRef}
          onImageClick={handleImageClick}
          onImageLoad={handleImageLoad}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleSwipeMouseUpCombined}
        />

        {/* 정보 패널 */}
        <div className="selection-info">
          {captureMode ? (
            <CapturePanel
              selectionPreview={selectionPreview}
              deviceRegion={deviceRegion}
              templateName={templateName}
              onTemplateNameChange={setTemplateName}
              saving={saving}
              onSave={handleSaveTemplate}
              onCancel={toggleCaptureMode}
            />
          ) : textExtractMode ? (
            <TextExtractPanel
              selectionPreview={selectionPreview}
              deviceRegion={deviceRegion}
              extracting={extracting}
              extractedText={extractedText}
              onExtract={handleExtractText}
              onCancel={toggleTextExtractMode}
            />
          ) : regionSelectMode ? (
            <RegionSelectPanel
              selectionPreview={selectionPreview}
              deviceRegion={deviceRegion}
              normalizedRegion={normalizedRegion}
              onApply={handleApplyRegion}
              onCancel={handleCancelRegionSelect}
            />
          ) : swipeSelectMode ? (
            <SwipeSelectPanel
              swipeStart={swipeStart}
              swipeEnd={swipeEnd}
              deviceSwipe={getDeviceSwipe()}
              onApply={handleApplySwipe}
              onCancel={handleCancelSwipeSelect}
            />
          ) : (
            <InfoPanel
              clickPos={clickPos}
              elementInfo={elementInfo}
              elementLoading={elementLoading}
              onApplyCoordinate={handleApplyCoordinate}
              onApplyElement={handleApplyElement}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default DevicePreview;
