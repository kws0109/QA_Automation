// frontend/src/components/TestExecutionPanel/TestStatusBar.tsx
// 테스트 현황 상단 바 (요약 카드 + 드롭다운 패널)

import React, { useState, useEffect, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import type { QueuedTest, DeviceQueueStatus, CompletedTest, DeviceProgress } from '../../types';
import TestDetailModal from './TestDetailModal';
import './TestStatusBar.css';

export interface QueueStatus {
  isProcessing: boolean;
  queueLength: number;
  runningCount: number;
  pendingTests: QueuedTest[];
  runningTests: QueuedTest[];
  completedTests: CompletedTest[];
  deviceStatuses: DeviceQueueStatus[];
}

interface ExecutionLog {
  timestamp: string;
  deviceId: string;
  deviceName: string;
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
}

type PanelType = 'running' | 'pending' | 'completed' | null;

interface TestStatusBarProps {
  socket: Socket | null;
  userName: string;
  queueStatus: QueueStatus;
  onQueueStatusChange: (status: QueueStatus) => void;
  deviceProgress: Map<string, DeviceProgress>;
  onNavigateToReport?: (reportId: string, type: 'scenario' | 'suite') => void;
}

const TestStatusBar: React.FC<TestStatusBarProps> = ({
  socket,
  userName,
  queueStatus,
  onQueueStatusChange,
  deviceProgress,
  onNavigateToReport,
}) => {
  const [cancellingIds, setCancellingIds] = useState<Set<string>>(new Set());
  const [expandedPanel, setExpandedPanel] = useState<PanelType>(null);

  // 상세 모달 상태
  const [detailModalTest, setDetailModalTest] = useState<QueuedTest | null>(null);
  const [executionLogs, setExecutionLogs] = useState<ExecutionLog[]>([]);

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

    // 실행 로그 수신
    const handleExecutionLog = (data: { deviceId: string; deviceName?: string; message: string; type?: string }) => {
      setExecutionLogs(prev => [...prev.slice(-100), {
        timestamp: new Date().toISOString(),
        deviceId: data.deviceId,
        deviceName: data.deviceName || data.deviceId,
        message: data.message,
        type: (data.type as ExecutionLog['type']) || 'info',
      }]);
    };

    socket.on('queue:status:response', handleQueueStatusResponse);
    socket.on('queue:updated', handleQueueUpdated);
    socket.on('queue:cancel:response', handleCancelResponse);
    socket.on('test:log', handleExecutionLog);
    socket.on('device:node', handleExecutionLog);

    requestQueueStatus();
    const interval = setInterval(requestQueueStatus, 3000);

    return () => {
      socket.off('queue:status:response', handleQueueStatusResponse);
      socket.off('queue:updated', handleQueueUpdated);
      socket.off('queue:cancel:response', handleCancelResponse);
      socket.off('test:log', handleExecutionLog);
      socket.off('device:node', handleExecutionLog);
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

  // 내 테스트인지 확인
  const isMyTest = (test: QueuedTest) => test.requesterName === userName;
  const isMyCompletedTest = (test: CompletedTest) => test.requesterName === userName;

  // 테스트 진행률 계산
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

  // 소요 시간 포맷
  const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}초`;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}분 ${secs}초`;
  };

  // 날짜/시간 포맷
  const formatDateTime = (dateStr: string): string => {
    const date = new Date(dateStr);
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${mm}/${dd} ${hh}:${min}`;
  };

  // 대기 시간 표시
  const getWaitTimeText = (test: QueuedTest): string => {
    const diff = Date.now() - new Date(test.createdAt).getTime();
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return `${seconds}초`;
    return `${Math.floor(seconds / 60)}분`;
  };

  // 경과 시간
  const getElapsedTime = (test: QueuedTest): string => {
    if (!test.startedAt) return '-';
    const diff = Date.now() - new Date(test.startedAt).getTime();
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return `${seconds}초`;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${String(secs).padStart(2, '0')}`;
  };

  // 차단 디바이스 정보
  const getBlockingInfo = (test: QueuedTest): string | null => {
    if (!test.waitingInfo?.blockedByDevices?.length) return null;
    const first = test.waitingInfo.blockedByDevices[0];
    return `${first.deviceName} (${first.usedBy})`;
  };

  // 완료된 테스트 클릭 핸들러 (리포트로 이동)
  const handleCompletedTestClick = (test: CompletedTest) => {
    if (test.reportId && onNavigateToReport) {
      const reportType = test.type === 'suite' ? 'suite' : 'scenario';
      onNavigateToReport(test.reportId, reportType);
      setExpandedPanel(null);
    }
  };

  // 진행 중 테스트 클릭 핸들러 (상세 모달 열기)
  const handleRunningTestClick = (test: QueuedTest) => {
    setDetailModalTest(test);
  };

  // 모달에서 중지
  const handleStopFromModal = () => {
    if (detailModalTest && socket) {
      setCancellingIds(prev => new Set(prev).add(detailModalTest.queueId));
      socket.emit('queue:cancel', { queueId: detailModalTest.queueId });
      setDetailModalTest(null);
    }
  };

  // 카드 클릭 (패널 토글)
  const handleCardClick = (panelType: PanelType) => {
    setExpandedPanel(prev => prev === panelType ? null : panelType);
  };

  // 통계 계산
  const successCount = queueStatus.completedTests.filter(t => t.success).length;
  const failedCount = queueStatus.completedTests.filter(t => !t.success).length;

  return (
    <div className="test-status-bar">
      {/* 요약 카드 행 */}
      <div className="status-summary-row">
        <span className="status-label">테스트 현황</span>

        <div className="status-cards">
          <button
            className={`status-card running ${expandedPanel === 'running' ? 'active' : ''}`}
            onClick={() => handleCardClick('running')}
          >
            <span className="card-icon">🔄</span>
            <span className="card-value">{queueStatus.runningTests.length}</span>
            <span className="card-label">진행</span>
          </button>

          <button
            className={`status-card pending ${expandedPanel === 'pending' ? 'active' : ''}`}
            onClick={() => handleCardClick('pending')}
          >
            <span className="card-icon">⏳</span>
            <span className="card-value">{queueStatus.pendingTests.length}</span>
            <span className="card-label">대기</span>
          </button>

          <button
            className={`status-card success ${expandedPanel === 'completed' && successCount > 0 ? 'active' : ''}`}
            onClick={() => handleCardClick('completed')}
          >
            <span className="card-icon">✅</span>
            <span className="card-value">{successCount}</span>
            <span className="card-label">성공</span>
          </button>

          <button
            className={`status-card failed ${expandedPanel === 'completed' && failedCount > 0 ? 'active' : ''}`}
            onClick={() => handleCardClick('completed')}
          >
            <span className="card-icon">❌</span>
            <span className="card-value">{failedCount}</span>
            <span className="card-label">실패</span>
          </button>
        </div>

        <button className="refresh-btn" onClick={requestQueueStatus} title="새로고침">
          🔄
        </button>
      </div>

      {/* 드롭다운 패널 */}
      {expandedPanel && (
        <div className={`status-dropdown-panel ${expandedPanel}`}>
          <div className="dropdown-header">
            <span className="dropdown-title">
              {expandedPanel === 'running' && `🔄 진행 중 (${queueStatus.runningTests.length})`}
              {expandedPanel === 'pending' && `⏳ 대기 중 (${queueStatus.pendingTests.length})`}
              {expandedPanel === 'completed' && `✅ 완료 (${queueStatus.completedTests.length})`}
            </span>
            <button className="dropdown-close" onClick={() => setExpandedPanel(null)}>✕</button>
          </div>

          <div className="dropdown-content">
            {/* 진행 중 패널 */}
            {expandedPanel === 'running' && (
              queueStatus.runningTests.length === 0 ? (
                <div className="dropdown-empty">진행 중인 테스트가 없습니다</div>
              ) : (
                <div className="test-cards-grid">
                  {queueStatus.runningTests.map(test => {
                    const isMine = isMyTest(test);
                    const progress = calculateTestProgress(test);
                    const testType = test.type === 'suite' ? '묶음' : '테스트';

                    return (
                      <div
                        key={test.queueId}
                        className={`test-card running ${isMine ? 'mine' : ''}`}
                        onClick={() => handleRunningTestClick(test)}
                      >
                        <div className="test-card-header">
                          <span className={`type-badge ${test.type || 'test'}`}>{testType}</span>
                          <span className="test-name">
                            {test.testName || `테스트 ${test.queueId.slice(0, 6)}`}
                          </span>
                          {isMine && <span className="mine-badge">MY</span>}
                        </div>

                        <div className="progress-bar-wrapper">
                          <div className="progress-bar">
                            <div className="progress-fill" style={{ width: `${progress}%` }} />
                          </div>
                          <span className="progress-text">{progress}%</span>
                        </div>

                        <div className="test-card-meta">
                          <span>📱 {test.request.deviceIds.length}대</span>
                          <span>⏱️ {getElapsedTime(test)}</span>
                        </div>

                        {isMine && (
                          <button
                            className="stop-btn"
                            onClick={(e) => handleCancel(test.queueId, e)}
                            disabled={cancellingIds.has(test.queueId)}
                          >
                            {cancellingIds.has(test.queueId) ? '중지 중...' : '⏹ 중지'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )
            )}

            {/* 대기 중 패널 */}
            {expandedPanel === 'pending' && (
              queueStatus.pendingTests.length === 0 ? (
                <div className="dropdown-empty">대기 중인 테스트가 없습니다</div>
              ) : (
                <div className="test-cards-grid">
                  {queueStatus.pendingTests.map((test, index) => {
                    const isMine = isMyTest(test);
                    const blockingInfo = getBlockingInfo(test);
                    const testType = test.type === 'suite' ? '묶음' : '테스트';

                    return (
                      <div key={test.queueId} className={`test-card pending ${isMine ? 'mine' : ''}`}>
                        <div className="test-card-header">
                          <span className="queue-position">#{index + 1}</span>
                          <span className={`type-badge ${test.type || 'test'}`}>{testType}</span>
                          <span className="test-name">
                            {test.testName || `테스트 ${test.queueId.slice(0, 6)}`}
                          </span>
                          {isMine && <span className="mine-badge">MY</span>}
                        </div>

                        <div className="test-card-meta">
                          <span>📱 {test.request.deviceIds.length}대</span>
                          <span className="wait-time">⏳ {getWaitTimeText(test)} 대기</span>
                        </div>

                        {blockingInfo && (
                          <div className="blocking-info">
                            <span>🔒 {blockingInfo}</span>
                          </div>
                        )}

                        {isMine && (
                          <button
                            className="cancel-btn"
                            onClick={(e) => handleCancel(test.queueId, e)}
                            disabled={cancellingIds.has(test.queueId)}
                          >
                            {cancellingIds.has(test.queueId) ? '취소 중...' : '취소'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )
            )}

            {/* 완료 패널 */}
            {expandedPanel === 'completed' && (
              queueStatus.completedTests.length === 0 ? (
                <div className="dropdown-empty">완료된 테스트가 없습니다</div>
              ) : (
                <div className="test-cards-grid">
                  {queueStatus.completedTests.map(test => {
                    const isMine = isMyCompletedTest(test);
                    const hasReport = !!test.reportId;
                    const testType = test.type === 'suite' ? '묶음' : '테스트';

                    return (
                      <div
                        key={test.queueId}
                        className={`test-card completed ${test.success ? 'success' : 'failed'} ${isMine ? 'mine' : ''} ${hasReport ? 'clickable' : ''}`}
                        onClick={() => hasReport && handleCompletedTestClick(test)}
                        title={hasReport ? '클릭하여 리포트 보기' : undefined}
                      >
                        <div className="test-card-header">
                          <span className="result-icon">{test.success ? '✅' : '❌'}</span>
                          <span className={`type-badge ${test.type || 'test'}`}>{testType}</span>
                          <span className="test-name">
                            {test.testName || `테스트 ${test.queueId.slice(0, 6)}`}
                          </span>
                          {isMine && <span className="mine-badge">MY</span>}
                          {hasReport && <span className="report-icon">📊</span>}
                        </div>

                        <div className="test-card-meta">
                          <span className={test.success ? 'success-text' : 'failed-text'}>
                            📱 {test.successCount}/{test.totalCount}
                          </span>
                          <span>⏱️ {formatDuration(test.duration)}</span>
                          <span className="datetime">{formatDateTime(test.completedAt)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </div>
        </div>
      )}

      {/* 상세 모달 */}
      {detailModalTest && (
        <TestDetailModal
          test={detailModalTest}
          deviceProgress={deviceProgress}
          executionLogs={executionLogs}
          onClose={() => setDetailModalTest(null)}
          onStop={isMyTest(detailModalTest) ? handleStopFromModal : undefined}
          isMine={isMyTest(detailModalTest)}
        />
      )}
    </div>
  );
};

export default TestStatusBar;
