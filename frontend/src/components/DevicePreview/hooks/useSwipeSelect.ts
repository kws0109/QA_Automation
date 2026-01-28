// frontend/src/components/DevicePreview/hooks/useSwipeSelect.ts
// 스와이프 좌표 선택 로직을 담당하는 훅

import { useState, useCallback, RefObject } from 'react';

interface SwipePosition {
  x: number;
  y: number;
}

interface DeviceSwipeCoords {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  startXPercent: number;
  startYPercent: number;
  endXPercent: number;
  endYPercent: number;
}

interface UseSwipeSelectReturn {
  // State
  swipeStart: SwipePosition | null;
  swipeEnd: SwipePosition | null;
  isSwipeDragging: boolean;
  // Handlers
  handleSwipeMouseDown: (e: React.MouseEvent<HTMLImageElement>) => void;
  handleSwipeMouseMove: (e: React.MouseEvent<HTMLImageElement>) => void;
  handleSwipeMouseUp: () => void;
  // Utilities
  getDeviceSwipe: () => DeviceSwipeCoords | null;
  resetSwipe: () => void;
}

export function useSwipeSelect(
  imageRef: RefObject<HTMLImageElement | null>,
  swipeSelectMode: boolean
): UseSwipeSelectReturn {
  const [swipeStart, setSwipeStart] = useState<SwipePosition | null>(null);
  const [swipeEnd, setSwipeEnd] = useState<SwipePosition | null>(null);
  const [isSwipeDragging, setIsSwipeDragging] = useState(false);

  // 스와이프 시작
  const handleSwipeMouseDown = useCallback((e: React.MouseEvent<HTMLImageElement>) => {
    if (!swipeSelectMode || !imageRef.current) return;

    const rect = imageRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setSwipeStart({ x, y });
    setSwipeEnd({ x, y });
    setIsSwipeDragging(true);
  }, [swipeSelectMode, imageRef]);

  // 스와이프 중
  const handleSwipeMouseMove = useCallback((e: React.MouseEvent<HTMLImageElement>) => {
    if (!swipeSelectMode || !isSwipeDragging || !imageRef.current) return;

    const rect = imageRef.current.getBoundingClientRect();
    const x = Math.min(Math.max(0, e.clientX - rect.left), rect.width);
    const y = Math.min(Math.max(0, e.clientY - rect.top), rect.height);

    setSwipeEnd({ x, y });
  }, [swipeSelectMode, isSwipeDragging, imageRef]);

  // 스와이프 완료
  const handleSwipeMouseUp = useCallback(() => {
    if (!swipeSelectMode) return;
    setIsSwipeDragging(false);
  }, [swipeSelectMode]);

  // 디바이스 좌표 및 비율 계산
  const getDeviceSwipe = useCallback((): DeviceSwipeCoords | null => {
    if (!swipeStart || !swipeEnd || !imageRef.current) return null;

    const img = imageRef.current;
    const scaleX = img.naturalWidth / img.clientWidth;
    const scaleY = img.naturalHeight / img.clientHeight;

    const startX = Math.round(swipeStart.x * scaleX);
    const startY = Math.round(swipeStart.y * scaleY);
    const endX = Math.round(swipeEnd.x * scaleX);
    const endY = Math.round(swipeEnd.y * scaleY);

    // 비율 계산 (0-100%)
    const startXPercent = (swipeStart.x / img.clientWidth) * 100;
    const startYPercent = (swipeStart.y / img.clientHeight) * 100;
    const endXPercent = (swipeEnd.x / img.clientWidth) * 100;
    const endYPercent = (swipeEnd.y / img.clientHeight) * 100;

    return {
      startX,
      startY,
      endX,
      endY,
      startXPercent: parseFloat(startXPercent.toFixed(2)),
      startYPercent: parseFloat(startYPercent.toFixed(2)),
      endXPercent: parseFloat(endXPercent.toFixed(2)),
      endYPercent: parseFloat(endYPercent.toFixed(2)),
    };
  }, [swipeStart, swipeEnd, imageRef]);

  // 스와이프 상태 초기화
  const resetSwipe = useCallback(() => {
    setSwipeStart(null);
    setSwipeEnd(null);
    setIsSwipeDragging(false);
  }, []);

  return {
    swipeStart,
    swipeEnd,
    isSwipeDragging,
    handleSwipeMouseDown,
    handleSwipeMouseMove,
    handleSwipeMouseUp,
    getDeviceSwipe,
    resetSwipe,
  };
}
