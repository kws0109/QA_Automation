// frontend/src/components/ScenarioExecution/ScenarioExecution.tsx

import { useMemo } from 'react';
import axios from 'axios';
import {
  DeviceDetailedInfo,
  SessionInfo,
  ScenarioSummary,
  ParallelLog,
  ParallelExecutionResult,
} from '../../types';
import './ScenarioExecution.css';

const API_BASE = 'http://127.0.0.1:3001';

interface ScenarioExecutionProps {
  scenarios: ScenarioSummary[];
  parallelLogs: ParallelLog[];
  isParallelRunning: boolean;
  lastParallelResult: ParallelExecutionResult | null;
  onParallelRunningChange: (running: boolean) => void;
  onParallelComplete: (result: ParallelExecutionResult) => void;
  // 탭 전환 시에도 유지되는 상태
  selectedDevices: string[];
  onSelectedDevicesChange: (devices: string[]) => void;
  selectedScenarioId: string;
  onSelectedScenarioIdChange: (scenarioId: string) => void;
  // 공유 데이터 (App.tsx에서 전달)
  devices: DeviceDetailedInfo[];
  sessions: SessionInfo[];
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onSessionChange: () => void;
}

// 디바이스별 실행 상태
interface DeviceProgress {
  status: 'idle' | 'running' | 'success' | 'error';
  currentNode: string | null;
  currentNodeLabel: string | null;
  completedNodes: number;
  totalNodes: number;
  lastMessage: string | null;
}

export default function ScenarioExecution({
  scenarios,
  parallelLogs,
  isParallelRunning,
  lastParallelResult,
  onParallelRunningChange,
  onParallelComplete,
  selectedDevices,
  onSelectedDevicesChange,
  selectedScenarioId,
  onSelectedScenarioIdChange,
  devices,
  sessions,
  loading,
  refreshing,
  onRefresh,
  onSessionChange,
}: ScenarioExecutionProps) {

  // 세션 여부 확인
  const hasSession = (deviceId: string) => sessions.some(s => s.deviceId === deviceId);

  // 연결된 디바이스만 필터링
  const connectedDevices = useMemo(() => {
    return devices.filter(d => d.status === 'connected');
  }, [devices]);

  // 선택된 시나리오 정보
  const selectedScenario = useMemo(() => {
    return scenarios.find(s => s.id === selectedScenarioId);
  }, [scenarios, selectedScenarioId]);

  const selectedScenarioNodeCount = selectedScenario?.nodeCount || 0;

  // 디바이스별 진행 상태 계산
  const deviceProgressMap = useMemo(() => {
    const progressMap = new Map<string, DeviceProgress>();

    // 선택된 디바이스들의 초기 상태 설정
    selectedDevices.forEach(deviceId => {
      progressMap.set(deviceId, {
        status: 'idle',
        currentNode: null,
        currentNodeLabel: null,
        completedNodes: 0,
        totalNodes: selectedScenarioNodeCount,
        lastMessage: null,
      });
    });

    // 로그를 순회하며 상태 업데이트
    parallelLogs.forEach(log => {
      const progress = progressMap.get(log.deviceId);
      if (!progress) return;

      if (log.nodeId === 'scenario') {
        // 시나리오 시작/완료 이벤트
        if (log.status === 'start') {
          progress.status = 'running';
          progress.lastMessage = log.message;
        } else if (log.status === 'success') {
          progress.status = 'success';
          progress.currentNode = null;
          progress.currentNodeLabel = null;
          progress.lastMessage = log.message;
        } else if (log.status === 'error') {
          progress.status = 'error';
          progress.lastMessage = log.message;
        }
      } else {
        // 노드 실행 이벤트
        if (log.status === 'start') {
          progress.currentNode = log.nodeId;
          progress.currentNodeLabel = log.message;
          progress.status = 'running';
        } else if (log.status === 'success') {
          progress.completedNodes++;
          progress.lastMessage = log.message;
        } else if (log.status === 'error') {
          progress.status = 'error';
          progress.lastMessage = log.message;
        }
      }
    });

    // 실행 결과가 있으면 해당 디바이스 상태 강제 업데이트
    if (lastParallelResult) {
      lastParallelResult.results.forEach(result => {
        const progress = progressMap.get(result.deviceId);
        if (progress && progress.status === 'running') {
          // 아직 running 상태인데 결과가 있으면 완료된 것
          progress.status = result.success ? 'success' : 'error';
          progress.currentNode = null;
          progress.currentNodeLabel = null;
        }
      });
    }

    return progressMap;
  }, [parallelLogs, selectedDevices, selectedScenarioNodeCount, lastParallelResult]);

  // 실행 중인 디바이스 ID 목록
  const runningDeviceIds = useMemo(() => {
    const running: string[] = [];
    deviceProgressMap.forEach((progress, deviceId) => {
      if (progress.status === 'running') {
        running.push(deviceId);
      }
    });
    return running;
  }, [deviceProgressMap]);

  // 디바이스가 실행 중인지 확인
  const isDeviceRunning = (deviceId: string) => runningDeviceIds.includes(deviceId);

  // 선택된 디바이스 중 실행 가능한(실행 중이 아닌) 디바이스
  const executableSelectedDevices = useMemo(() => {
    return selectedDevices.filter(id => !isDeviceRunning(id));
  }, [selectedDevices, runningDeviceIds]);

  // 디바이스 선택 토글 (실행 중인 디바이스는 선택 해제만 가능)
  const toggleDeviceSelection = (deviceId: string) => {
    if (isDeviceRunning(deviceId)) return; // 실행 중인 디바이스는 선택 변경 불가
    onSelectedDevicesChange(
      selectedDevices.includes(deviceId)
        ? selectedDevices.filter(id => id !== deviceId)
        : [...selectedDevices, deviceId],
    );
  };

  // 전체 선택 (실행 중이 아닌 디바이스만)
  const selectAllDevices = () => {
    const availableDevices = connectedDevices
      .filter(d => !isDeviceRunning(d.id))
      .map(d => d.id);
    // 기존 실행 중인 선택 유지 + 새로 선택
    const newSelection = [...new Set([...selectedDevices.filter(id => isDeviceRunning(id)), ...availableDevices])];
    onSelectedDevicesChange(newSelection);
  };

  // 전체 해제 (실행 중인 디바이스는 유지)
  const deselectAllDevices = () => {
    onSelectedDevicesChange(selectedDevices.filter(id => isDeviceRunning(id)));
  };

  // 병렬 실행 (실행 가능한 디바이스만)
  const handleExecuteParallel = async () => {
    if (!selectedScenarioId || executableSelectedDevices.length === 0) {
      alert('시나리오와 실행 가능한 디바이스를 선택하세요.');
      return;
    }

    onParallelRunningChange(true);
    try {
      // 실행 가능한 디바이스 중 세션이 없는 것들 자동 생성
      const devicesWithoutSession = executableSelectedDevices.filter(id => !hasSession(id));
      if (devicesWithoutSession.length > 0) {
        console.log(`세션 자동 생성 중: ${devicesWithoutSession.length}개 디바이스`);
        await Promise.all(
          devicesWithoutSession.map(deviceId =>
            axios.post(`${API_BASE}/api/session/create`, { deviceId }).catch(err => {
              console.error(`세션 생성 실패 (${deviceId}):`, err);
              throw err;
            }),
          ),
        );
        onSessionChange();
      }

      const res = await axios.post<{ success: boolean; result: ParallelExecutionResult }>(
        `${API_BASE}/api/session/execute-parallel`,
        { scenarioId: selectedScenarioId, deviceIds: executableSelectedDevices },
      );
      if (res.data.success) {
        onParallelComplete(res.data.result);
      }
    } catch (err) {
      const error = err as Error;
      alert(`병렬 실행 실패: ${error.message}`);
    } finally {
      onParallelRunningChange(false);
      onSessionChange();
    }
  };

  // 병렬 실행 중지
  const handleStopParallel = async () => {
    try {
      await axios.post(`${API_BASE}/api/session/parallel/stop-all`);
    } catch (err) {
      console.error('실행 중지 실패:', err);
    }
  };

  // 디바이스 표시명
  const getDeviceDisplayName = (device: DeviceDetailedInfo) => {
    return device.alias || `${device.brand} ${device.model}`;
  };

  if (loading) {
    return (
      <div className="scenario-execution">
        <div className="execution-loading">
          <div className="spinner-large" />
          <p>로딩 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="scenario-execution">
      {/* 헤더 */}
      <div className="execution-header">
        <div className="header-left">
          <h2>시나리오 실행</h2>
          <span className="device-count">
            {connectedDevices.length}개 디바이스 사용 가능
          </span>
        </div>
        <div className="header-right">
          <button
            className="btn-refresh"
            onClick={onRefresh}
            disabled={refreshing}
          >
            {refreshing ? '갱신 중...' : '새로고침'}
          </button>
        </div>
      </div>

      <div className="execution-content">
        {/* 왼쪽: 설정 패널 */}
        <div className="setup-panel">
          {/* 시나리오 선택 */}
          <div className="setup-section">
            <h3>시나리오 선택</h3>
            <select
              value={selectedScenarioId}
              onChange={e => onSelectedScenarioIdChange(e.target.value)}
              disabled={isParallelRunning}
              className="scenario-select"
            >
              <option value="">-- 시나리오 선택 --</option>
              {scenarios.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.nodeCount} nodes)
                </option>
              ))}
            </select>
          </div>

          {/* 디바이스 선택 */}
          <div className="setup-section">
            <div className="section-header">
              <h3>디바이스 선택</h3>
              <div className="selection-controls">
                <button
                  onClick={selectAllDevices}
                  disabled={connectedDevices.filter(d => !isDeviceRunning(d.id)).length === 0}
                >
                  전체 선택
                </button>
                <button
                  onClick={deselectAllDevices}
                  disabled={executableSelectedDevices.length === 0}
                >
                  전체 해제
                </button>
                <span className="selected-count">
                  {selectedDevices.length}개 선택
                  {runningDeviceIds.length > 0 && ` (${runningDeviceIds.length}개 실행 중)`}
                </span>
              </div>
            </div>

            {connectedDevices.length === 0 ? (
              <div className="no-devices">
                <p>연결된 디바이스가 없습니다.</p>
                <small>ADB로 디바이스를 연결하세요.</small>
              </div>
            ) : (
              <div className="device-list">
                {connectedDevices.map(device => {
                  const progress = deviceProgressMap.get(device.id);
                  const isSelected = selectedDevices.includes(device.id);
                  const progressPercent = progress && progress.totalNodes > 0
                    ? Math.round((progress.completedNodes / progress.totalNodes) * 100)
                    : 0;

                  return (
                    <div
                      key={device.id}
                      className={`device-item ${isSelected ? 'selected' : ''} ${progress?.status || ''}`}
                      onClick={() => toggleDeviceSelection(device.id)}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleDeviceSelection(device.id)}
                        disabled={isDeviceRunning(device.id)}
                      />
                      <div className="device-info">
                        <div className="device-header">
                          <span className="device-name">{getDeviceDisplayName(device)}</span>
                          {!isParallelRunning && (
                            <span className={`session-badge ${hasSession(device.id) ? 'active' : ''}`}>
                              {hasSession(device.id) ? '세션 활성' : '세션 없음'}
                            </span>
                          )}
                          {isParallelRunning && progress && (
                            <span className={`status-badge ${progress.status}`}>
                              {progress.status === 'idle' && '대기'}
                              {progress.status === 'running' && '실행 중'}
                              {progress.status === 'success' && '완료'}
                              {progress.status === 'error' && '실패'}
                            </span>
                          )}
                        </div>
                        <span className="device-detail">
                          {device.os} {device.osVersion} | {device.screenResolution}
                        </span>

                        {/* 실행 중일 때 진행 상태 표시 */}
                        {isParallelRunning && isSelected && progress && progress.status !== 'idle' && (
                          <div className="device-progress">
                            {/* 실행 중인 시나리오 이름 */}
                            {selectedScenario && (
                              <div className="scenario-name">
                                {selectedScenario.name}
                              </div>
                            )}
                            {/* 진행률 바 */}
                            <div className="progress-bar-container">
                              <div
                                className={`progress-bar ${progress.status}`}
                                style={{ width: `${progressPercent}%` }}
                              />
                            </div>
                            <span className="progress-text">
                              {progress.completedNodes}/{progress.totalNodes} ({progressPercent}%)
                            </span>
                            {/* 현재 실행 중인 노드 */}
                            {progress.currentNodeLabel && progress.status === 'running' && (
                              <div className="current-node">
                                {progress.currentNodeLabel}
                              </div>
                            )}
                          </div>
                        )}

                        {/* 완료/실패 후 결과 메시지 */}
                        {!isParallelRunning && isSelected && progress && progress.status !== 'idle' && (
                          <div className="device-result">
                            <span className={`result-badge ${progress.status}`}>
                              {progress.status === 'success' && `완료 (${progress.completedNodes}/${progress.totalNodes})`}
                              {progress.status === 'error' && '실패'}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 실행 버튼 */}
          <div className="execution-actions">
            {/* 실행 가능한 디바이스가 있으면 실행 버튼 표시 */}
            <button
              className="btn-execute"
              onClick={handleExecuteParallel}
              disabled={!selectedScenarioId || executableSelectedDevices.length === 0}
            >
              {executableSelectedDevices.length > 0
                ? `${executableSelectedDevices.length}개 디바이스 실행`
                : '실행할 디바이스 선택'}
            </button>

            {/* 실행 중인 디바이스가 있으면 중지 버튼 표시 */}
            {runningDeviceIds.length > 0 && (
              <button className="btn-stop" onClick={handleStopParallel}>
                실행 중지 ({runningDeviceIds.length}개)
              </button>
            )}

            {runningDeviceIds.length > 0 && (
              <div className="running-status">
                <div className="spinner" />
                <span>{runningDeviceIds.length}개 디바이스 실행 중...</span>
              </div>
            )}
          </div>
        </div>

        {/* 오른쪽: 결과/로그 패널 */}
        <div className="result-panel">
          {/* 실행 결과 */}
          {lastParallelResult && !isParallelRunning && (
            <div className="execution-result">
              <h3>실행 결과</h3>
              <div className="result-summary">
                <span>총 소요시간: {(lastParallelResult.totalDuration / 1000).toFixed(2)}초</span>
                <span className="success">성공: {lastParallelResult.results.filter(r => r.success).length}</span>
                <span className="error">실패: {lastParallelResult.results.filter(r => !r.success).length}</span>
              </div>
              <div className="result-details">
                {lastParallelResult.results.map(r => {
                  const device = devices.find(d => d.id === r.deviceId);
                  const deviceLabel = device ? getDeviceDisplayName(device) : r.deviceId;
                  return (
                    <div key={r.deviceId} className={`result-item ${r.success ? 'success' : 'error'}`}>
                      <div className="result-header">
                        <span className="result-device">{deviceLabel}</span>
                        <span className="result-status">{r.success ? '성공' : '실패'}</span>
                        <span className="result-duration">{(r.duration / 1000).toFixed(2)}s</span>
                      </div>
                      {r.error && <div className="result-error">{r.error}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 실시간 로그 */}
          <div className="execution-logs">
            <h3>실행 로그</h3>
            {parallelLogs.length === 0 ? (
              <div className="no-logs">
                <p>실행 로그가 없습니다.</p>
                <small>시나리오를 실행하면 로그가 표시됩니다.</small>
              </div>
            ) : (
              <div className="logs-list">
                {parallelLogs.slice(-100).map((log, i) => {
                  const device = devices.find(d => d.id === log.deviceId);
                  const deviceLabel = device ? getDeviceDisplayName(device) : log.deviceId.slice(0, 12);
                  return (
                    <div key={i} className={`log-item ${log.status}`}>
                      <span className="log-time">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                      <span className="log-device">[{deviceLabel}]</span>
                      <span className="log-message">{log.message}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
