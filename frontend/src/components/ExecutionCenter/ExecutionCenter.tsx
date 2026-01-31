// frontend/src/components/ExecutionCenter/ExecutionCenter.tsx
// 통합 실행 센터: 시나리오 직접 선택 또는 저장된 묶음 사용을 통합

import { useState, useEffect, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import TestStatusBar from '../TestExecutionPanel/TestStatusBar';
import ScenarioSelector from '../TestExecutionPanel/ScenarioSelector';
import '../TestExecutionPanel/TestExecutionPanel.css';  // ScenarioSelector 스타일 포함
import { useQueueStatus } from '../../hooks/useQueueStatus';
import type {
  DeviceDetailedInfo,
  SessionInfo,
  ScenarioSummary,
  TestSuite,
  DeviceProgress,
  DeviceQueueStatus,
} from '../../types';
import { authFetch, apiClient, API_BASE_URL } from '../../config/api';
import './ExecutionCenter.css';

// 실행 소스 타입
type ExecutionSource = 'scenario' | 'suite';

interface ExecutionCenterProps {
  devices: DeviceDetailedInfo[];
  sessions: SessionInfo[];
  scenarios: ScenarioSummary[];
  socket: Socket | null;
  onSessionChange: () => void;
  userName?: string;
  slackUserId?: string;
  onNavigateToReport?: (reportId: string) => void;
}

export default function ExecutionCenter({
  devices,
  sessions,
  scenarios,
  socket,
  onSessionChange,
  userName = '',
  slackUserId = '',
  onNavigateToReport,
}: ExecutionCenterProps) {
  // useQueueStatus 훅 사용 (중앙 집중식 큐 상태 관리)
  const {
    queueStatus,
    executionLogs,
    cancellingIds,
    requestQueueStatus,
    handleCancel,
  } = useQueueStatus(socket);

  // 실행 소스 선택 (라디오 버튼)
  const [executionSource, setExecutionSource] = useState<ExecutionSource>('scenario');

  // 시나리오 직접 선택 시
  const [selectedScenarioIds, setSelectedScenarioIds] = useState<string[]>([]);

  // 묶음 선택 시
  const [suites, setSuites] = useState<TestSuite[]>([]);
  const [selectedSuiteId, setSelectedSuiteId] = useState<string | null>(null);
  const [suitesLoading, setSuitesLoading] = useState(true);

  // 디바이스 선택 (공통)
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);
  const [deviceSearchQuery, setDeviceSearchQuery] = useState('');

  // 실행 옵션
  const [repeatCount, setRepeatCount] = useState(1);
  const [scenarioInterval, setScenarioInterval] = useState(5);

  // 상태
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 디바이스 진행 상태 (별도 관리)
  const [deviceProgress, setDeviceProgress] = useState<Map<string, DeviceProgress>>(new Map());

  // Suite 목록 로드
  const loadSuites = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE_URL}/api/suites`);
      const data = await res.json();
      setSuites(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load suites:', err);
      setSuites([]);
    } finally {
      setSuitesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSuites();
  }, [loadSuites]);

  // 디바이스 진행 상태 소켓 이벤트
  useEffect(() => {
    if (!socket) return;

    // 디바이스 진행 상태
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

  // 묶음 선택 시 디바이스 자동 선택
  const selectedSuite = suites.find(s => s.id === selectedSuiteId);

  useEffect(() => {
    if (executionSource === 'suite' && selectedSuite) {
      // 묶음의 디바이스를 자동 선택 (연결된 디바이스만)
      const connectedDeviceIds = selectedSuite.deviceIds.filter(id => {
        const device = devices.find(d => d.id === id);
        return device?.status === 'connected';
      });
      setSelectedDeviceIds(connectedDeviceIds);
      // 시나리오도 자동 선택
      setSelectedScenarioIds(selectedSuite.scenarioIds);
    }
  }, [executionSource, selectedSuite, devices]);

  // 실행 소스 변경 시 선택 초기화
  const handleSourceChange = (source: ExecutionSource) => {
    setExecutionSource(source);
    if (source === 'scenario') {
      setSelectedSuiteId(null);
      setSelectedDeviceIds([]);
      setSelectedScenarioIds([]);
    }
  };

  // 테스트 실행
  const handleExecute = async () => {
    if (selectedDeviceIds.length === 0) {
      alert('테스트할 디바이스를 선택해주세요.');
      return;
    }

    if (selectedScenarioIds.length === 0) {
      alert('테스트할 시나리오를 선택해주세요.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (executionSource === 'suite' && selectedSuiteId) {
        // Suite 실행 API 사용 (반복 횟수, 시나리오 간격 적용)
        await apiClient.post(`/api/suites/${selectedSuiteId}/execute`, {
          userName: userName || 'anonymous',
          requesterSlackId: slackUserId || undefined,
          repeatCount,
          scenarioInterval: scenarioInterval * 1000,
        });
      } else {
        // 시나리오 직접 실행
        const request = {
          deviceIds: selectedDeviceIds,
          scenarioIds: selectedScenarioIds,
          repeatCount,
          scenarioInterval: scenarioInterval * 1000,
          userName: userName || 'anonymous',
          requesterSlackId: slackUserId || undefined,
        };
        await apiClient.post(`/api/test/execute`, request);
      }
    } catch (err) {
      const error = err as Error;
      alert(`테스트 실행에 실패했습니다: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 리포트 탐색 핸들러
  const handleNavigateToReport = useCallback((reportId: string, _type: 'scenario' | 'suite') => {
    onNavigateToReport?.(reportId);
  }, [onNavigateToReport]);

  // 디바이스 선택/해제 토글
  const toggleDevice = (deviceId: string) => {
    setSelectedDeviceIds(prev =>
      prev.includes(deviceId)
        ? prev.filter(id => id !== deviceId)
        : [...prev, deviceId]
    );
  };

  // 전체 선택/해제
  const toggleAllDevices = () => {
    const connectedDevices = devices.filter(d => d.status === 'connected');
    if (selectedDeviceIds.length === connectedDevices.length) {
      setSelectedDeviceIds([]);
    } else {
      setSelectedDeviceIds(connectedDevices.map(d => d.id));
    }
  };

  // 디바이스 상태 확인
  const getDeviceStatus = (deviceId: string): DeviceQueueStatus | undefined => {
    return queueStatus.deviceStatuses.find(s => s.deviceId === deviceId);
  };

  // 선택한 디바이스 중 바쁜 디바이스 수
  const busyCount = selectedDeviceIds.filter(id => {
    const status = getDeviceStatus(id);
    return status?.status === 'busy_other' || status?.status === 'busy_mine';
  }).length;

  // 실행 가능 여부
  const canExecute = selectedDeviceIds.length > 0 && selectedScenarioIds.length > 0;

  // 연결된 디바이스만 필터링
  const connectedDevices = devices.filter(d => d.status === 'connected');

  // 디바이스 검색 필터링
  const filteredDevices = connectedDevices.filter(device => {
    if (!deviceSearchQuery) return true;
    const query = deviceSearchQuery.toLowerCase();
    return (
      device.id.toLowerCase().includes(query) ||
      device.model?.toLowerCase().includes(query) ||
      device.alias?.toLowerCase().includes(query) ||
      device.name?.toLowerCase().includes(query)
    );
  });

  // 시나리오 정보 가져오기
  const getScenarioInfo = (scenarioId: string) => {
    return scenarios.find(s => s.id === scenarioId);
  };

  return (
    <div className="execution-center full-width">
      {/* 테스트 현황 상단 바 */}
      {userName && (
        <TestStatusBar
          socket={socket}
          userName={userName}
          queueStatus={queueStatus}
          executionLogs={executionLogs}
          cancellingIds={cancellingIds}
          deviceProgress={deviceProgress}
          onCancel={handleCancel}
          onRefresh={requestQueueStatus}
          onNavigateToReport={handleNavigateToReport}
        />
      )}

      {/* 메인 컨텐츠 */}
      <div className="execution-main-content">
        {/* 실행 소스 선택 */}
        <div className="source-selector">
          <span className="source-label">실행 소스</span>
          <div className="source-options">
            <label className={`source-option ${executionSource === 'scenario' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="executionSource"
                value="scenario"
                checked={executionSource === 'scenario'}
                onChange={() => handleSourceChange('scenario')}
              />
              <span className="option-icon">📋</span>
              <span className="option-text">시나리오 직접 선택</span>
            </label>
            <label className={`source-option ${executionSource === 'suite' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="executionSource"
                value="suite"
                checked={executionSource === 'suite'}
                onChange={() => handleSourceChange('suite')}
              />
              <span className="option-icon">📦</span>
              <span className="option-text">저장된 묶음 사용</span>
            </label>
          </div>
        </div>

        {/* 메인 레이아웃: 좌측(시나리오/묶음) + 우측(디바이스) */}
        <div className="execution-layout">
          {/* 좌측: 시나리오 또는 묶음 선택 */}
          <div className="left-panel">
            {executionSource === 'scenario' ? (
              <ScenarioSelector
                selectedScenarioIds={selectedScenarioIds}
                onSelectionChange={setSelectedScenarioIds}
                disabled={false}
              />
            ) : (
              <div className="suite-selector">
                <div className="panel-header-row">
                  <h3>📦 저장된 묶음</h3>
                  <button className="btn-refresh-small" onClick={loadSuites} title="새로고침">
                    🔄
                  </button>
                </div>
                {suitesLoading ? (
                  <div className="loading-state">불러오는 중...</div>
                ) : suites.length === 0 ? (
                  <div className="empty-state">
                    <p>등록된 묶음이 없습니다.</p>
                    <p className="hint">시나리오 묶음 탭에서 먼저 생성하세요.</p>
                  </div>
                ) : (
                  <div className="suite-list-unified">
                    {suites.map(suite => {
                      const isSelected = selectedSuiteId === suite.id;
                      const offlineCount = suite.deviceIds.filter(id => {
                        const device = devices.find(d => d.id === id);
                        return !device || device.status !== 'connected';
                      }).length;

                      return (
                        <div
                          key={suite.id}
                          className={`suite-item ${isSelected ? 'selected' : ''}`}
                          onClick={() => setSelectedSuiteId(suite.id)}
                        >
                          <div className="suite-item-main">
                            <span className="suite-name">{suite.name}</span>
                            {suite.description && (
                              <span className="suite-desc">{suite.description}</span>
                            )}
                          </div>
                          <div className="suite-item-meta">
                            <span className="meta-item" title="시나리오 수">📋 {suite.scenarioIds.length}</span>
                            <span className="meta-item" title="디바이스 수">📱 {suite.deviceIds.length}</span>
                            {offlineCount > 0 && (
                              <span className="meta-item warning" title={`${offlineCount}개 오프라인`}>
                                ⚠️ {offlineCount}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 선택된 묶음의 시나리오 목록 */}
                {selectedSuite && (
                  <div className="suite-scenarios-preview">
                    <h4>포함된 시나리오 ({selectedSuite.scenarioIds.length}개)</h4>
                    <div className="scenario-preview-list">
                      {selectedSuite.scenarioIds.map((scenarioId, index) => {
                        const scenario = getScenarioInfo(scenarioId);
                        return (
                          <div key={scenarioId} className="scenario-preview-item">
                            <span className="order-badge">{index + 1}</span>
                            <span className="scenario-name-text">
                              {scenario?.name || scenarioId}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 우측: 디바이스 선택 */}
          <div className="right-panel">
            <div className="device-selector-unified">
              <div className="panel-header-row">
                <h3>📱 디바이스 선택</h3>
                <div className="header-actions">
                  <span className="selection-count">
                    {selectedDeviceIds.length}/{connectedDevices.length} 선택
                  </span>
                  <button
                    className="btn-toggle-all"
                    onClick={toggleAllDevices}
                  >
                    {selectedDeviceIds.length === connectedDevices.length ? '전체 해제' : '전체 선택'}
                  </button>
                </div>
              </div>

              <div className="device-content">
                {/* 검색창 */}
                <div className="search-box">
                  <input
                    type="text"
                    placeholder="디바이스 검색..."
                    value={deviceSearchQuery}
                    onChange={e => setDeviceSearchQuery(e.target.value)}
                  />
                  {deviceSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setDeviceSearchQuery('')}
                      className="clear-btn"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {connectedDevices.length === 0 ? (
                  <div className="empty-state">
                    <p>연결된 디바이스가 없습니다.</p>
                    <p className="hint">디바이스 관리에서 세션을 시작하세요.</p>
                  </div>
                ) : filteredDevices.length === 0 ? (
                  <div className="empty-state">
                    <p>검색 결과가 없습니다.</p>
                  </div>
                ) : (
                  <div className="device-list-unified">
                    {filteredDevices.map(device => {
                      const isSelected = selectedDeviceIds.includes(device.id);
                      const deviceQueueStatus = getDeviceStatus(device.id);
                      const isBusy = deviceQueueStatus?.status === 'busy_other' || deviceQueueStatus?.status === 'busy_mine';
                      const isBusyByOther = deviceQueueStatus?.status === 'busy_other';
                      const isAvailable = device.sessionActive && !isBusyByOther;

                      return (
                        <div
                          key={device.id}
                          className={`device-item ${isSelected ? 'selected' : ''} ${!isAvailable ? 'unavailable' : ''}`}
                          onClick={() => toggleDevice(device.id)}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            className="device-checkbox"
                          />
                          <div className="device-info">
                            <span className="device-name-text">
                              {device.alias || device.model || device.id}
                            </span>
                            <div className="device-details">
                              <span className="device-manufacturer">
                                {device.manufacturer || device.brand || '-'}
                              </span>
                              <span className="device-os">
                                Android {device.osVersion}
                              </span>
                            </div>
                          </div>
                          <div className="device-status">
                            {!device.sessionActive ? (
                              <span className="status-badge offline">세션 없음</span>
                            ) : isBusyByOther ? (
                              <span className="status-badge busy">{deviceQueueStatus?.lockedBy}</span>
                            ) : isBusy ? (
                              <span className="status-badge mine">내 테스트</span>
                            ) : (
                              <span className="status-badge available">사용 가능</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 하단: 실행 옵션 및 실행 버튼 */}
        <div className="execution-footer">
          <div className="execution-options-row">
            <div className="option-group">
              <label>반복 횟수</label>
              <input
                type="number"
                min={1}
                max={10}
                value={repeatCount}
                onChange={(e) => setRepeatCount(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
              />
            </div>
            <div className="option-group">
              <label>시나리오 간격 (초)</label>
              <input
                type="number"
                min={0}
                max={60}
                value={scenarioInterval}
                onChange={(e) => setScenarioInterval(Math.max(0, Math.min(60, parseInt(e.target.value) || 0)))}
              />
            </div>
          </div>

          <div className="execution-summary">
            <div className="summary-item">
              <span className="summary-label">시나리오</span>
              <span className="summary-value">{selectedScenarioIds.length}개</span>
            </div>
            <span className="summary-multiply">×</span>
            <div className="summary-item">
              <span className="summary-label">디바이스</span>
              <span className="summary-value">{selectedDeviceIds.length}대</span>
            </div>
            <span className="summary-multiply">×</span>
            <div className="summary-item">
              <span className="summary-label">반복</span>
              <span className="summary-value">{repeatCount}회</span>
            </div>
            <span className="summary-equals">=</span>
            <div className="summary-item total">
              <span className="summary-label">총 실행</span>
              <span className="summary-value">
                {selectedScenarioIds.length * selectedDeviceIds.length * repeatCount}회
              </span>
            </div>
            {busyCount > 0 && (
              <div className="busy-warning">
                ⚠️ {busyCount}대 사용 중 (대기열에 추가됨)
              </div>
            )}
          </div>

          <button
            className="btn-execute-unified"
            onClick={handleExecute}
            disabled={!canExecute || isSubmitting}
          >
            {isSubmitting ? '제출 중...' : busyCount > 0 ? '▶ 테스트 실행 (일부 대기)' : '▶ 테스트 실행'}
          </button>
        </div>
      </div>
    </div>
  );
}
