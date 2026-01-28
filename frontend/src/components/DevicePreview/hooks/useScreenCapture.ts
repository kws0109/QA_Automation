// frontend/src/components/DevicePreview/hooks/useScreenCapture.ts

import { useState, useRef, useEffect, useCallback } from 'react';
import { apiClient, API_BASE_URL } from '../../../config/api';
import type {
  DeviceSize,
  SelectionRegion,
  DeviceRegion,
  NormalizedRegion,
  UseScreenCaptureReturn,
} from '../types';

interface DeviceInfoResponse {
  windowSize?: DeviceSize;
}

interface ScreenshotResponse {
  screenshot?: string;
}

export function useScreenCapture(
  selectedDeviceId: string,
  hasSession: boolean,
): UseScreenCaptureReturn {
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [deviceSize, setDeviceSize] = useState<DeviceSize>({ width: 1080, height: 1920 });
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [selectionRegion, setSelectionRegion] = useState<SelectionRegion | null>(null);
  const [isSelecting, setIsSelecting] = useState<boolean>(false);
  const [selectionPreview, setSelectionPreview] = useState<string | null>(null);

  const imageRef = useRef<HTMLImageElement>(null);
  const liveImageRef = useRef<HTMLImageElement>(null);

  // 디바이스 정보 가져오기
  const fetchDeviceInfo = useCallback(async () => {
    if (!selectedDeviceId) return;

    try {
      const res = await apiClient.get<DeviceInfoResponse>(
        `${API_BASE_URL}/api/device/info?deviceId=${selectedDeviceId}`,
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

  // 스크린샷 캡처
  const captureScreen = useCallback(async () => {
    if (!selectedDeviceId) return;

    setLoading(true);
    try {
      await fetchDeviceInfo();

      const res = await apiClient.get<ScreenshotResponse>(
        `${API_BASE_URL}/api/device/screenshot?deviceId=${selectedDeviceId}`,
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

  // 이미지 크기/방향 업데이트
  const updateImageSize = useCallback((img: HTMLImageElement) => {
    const { naturalWidth, naturalHeight } = img;

    if (naturalWidth > 0 && naturalHeight > 0) {
      const newOrientation = naturalWidth > naturalHeight ? 'landscape' : 'portrait';

      if (newOrientation !== orientation) {
        setOrientation(newOrientation);
        console.log(`📱 화면 방향 변경: ${newOrientation} (${naturalWidth}x${naturalHeight})`);
      }

      if (deviceSize.width !== naturalWidth || deviceSize.height !== naturalHeight) {
        setDeviceSize({ width: naturalWidth, height: naturalHeight });
        console.log(`📐 디바이스 크기 업데이트: ${naturalWidth}x${naturalHeight}`);
      }
    }
  }, [orientation, deviceSize.width, deviceSize.height]);

  // 이미지 로드 핸들러
  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    updateImageSize(e.currentTarget);
  }, [updateImageSize]);

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

    const x = Math.min(selectionRegion.startX, selectionRegion.endX);
    const y = Math.min(selectionRegion.startY, selectionRegion.endY);
    const width = Math.abs(selectionRegion.endX - selectionRegion.startX);
    const height = Math.abs(selectionRegion.endY - selectionRegion.startY);

    if (width < 5 || height < 5) {
      setSelectionPreview(null);
      return;
    }

    const scaleX = img.naturalWidth / img.clientWidth;
    const scaleY = img.naturalHeight / img.clientHeight;

    const srcX = x * scaleX;
    const srcY = y * scaleY;
    const srcW = width * scaleX;
    const srcH = height * scaleY;

    canvas.width = srcW;
    canvas.height = srcH;

    const tempImg = new Image();
    tempImg.onload = () => {
      ctx.drawImage(tempImg, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);
      setSelectionPreview(canvas.toDataURL('image/png'));
    };
    tempImg.src = screenshot;
  }, [selectionRegion, screenshot]);

  // 영역 선택 시작
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLImageElement>) => {
    if (!imageRef.current) return;

    const rect = imageRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setIsSelecting(true);
    setSelectionRegion({ startX: x, startY: y, endX: x, endY: y });
  }, []);

  // 영역 선택 중
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLImageElement>) => {
    if (!isSelecting || !imageRef.current || !selectionRegion) return;

    const rect = imageRef.current.getBoundingClientRect();
    const x = Math.min(Math.max(0, e.clientX - rect.left), rect.width);
    const y = Math.min(Math.max(0, e.clientY - rect.top), rect.height);

    setSelectionRegion({ ...selectionRegion, endX: x, endY: y });
  }, [isSelecting, selectionRegion]);

  // 영역 선택 완료
  const handleMouseUp = useCallback(() => {
    setIsSelecting(false);
  }, []);

  // 디바이스 좌표로 변환
  const getDeviceRegion = useCallback((): DeviceRegion | null => {
    if (!selectionRegion || !imageRef.current) return null;

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
  }, [selectionRegion]);

  // 정규화된 좌표로 변환 (0~1 범위)
  const getNormalizedRegion = useCallback((): NormalizedRegion | null => {
    if (!selectionRegion || !imageRef.current) return null;

    const x = Math.min(selectionRegion.startX, selectionRegion.endX);
    const y = Math.min(selectionRegion.startY, selectionRegion.endY);
    const width = Math.abs(selectionRegion.endX - selectionRegion.startX);
    const height = Math.abs(selectionRegion.endY - selectionRegion.startY);

    const imgWidth = imageRef.current.clientWidth;
    const imgHeight = imageRef.current.clientHeight;

    return {
      x: parseFloat((x / imgWidth).toFixed(4)),
      y: parseFloat((y / imgHeight).toFixed(4)),
      width: parseFloat((width / imgWidth).toFixed(4)),
      height: parseFloat((height / imgHeight).toFixed(4)),
    };
  }, [selectionRegion]);

  // 선택 초기화
  const resetSelection = useCallback(() => {
    setSelectionRegion(null);
    setSelectionPreview(null);
    setIsSelecting(false);
  }, []);

  return {
    screenshot,
    loading,
    deviceSize,
    orientation,
    selectionRegion,
    isSelecting,
    selectionPreview,
    imageRef,
    liveImageRef,
    captureScreen,
    handleImageLoad,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    getDeviceRegion,
    getNormalizedRegion,
    resetSelection,
    setScreenshot,
  };
}
