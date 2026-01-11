// frontend/src/components/TestExecutionPanel/ExecutionProgress.tsx
// 실행 진행 상황 표시 (방식 2: 디바이스별 독립 실행)

import React, { useState, useMemo } from 'react';
import type { TestExecutionStatus, ScenarioQueueItem, DeviceProgress } from '../../types';

interface ExecutionLog {
  timestamp: string;
  type: 'info' | 'success' | 'error' | 'warning';
  message: string;
  scenarioName?: string;
  deviceId?: string;
}

interface ExecutionProgressProps {
  status: TestExecutionStatus;
  queue: ScenarioQueueItem[];
  logs: ExecutionLog[];
  deviceProgress: Map<string, DeviceProgress>;
  onStop: () => void;
  onClose: () => void;
}

const ExecutionProgress: React.FC<ExecutionProgressProps> = ({
  status,
  queue,
  logs,
  deviceProgress,
  onStop,
  onClose,
}) => {
  const { isRunning, progress } = status;
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [showAllLogs, setShowAllLogs] = useState(true);

  // 진행률 계산
  const progressPercent = progress.percentage;

  // 남은 시간 추정 (평균 시나리오 실행 시간 기반)
  const estimatedRemaining = () => {
    if (!status.startedAt || progress.completed === 0) return null;

    const elapsed = Date.now() - new Date(status.startedAt).getTime();
    const avgPerScenario = elapsed / progress.completed;
    const remaining = avgPerScenario * (progress.total - progress.completed);

    if (remaining < 60000) {
      return `약 ${Math.ceil(remaining / 1000)}초`;
    } else {
      return `약 ${Math.ceil(remaining / 60000)}분`;
    }
  };

  // 디바이스별 상태 아이콘
  const getDeviceStatusIcon = (dp: DeviceProgress) => {
    switch (dp.status) {
      case 'running': return '🔄';
      case 'completed': return '✅';
      case 'failed': return '❌';
      case 'stopped': return '⏹';
      default: return '⏳';
    }
  };

  // 디바이스별 진행률 바 색상
  const getDeviceProgressColor = (dp: DeviceProgress) => {
    if (dp.failedScenarios > 0) return 'var(--ctp-red)';
    if (dp.status === 'completed') return 'var(--ctp-green)';
    return 'var(--ctp-blue)';
  };

  // 필터링된 로그
  const filteredLogs = showAllLogs
    ? logs
    : logs.filter(log => !selectedDeviceId || log.deviceId === selectedDeviceId);

  if (!isRunning && queue.length === 0) {
    return null;
  }

  const deviceProgressArray = Array.from(deviceProgress.values());

  return (
    <div className="execution-progress">
      <div className="progress-header">
        <h3>실행 진행 상황</h3>
        <div className="progress-actions">
          {isRunning ? (
            <button
              type="button"
              onClick={onStop}
              className="stop-btn"
            >
              ⏹ 중지
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="close-btn"
            >
              ✕ 닫기
            </button>
          )}
        </div>
      </div>

      {/* 전체 진행률 바 */}
      <div className="progress-bar-container">
        <div
          className="progress-bar"
          style={{ width: `${progressPercent}%` }}
        />
        <span className="progress-text">
          {progress.completed} / {progress.total} ({progressPercent}%)
        </span>
      </div>

      {/* 남은 시간 */}
      {isRunning && estimatedRemaining && (
        <div className="time-remaining">
          남은 예상 시간: {estimatedRemaining}
        </div>
      )}

      {/* 디바이스별 진행 상황 */}
      {deviceProgressArray.length > 0 && (
        <div className="device-progress-section">
          <div className="section-title">디바이스별 진행 상황</div>
          <div className="device-progress-list">
            {deviceProgressArray.map(dp => {
              const devicePercent = dp.totalScenarios > 0
                ? Math.round(((dp.completedScenarios + dp.failedScenarios) / dp.totalScenarios) * 100)
                : 0;

              return (
                <div
                  key={dp.deviceId}
                  className={`device-progress-item ${selectedDeviceId === dp.deviceId ? 'selected' : ''}`}
                  onClick={() => {
                    setSelectedDeviceId(selectedDeviceId === dp.deviceId ? null : dp.deviceId);
                    setShowAllLogs(false);
                  }}
                >
                  <div className="device-progress-header">
                    <span className="device-status-icon">{getDeviceStatusIcon(dp)}</span>
                    <span className="device-id">{dp.deviceId}</span>
                    <span className="device-scenario-count">
                      {dp.completedScenarios}/{dp.totalScenarios}
                      {dp.failedScenarios > 0 && (
                        <span className="failed-count"> ({dp.failedScenarios} 실패)</span>
                      )}
                    </span>
                  </div>
                  <div className="device-progress-bar-container">
                    <div
                      className="device-progress-bar"
                      style={{
                        width: `${devicePercent}%`,
                        backgroundColor: getDeviceProgressColor(dp),
                      }}
                    />
                  </div>
                  {dp.status === 'running' && dp.currentScenarioName && (
                    <div className="device-current-scenario">
                      현재: {dp.currentScenarioName}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 시나리오 큐 목록 */}
      {queue.length > 0 && (
        <div className="queue-list">
          <div className="queue-header">시나리오 목록 ({queue.length}개)</div>
          <div className="queue-items">
            {queue.map((item, index) => (
              <div
                key={`${item.scenarioId}-${item.repeatIndex}`}
                className="queue-item"
              >
                <span className="queue-order">{index + 1}.</span>
                <span className="queue-name">{item.scenarioName}</span>
                {item.repeatIndex > 1 && (
                  <span className="queue-repeat">({item.repeatIndex}회차)</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 실행 로그 */}
      {logs.length > 0 && (
        <div className="execution-logs">
          <div className="logs-header">
            <span>실행 로그</span>
            <div className="logs-filter">
              <button
                type="button"
                className={`filter-btn ${showAllLogs ? 'active' : ''}`}
                onClick={() => {
                  setShowAllLogs(true);
                  setSelectedDeviceId(null);
                }}
              >
                전체
              </button>
              {deviceProgressArray.map(dp => (
                <button
                  key={dp.deviceId}
                  type="button"
                  className={`filter-btn ${!showAllLogs && selectedDeviceId === dp.deviceId ? 'active' : ''}`}
                  onClick={() => {
                    setShowAllLogs(false);
                    setSelectedDeviceId(dp.deviceId);
                  }}
                >
                  {dp.deviceId.slice(-4)}
                </button>
              ))}
            </div>
          </div>
          <div className="logs-container">
            {filteredLogs.slice(-50).map((log, index) => (
              <div
                key={index}
                className={`log-item log-${log.type}`}
              >
                <span className="log-time">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                {log.deviceId && (
                  <span className="log-device">[{log.deviceId.slice(-4)}]</span>
                )}
                <span className="log-message">{log.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ExecutionProgress;
