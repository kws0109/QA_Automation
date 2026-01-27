// frontend/src/components/TestExecutionPanel/TestDetailModal.tsx
// 테스트 상세 진행 상황 모달

import React, { useEffect, useState, useRef } from 'react';
import type { QueuedTest, DeviceProgress } from '../../types';
import './TestDetailModal.css';

interface ExecutionLog {
  timestamp: string;
  deviceId: string;
  deviceName: string;
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
}

interface TestDetailModalProps {
  test: QueuedTest;
  deviceProgress: Map<string, DeviceProgress>;
  executionLogs: ExecutionLog[];
  onClose: () => void;
  onStop?: () => void;
  isMine: boolean;
}

const TestDetailModal: React.FC<TestDetailModalProps> = ({
  test,
  deviceProgress,
  executionLogs,
  onClose,
  onStop,
  isMine,
}) => {
  const logsEndRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // 전체 진행률 계산
  const calculateOverallProgress = (): { completed: number; total: number; percent: number } => {
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

    return {
      completed,
      total,
      percent: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  };

  // 시작 후 경과 시간
  const getElapsedTime = (): string => {
    if (!test.startedAt) return '-';
    const elapsed = Date.now() - new Date(test.startedAt).getTime();
    const seconds = Math.floor(elapsed / 1000);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (minutes > 0) {
      return `${minutes}분 ${secs}초`;
    }
    return `${secs}초`;
  };

  // 시간 포맷
  const formatTime = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  // 자동 스크롤
  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [executionLogs, autoScroll]);

  // ESC 키로 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const progress = calculateOverallProgress();
  const testType = test.type === 'suite' ? 'Suite' : '시나리오';

  return (
    <div className="test-detail-modal-overlay" onClick={onClose}>
      <div className="test-detail-modal" onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="modal-header">
          <div className="modal-title">
            <span className="test-type-badge">{testType}</span>
            <h3>{test.testName || `테스트 ${test.queueId.slice(0, 6)}`}</h3>
          </div>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        {/* 메타 정보 */}
        <div className="modal-meta">
          <span>요청자: {test.requesterName}</span>
          <span>시작: {test.startedAt ? formatTime(test.startedAt) : '-'}</span>
          <span>경과: {getElapsedTime()}</span>
        </div>

        {/* 전체 진행률 */}
        <div className="overall-progress-section">
          <div className="progress-header">
            <span>전체 진행률</span>
            <span className="progress-percent">{progress.percent}%</span>
          </div>
          <div className="progress-bar-container">
            <div
              className="progress-bar-fill"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          <div className="progress-stats">
            <span>{progress.completed}/{progress.total} 시나리오 완료</span>
          </div>
        </div>

        {/* 디바이스별 진행 상황 */}
        <div className="devices-progress-section">
          <h4>📱 디바이스별 진행 상황</h4>
          <div className="devices-list">
            {test.request.deviceIds.map(deviceId => {
              const dp = deviceProgress.get(deviceId);
              const isPending = test.pendingDevices?.includes(deviceId);
              const isRunning = test.runningDevices?.includes(deviceId);
              const isCompleted = test.completedDevices?.includes(deviceId);

              if (dp) {
                const devicePercent = dp.totalScenarios > 0
                  ? Math.round(((dp.completedScenarios + dp.failedScenarios) / dp.totalScenarios) * 100)
                  : 0;

                return (
                  <div key={deviceId} className={`device-progress-item ${dp.status}`}>
                    <div className="device-header">
                      <span className="device-name">{dp.deviceName || deviceId.slice(0, 12)}</span>
                      <span className="device-stats">
                        {dp.completedScenarios + dp.failedScenarios}/{dp.totalScenarios}
                        {dp.failedScenarios > 0 && (
                          <span className="failed-count"> ({dp.failedScenarios} 실패)</span>
                        )}
                      </span>
                    </div>
                    <div className="device-progress-bar">
                      <div
                        className={`device-progress-fill ${dp.status}`}
                        style={{ width: `${devicePercent}%` }}
                      />
                    </div>
                    <div className="device-current">
                      {dp.status === 'running' && dp.currentScenarioName && (
                        <span>현재: {dp.currentScenarioName}</span>
                      )}
                      {dp.status === 'completed' && <span className="status-completed">✅ 완료</span>}
                      {dp.status === 'failed' && <span className="status-failed">❌ 실패</span>}
                    </div>
                  </div>
                );
              }

              // 진행 정보 없는 경우 (대기 중)
              return (
                <div key={deviceId} className={`device-progress-item ${isPending ? 'pending' : isCompleted ? 'completed' : 'waiting'}`}>
                  <div className="device-header">
                    <span className="device-name">{deviceId.slice(0, 12)}</span>
                    <span className="device-status-text">
                      {isPending && '⏳ 대기 중'}
                      {isRunning && '🔄 실행 중'}
                      {isCompleted && '✅ 완료'}
                      {!isPending && !isRunning && !isCompleted && '⏳ 준비 중'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 최근 로그 */}
        <div className="logs-section">
          <div className="logs-header">
            <h4>📝 실행 로그</h4>
            <label className="auto-scroll-toggle">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={e => setAutoScroll(e.target.checked)}
              />
              자동 스크롤
            </label>
          </div>
          <div className="logs-container">
            {executionLogs.length === 0 ? (
              <div className="logs-empty">로그가 없습니다.</div>
            ) : (
              executionLogs.slice(-50).map((log, idx) => (
                <div key={idx} className={`log-item ${log.type}`}>
                  <span className="log-time">{formatTime(log.timestamp)}</span>
                  <span className="log-device">{log.deviceName || log.deviceId?.slice(0, 8)}</span>
                  <span className="log-message">{log.message}</span>
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>
        </div>

        {/* 액션 버튼 */}
        {isMine && onStop && (
          <div className="modal-actions">
            <button className="stop-btn" onClick={onStop}>
              ⏹ 테스트 중지
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default TestDetailModal;
