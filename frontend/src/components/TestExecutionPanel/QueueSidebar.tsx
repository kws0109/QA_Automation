// frontend/src/components/TestExecutionPanel/QueueSidebar.tsx
// 큐 사이드바: 테스트 현황 대시보드 (고도화)

import React, { useState } from 'react';
import { Socket } from 'socket.io-client';
import type { QueuedTest, CompletedTest, DeviceProgress } from '../../types';
import {
  QueueStatus,
  ExecutionLog,
  isMyTest,
  isMyCompletedTest,
  formatDuration,
  formatDateTime,
  getWaitTimeText,
  getElapsedTime,
  getBlockingInfo,
  canForceComplete,
} from '../../hooks/useQueueStatus';
import TestDetailModal from './TestDetailModal';
import './QueueSidebar.css';

interface QueueSidebarProps {
  socket: Socket | null;
  userName: string;
  selectedQueueId: string | null;
  onSelectTest: (queueId: string | null) => void;
  queueStatus: QueueStatus;
  executionLogs: ExecutionLog[];
  cancellingIds: Set<string>;
  forceCompletingIds: Set<string>;
  deviceProgress: Map<string, DeviceProgress>;
  onCancel: (queueId: string) => void;
  onForceComplete: (executionId: string) => void;
  onRefresh: () => void;
  onNavigateToReport?: (reportId: string, type: 'scenario' | 'suite') => void;
}

const QueueSidebar: React.FC<QueueSidebarProps> = ({
  socket,
  userName,
  selectedQueueId,
  onSelectTest,
  queueStatus,
  executionLogs,
  cancellingIds,
  forceCompletingIds,
  deviceProgress,
  onCancel,
  onForceComplete,
  onRefresh,
  onNavigateToReport,
}) => {
  const [pendingExpanded, setPendingExpanded] = useState(true);
  const [runningExpanded, setRunningExpanded] = useState(true);
  const [completedExpanded, setCompletedExpanded] = useState(true);

  // 상세 모달 상태
  const [detailModalTest, setDetailModalTest] = useState<QueuedTest | null>(null);

  // 테스트 취소/중지 (stopPropagation 추가)
  const handleCancel = (queueId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onCancel(queueId);
  };

  // 부분 완료 (대기 디바이스 포기)
  const handleForceComplete = (executionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onForceComplete(executionId);
  };

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

  // 완료된 테스트 클릭 핸들러 (리포트로 이동)
  const handleCompletedTestClick = (test: CompletedTest) => {
    if (test.reportId && onNavigateToReport) {
      const reportType = test.type === 'suite' ? 'suite' : 'scenario';
      onNavigateToReport(test.reportId, reportType);
    }
  };

  // 진행 중 테스트 클릭 핸들러 (상세 모달 열기)
  const handleRunningTestClick = (test: QueuedTest) => {
    setDetailModalTest(test);
  };

  // 모달에서 중지
  const handleStopFromModal = () => {
    if (detailModalTest && socket) {
      onCancel(detailModalTest.queueId);
      setDetailModalTest(null);
    }
  };

  // 통계 계산
  const successCount = queueStatus.completedTests.filter(t => t.success).length;
  const failedCount = queueStatus.completedTests.filter(t => !t.success).length;

  return (
    <div className="queue-sidebar">
      {/* 헤더 */}
      <div className="sidebar-header">
        <h3>테스트 현황</h3>
        <button className="refresh-btn" onClick={onRefresh} title="새로고침">
          🔄
        </button>
      </div>

      {/* 대시보드 요약 카드 */}
      <div className="dashboard-summary">
        <div className="summary-card running">
          <span className="card-icon">🔄</span>
          <span className="card-value">{queueStatus.runningTests.length}</span>
          <span className="card-label">진행</span>
        </div>
        <div className="summary-card pending">
          <span className="card-icon">⏳</span>
          <span className="card-value">{queueStatus.pendingTests.length}</span>
          <span className="card-label">대기</span>
        </div>
        <div className="summary-card success">
          <span className="card-icon">✅</span>
          <span className="card-value">{successCount}</span>
          <span className="card-label">성공</span>
        </div>
        <div className="summary-card failed">
          <span className="card-icon">❌</span>
          <span className="card-value">{failedCount}</span>
          <span className="card-label">실패</span>
        </div>
      </div>

      <div className="sidebar-content">
        {/* 진행 섹션 */}
        <div className="queue-section running-section">
          <div className="section-header" onClick={() => setRunningExpanded(!runningExpanded)}>
            <div className="section-header-left">
              <span className="section-icon">🔄</span>
              <span className="section-title">진행 중</span>
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
                    const isMine = isMyTest(test, userName);
                    const progress = calculateTestProgress(test);
                    const testType = test.type === 'suite' ? '묶음' : '테스트';

                    return (
                      <div
                        key={test.queueId}
                        className={`queue-item running ${isMine ? 'mine' : ''}`}
                        onClick={() => handleRunningTestClick(test)}
                      >
                        <div className="item-header">
                          <span className={`type-badge ${test.type || 'test'}`}>{testType}</span>
                          <span className="item-name">
                            {test.testName || `테스트 ${test.queueId.slice(0, 6)}`}
                          </span>
                          {isMine && <span className="mine-badge">MY</span>}
                        </div>

                        {/* 진행 바 */}
                        <div className="progress-bar-wrapper">
                          <div className="progress-bar">
                            <div
                              className="progress-fill"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <span className="progress-text">{progress}%</span>
                        </div>

                        <div className="item-meta-row">
                          <span className="meta-item">
                            📱 {test.request.deviceIds.length}대
                          </span>
                          <span className="meta-item">
                            ⏱️ {getElapsedTime(test)}
                          </span>
                          {isMine && (
                            <button
                              className="mini-stop-btn"
                              onClick={(e) => handleCancel(test.queueId, e)}
                              disabled={cancellingIds.has(test.queueId)}
                            >
                              {cancellingIds.has(test.queueId) ? '...' : '중지'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

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
                    const isMine = isMyTest(test, userName);
                    const blockingInfo = getBlockingInfo(test);
                    const testType = test.type === 'suite' ? '묶음' : '테스트';

                    return (
                      <div
                        key={test.queueId}
                        className={`queue-item pending ${isMine ? 'mine' : ''}`}
                        onClick={() => onSelectTest(selectedQueueId === test.queueId ? null : test.queueId)}
                      >
                        <div className="item-header">
                          <span className="queue-position">#{index + 1}</span>
                          <span className={`type-badge ${test.type || 'test'}`}>{testType}</span>
                          <span className="item-name">
                            {test.testName || `테스트 ${test.queueId.slice(0, 6)}`}
                          </span>
                          {isMine && <span className="mine-badge">MY</span>}
                        </div>

                        <div className="item-meta-row">
                          <span className="meta-item">📱 {test.request.deviceIds.length}대</span>
                          <span className="meta-item wait-time">⏳ {getWaitTimeText(test)} 대기</span>
                        </div>

                        {blockingInfo && (
                          <div className="blocking-info">
                            <span className="blocking-icon">🔒</span>
                            <span className="blocking-text">{blockingInfo}</span>
                          </div>
                        )}

                        {isMine && (
                          <div className="item-actions">
                            {canForceComplete(test) && test.executionId && (
                              <button
                                className="force-complete-btn"
                                onClick={(e) => handleForceComplete(test.executionId!, e)}
                                disabled={forceCompletingIds.has(test.executionId)}
                                title="대기 중인 디바이스를 포기하고 완료된 결과로 리포트 생성"
                              >
                                {forceCompletingIds.has(test.executionId) ? '처리 중...' : '부분 완료'}
                              </button>
                            )}
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
                    const isMine = isMyCompletedTest(test, userName);
                    const hasReport = !!test.reportId;
                    const testType = test.type === 'suite' ? '묶음' : '테스트';

                    return (
                      <div
                        key={test.queueId}
                        className={`queue-item completed ${test.success ? 'success' : 'failed'} ${isMine ? 'mine' : ''} ${hasReport ? 'clickable' : ''}`}
                        onClick={() => hasReport && handleCompletedTestClick(test)}
                        title={hasReport ? '클릭하여 리포트 보기' : undefined}
                      >
                        <div className="item-header">
                          <span className="result-icon">{test.success ? '✅' : '❌'}</span>
                          <span className={`type-badge ${test.type || 'test'}`}>{testType}</span>
                          <span className="item-name">
                            {test.testName || `테스트 ${test.queueId.slice(0, 6)}`}
                          </span>
                          {isMine && <span className="mine-badge">MY</span>}
                          {hasReport && <span className="report-icon" title="리포트 보기">📊</span>}
                        </div>

                        <div className="item-meta-row">
                          <span className={`meta-item ${test.success ? 'success' : 'failed'}`}>
                            📱 {test.successCount}/{test.totalCount}
                          </span>
                          <span className="meta-item">⏱️ {formatDuration(test.duration)}</span>
                          <span className="meta-item datetime">{formatDateTime(test.completedAt)}</span>
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

      {/* 상세 모달 */}
      {detailModalTest && (
        <TestDetailModal
          test={detailModalTest}
          deviceProgress={deviceProgress}
          executionLogs={executionLogs}
          onClose={() => setDetailModalTest(null)}
          onStop={isMyTest(detailModalTest, userName) ? handleStopFromModal : undefined}
          isMine={isMyTest(detailModalTest, userName)}
        />
      )}
    </div>
  );
};

export default QueueSidebar;
