// frontend/src/components/ExecutionCenter/ExecutionCenter.tsx
// 통합 실행 센터: 시나리오 실행, Suite 실행, 실행 이력을 한 곳에서 관리

import { useState, useEffect, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import TestExecutionPanel from '../TestExecutionPanel';
import TestReports from '../TestReports';
import QueueSidebar, { QueueStatus } from '../TestExecutionPanel/QueueSidebar';
import type {
  DeviceDetailedInfo,
  SessionInfo,
  ScenarioSummary,
  TestSuite,
  SuiteProgress,
  DeviceProgress,
} from '../../types';
import './ExecutionCenter.css';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:3001';

type ExecutionTab = 'scenario' | 'suite' | 'history';

interface ExecutionCenterProps {
  devices: DeviceDetailedInfo[];
  sessions: SessionInfo[];
  scenarios: ScenarioSummary[];
  socket: Socket | null;
  onSessionChange: () => void;
  userName?: string;
  initialReportId?: string;
  onReportIdConsumed?: () => void;
}

export default function ExecutionCenter({
  devices,
  sessions,
  scenarios,
  socket,
  onSessionChange,
  userName = '',
  initialReportId,
  onReportIdConsumed,
}: ExecutionCenterProps) {
  const [activeTab, setActiveTab] = useState<ExecutionTab>('scenario');

  // Suite 목록
  const [suites, setSuites] = useState<TestSuite[]>([]);
  const [selectedSuiteId, setSelectedSuiteId] = useState<string | null>(null);
  const [suitesLoading, setSuitesLoading] = useState(true);

  // Suite 실행 상태
  const [suiteExecuting, setSuiteExecuting] = useState(false);
  const [suiteProgress, setSuiteProgress] = useState<SuiteProgress | null>(null);
  const [suiteStopLoading, setSuiteStopLoading] = useState(false);

  // 시나리오 큐 상태 (실시간 추적)
  const [queueStatus, setQueueStatus] = useState<QueueStatus>({
    isProcessing: false,
    queueLength: 0,
    runningCount: 0,
    pendingTests: [],
    runningTests: [],
    completedTests: [],
    deviceStatuses: [],
  });

  // 디바이스 진행 상태
  const [deviceProgress, setDeviceProgress] = useState<Map<string, DeviceProgress>>(new Map());

  // 선택된 큐 아이템 (상세 보기용)
  const [selectedQueueId, setSelectedQueueId] = useState<string | null>(null);

  // Suite 목록 로드
  const loadSuites = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/suites`);
      const data = await res.json();
      setSuites(data);
    } catch (err) {
      console.error('Failed to load suites:', err);
    } finally {
      setSuitesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSuites();
  }, [loadSuites]);

  // Socket.IO 이벤트 (Suite 실행)
  useEffect(() => {
    if (!socket) return;

    const handleSuiteStart = () => {
      setSuiteExecuting(true);
    };

    const handleSuiteProgress = (progress: SuiteProgress) => {
      setSuiteProgress(progress);
    };

    const handleSuiteComplete = () => {
      setSuiteExecuting(false);
      setSuiteProgress(null);
      alert('Suite 실행이 완료되었습니다.');
      // 실행 이력 탭으로 이동
      setActiveTab('history');
    };

    const handleSuiteError = (data: { error: string }) => {
      setSuiteExecuting(false);
      setSuiteProgress(null);
      alert(`Suite 실행 오류: ${data.error}`);
    };

    socket.on('suite:start', handleSuiteStart);
    socket.on('suite:progress', handleSuiteProgress);
    socket.on('suite:complete', handleSuiteComplete);
    socket.on('suite:error', handleSuiteError);

    // Suite 중단 이벤트
    const handleSuiteStopped = () => {
      setSuiteExecuting(false);
      setSuiteProgress(null);
      setSuiteStopLoading(false);
      alert('Suite 실행이 중단되었습니다.');
    };

    socket.on('suite:stopped', handleSuiteStopped);

    return () => {
      socket.off('suite:start', handleSuiteStart);
      socket.off('suite:progress', handleSuiteProgress);
      socket.off('suite:complete', handleSuiteComplete);
      socket.off('suite:error', handleSuiteError);
      socket.off('suite:stopped', handleSuiteStopped);
    };
  }, [socket]);

  // 시나리오 큐 상태 추적 - QueueSidebar에서 관리하므로 제거
  // (QueueSidebar가 자체적으로 socket 이벤트 처리)

  // 디바이스 진행 상태 추적
  useEffect(() => {
    if (!socket) return;

    const handleProgress = (data: { deviceProgress: DeviceProgress[] }) => {
      const newMap = new Map<string, DeviceProgress>();
      for (const dp of data.deviceProgress) {
        newMap.set(dp.deviceId, dp);
      }
      setDeviceProgress(newMap);
    };

    socket.on('test:progress', handleProgress);

    return () => {
      socket.off('test:progress', handleProgress);
    };
  }, [socket]);

  // Suite 실행 중단
  const handleStopSuite = async () => {
    if (!suiteProgress) return;

    if (!confirm('Suite 실행을 중단하시겠습니까?')) return;

    setSuiteStopLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/suites/${suiteProgress.suiteId}/stop`, {
        method: 'POST',
      });

      if (!res.ok) {
        throw new Error('Failed to stop suite');
      }
    } catch (err) {
      console.error('Failed to stop suite:', err);
      alert('Suite 중단에 실패했습니다.');
      setSuiteStopLoading(false);
    }
  };

  // 큐 상태 변경 핸들러 (QueueSidebar에서 호출)
  const handleQueueStatusChange = useCallback((status: QueueStatus) => {
    setQueueStatus(status);
  }, []);

  // Suite 실행
  const handleExecuteSuite = async () => {
    if (!selectedSuiteId) return;

    const suite = suites.find(s => s.id === selectedSuiteId);
    if (!suite) return;

    // 오프라인 디바이스 체크
    const offlineDevices = suite.deviceIds.filter(id => {
      const device = devices.find(d => d.id === id);
      return !device || device.status !== 'connected';
    });

    if (offlineDevices.length > 0) {
      if (!confirm(`${offlineDevices.length}개의 디바이스가 오프라인입니다. 연결된 디바이스만으로 실행하시겠습니까?`)) {
        return;
      }
    }

    if (!confirm(`"${suite.name}" Suite를 실행하시겠습니까?`)) return;

    try {
      const res = await fetch(`${API_BASE}/api/suites/${selectedSuiteId}/execute`, {
        method: 'POST',
      });

      if (!res.ok) {
        throw new Error('Failed to execute suite');
      }
    } catch (err) {
      console.error('Failed to execute suite:', err);
      alert('Suite 실행에 실패했습니다.');
    }
  };

  // 선택된 Suite 정보
  const selectedSuite = suites.find(s => s.id === selectedSuiteId);

  // 시나리오 정보 가져오기
  const getScenarioInfo = (scenarioId: string) => {
    return scenarios.find(s => s.id === scenarioId);
  };

  // 디바이스 정보 가져오기
  const getDeviceInfo = (deviceId: string) => {
    return devices.find(d => d.id === deviceId);
  };

  // 시간 포맷
  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes > 0) {
      return `${minutes}분 ${remainingSeconds}초`;
    }
    return `${remainingSeconds}초`;
  };

  return (
    <div className="execution-center">
      {/* 좌측: 탭 + 컨텐츠 */}
      <div className="execution-main-content">
        {/* 서브탭 네비게이션 */}
        <div className="execution-tabs">
        <button
          className={`execution-tab ${activeTab === 'scenario' ? 'active' : ''}`}
          onClick={() => setActiveTab('scenario')}
        >
          시나리오 실행
        </button>
        <button
          className={`execution-tab ${activeTab === 'suite' ? 'active' : ''}`}
          onClick={() => setActiveTab('suite')}
        >
          Suite 실행
        </button>
        <button
          className={`execution-tab ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          실행 이력
        </button>
      </div>

      {/* 탭 컨텐츠 */}
      <div className="execution-content">
        {/* 시나리오 실행 탭 */}
        {activeTab === 'scenario' && (
          <TestExecutionPanel
            devices={devices}
            sessions={sessions}
            socket={socket}
            onSessionChange={onSessionChange}
            userName={userName}
          />
        )}

        {/* Suite 실행 탭 */}
        {activeTab === 'suite' && (
          <div className="suite-execution">
            {suitesLoading ? (
              <div className="loading-spinner">Suite 목록을 불러오는 중...</div>
            ) : suites.length === 0 ? (
              <div className="suite-empty">
                <p>📦</p>
                <p>등록된 Suite가 없습니다.</p>
                <p>Suite 관리 탭에서 Suite를 먼저 생성하세요.</p>
              </div>
            ) : (
              <div className="suite-execution-layout">
                {/* 좌측: Suite 목록 */}
                <div className="suite-list-panel">
                  <div className="suite-list-header">
                    <h3>Suite 목록</h3>
                    <button
                      className="btn-refresh"
                      onClick={loadSuites}
                      title="목록 새로고침"
                    >
                      🔄
                    </button>
                  </div>
                  <div className="suite-list">
                    {suites.map(suite => {
                      const offlineCount = suite.deviceIds.filter(id => {
                        const device = devices.find(d => d.id === id);
                        return !device || device.status !== 'connected';
                      }).length;

                      return (
                        <div
                          key={suite.id}
                          className={`suite-list-item ${selectedSuiteId === suite.id ? 'selected' : ''}`}
                          onClick={() => setSelectedSuiteId(suite.id)}
                        >
                          <div className="suite-list-item-name">{suite.name}</div>
                          <div className="suite-list-item-meta">
                            <span>📋 {suite.scenarioIds.length}</span>
                            <span>📱 {suite.deviceIds.length}</span>
                            {offlineCount > 0 && (
                              <span className="suite-warning" title={`${offlineCount}개 오프라인`}>
                                ⚠️ {offlineCount}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 우측: Suite 상세 + 실행 */}
                <div className="suite-detail-panel">
                  {!selectedSuite ? (
                    <div className="suite-detail-empty">
                      <p>📦</p>
                      <p>실행할 Suite를 선택하세요</p>
                    </div>
                  ) : (
                    <>
                      <div className="suite-detail-header">
                        <h3>{selectedSuite.name}</h3>
                        {selectedSuite.description && (
                          <p className="suite-description">{selectedSuite.description}</p>
                        )}
                      </div>

                      <div className="suite-detail-content">
                        {/* 시나리오 목록 */}
                        <div className="suite-section">
                          <h4>📋 시나리오 ({selectedSuite.scenarioIds.length}개)</h4>
                          <div className="suite-scenario-list">
                            {selectedSuite.scenarioIds.map((scenarioId, index) => {
                              const scenario = getScenarioInfo(scenarioId);
                              return (
                                <div key={scenarioId} className="suite-scenario-item">
                                  <span className="scenario-order">{index + 1}</span>
                                  <div className="scenario-info">
                                    <span className="scenario-name">
                                      {scenario?.name || scenarioId}
                                    </span>
                                    {scenario && (
                                      <span className="scenario-path">
                                        {scenario.packageName} / {scenario.categoryName}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* 디바이스 목록 */}
                        <div className="suite-section">
                          <h4>📱 디바이스 ({selectedSuite.deviceIds.length}개)</h4>
                          <div className="suite-device-list">
                            {selectedSuite.deviceIds.map(deviceId => {
                              const device = getDeviceInfo(deviceId);
                              const isOnline = device?.status === 'connected';
                              return (
                                <div
                                  key={deviceId}
                                  className={`suite-device-item ${!isOnline ? 'offline' : ''}`}
                                >
                                  <span className="device-icon">📱</span>
                                  <span className="device-name">
                                    {device?.alias || device?.model || deviceId}
                                  </span>
                                  <span className={`device-status ${isOnline ? 'online' : 'offline'}`}>
                                    {isOnline ? '연결됨' : '오프라인'}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {/* 실행 버튼 */}
                      <div className="suite-detail-actions">
                        {!suiteExecuting ? (
                          <button
                            className="btn-execute-suite"
                            onClick={handleExecuteSuite}
                          >
                            ▶ Suite 실행
                          </button>
                        ) : (
                          <div className="suite-action-buttons">
                            <button
                              className="btn-execute-suite executing"
                              disabled
                            >
                              ⏳ 실행 중...
                            </button>
                            <button
                              className="btn-stop-suite"
                              onClick={handleStopSuite}
                              disabled={suiteStopLoading}
                            >
                              {suiteStopLoading ? '⏳ 중단 중...' : '⏹ 중단'}
                            </button>
                          </div>
                        )}
                      </div>

                      {/* 실행 진행 상태 */}
                      {suiteExecuting && suiteProgress && (
                        <div className="suite-progress">
                          <div className="progress-header">
                            <span className="progress-spinner">⏳</span>
                            <span>실행 중: {suiteProgress.suiteName}</span>
                          </div>

                          <div className="progress-current">
                            <div className="progress-item">
                              <span className="progress-label">현재 디바이스</span>
                              <span className="progress-value">📱 {suiteProgress.currentDevice}</span>
                            </div>
                            <div className="progress-item">
                              <span className="progress-label">현재 시나리오</span>
                              <span className="progress-value">📋 {suiteProgress.currentScenario}</span>
                            </div>
                          </div>

                          <div className="progress-bar-section">
                            <div className="progress-bar-header">
                              <span>전체 진행률</span>
                              <span>{suiteProgress.overallProgress}%</span>
                            </div>
                            <div className="progress-bar">
                              <div
                                className="progress-fill"
                                style={{ width: `${suiteProgress.overallProgress}%` }}
                              />
                            </div>
                          </div>

                          <div className="progress-stats">
                            <span>
                              📱 {suiteProgress.deviceProgress.current}/{suiteProgress.deviceProgress.total}
                            </span>
                            <span>
                              📋 {suiteProgress.scenarioProgress.current}/{suiteProgress.scenarioProgress.total}
                            </span>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 실행 이력 탭 */}
        {activeTab === 'history' && (
          <TestReports
            socket={socket}
            initialReportId={initialReportId}
            onReportIdConsumed={onReportIdConsumed}
          />
        )}
      </div>
      </div>

      {/* 우측 사이드바: 통합 실행 현황 */}
      {userName && (
        <QueueSidebar
          socket={socket}
          userName={userName}
          selectedQueueId={selectedQueueId}
          onSelectTest={setSelectedQueueId}
          queueStatus={queueStatus}
          onQueueStatusChange={handleQueueStatusChange}
          deviceProgress={deviceProgress}
        />
      )}
    </div>
  );
}
