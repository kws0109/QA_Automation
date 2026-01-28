// frontend/src/hooks/useQueueStatus.ts
// 중앙 집중식 큐 상태 관리 훅 - 폴링 통합 (3초 단일 소스)

import { useState, useEffect, useCallback, useRef } from 'react';
import { Socket } from 'socket.io-client';
import type { QueuedTest, DeviceQueueStatus, CompletedTest } from '../types';

export interface QueueStatus {
  isProcessing: boolean;
  queueLength: number;
  runningCount: number;
  pendingTests: QueuedTest[];
  runningTests: QueuedTest[];
  completedTests: CompletedTest[];
  deviceStatuses: DeviceQueueStatus[];
}

export interface ExecutionLog {
  timestamp: string;
  deviceId: string;
  deviceName: string;
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
}

interface UseQueueStatusOptions {
  intervalMs?: number;
  maxLogs?: number;
}

interface UseQueueStatusReturn {
  queueStatus: QueueStatus;
  executionLogs: ExecutionLog[];
  cancellingIds: Set<string>;
  forceCompletingIds: Set<string>;
  requestQueueStatus: () => void;
  handleCancel: (queueId: string) => void;
  handleForceComplete: (executionId: string) => void;
}

const DEFAULT_QUEUE_STATUS: QueueStatus = {
  isProcessing: false,
  queueLength: 0,
  runningCount: 0,
  pendingTests: [],
  runningTests: [],
  completedTests: [],
  deviceStatuses: [],
};

export function useQueueStatus(
  socket: Socket | null,
  options: UseQueueStatusOptions = {},
): UseQueueStatusReturn {
  const { intervalMs = 3000, maxLogs = 100 } = options;

  const [queueStatus, setQueueStatus] = useState<QueueStatus>(DEFAULT_QUEUE_STATUS);
  const [executionLogs, setExecutionLogs] = useState<ExecutionLog[]>([]);
  const [cancellingIds, setCancellingIds] = useState<Set<string>>(new Set());
  const [forceCompletingIds, setForceCompletingIds] = useState<Set<string>>(new Set());

  // 인터벌 ref (cleanup 위해)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 큐 상태 요청
  const requestQueueStatus = useCallback(() => {
    if (socket) {
      socket.emit('queue:status');
    }
  }, [socket]);

  // 테스트 취소
  const handleCancel = useCallback((queueId: string) => {
    if (!socket) return;
    setCancellingIds(prev => new Set(prev).add(queueId));
    socket.emit('queue:cancel', { queueId });
  }, [socket]);

  // 부분 완료 (대기 디바이스 포기)
  const handleForceComplete = useCallback((executionId: string) => {
    if (!socket) return;
    setForceCompletingIds(prev => new Set(prev).add(executionId));
    socket.emit('queue:force_complete', { executionId });
  }, [socket]);

  // Socket 이벤트 설정
  useEffect(() => {
    if (!socket) return;

    const handleQueueStatusResponse = (data: QueueStatus) => {
      setQueueStatus({
        isProcessing: data.isProcessing ?? false,
        queueLength: data.queueLength ?? 0,
        runningCount: data.runningCount ?? 0,
        pendingTests: data.pendingTests ?? [],
        runningTests: data.runningTests ?? [],
        completedTests: data.completedTests ?? [],
        deviceStatuses: data.deviceStatuses ?? [],
      });
    };

    const handleQueueUpdated = () => {
      requestQueueStatus();
    };

    const handleCancelResponse = (data: { success: boolean; queueId?: string }) => {
      if (data.queueId) {
        setCancellingIds(prev => {
          const next = new Set(prev);
          next.delete(data.queueId!);
          return next;
        });
      }
      requestQueueStatus();
    };

    const handleForceCompleteResponse = (data: { success: boolean; executionId?: string }) => {
      if (data.executionId) {
        setForceCompletingIds(prev => {
          const next = new Set(prev);
          next.delete(data.executionId!);
          return next;
        });
      }
      requestQueueStatus();
    };

    // 실행 로그 수신
    const handleExecutionLog = (data: { deviceId: string; deviceName?: string; message: string; type?: string }) => {
      setExecutionLogs(prev => [...prev.slice(-maxLogs), {
        timestamp: new Date().toISOString(),
        deviceId: data.deviceId,
        deviceName: data.deviceName || data.deviceId,
        message: data.message,
        type: (data.type as ExecutionLog['type']) || 'info',
      }]);
    };

    // 이벤트 리스너 등록
    socket.on('queue:status:response', handleQueueStatusResponse);
    socket.on('queue:updated', handleQueueUpdated);
    socket.on('queue:cancel:response', handleCancelResponse);
    socket.on('queue:force_complete:response', handleForceCompleteResponse);
    socket.on('test:log', handleExecutionLog);
    socket.on('device:node', handleExecutionLog);

    // 초기 상태 요청
    requestQueueStatus();

    // 폴링 설정
    intervalRef.current = setInterval(requestQueueStatus, intervalMs);

    return () => {
      socket.off('queue:status:response', handleQueueStatusResponse);
      socket.off('queue:updated', handleQueueUpdated);
      socket.off('queue:cancel:response', handleCancelResponse);
      socket.off('queue:force_complete:response', handleForceCompleteResponse);
      socket.off('test:log', handleExecutionLog);
      socket.off('device:node', handleExecutionLog);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [socket, requestQueueStatus, intervalMs, maxLogs]);

  return {
    queueStatus,
    executionLogs,
    cancellingIds,
    forceCompletingIds,
    requestQueueStatus,
    handleCancel,
    handleForceComplete,
  };
}

// 유틸리티 함수들 (컴포넌트에서 사용)
export function isMyTest(test: QueuedTest, userName: string): boolean {
  return test.requesterName === userName;
}

export function isMyCompletedTest(test: CompletedTest, userName: string): boolean {
  return test.requesterName === userName;
}

export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}초`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}분 ${secs}초`;
}

export function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${mm}/${dd} ${hh}:${min}`;
}

export function getWaitTimeText(test: QueuedTest): string {
  const diff = Date.now() - new Date(test.createdAt).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}초`;
  return `${Math.floor(seconds / 60)}분`;
}

export function getElapsedTime(test: QueuedTest): string {
  if (!test.startedAt) return '-';
  const diff = Date.now() - new Date(test.startedAt).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}초`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

export function getBlockingInfo(test: QueuedTest): string | null {
  if (!test.waitingInfo?.blockedByDevices?.length) return null;
  const first = test.waitingInfo.blockedByDevices[0];
  return `${first.deviceName} (${first.usedBy})`;
}

export function canForceComplete(test: QueuedTest): boolean {
  const pending = test.pendingDevices?.length || 0;
  const running = test.runningDevices?.length || 0;
  return pending > 0 && running === 0;
}
