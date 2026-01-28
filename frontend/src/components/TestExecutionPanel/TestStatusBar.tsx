// frontend/src/components/TestExecutionPanel/TestStatusBar.tsx
// 테스트 현황 상단 바 (요약 카드 + 드롭다운 패널)

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
} from '../../hooks/useQueueStatus';
import TestDetailModal from './TestDetailModal';
import './TestStatusBar.css';

type PanelType = 'running' | 'pending' | 'completed' | null;

interface TestStatusBarProps {
  socket: Socket | null;
  userName: string;
  queueStatus: QueueStatus;
  executionLogs: ExecutionLog[];
  cancellingIds: Set<string>;
  deviceProgress: Map<string, DeviceProgress>;
  onCancel: (queueId: string) => void;
  onRefresh: () => void;
  onNavigateToReport?: (reportId: string, type: 'scenario' | 'suite') => void;
}

const TestStatusBar: React.FC<TestStatusBarProps> = ({
  socket,
  userName,
  queueStatus,
  executionLogs,
  cancellingIds,
  deviceProgress,
  onCancel,
  onRefresh,
  onNavigateToReport,
}) => {
  const [expandedPanel, setExpandedPanel] = useState<PanelType>(null);

  // 상세 모달 상태
  const [detailModalTest, setDetailModalTest] = useState<QueuedTest | null>(null);

  // 테스트 취소/중지 (stopPropagation 추가)
  const handleCancel = (queueId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onCancel(queueId);
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
      onCancel(detailModalTest.queueId);
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

        <button className="refresh-btn" onClick={onRefresh} title="새로고침">
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
                    const isMine = isMyTest(test, userName);
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
                    const isMine = isMyTest(test, userName);
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
                    const isMine = isMyCompletedTest(test, userName);
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
          onStop={isMyTest(detailModalTest, userName) ? handleStopFromModal : undefined}
          isMine={isMyTest(detailModalTest, userName)}
        />
      )}
    </div>
  );
};

export default TestStatusBar;
