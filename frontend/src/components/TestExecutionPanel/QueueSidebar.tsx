// frontend/src/components/TestExecutionPanel/QueueSidebar.tsx
// 큐 사이드바: Suite + 대기/진행/완료 섹션 통합

import React, { useState, useEffect, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import type { QueuedTest, DeviceQueueStatus, CompletedTest, DeviceProgress } from '../../types';
import './QueueSidebar.css';

export interface QueueStatus {
  isProcessing: boolean;
  queueLength: number;
  runningCount: number;
  pendingTests: QueuedTest[];
  runningTests: QueuedTest[];
  completedTests: CompletedTest[];
  deviceStatuses: DeviceQueueStatus[];
}

interface QueueSidebarProps {
  socket: Socket | null;
  userName: string;
  selectedQueueId: string | null;
  onSelectTest: (queueId: string | null) => void;
  queueStatus: QueueStatus;
  onQueueStatusChange: (status: QueueStatus) => void;
  deviceProgress: Map<string, DeviceProgress>;
}

const QueueSidebar: React.FC<QueueSidebarProps> = ({
  socket,
  userName,
  selectedQueueId,
  onSelectTest,
  queueStatus,
  onQueueStatusChange,
  deviceProgress,
}) => {
  const [cancellingIds, setCancellingIds] = useState<Set<string>>(new Set());
  const [forceCompletingIds, setForceCompletingIds] = useState<Set<string>>(new Set());
  const [pendingExpanded, setPendingExpanded] = useState(true);
  const [runningExpanded, setRunningExpanded] = useState(true);
  const [completedExpanded, setCompletedExpanded] = useState(true);

  // 큐 상태 요청
  const requestQueueStatus = useCallback(() => {
    if (socket) {
      socket.emit('queue:status');
    }
  }, [socket]);

  // Socket 이벤트 설정
  useEffect(() => {
    if (!socket) return;

    const handleQueueStatusResponse = (data: QueueStatus) => {
      onQueueStatusChange({
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

    socket.on('queue:status:response', handleQueueStatusResponse);
    socket.on('queue:updated', handleQueueUpdated);
    socket.on('queue:cancel:response', handleCancelResponse);
    socket.on('queue:force_complete:response', handleForceCompleteResponse);

    requestQueueStatus();
    const interval = setInterval(requestQueueStatus, 3000);

    return () => {
      socket.off('queue:status:response', handleQueueStatusResponse);
      socket.off('queue:updated', handleQueueUpdated);
      socket.off('queue:cancel:response', handleCancelResponse);
      socket.off('queue:force_complete:response', handleForceCompleteResponse);
      clearInterval(interval);
    };
  }, [socket, requestQueueStatus, onQueueStatusChange]);

  // 테스트 취소/중지
  const handleCancel = (queueId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!socket) return;
    setCancellingIds(prev => new Set(prev).add(queueId));
    socket.emit('queue:cancel', { queueId });
  };

  // 부분 완료 (대기 디바이스 포기)
  const handleForceComplete = (executionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!socket) return;
    setForceCompletingIds(prev => new Set(prev).add(executionId));
    socket.emit('queue:force_complete', { executionId });
  };

  // 부분 완료 가능 여부 (대기 디바이스가 있고, 실행 중인 디바이스가 없을 때)
  const canForceComplete = (test: QueuedTest): boolean => {
    const pending = test.pendingDevices?.length || 0;
    const running = test.runningDevices?.length || 0;
    return pending > 0 && running === 0;
  };

  // 내 테스트인지 확인
  const isMyTest = (test: QueuedTest) => test.requesterName === userName;
  const isMyCompletedTest = (test: CompletedTest) => test.requesterName === userName;

  // 디바이스 수 표시
  const getDeviceCountText = (test: QueuedTest) => {
    const count = test.request.deviceIds.length;
    if (count === 1) {
      const deviceId = test.request.deviceIds[0];
      const deviceStatus = queueStatus.deviceStatuses.find(d => d.deviceId === deviceId);
      return deviceStatus?.deviceName || deviceId.slice(0, 8);
    }
    return `${count}대`;
  };

  // 분할 실행 상태 표시 (진행 중인 테스트용)
  const getDeviceStatusText = (test: QueuedTest): string | null => {
    const running = test.runningDevices?.length || 0;
    const pending = test.pendingDevices?.length || 0;
    const completed = test.completedDevices?.length || 0;

    if (pending === 0 && running === 0) {
      // 분할 실행 아님
      return null;
    }

    if (pending > 0) {
      // 분할 실행 중
      return `${running + completed}대 진행 / ${pending}대 대기`;
    }

    return null;
  };

  // 대기 시간 표시
  const getWaitTimeText = (test: QueuedTest): string => {
    if (!test.waitingInfo?.estimatedWaitTime) {
      const diff = Date.now() - new Date(test.createdAt).getTime();
      const seconds = Math.floor(diff / 1000);
      if (seconds < 60) return `${seconds}초 대기`;
      return `${Math.floor(seconds / 60)}분 대기`;
    }
    const seconds = test.waitingInfo.estimatedWaitTime;
    if (seconds < 60) return `약 ${seconds}초`;
    return `약 ${Math.ceil(seconds / 60)}분`;
  };

  // 소요 시간 포맷
  const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}초`;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}분 ${secs}초`;
  };

  // 날짜/시간 포맷 (YY/MM/DD HH:mm:ss)
  const formatDateTime = (dateStr: string): string => {
    const date = new Date(dateStr);
    const yy = String(date.getFullYear()).slice(-2);
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    return `${yy}/${mm}/${dd} ${hh}:${min}:${ss}`;
  };

  // 차단 디바이스 정보
  const getBlockingInfo = (test: QueuedTest): string | null => {
    if (!test.waitingInfo?.blockedByDevices?.length) return null;
    const first = test.waitingInfo.blockedByDevices[0];
    return `${first.deviceName} (${first.usedBy})`;
  };

  // 테스트 진행률 계산 (deviceProgress 기반)
  const calculateTestProgress = (test: QueuedTest): number => {
    const deviceIds = test.request.deviceIds;
    let completed = 0;
    let total = 0;
    for (const deviceId of deviceIds) {
      const dp = deviceProgress.get(deviceId);
      if (dp) {
        completed += dp.completedScenarios + dp.failedScenarios;
        total += dp.totalScenarios;
      }
    }
    return total > 0 ? Math.round((completed / total) * 100) : 0;
  };

  return (
    <div className="queue-sidebar">
      {/* 헤더 */}
      <div className="sidebar-header">
        <h3>테스트 현황</h3>
        <button className="refresh-btn" onClick={requestQueueStatus} title="새로고침">
          🔄
        </button>
      </div>

      <div className="sidebar-content">
        {/* 대기 섹션 */}
        <div className="queue-section pending-section">
          <div className="section-header" onClick={() => setPendingExpanded(!pendingExpanded)}>
            <div className="section-header-left">
              <span className="section-icon">⏳</span>
              <span className="section-title">대기</span>
            </div>
            <div className="section-header-right">
              <span className="section-count">{queueStatus.pendingTests.length}</span>
              <span className="section-toggle">{pendingExpanded ? '▼' : '▶'}</span>
            </div>
          </div>
          {pendingExpanded && (
            <div className="section-content">
              {queueStatus.pendingTests.length === 0 ? (
                <div className="empty-section">대기 중인 테스트 없음</div>
              ) : (
                <div className="queue-list">
                  {queueStatus.pendingTests.map((test, index) => {
                    const isMine = isMyTest(test);
                    const isSelected = selectedQueueId === test.queueId;
                    const blockingInfo = getBlockingInfo(test);

                    return (
                      <div
                        key={test.queueId}
                        className={`queue-item pending ${isMine ? 'mine' : ''} ${isSelected ? 'selected' : ''}`}
                        onClick={() => onSelectTest(isSelected ? null : test.queueId)}
                      >
                        <div className="item-header">
                          <span className="item-name">
                            {test.testName || `테스트 ${test.queueId.slice(0, 6)}`}
                          </span>
                          {isMine && <span className="mine-badge">MY</span>}
                        </div>
                        <div className="item-details">
                          <div className="detail-row">
                            <span className="detail-label">요청자:</span>
                            <span className="detail-value">{isMine ? '나' : test.requesterName}</span>
                          </div>
                          <div className="detail-row">
                            <span className="detail-label">기기:</span>
                            <span className="detail-value">{getDeviceCountText(test)}</span>
                          </div>
                          <div className="detail-row">
                            <span className="detail-label">대기 순서:</span>
                            <span className="detail-value">#{index + 1}</span>
                          </div>
                          <div className="detail-row">
                            <span className="detail-label">대기 시간:</span>
                            <span className="detail-value wait-time">{getWaitTimeText(test)}</span>
                          </div>
                        </div>
                        {blockingInfo && (
                          <div className="blocking-info">
                            <span className="blocking-icon">🔒</span>
                            <span className="blocking-text">{blockingInfo}</span>
                          </div>
                        )}
                        {isMine && (
                          <div className="item-actions">
                            <button
                              className="cancel-btn"
                              onClick={(e) => handleCancel(test.queueId, e)}
                              disabled={cancellingIds.has(test.queueId)}
                            >
                              {cancellingIds.has(test.queueId) ? '취소 중...' : '취소'}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 진행 섹션 */}
        <div className="queue-section running-section">
          <div className="section-header" onClick={() => setRunningExpanded(!runningExpanded)}>
            <div className="section-header-left">
              <span className="section-icon">🔄</span>
              <span className="section-title">진행</span>
            </div>
            <div className="section-header-right">
              <span className="section-count">{queueStatus.runningTests.length}</span>
              <span className="section-toggle">{runningExpanded ? '▼' : '▶'}</span>
            </div>
          </div>
          {runningExpanded && (
            <div className="section-content">
              {queueStatus.runningTests.length === 0 ? (
                <div className="empty-section">진행 중인 테스트 없음</div>
              ) : (
                <div className="queue-list">
                  {queueStatus.runningTests.map(test => {
                    const isMine = isMyTest(test);
                    const isSelected = selectedQueueId === test.queueId;

                    return (
                      <div
                        key={test.queueId}
                        className={`queue-item running ${isMine ? 'mine' : ''} ${isSelected ? 'selected' : ''}`}
                        onClick={() => onSelectTest(isSelected ? null : test.queueId)}
                      >
                        <div className="item-header">
                          <span className="item-name">
                            {test.testName || `테스트 ${test.queueId.slice(0, 6)}`}
                          </span>
                          {isMine && <span className="mine-badge">MY</span>}
                        </div>
                        <div className="item-details">
                          <div className="detail-row">
                            <span className="detail-label">요청자:</span>
                            <span className="detail-value">{isMine ? '나' : test.requesterName}</span>
                          </div>
                          <div className="detail-row">
                            <span className="detail-label">기기:</span>
                            <span className="detail-value">{getDeviceCountText(test)}</span>
                          </div>
                          {getDeviceStatusText(test) && (
                            <div className="detail-row">
                              <span className="detail-label">상태:</span>
                              <span className="detail-value split-status">{getDeviceStatusText(test)}</span>
                            </div>
                          )}
                          <div className="detail-row">
                            <span className="detail-label">진행률:</span>
                            <span className="detail-value progress-value">{calculateTestProgress(test)}%</span>
                          </div>
                          <div className="detail-row">
                            <span className="detail-label">시작:</span>
                            <span className="detail-value">{test.startedAt ? formatDateTime(test.startedAt) : '-'}</span>
                          </div>
                        </div>
                        {isMine && (
                          <div className="item-actions">
                            <button
                              className="cancel-btn stop"
                              onClick={(e) => handleCancel(test.queueId, e)}
                              disabled={cancellingIds.has(test.queueId)}
                            >
                              {cancellingIds.has(test.queueId) ? '중지 중...' : '중지'}
                            </button>
                            {canForceComplete(test) && test.executionId && (
                              <button
                                className="force-complete-btn"
                                onClick={(e) => handleForceComplete(test.executionId!, e)}
                                disabled={forceCompletingIds.has(test.executionId)}
                                title="대기 중인 디바이스를 건너뛰고 현재 결과로 완료"
                              >
                                {forceCompletingIds.has(test.executionId) ? '완료 중...' : '대기 포기'}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 완료 섹션 */}
        <div className="queue-section completed-section">
          <div className="section-header" onClick={() => setCompletedExpanded(!completedExpanded)}>
            <div className="section-header-left">
              <span className="section-icon">✅</span>
              <span className="section-title">완료</span>
            </div>
            <div className="section-header-right">
              <span className="section-count">{queueStatus.completedTests.length}</span>
              <span className="section-toggle">{completedExpanded ? '▼' : '▶'}</span>
            </div>
          </div>
          {completedExpanded && (
            <div className="section-content">
              {queueStatus.completedTests.length === 0 ? (
                <div className="empty-section">완료된 테스트 없음</div>
              ) : (
                <div className="queue-list">
                  {queueStatus.completedTests.map(test => {
                    const isMine = isMyCompletedTest(test);

                    return (
                      <div
                        key={test.queueId}
                        className={`queue-item completed ${test.success ? 'success' : 'failed'} ${isMine ? 'mine' : ''}`}
                      >
                        <div className="item-header">
                          <span className="item-name">
                            {test.testName || `테스트 ${test.queueId.slice(0, 6)}`}
                          </span>
                          {isMine && <span className="mine-badge">MY</span>}
                        </div>
                        <div className="item-details">
                          <div className="detail-row">
                            <span className="detail-label">요청자:</span>
                            <span className="detail-value">{isMine ? '나' : test.requesterName}</span>
                          </div>
                          <div className="detail-row">
                            <span className="detail-label">결과:</span>
                            <span className={`detail-value ${test.success ? 'result-success' : 'result-failed'}`}>
                              {test.success ? '성공' : '실패'} {test.successCount}/{test.totalCount}
                            </span>
                          </div>
                          <div className="detail-row">
                            <span className="detail-label">진행 시간:</span>
                            <span className="detail-value">{formatDuration(test.duration)}</span>
                          </div>
                          <div className="detail-row">
                            <span className="detail-label">완료 시간:</span>
                            <span className="detail-value">{formatDateTime(test.completedAt)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 하단 요약 */}
      <div className="sidebar-footer">
        <div className="my-tests-summary">
          <span className="label">📊 현재 상태:</span>
          <span className="summary-stats">
            <span className="stat pending">대기 {queueStatus.pendingTests.length}</span>
            <span className="stat running">진행 {queueStatus.runningTests.length}</span>
            <span className="stat completed">완료 {queueStatus.completedTests.length}</span>
          </span>
        </div>
      </div>
    </div>
  );
};

export default QueueSidebar;
