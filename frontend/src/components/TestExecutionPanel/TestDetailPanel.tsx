// frontend/src/components/TestExecutionPanel/TestDetailPanel.tsx
// 테스트 상세 패널: 선택된 큐 아이템의 상세 정보 표시

import React, { useState, useMemo } from 'react';
import type { DeviceProgress } from '../../types';
import { QueueStatus } from './QueueSidebar';
import './TestDetailPanel.css';

interface ExecutionLog {
  timestamp: string;
  type: 'info' | 'success' | 'error' | 'warning';
  message: string;
  scenarioName?: string;
  deviceId?: string;
  deviceName?: string;
}

interface TestDetailPanelProps {
  selectedQueueId: string | null;
  queueStatus: QueueStatus;
  logs: ExecutionLog[];
  deviceProgress: Map<string, DeviceProgress>;
  onClose: () => void;
  onStop: (queueId: string) => void;
  userName: string;
}

const TestDetailPanel: React.FC<TestDetailPanelProps> = ({
  selectedQueueId,
  queueStatus,
  logs,
  deviceProgress,
  onClose,
  onStop,
  userName,
}) => {
  const [selectedDeviceFilter, setSelectedDeviceFilter] = useState<string | null>(null);
  const [showAllLogs, setShowAllLogs] = useState(true);

  // 선택된 테스트 찾기
  const selectedTest = useMemo(() => {
    if (!selectedQueueId) return null;
    const running = queueStatus.runningTests.find(t => t.queueId === selectedQueueId);
    if (running) return { ...running, isRunning: true };
    const pending = queueStatus.pendingTests.find(t => t.queueId === selectedQueueId);
    if (pending) return { ...pending, isRunning: false };
    return null;
  }, [selectedQueueId, queueStatus]);

  // 해당 테스트의 디바이스 진행 상황
  const testDeviceProgress = useMemo(() => {
    if (!selectedTest) return [];
    return selectedTest.request.deviceIds
      .map(id => deviceProgress.get(id))
      .filter((dp): dp is DeviceProgress => dp !== undefined);
  }, [selectedTest, deviceProgress]);

  // 전체 진행률 계산
  const overallProgress = useMemo(() => {
    if (testDeviceProgress.length === 0) return { completed: 0, total: 0, percentage: 0 };
    let completed = 0;
    let total = 0;
    for (const dp of testDeviceProgress) {
      completed += dp.completedScenarios + dp.failedScenarios;
      total += dp.totalScenarios;
    }
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { completed, total, percentage };
  }, [testDeviceProgress]);

  // 필터링된 로그 (해당 테스트의 디바이스만)
  const filteredLogs = useMemo(() => {
    if (!selectedTest) return [];
    const deviceIds = new Set(selectedTest.request.deviceIds);
    let filtered = logs.filter(log => !log.deviceId || deviceIds.has(log.deviceId));

    if (!showAllLogs && selectedDeviceFilter) {
      filtered = filtered.filter(log => log.deviceId === selectedDeviceFilter);
    }

    return filtered.slice(-100);
  }, [logs, selectedTest, showAllLogs, selectedDeviceFilter]);

  // 디바이스 상태 아이콘
  const getDeviceStatusIcon = (dp: DeviceProgress) => {
    switch (dp.status) {
      case 'running': return '🔄';
      case 'completed': return '✅';
      case 'failed': return '❌';
      case 'stopped': return '⏹';
      default: return '⏳';
    }
  };

  // 디바이스 진행률 바 색상
  const getDeviceProgressColor = (dp: DeviceProgress) => {
    if (dp.failedScenarios > 0) return 'var(--ctp-red)';
    if (dp.status === 'completed') return 'var(--ctp-green)';
    return 'var(--ctp-blue)';
  };

  // 디바이스 이름 조회
  const getDeviceName = (deviceId: string): string => {
    const deviceStatus = queueStatus.deviceStatuses.find(d => d.deviceId === deviceId);
    return deviceStatus?.deviceName || deviceId.slice(0, 12);
  };

  // 경과 시간 계산
  const getElapsedTime = (startedAt?: string): string => {
    if (!startedAt) return '-';
    const elapsed = Date.now() - new Date(startedAt).getTime();
    const seconds = Math.floor(elapsed / 1000);
    if (seconds < 60) return `${seconds}초`;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}분 ${secs}초`;
  };

  // 테스트가 완료되어 큐에서 사라진 경우
  if (!selectedTest && selectedQueueId) {
    return (
      <div className="test-detail-panel">
        <div className="detail-header">
          <div className="header-title">
            <span className="title-icon">✅</span>
            <h3>테스트 완료</h3>
          </div>
          <button className="close-btn" onClick={onClose} title="닫기">
            ✕
          </button>
        </div>
        <div className="detail-content">
          <div className="empty-state">
            <p>테스트가 완료되어 큐에서 제거되었습니다.</p>
            <p className="hint">실행 리포트 탭에서 결과를 확인하세요.</p>
          </div>
        </div>
      </div>
    );
  }

  // 선택된 테스트가 없는 초기 상태
  if (!selectedTest) {
    return (
      <div className="test-detail-panel empty">
        <div className="empty-state">
          <p>테스트를 선택하면 상세 정보가 표시됩니다.</p>
          <p className="hint">오른쪽 대기열에서 테스트를 클릭하세요.</p>
        </div>
      </div>
    );
  }

  const isMyTest = selectedTest.requesterName === userName;
  const isRunning = 'isRunning' in selectedTest && selectedTest.isRunning;

  return (
    <div className="test-detail-panel">
      {/* 헤더 */}
      <div className="detail-header">
        <div className="header-title">
          <span className="title-icon">📋</span>
          <h3>{selectedTest.testName || `테스트 ${selectedTest.queueId.slice(0, 8)}`}</h3>
        </div>
        <button className="close-btn" onClick={onClose} title="닫기">
          ✕
        </button>
      </div>

      <div className="detail-content">
        {/* 기본 정보 */}
        <div className="info-section">
          <div className="info-grid">
            <div className="info-item">
              <span className="info-label">상태</span>
              <span className={`info-value status ${isRunning ? 'running' : 'pending'}`}>
                {isRunning ? '🔄 실행 중' : '⏳ 대기 중'}
              </span>
            </div>
            <div className="info-item">
              <span className="info-label">요청자</span>
              <span className="info-value">
                {isMyTest ? '나' : selectedTest.requesterName}
                {isMyTest && <span className="mine-tag">내 테스트</span>}
              </span>
            </div>
            <div className="info-item">
              <span className="info-label">{isRunning ? '시작' : '요청'}</span>
              <span className="info-value">
                {new Date(isRunning && selectedTest.startedAt ? selectedTest.startedAt : selectedTest.createdAt)
                  .toLocaleTimeString()}
              </span>
            </div>
            {isRunning && selectedTest.startedAt && (
              <div className="info-item">
                <span className="info-label">경과</span>
                <span className="info-value">{getElapsedTime(selectedTest.startedAt)}</span>
              </div>
            )}
            <div className="info-item">
              <span className="info-label">디바이스</span>
              <span className="info-value">
                {selectedTest.request.deviceIds.length}대
              </span>
            </div>
            <div className="info-item">
              <span className="info-label">시나리오</span>
              <span className="info-value">
                {selectedTest.request.scenarioIds.length}개 × {selectedTest.request.repeatCount || 1}회
              </span>
            </div>
          </div>
        </div>

        {/* 대기 원인 (대기 중일 때만) */}
        {!isRunning && selectedTest.waitingInfo && selectedTest.waitingInfo.blockedByDevices.length > 0 && (
          <div className="waiting-section">
            <h4>⏳ 대기 원인</h4>
            <div className="blocking-list">
              {selectedTest.waitingInfo.blockedByDevices.map(device => (
                <div key={device.deviceId} className="blocking-item">
                  <span className="blocking-device">🔒 {device.deviceName}</span>
                  <span className="blocking-user">{device.usedBy}</span>
                  {device.testName && (
                    <span className="blocking-test">{device.testName}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 진행 상황 (실행 중일 때) */}
        {isRunning && (
          <div className="progress-section">
            <div className="progress-header">
              <h4>📊 진행 상황</h4>
              {isMyTest && (
                <button
                  className="stop-btn"
                  onClick={() => onStop(selectedTest.queueId)}
                >
                  ⏹ 중지
                </button>
              )}
            </div>

            {/* 전체 진행률 */}
            <div className="overall-progress">
              <div className="progress-bar-container">
                <div
                  className="progress-bar"
                  style={{ width: `${overallProgress.percentage}%` }}
                />
              </div>
              <span className="progress-text">
                {overallProgress.completed}/{overallProgress.total} ({overallProgress.percentage}%)
              </span>
            </div>

            {/* 디바이스별 진행 */}
            {testDeviceProgress.length > 0 && (
              <div className="device-progress-grid">
                {testDeviceProgress.map(dp => {
                  const percent = dp.totalScenarios > 0
                    ? Math.round(((dp.completedScenarios + dp.failedScenarios) / dp.totalScenarios) * 100)
                    : 0;

                  return (
                    <div
                      key={dp.deviceId}
                      className={`device-progress-card ${selectedDeviceFilter === dp.deviceId ? 'selected' : ''}`}
                      onClick={() => {
                        if (selectedDeviceFilter === dp.deviceId) {
                          setSelectedDeviceFilter(null);
                          setShowAllLogs(true);
                        } else {
                          setSelectedDeviceFilter(dp.deviceId);
                          setShowAllLogs(false);
                        }
                      }}
                    >
                      <div className="device-header">
                        <span className="device-icon">{getDeviceStatusIcon(dp)}</span>
                        <span className="device-name">{dp.deviceName}</span>
                      </div>
                      {dp.status === 'running' && dp.currentScenarioName && (
                        <div className="current-scenario">
                          현재: {dp.currentScenarioName}
                        </div>
                      )}
                      <div className="device-progress-bar">
                        <div
                          className="bar"
                          style={{
                            width: `${percent}%`,
                            backgroundColor: getDeviceProgressColor(dp),
                          }}
                        />
                      </div>
                      <div className="device-stats">
                        <span className="completed">성공: {dp.completedScenarios}</span>
                        {dp.failedScenarios > 0 && (
                          <span className="failed">실패: {dp.failedScenarios}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 실행 로그 */}
        <div className="logs-section">
          <div className="logs-header">
            <h4>📝 실행 로그</h4>
            <div className="logs-filter">
              <button
                className={`filter-btn ${showAllLogs ? 'active' : ''}`}
                onClick={() => {
                  setShowAllLogs(true);
                  setSelectedDeviceFilter(null);
                }}
              >
                전체
              </button>
              {selectedTest.request.deviceIds.map(deviceId => (
                <button
                  key={deviceId}
                  className={`filter-btn ${!showAllLogs && selectedDeviceFilter === deviceId ? 'active' : ''}`}
                  onClick={() => {
                    setShowAllLogs(false);
                    setSelectedDeviceFilter(deviceId);
                  }}
                >
                  {getDeviceName(deviceId)}
                </button>
              ))}
            </div>
          </div>
          <div className="logs-container">
            {filteredLogs.length === 0 ? (
              <div className="no-logs">
                {isRunning ? '로그 대기 중...' : '로그가 없습니다.'}
              </div>
            ) : (
              filteredLogs.map((log, index) => (
                <div key={index} className={`log-item log-${log.type}`}>
                  <span className="log-time">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  {log.deviceName && (
                    <span className="log-device">[{log.deviceName}]</span>
                  )}
                  <span className="log-message">{log.message}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TestDetailPanel;
