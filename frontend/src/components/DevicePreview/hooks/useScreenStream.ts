// frontend/src/components/DevicePreview/hooks/useScreenStream.ts
// WebSocket 기반 스크린 스트리밍 훅

import { useState, useEffect, useRef, useCallback } from 'react';
import { WS_STREAM_URL } from '../../../config/api';

interface UseScreenStreamOptions {
  fps?: number;
  quality?: number;
  scale?: number;
}

interface UseScreenStreamReturn {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  isConnected: boolean;
  isStreaming: boolean;
  error: string | null;
  frameCount: number;
  startStream: () => void;
  stopStream: () => void;
  reconnect: () => void;
}

export function useScreenStream(
  deviceId: string | null,
  enabled: boolean = true,
  options: UseScreenStreamOptions = {}
): UseScreenStreamReturn {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectCountRef = useRef(0);

  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [frameCount, setFrameCount] = useState(0);

  const maxReconnectAttempts = 3;    // 최대 재시도 횟수 (5 -> 3)
  const baseReconnectDelay = 2000;   // 기본 재연결 대기 시간 (1초 -> 2초)

  // 캔버스에 이미지 렌더링
  const renderFrame = useCallback((data: Blob) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    const url = URL.createObjectURL(data);

    img.onload = () => {
      // 캔버스 크기를 이미지에 맞춤
      if (canvas.width !== img.width || canvas.height !== img.height) {
        canvas.width = img.width;
        canvas.height = img.height;
      }

      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      setFrameCount(prev => prev + 1);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
    };

    img.src = url;
  }, []);

  // WebSocket 연결
  const connect = useCallback(() => {
    if (!deviceId || !enabled) return;

    // 기존 연결 정리
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    const wsUrl = `${WS_STREAM_URL}/ws/screen?deviceId=${deviceId}`;
    // 첫 연결 시도만 로그 출력
    if (reconnectCountRef.current === 0) {
      console.log(`[ScreenStream] WebSocket 연결 시도: ${wsUrl}`);
    }

    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'blob';

    ws.onopen = () => {
      const wasReconnecting = reconnectCountRef.current > 0;
      setIsConnected(true);
      setError(null);
      reconnectCountRef.current = 0;

      if (wasReconnecting) {
        console.log('[ScreenStream] 재연결 성공');
      } else {
        console.log('[ScreenStream] WebSocket 연결 성공');
      }

      // 스트림 시작 요청
      ws.send(JSON.stringify({
        type: 'start',
        payload: {
          fps: options.fps || 10,
          quality: options.quality || 70,
          scale: options.scale || 0.5,
        },
      }));
      setIsStreaming(true);
    };

    ws.onmessage = (event) => {
      if (event.data instanceof Blob) {
        // 바이너리 프레임 데이터
        renderFrame(event.data);
      } else {
        // JSON 메시지
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'error') {
            console.error(`[ScreenStream] 서버 에러: ${msg.message}`);
            setError(msg.message);
          }
        } catch {
          // 파싱 실패 무시
        }
      }
    };

    ws.onclose = (event) => {
      setIsConnected(false);
      setIsStreaming(false);
      wsRef.current = null;

      // 정상 종료인 경우 로그만 출력
      if (event.code === 1000) {
        console.log('[ScreenStream] WebSocket 정상 종료');
        return;
      }

      // 비정상 종료 시 재연결 시도
      if (enabled && reconnectCountRef.current < maxReconnectAttempts) {
        reconnectCountRef.current++;
        const delay = baseReconnectDelay * Math.pow(1.5, reconnectCountRef.current - 1);

        // 첫 번째 재시도만 로그 출력
        if (reconnectCountRef.current === 1) {
          console.log(`[ScreenStream] 연결 끊김 - 재연결 시도 중...`);
        }

        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, delay);
      } else if (reconnectCountRef.current >= maxReconnectAttempts) {
        console.warn(`[ScreenStream] 재연결 실패 (${maxReconnectAttempts}회 시도)`);
        setError('스트리밍 서버 연결 실패');
      }
    };

    ws.onerror = () => {
      // WebSocket 에러 - onclose에서 재연결 처리하므로 여기서는 로그만 출력
      // 연결 실패 시 더 구체적인 에러 메시지 설정
      if (!isConnected) {
        console.warn('[ScreenStream] WebSocket 연결 실패 - 서버가 실행 중인지 확인하세요');
      }
    };

    wsRef.current = ws;
  }, [deviceId, enabled, options.fps, options.quality, options.scale, renderFrame]);

  // 스트림 시작
  const startStream = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'start',
        payload: {
          fps: options.fps || 10,
          quality: options.quality || 70,
          scale: options.scale || 0.5,
        },
      }));
      setIsStreaming(true);
    }
  }, [options]);

  // 스트림 중지
  const stopStream = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'stop' }));
      setIsStreaming(false);
    }
  }, []);

  // 수동 재연결
  const reconnect = useCallback(() => {
    reconnectCountRef.current = 0;
    setError(null);
    connect();
  }, [connect]);

  // deviceId 또는 enabled 변경 시 연결
  useEffect(() => {
    if (deviceId && enabled) {
      connect();
    } else {
      // 비활성화 시 연결 종료
      if (wsRef.current) {
        wsRef.current.close(1000);
        wsRef.current = null;
      }
      setIsConnected(false);
      setIsStreaming(false);
    }

    return () => {
      // 클린업
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close(1000);
        wsRef.current = null;
      }
    };
  }, [deviceId, enabled, connect]);

  return {
    canvasRef,
    isConnected,
    isStreaming,
    error,
    frameCount,
    startStream,
    stopStream,
    reconnect,
  };
}
