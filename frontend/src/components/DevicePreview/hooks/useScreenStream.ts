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

  const maxReconnectAttempts = 5;
  const baseReconnectDelay = 1000;

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
    console.log(`[ScreenStream] WebSocket 연결 시도: ${wsUrl}`);

    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'blob';

    ws.onopen = () => {
      console.log(`[ScreenStream] WebSocket 연결 성공`);
      setIsConnected(true);
      setError(null);
      reconnectCountRef.current = 0;

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
      console.log(`[ScreenStream] WebSocket 연결 종료 (code: ${event.code})`);
      setIsConnected(false);
      setIsStreaming(false);
      wsRef.current = null;

      // 자동 재연결 (enabled 상태이고 정상 종료가 아닌 경우)
      if (enabled && event.code !== 1000 && reconnectCountRef.current < maxReconnectAttempts) {
        reconnectCountRef.current++;
        const delay = baseReconnectDelay * Math.pow(2, reconnectCountRef.current - 1);
        console.log(`[ScreenStream] ${delay}ms 후 재연결 시도 (${reconnectCountRef.current}/${maxReconnectAttempts})`);

        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, delay);
      } else if (reconnectCountRef.current >= maxReconnectAttempts) {
        setError('연결 실패: 최대 재시도 횟수 초과');
      }
    };

    ws.onerror = (event) => {
      console.error('[ScreenStream] WebSocket 에러', event);
      // onclose에서 처리하므로 여기서는 에러만 설정
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
