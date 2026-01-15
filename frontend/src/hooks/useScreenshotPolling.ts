// frontend/src/hooks/useScreenshotPolling.ts
// WiFi ADB 최적화를 위한 순차 폴링 기반 스크린샷 훅

import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:3001';

// 스크린샷 데이터
export interface ScreenshotData {
  deviceId: string;
  image: string;      // base64 data URL
  timestamp: string;
  width: number;
  height: number;
}

// 훅 반환 타입
interface UseScreenshotPollingReturn {
  screenshots: Map<string, ScreenshotData>;
  isConnected: boolean;
  error: string | null;
  subscribe: (deviceIds: string[]) => void;
  unsubscribe: (deviceIds: string[]) => void;
  getScreenshot: (deviceId: string) => ScreenshotData | undefined;
}

// 싱글톤 소켓 (여러 컴포넌트에서 공유)
let sharedSocket: Socket | null = null;
let socketRefCount = 0;

function getSharedSocket(): Socket {
  if (!sharedSocket) {
    sharedSocket = io(API_BASE, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });
  }
  socketRefCount++;
  return sharedSocket;
}

function releaseSharedSocket(): void {
  socketRefCount--;
  if (socketRefCount <= 0 && sharedSocket) {
    sharedSocket.emit('screenshot:leave');
    // 소켓은 유지 (다른 기능에서 사용할 수 있음)
    socketRefCount = 0;
  }
}

/**
 * 스크린샷 폴링 훅
 * WiFi ADB 환경에서 여러 디바이스의 스크린샷을 순차적으로 폴링
 *
 * @param deviceIds 구독할 디바이스 ID 배열
 * @param autoSubscribe 자동 구독 여부 (기본: true)
 */
export function useScreenshotPolling(
  deviceIds: string[] = [],
  autoSubscribe: boolean = true,
): UseScreenshotPollingReturn {
  const [screenshots, setScreenshots] = useState<Map<string, ScreenshotData>>(new Map());
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const subscribedRef = useRef<Set<string>>(new Set());

  // 소켓 연결 및 이벤트 설정
  useEffect(() => {
    const socket = getSharedSocket();
    socketRef.current = socket;

    // 연결 상태 핸들러
    const handleConnect = () => {
      setIsConnected(true);
      setError(null);
      console.log('📸 [useScreenshotPolling] 소켓 연결됨');
    };

    const handleDisconnect = () => {
      setIsConnected(false);
      console.log('📸 [useScreenshotPolling] 소켓 연결 해제');
    };

    const handleConnectError = (err: Error) => {
      setError(`연결 오류: ${err.message}`);
      console.error('📸 [useScreenshotPolling] 연결 오류:', err);
    };

    // 스크린샷 업데이트 핸들러
    const handleScreenshotUpdate = (data: ScreenshotData) => {
      setScreenshots(prev => {
        const next = new Map(prev);
        next.set(data.deviceId, data);
        return next;
      });
    };

    // 스크린샷 에러 핸들러
    const handleScreenshotError = (data: { deviceId: string; error: string }) => {
      console.warn(`📸 [useScreenshotPolling] 캡처 실패 (${data.deviceId}):`, data.error);
    };

    // 이벤트 리스너 등록
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.on('screenshot:update', handleScreenshotUpdate);
    socket.on('screenshot:error', handleScreenshotError);

    // 이미 연결되어 있으면 상태 업데이트
    if (socket.connected) {
      setIsConnected(true);
    }

    // 클린업
    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.off('screenshot:update', handleScreenshotUpdate);
      socket.off('screenshot:error', handleScreenshotError);

      releaseSharedSocket();
    };
  }, []);

  // 구독 함수
  const subscribe = useCallback((ids: string[]) => {
    if (!socketRef.current || ids.length === 0) return;

    const newIds = ids.filter(id => !subscribedRef.current.has(id));
    if (newIds.length === 0) return;

    socketRef.current.emit('screenshot:subscribe', { deviceIds: newIds });
    newIds.forEach(id => subscribedRef.current.add(id));

    console.log(`📸 [useScreenshotPolling] 구독: ${newIds.join(', ')}`);
  }, []);

  // 구독 해제 함수
  const unsubscribe = useCallback((ids: string[]) => {
    if (!socketRef.current || ids.length === 0) return;

    const existingIds = ids.filter(id => subscribedRef.current.has(id));
    if (existingIds.length === 0) return;

    socketRef.current.emit('screenshot:unsubscribe', { deviceIds: existingIds });
    existingIds.forEach(id => {
      subscribedRef.current.delete(id);
      setScreenshots(prev => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
    });

    console.log(`📸 [useScreenshotPolling] 구독 해제: ${existingIds.join(', ')}`);
  }, []);

  // 특정 디바이스 스크린샷 조회
  const getScreenshot = useCallback((deviceId: string): ScreenshotData | undefined => {
    return screenshots.get(deviceId);
  }, [screenshots]);

  // 자동 구독 (deviceIds 변경 시)
  useEffect(() => {
    if (!autoSubscribe || !isConnected) return;

    const currentIds = new Set(deviceIds);
    const subscribedIds = subscribedRef.current;

    // 새로 추가된 디바이스 구독
    const toSubscribe = deviceIds.filter(id => !subscribedIds.has(id));
    if (toSubscribe.length > 0) {
      subscribe(toSubscribe);
    }

    // 제거된 디바이스 구독 해제
    const toUnsubscribe = Array.from(subscribedIds).filter(id => !currentIds.has(id));
    if (toUnsubscribe.length > 0) {
      unsubscribe(toUnsubscribe);
    }
  }, [deviceIds, isConnected, autoSubscribe, subscribe, unsubscribe]);

  // 컴포넌트 언마운트 시 모든 구독 해제
  useEffect(() => {
    return () => {
      if (subscribedRef.current.size > 0 && socketRef.current) {
        const allIds = Array.from(subscribedRef.current);
        socketRef.current.emit('screenshot:unsubscribe', { deviceIds: allIds });
        subscribedRef.current.clear();
      }
    };
  }, []);

  return {
    screenshots,
    isConnected,
    error,
    subscribe,
    unsubscribe,
    getScreenshot,
  };
}

export default useScreenshotPolling;
