// frontend/src/hooks/useScrcpyStream.ts
// scrcpy H.264 스트림을 WebSocket으로 수신하고 jMuxer로 디코딩하는 훅

import { useEffect, useRef, useState, useCallback } from 'react';
import JMuxer from 'jmuxer';
import { WS_SCRCPY_URL } from '../config/api';

// ========== 상수 정의 ==========
const MAX_RETRY_COUNT = 3;           // 최대 재시도 횟수
const RETRY_DELAY_MS = 2000;         // 재시도 간격 (ms)
const RETRY_BACKOFF_MULTIPLIER = 1.5; // 지수 백오프 배수

export interface ScrcpyStreamOptions {
  maxFps?: number;      // 최대 FPS (기본: 30)
  bitRate?: number;     // 비트레이트 (기본: 2000000)
  maxSize?: number;     // 최대 해상도 (기본: 1080)
}

interface UseScrcpyStreamResult {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isConnected: boolean;
  isStreaming: boolean;
  error: string | null;
  retryCount: number;
  start: (options?: ScrcpyStreamOptions) => void;
  stop: () => void;
  reconnect: () => void;
}

export function useScrcpyStream(deviceId: string | null): UseScrcpyStreamResult {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const jmuxerRef = useRef<JMuxer | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastOptionsRef = useRef<ScrcpyStreamOptions | undefined>(undefined);

  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // jMuxer 초기화
  const initJMuxer = useCallback(() => {
    if (!videoRef.current) return null;

    // 기존 jMuxer 정리
    if (jmuxerRef.current) {
      jmuxerRef.current.destroy();
    }

    const jmuxer = new JMuxer({
      node: videoRef.current,
      mode: 'video',
      flushingTime: 0,
      fps: 30,
      debug: false,
      onError: (err: Error) => {
        console.error('[scrcpy] jMuxer error:', err);
        setError(`디코딩 에러: ${err.message}`);
      },
    });

    jmuxerRef.current = jmuxer;
    return jmuxer;
  }, []);

  // 재시도 타이머 정리
  const clearRetryTimeout = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  }, []);

  // 자동 재연결 - start를 useRef로 저장
  const startRef = useRef<((options?: ScrcpyStreamOptions) => void) | null>(null);

  // 자동 재연결 스케줄링
  const scheduleRetry = useCallback((currentRetry: number) => {
    if (currentRetry >= MAX_RETRY_COUNT) {
      console.log(`[scrcpy] 최대 재시도 횟수(${MAX_RETRY_COUNT}) 초과`);
      setError(`연결 실패 (${MAX_RETRY_COUNT}회 재시도 후)`);
      return;
    }

    const delay = RETRY_DELAY_MS * Math.pow(RETRY_BACKOFF_MULTIPLIER, currentRetry);
    console.log(`[scrcpy] ${delay}ms 후 재연결 시도 (${currentRetry + 1}/${MAX_RETRY_COUNT})`);

    retryTimeoutRef.current = setTimeout(() => {
      setRetryCount(currentRetry + 1);
      // start 함수 호출하여 재연결
      if (startRef.current) {
        startRef.current(lastOptionsRef.current);
      }
    }, delay);
  }, []);

  // WebSocket 연결 및 스트림 시작
  const start = useCallback((options?: ScrcpyStreamOptions) => {
    if (!deviceId) {
      setError('디바이스가 선택되지 않았습니다.');
      return;
    }

    // 이미 연결 중이면 무시
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    // 재시도 타이머 정리
    clearRetryTimeout();

    // 옵션 저장 (재연결 시 사용)
    lastOptionsRef.current = options;

    setError(null);

    // video 엘리먼트가 아직 마운트되지 않았으면 잠시 대기 후 재시도
    if (!videoRef.current) {
      console.log('[scrcpy] video 엘리먼트 대기 중...');
      retryTimeoutRef.current = setTimeout(() => {
        start(options);
      }, 100);
      return;
    }

    // jMuxer 초기화
    const jmuxer = initJMuxer();
    if (!jmuxer) {
      setError('비디오 엘리먼트를 찾을 수 없습니다.');
      return;
    }

    // WebSocket 연결 (항상 로컬 백엔드 직접 연결)
    const wsUrl = `${WS_SCRCPY_URL}/ws/scrcpy?deviceId=${encodeURIComponent(deviceId)}`;
    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      console.log(`[scrcpy] WebSocket 연결됨: ${deviceId}`);
      setIsConnected(true);
      setRetryCount(0); // 연결 성공 시 재시도 카운트 리셋

      // 스트림 시작 요청
      ws.send(JSON.stringify({
        type: 'start',
        payload: {
          maxFps: options?.maxFps || 30,
          bitRate: options?.bitRate || 2000000,
          maxSize: options?.maxSize || 1080,
        },
      }));
    };

    ws.onmessage = (event) => {
      // 바이너리 데이터 (H.264)
      if (event.data instanceof ArrayBuffer) {
        const data = new Uint8Array(event.data);

        // jMuxer에 H.264 데이터 전달
        if (jmuxerRef.current) {
          jmuxerRef.current.feed({
            video: data,
          });
        }
        return;
      }

      // JSON 메시지
      try {
        const msg = JSON.parse(event.data);

        switch (msg.type) {
          case 'connected':
            console.log(`[scrcpy] 서비스 연결됨: ${msg.message}`);
            break;
          case 'stream_started':
            console.log(`[scrcpy] 스트림 시작됨`);
            setIsStreaming(true);
            setRetryCount(0); // 스트림 시작 성공 시 재시도 카운트 리셋
            break;
          case 'stream_stopped':
          case 'stream_closed':
            console.log(`[scrcpy] 스트림 중지됨`);
            setIsStreaming(false);
            break;
          case 'error':
            console.error(`[scrcpy] 에러: ${msg.code} - ${msg.message}`);
            setError(msg.message);
            setIsStreaming(false);
            break;
          default:
            console.log(`[scrcpy] 알 수 없는 메시지:`, msg);
        }
      } catch {
        // JSON 파싱 실패 - 무시
      }
    };

    ws.onerror = (event) => {
      console.error('[scrcpy] WebSocket 에러:', event);
      setError('WebSocket 연결 에러');
    };

    ws.onclose = (event) => {
      console.log(`[scrcpy] WebSocket 연결 종료 (code: ${event.code})`);
      setIsConnected(false);
      setIsStreaming(false);

      // 비정상 종료 시 자동 재연결 (1000: 정상 종료, 4000+: 클라이언트 에러)
      if (event.code !== 1000 && event.code < 4000) {
        scheduleRetry(retryCount);
      }
    };

    wsRef.current = ws;
  }, [deviceId, initJMuxer, clearRetryTimeout, scheduleRetry, retryCount]);

  // start 함수를 ref에 저장 (scheduleRetry에서 사용)
  useEffect(() => {
    startRef.current = start;
  }, [start]);

  // 스트림 중지
  const stop = useCallback(() => {
    // 재시도 타이머 정리
    clearRetryTimeout();

    // WebSocket으로 중지 요청
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'stop' }));
      wsRef.current.close(1000, 'User requested stop'); // 정상 종료 코드
    }
    wsRef.current = null;

    // jMuxer 정리
    if (jmuxerRef.current) {
      jmuxerRef.current.destroy();
      jmuxerRef.current = null;
    }

    setIsConnected(false);
    setIsStreaming(false);
    setRetryCount(0);
  }, [clearRetryTimeout]);

  // 수동 재연결
  const reconnect = useCallback(() => {
    stop();
    setRetryCount(0);
    setError(null);
    // 약간의 딜레이 후 재연결
    setTimeout(() => {
      start(lastOptionsRef.current);
    }, 500);
  }, [stop, start]);

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      clearRetryTimeout();
      stop();
    };
  }, [stop, clearRetryTimeout]);

  // deviceId 변경 시 재연결
  useEffect(() => {
    if (deviceId && isConnected) {
      stop();
    }
  }, [deviceId]);

  return {
    videoRef,
    isConnected,
    isStreaming,
    error,
    retryCount,
    start,
    stop,
    reconnect,
  };
}
