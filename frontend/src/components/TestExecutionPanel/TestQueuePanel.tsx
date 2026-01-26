// frontend/src/components/TestExecutionPanel/TestQueuePanel.tsx
// 다중 사용자 테스트 대기열 패널

import React, { useState, useEffect, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import type { QueuedTest, DeviceQueueStatus, WaitingInfo } from '../../types';
import './TestQueuePanel.css';

interface TestQueuePanelProps {
  socket: Socket | null;
  userName: string;
}

interface QueueStatus {
  isProcessing: boolean;
  queueLength: number;
  runningCount: number;
  pendingTests: QueuedTest[];
  runningTests: QueuedTest[];
  deviceStatuses: DeviceQueueStatus[];
}

const TestQueuePanel: React.FC<TestQueuePanelProps> = ({
  socket,
  userName,
}) => {
  const [queueStatus, setQueueStatus] = useState<QueueStatus>({
    isProcessing: false,
    queueLength: 0,
    runningCount: 0,
    pendingTests: [],
    runningTests: [],
    deviceStatuses: [],
  });
  const [isExpanded, setIsExpanded] = useState(false);
  const [cancellingIds, setCancellingIds] = useState<Set<string>>(new Set());

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
      // 방어적 처리: 배열 필드가 없으면 빈 배열로 설정
      setQueueStatus({
        isProcessing: data.isProcessing ?? false,
        queueLength: data.queueLength ?? 0,
        runningCount: data.runningCount ?? 0,
        pendingTests: data.pendingTests ?? [],
        runningTests: data.runningTests ?? [],
        deviceStatuses: data.deviceStatuses ?? [],
      });
    };

    const handleQueueUpdated = () => {
      // 큐 상태 변경 시 다시 요청
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
      // 취소 후 상태 갱신
      requestQueueStatus();
    };

    socket.on('queue:status:response', handleQueueStatusResponse);
    socket.on('queue:updated', handleQueueUpdated);
    socket.on('queue:cancel:response', handleCancelResponse);

    // 초기 상태 요청
    requestQueueStatus();

    // 3초마다 상태 갱신
    const interval = setInterval(requestQueueStatus, 3000);

    return () => {
      socket.off('queue:status:response', handleQueueStatusResponse);
      socket.off('queue:updated', handleQueueUpdated);
      socket.off('queue:cancel:response', handleCancelResponse);
      clearInterval(interval);
    };
  }, [socket, requestQueueStatus]);

  // 테스트 취소
  const handleCancel = (queueId: string) => {
    if (!socket) return;
    setCancellingIds(prev => new Set(prev).add(queueId));
    socket.emit('queue:cancel', { queueId });
  };

  // 내 테스트인지 확인
  const isMyTest = (test: QueuedTest) => test.requesterName === userName;

  // 우선순위 라벨
  const getPriorityLabel = (priority: number) => {
    switch (priority) {
      case 2: return '높음';
      case 1: return '보통';
      default: return '낮음';
    }
  };

  // 우선순위 색상 클래스
  const getPriorityClass = (priority: number) => {
    switch (priority) {
      case 2: return 'priority-high';
      case 1: return 'priority-normal';
      default: return 'priority-low';
    }
  };

  // 상태별 라벨 (나중에 사용할 수 있음)
  const _getStatusLabel = (status: string) => {
    switch (status) {
      case 'running': return '실행 중';
      case 'pending': return '대기 중';
      case 'completed': return '완료';
      case 'cancelled': return '취소됨';
      case 'failed': return '실패';
      default: return status;
    }
  };

  // 대기 시간 계산
  const getWaitTime = (createdAt: string) => {
    const diff = Date.now() - new Date(createdAt).getTime();
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return `${seconds}초`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}분`;
    const hours = Math.floor(minutes / 60);
    return `${hours}시간 ${minutes % 60}분`;
  };

  // 예상 시간 포맷팅
  const formatEstimatedTime = (seconds: number) => {
    if (seconds < 60) return `약 ${Math.ceil(seconds)}초`;
    const minutes = Math.ceil(seconds / 60);
    if (minutes < 60) return `약 ${minutes}분`;
    const hours = Math.floor(minutes / 60);
    return `약 ${hours}시간 ${minutes % 60}분`;
  };

  // 대기 원인 요약
  const getWaitingReason = (waitingInfo?: WaitingInfo): string => {
    if (!waitingInfo || waitingInfo.blockedByDevices.length === 0) {
      return '';
    }

    const blockedDevices = waitingInfo.blockedByDevices;
    const deviceNames = blockedDevices.map(d => d.deviceName).slice(0, 2);
    const remaining = blockedDevices.length - 2;

    let reason = `${deviceNames.join(', ')}`;
    if (remaining > 0) {
      reason += ` 외 ${remaining}대`;
    }
    reason += ' 대기 중';

    return reason;
  };

  const totalInQueue = queueStatus.runningCount + queueStatus.queueLength;
  const myPendingTests = queueStatus.pendingTests.filter(isMyTest);
  const myRunningTests = queueStatus.runningTests.filter(isMyTest);
  // 나중에 타인 테스트 필터링이 필요할 경우 사용
  // const otherRunningTests = queueStatus.runningTests.filter(t => !isMyTest(t));
  // const otherPendingTests = queueStatus.pendingTests.filter(t => !isMyTest(t));

  return (
    <div className={`test-queue-panel ${isExpanded ? 'expanded' : 'collapsed'}`}>
      {/* 헤더 (항상 표시) */}
      <div className="queue-header" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="queue-summary">
          <span className="queue-icon">{queueStatus.isProcessing ? '🔄' : '📋'}</span>
          <span className="queue-title">테스트 대기열</span>
          <span className="queue-count">
            {totalInQueue > 0 ? (
              <>
                <span className="running-badge">{queueStatus.runningCount} 실행 중</span>
                {queueStatus.queueLength > 0 && (
                  <span className="pending-badge">{queueStatus.queueLength} 대기</span>
                )}
              </>
            ) : (
              <span className="empty-badge">비어있음</span>
            )}
          </span>
          {(myPendingTests.length > 0 || myRunningTests.length > 0) && (
            <span className="my-test-badge">
              내 테스트: {myRunningTests.length + myPendingTests.length}개
            </span>
          )}
        </div>
        <button className="toggle-btn">
          {isExpanded ? '▲' : '▼'}
        </button>
      </div>

      {/* 상세 내용 (펼쳤을 때) */}
      {isExpanded && (
        <div className="queue-content">
          {/* 실행 중인 테스트 */}
          {queueStatus.runningTests.length > 0 && (
            <div className="queue-section">
              <h4 className="section-title">
                <span className="status-icon running">●</span>
                실행 중 ({queueStatus.runningTests.length})
              </h4>
              <div className="test-list">
                {queueStatus.runningTests.map(test => (
                  <div key={test.queueId} className={`test-item ${isMyTest(test) ? 'my-test' : ''}`}>
                    <div className="test-info">
                      <span className="test-name">
                        {test.type === 'suite' && <span className="type-badge suite">Suite</span>}
                        {test.testName || test.suiteName || `테스트 ${test.queueId.slice(0, 8)}`}
                      </span>
                      <span className="test-meta">
                        <span className="requester">
                          {isMyTest(test) ? '나' : test.requesterName}
                        </span>
                        <span className={`priority ${getPriorityClass(test.priority)}`}>
                          {getPriorityLabel(test.priority)}
                        </span>
                        <span className="device-count">
                          {test.request.deviceIds.length}대
                        </span>
                        <span className="scenario-count">
                          {test.request.scenarioIds.length}개 시나리오
                        </span>
                      </span>
                    </div>
                    <div className="test-actions">
                      {isMyTest(test) && (
                        <button
                          className="cancel-btn"
                          onClick={() => handleCancel(test.queueId)}
                          disabled={cancellingIds.has(test.queueId)}
                        >
                          {cancellingIds.has(test.queueId) ? '취소 중...' : '중지'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 대기 중인 테스트 */}
          {queueStatus.pendingTests.length > 0 && (
            <div className="queue-section">
              <h4 className="section-title">
                <span className="status-icon pending">●</span>
                대기 중 ({queueStatus.pendingTests.length})
              </h4>
              <div className="test-list">
                {queueStatus.pendingTests.map((test, index) => (
                  <div key={test.queueId} className={`test-item ${isMyTest(test) ? 'my-test' : ''}`}>
                    <div className="test-info">
                      <span className="queue-position">#{index + 1}</span>
                      <span className="test-name">
                        {test.type === 'suite' && <span className="type-badge suite">Suite</span>}
                        {test.testName || test.suiteName || `테스트 ${test.queueId.slice(0, 8)}`}
                      </span>
                      <span className="test-meta">
                        <span className="requester">
                          {isMyTest(test) ? '나' : test.requesterName}
                        </span>
                        <span className={`priority ${getPriorityClass(test.priority)}`}>
                          {getPriorityLabel(test.priority)}
                        </span>
                        <span className="wait-time">
                          대기 {getWaitTime(test.createdAt)}
                        </span>
                      </span>
                      {/* 대기 원인 표시 */}
                      {test.waitingInfo && test.waitingInfo.blockedByDevices.length > 0 && (
                        <div className="waiting-reason">
                          <span className="waiting-icon">⏳</span>
                          <span className="waiting-text">
                            {getWaitingReason(test.waitingInfo)}
                          </span>
                          {test.waitingInfo.estimatedWaitTime > 0 && (
                            <span className="estimated-time">
                              ({formatEstimatedTime(test.waitingInfo.estimatedWaitTime)})
                            </span>
                          )}
                          <div className="blocking-details">
                            {test.waitingInfo.blockedByDevices.map(device => (
                              <span key={device.deviceId} className="blocking-device">
                                {device.deviceName}: {device.usedBy}
                                {device.testName && ` - ${device.testName}`}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="test-actions">
                      {isMyTest(test) && (
                        <button
                          className="cancel-btn"
                          onClick={() => handleCancel(test.queueId)}
                          disabled={cancellingIds.has(test.queueId)}
                        >
                          {cancellingIds.has(test.queueId) ? '취소 중...' : '취소'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 대기열이 비어있을 때 */}
          {totalInQueue === 0 && (
            <div className="empty-queue">
              <p>현재 대기 중인 테스트가 없습니다.</p>
              <p className="hint">테스트를 실행하면 여기에 표시됩니다.</p>
            </div>
          )}

          {/* 디바이스 상태 요약 */}
          {queueStatus.deviceStatuses.length > 0 && (
            <div className="queue-section device-summary">
              <h4 className="section-title">
                <span className="status-icon">📱</span>
                디바이스 상태
              </h4>
              <div className="device-status-bar">
                {(() => {
                  const available = queueStatus.deviceStatuses.filter(d => d.status === 'available').length;
                  const busyMine = queueStatus.deviceStatuses.filter(d => d.status === 'busy_mine').length;
                  const busyOther = queueStatus.deviceStatuses.filter(d => d.status === 'busy_other').length;
                  const total = queueStatus.deviceStatuses.length;
                  return (
                    <>
                      <span className="status available">
                        가용: {available}대
                      </span>
                      {busyMine > 0 && (
                        <span className="status busy-mine">
                          내가 사용: {busyMine}대
                        </span>
                      )}
                      {busyOther > 0 && (
                        <span className="status busy-other">
                          타인 사용: {busyOther}대
                        </span>
                      )}
                      <span className="status total">
                        전체: {total}대
                      </span>
                    </>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TestQueuePanel;
