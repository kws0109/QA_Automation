// frontend/src/components/ScenarioExecution/ScenarioExecution.tsx

import { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import {
  DeviceDetailedInfo,
  SessionInfo,
  ScenarioSummary,
  ParallelLog,
  ParallelExecutionResult,
} from '../../types';
import './ScenarioExecution.css';

const API_BASE = 'http://localhost:3001';

interface ScenarioExecutionProps {
  scenarios: ScenarioSummary[];
  parallelLogs: ParallelLog[];
  isParallelRunning: boolean;
  lastParallelResult: ParallelExecutionResult | null;
  onParallelRunningChange: (running: boolean) => void;
  onParallelComplete: (result: ParallelExecutionResult) => void;
}

export default function ScenarioExecution({
  scenarios,
  parallelLogs,
  isParallelRunning,
  lastParallelResult,
  onParallelRunningChange,
  onParallelComplete,
}: ScenarioExecutionProps) {
  const [devices, setDevices] = useState<DeviceDetailedInfo[]>([]);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // 디바이스 목록 조회
  const fetchDevices = useCallback(async () => {
    try {
      const res = await axios.get<{ success: boolean; devices: DeviceDetailedInfo[] }>(
        `${API_BASE}/api/device/list/detailed`
      );
      if (res.data.success) {
        setDevices(res.data.devices);
      }
    } catch (err) {
      console.error('디바이스 목록 조회 실패:', err);
    }
  }, []);

  // 세션 목록 조회
  const fetchSessions = useCallback(async () => {
    try {
      const res = await axios.get<{ success: boolean; sessions: SessionInfo[] }>(
        `${API_BASE}/api/session/list`
      );
      if (res.data.success) {
        setSessions(res.data.sessions);
      }
    } catch (err) {
      console.error('세션 목록 조회 실패:', err);
    }
  }, []);

  // 초기 로드
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchDevices(), fetchSessions()]);
      setLoading(false);
    };
    loadData();

    // 10초마다 갱신
    const interval = setInterval(() => {
      fetchDevices();
      fetchSessions();
    }, 10000);

    return () => clearInterval(interval);
  }, [fetchDevices, fetchSessions]);

  // 수동 새로고침
  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchDevices(), fetchSessions()]);
    setRefreshing(false);
  };

  // 세션 여부 확인
  const hasSession = (deviceId: string) => sessions.some(s => s.deviceId === deviceId);

  // 연결된 디바이스만 필터링
  const connectedDevices = useMemo(() => {
    return devices.filter(d => d.status === 'connected');
  }, [devices]);

  // 디바이스 선택 토글
  const toggleDeviceSelection = (deviceId: string) => {
    if (isParallelRunning) return;
    setSelectedDevices(prev =>
      prev.includes(deviceId)
        ? prev.filter(id => id !== deviceId)
        : [...prev, deviceId]
    );
  };

  // 전체 선택
  const selectAllDevices = () => {
    if (isParallelRunning) return;
    setSelectedDevices(connectedDevices.map(d => d.id));
  };

  // 전체 해제
  const deselectAllDevices = () => {
    if (isParallelRunning) return;
    setSelectedDevices([]);
  };

  // 병렬 실행
  const handleExecuteParallel = async () => {
    if (!selectedScenarioId || selectedDevices.length === 0) {
      alert('시나리오와 디바이스를 선택하세요.');
      return;
    }

    onParallelRunningChange(true);
    try {
      // 세션이 없는 디바이스들 자동 생성
      const devicesWithoutSession = selectedDevices.filter(id => !hasSession(id));
      if (devicesWithoutSession.length > 0) {
        console.log(`세션 자동 생성 중: ${devicesWithoutSession.length}개 디바이스`);
        await Promise.all(
          devicesWithoutSession.map(deviceId =>
            axios.post(`${API_BASE}/api/session/create`, { deviceId }).catch(err => {
              console.error(`세션 생성 실패 (${deviceId}):`, err);
              throw err;
            })
          )
        );
        await fetchSessions();
      }

      const res = await axios.post<{ success: boolean; result: ParallelExecutionResult }>(
        `${API_BASE}/api/session/execute-parallel`,
        { scenarioId: selectedScenarioId, deviceIds: selectedDevices }
      );
      if (res.data.success) {
        onParallelComplete(res.data.result);
      }
    } catch (err) {
      const error = err as Error;
      alert(`병렬 실행 실패: ${error.message}`);
    } finally {
      onParallelRunningChange(false);
      await fetchSessions();
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
            onClick={handleRefresh}
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
              onChange={e => setSelectedScenarioId(e.target.value)}
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
                <button onClick={selectAllDevices} disabled={isParallelRunning || connectedDevices.length === 0}>
                  전체 선택
                </button>
                <button onClick={deselectAllDevices} disabled={isParallelRunning || selectedDevices.length === 0}>
                  전체 해제
                </button>
                <span className="selected-count">
                  {selectedDevices.length}개 선택
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
                {connectedDevices.map(device => (
                  <div
                    key={device.id}
                    className={`device-item ${selectedDevices.includes(device.id) ? 'selected' : ''}`}
                    onClick={() => toggleDeviceSelection(device.id)}
                  >
                    <input
                      type="checkbox"
                      checked={selectedDevices.includes(device.id)}
                      onChange={() => toggleDeviceSelection(device.id)}
                      disabled={isParallelRunning}
                    />
                    <div className="device-info">
                      <span className="device-name">{getDeviceDisplayName(device)}</span>
                      <span className="device-detail">
                        {device.os} {device.osVersion} | {device.screenResolution}
                      </span>
                    </div>
                    <span className={`session-badge ${hasSession(device.id) ? 'active' : ''}`}>
                      {hasSession(device.id) ? '세션 활성' : '세션 없음'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 실행 버튼 */}
          <div className="execution-actions">
            {isParallelRunning ? (
              <button className="btn-stop" onClick={handleStopParallel}>
                실행 중지
              </button>
            ) : (
              <button
                className="btn-execute"
                onClick={handleExecuteParallel}
                disabled={!selectedScenarioId || selectedDevices.length === 0}
              >
                병렬 실행 시작
              </button>
            )}

            {isParallelRunning && (
              <div className="running-status">
                <div className="spinner" />
                <span>실행 중...</span>
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
