// frontend/src/components/EditorTestPanel/EditorTestPanel.tsx

import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { DeviceDetailedInfo, SessionInfo, ScenarioNode, ExecutionStatus, Package } from '../../types';
import { apiClient, API_BASE_URL } from '../../config/api';
import { useEditorPreview } from '../../contexts';
import './EditorTestPanel.css';

interface EditorTestPanelProps {
  devices: DeviceDetailedInfo[];
  sessions: SessionInfo[];
  nodes: ScenarioNode[];
  connections: Array<{ from: string; to: string; label?: string }>;
  onHighlightNode: (nodeId: string | null, status?: ExecutionStatus) => void;
  onRefreshDevices: () => void;
  // 패키지 관련 props
  packageId?: string;
  packages: Package[];
}

interface TestLog {
  timestamp: Date;
  nodeId?: string;
  nodeName?: string;
  status: 'info' | 'running' | 'passed' | 'failed' | 'warning';
  message: string;
}

interface VariableOverride {
  key: string;
  originalValue: string | number;
  overrideValue: string;
}

type TestMode = 'idle' | 'running' | 'stepping' | 'paused';

export default function EditorTestPanel({
  devices,
  sessions,
  nodes,
  connections,
  onHighlightNode,
  onRefreshDevices,
  packageId,
  packages,
}: EditorTestPanelProps) {
  // "여기서부터 실행" 기능
  const { startFromNodeId, setStartFromNodeId } = useEditorPreview();

  // 편집용 디바이스만 필터
  const editingDevices = devices.filter(d => d.role === 'editing' && d.status === 'connected');

  // 현재 선택된 패키지 정보
  const currentPackage = packageId ? packages.find(p => p.id === packageId) : undefined;
  const appPackage = currentPackage?.packageName;

  // 상태
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [testMode, setTestMode] = useState<TestMode>('idle');
  const [currentNodeIndex, setCurrentNodeIndex] = useState<number>(-1);
  const [logs, setLogs] = useState<TestLog[]>([]);
  const [variableOverrides, setVariableOverrides] = useState<VariableOverride[]>([]);
  const [showVariables, setShowVariables] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);

  // Refs
  const logsEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const executionAbortRef = useRef<boolean>(false);
  const stepResolverRef = useRef<(() => void) | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // 노드 실행 순서 계산
  const sortedNodes = useCallback(() => {
    if (nodes.length === 0) return [];

    // Start 노드 찾기
    const startNode = nodes.find(n => n.type === 'start');
    if (!startNode) return [];

    const visited = new Set<string>();
    const result: ScenarioNode[] = [];

    const traverse = (nodeId: string) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);

      const node = nodes.find(n => n.id === nodeId);
      if (!node) return;

      result.push(node);

      // 다음 노드 찾기
      const outConnections = connections.filter(c => c.from === nodeId);
      for (const conn of outConnections) {
        traverse(conn.to);
      }
    };

    traverse(startNode.id);
    return result;
  }, [nodes, connections]);

  // 로그 추가
  const addLog = useCallback((log: Omit<TestLog, 'timestamp'>) => {
    setLogs(prev => [...prev, { ...log, timestamp: new Date() }]);
  }, []);

  // 자동 스크롤
  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  // 선택된 디바이스의 세션 확인
  const hasSession = selectedDeviceId && sessions.some(s => s.deviceId === selectedDeviceId);

  // 세션 생성
  const handleCreateSession = async () => {
    if (!selectedDeviceId) return;

    try {
      addLog({ status: 'info', message: `세션 생성 중... (${selectedDeviceId})` });
      await apiClient.post(`${API_BASE_URL}/api/session/create`, { deviceId: selectedDeviceId });
      onRefreshDevices();
      addLog({ status: 'passed', message: '세션 생성 완료' });
    } catch (err) {
      const error = err as Error;
      addLog({ status: 'failed', message: `세션 생성 실패: ${error.message}` });
    }
  };

  // 단일 노드 실행
  const executeNode = async (node: ScenarioNode): Promise<boolean> => {
    if (executionAbortRef.current) return false;

    // Skip start/end nodes
    if (node.type === 'start' || node.type === 'end') {
      return true;
    }

    onHighlightNode(node.id, 'running');
    addLog({
      nodeId: node.id,
      nodeName: node.label || node.type,
      status: 'running',
      message: `실행 중: ${node.label || node.type}`,
    });

    try {
      // 변수 오버라이드 적용
      const params = { ...node.params };
      for (const override of variableOverrides) {
        if (params[override.key] !== undefined && override.overrideValue) {
          const originalType = typeof params[override.key];
          if (originalType === 'number') {
            params[override.key] = parseFloat(override.overrideValue) || params[override.key];
          } else {
            params[override.key] = override.overrideValue;
          }
        }
      }

      // AbortController 생성
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      // API 호출 (appPackage 전달, AbortController 사용)
      const response = await apiClient.post(`${API_BASE_URL}/api/test/execute-node`, {
        deviceId: selectedDeviceId,
        node: { ...node, params },
        appPackage,
      }, {
        signal: abortController.signal,
      });

      abortControllerRef.current = null;

      if (response.data.success) {
        onHighlightNode(node.id, 'passed');
        addLog({
          nodeId: node.id,
          nodeName: node.label || node.type,
          status: 'passed',
          message: `성공: ${node.label || node.type}`,
        });
        return true;
      } else {
        throw new Error(response.data.error || '실행 실패');
      }
    } catch (err) {
      // Abort된 경우
      if (axios.isCancel(err)) {
        addLog({
          nodeId: node.id,
          nodeName: node.label || node.type,
          status: 'warning',
          message: `중단됨: ${node.label || node.type}`,
        });
        return false;
      }

      const error = err as Error;
      onHighlightNode(node.id, 'failed');
      addLog({
        nodeId: node.id,
        nodeName: node.label || node.type,
        status: 'failed',
        message: `실패: ${error.message}`,
      });
      return false;
    }
  };

  // 전체 실행 (startIndex: 특정 노드부터 시작)
  const handleRunAll = async (startIndex: number = 0) => {
    if (!hasSession) {
      addLog({ status: 'warning', message: '먼저 세션을 생성하세요' });
      return;
    }

    const orderedNodes = sortedNodes();
    if (orderedNodes.length === 0) {
      addLog({ status: 'warning', message: '실행할 노드가 없습니다' });
      return;
    }

    // 유효한 시작 인덱스 확인
    const validStartIndex = Math.max(0, Math.min(startIndex, orderedNodes.length - 1));

    executionAbortRef.current = false;
    setTestMode('running');
    setCurrentNodeIndex(validStartIndex);

    if (validStartIndex > 0) {
      const startNodeName = orderedNodes[validStartIndex].label || orderedNodes[validStartIndex].type;
      addLog({ status: 'info', message: `=== 테스트 시작 (${startNodeName}부터) ===` });
    } else {
      addLog({ status: 'info', message: '=== 테스트 시작 ===' });
    }

    for (let i = validStartIndex; i < orderedNodes.length; i++) {
      if (executionAbortRef.current) {
        addLog({ status: 'warning', message: '테스트 중단됨' });
        break;
      }

      setCurrentNodeIndex(i);
      const success = await executeNode(orderedNodes[i]);

      if (!success && orderedNodes[i].type !== 'start' && orderedNodes[i].type !== 'end') {
        addLog({ status: 'failed', message: '=== 테스트 실패 ===' });
        setTestMode('idle');
        return;
      }
    }

    if (!executionAbortRef.current) {
      addLog({ status: 'passed', message: '=== 테스트 완료 ===' });
    }

    setTestMode('idle');
    setCurrentNodeIndex(-1);
    onHighlightNode(null);
  };

  // "여기서부터 실행" 트리거 처리
  useEffect(() => {
    if (!startFromNodeId) return;

    // 노드 순서에서 시작 노드의 인덱스 찾기
    const orderedNodes = sortedNodes();
    const startIndex = orderedNodes.findIndex(n => n.id === startFromNodeId);

    if (startIndex === -1) {
      addLog({ status: 'warning', message: '시작 노드를 찾을 수 없습니다' });
      setStartFromNodeId(null);
      return;
    }

    // 실행 시작
    handleRunAll(startIndex);

    // 사용 후 초기화
    setStartFromNodeId(null);
  }, [startFromNodeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 스텝 실행
  const handleStep = async () => {
    if (!hasSession) {
      addLog({ status: 'warning', message: '먼저 세션을 생성하세요' });
      return;
    }

    const orderedNodes = sortedNodes();
    if (orderedNodes.length === 0) {
      addLog({ status: 'warning', message: '실행할 노드가 없습니다' });
      return;
    }

    // 첫 스텝이면 초기화
    if (testMode === 'idle') {
      executionAbortRef.current = false;
      setTestMode('stepping');
      setCurrentNodeIndex(0);
      addLog({ status: 'info', message: '=== 스텝 실행 시작 ===' });

      // Start 노드는 스킵하고 다음으로
      if (orderedNodes[0].type === 'start') {
        await executeNode(orderedNodes[0]);
        setCurrentNodeIndex(1);
        if (orderedNodes.length > 1) {
          onHighlightNode(orderedNodes[1].id, 'pending');
          addLog({ status: 'info', message: `다음 노드: ${orderedNodes[1].label || orderedNodes[1].type}` });
        }
        return;
      }
    }

    // 현재 노드 실행
    const nextIndex = currentNodeIndex;
    if (nextIndex >= orderedNodes.length) {
      addLog({ status: 'passed', message: '=== 스텝 실행 완료 ===' });
      setTestMode('idle');
      setCurrentNodeIndex(-1);
      onHighlightNode(null);
      return;
    }

    const success = await executeNode(orderedNodes[nextIndex]);

    // 다음 노드로 이동
    const newIndex = nextIndex + 1;
    setCurrentNodeIndex(newIndex);

    if (newIndex < orderedNodes.length) {
      onHighlightNode(orderedNodes[newIndex].id, 'pending');
      addLog({ status: 'info', message: `다음 노드: ${orderedNodes[newIndex].label || orderedNodes[newIndex].type}` });
    } else {
      addLog({ status: 'passed', message: '=== 스텝 실행 완료 ===' });
      setTestMode('idle');
      setCurrentNodeIndex(-1);
      onHighlightNode(null);
    }

    if (!success && orderedNodes[nextIndex].type !== 'start' && orderedNodes[nextIndex].type !== 'end') {
      setTestMode('idle');
    }
  };

  // 중지
  const handleStop = async () => {
    executionAbortRef.current = true;

    // 1. 진행 중인 axios 요청 취소
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // 2. 백엔드에 중지 요청 (대기 중인 액션 중단)
    if (selectedDeviceId) {
      try {
        await apiClient.post(`${API_BASE_URL}/api/test/stop-editor-test`, {
          deviceId: selectedDeviceId,
        });
      } catch (err) {
        console.error('Stop request failed:', err);
      }
    }

    setTestMode('idle');
    setCurrentNodeIndex(-1);
    onHighlightNode(null);
    addLog({ status: 'warning', message: '테스트 중단됨' });
  };

  // 로그 초기화
  const clearLogs = () => {
    setLogs([]);
  };

  // 변수 오버라이드 초기화 (노드 파라미터에서 추출)
  useEffect(() => {
    const overridableParams: VariableOverride[] = [];
    const seenKeys = new Set<string>();

    for (const node of nodes) {
      if (node.params) {
        for (const [key, value] of Object.entries(node.params)) {
          // timeout, delay 등 수정 가능한 파라미터만
          if ((key.includes('timeout') || key.includes('delay') || key.includes('wait')) && !seenKeys.has(key)) {
            seenKeys.add(key);
            overridableParams.push({
              key,
              originalValue: value as string | number,
              overrideValue: '',
            });
          }
        }
      }
    }

    setVariableOverrides(overridableParams);
  }, [nodes]);

  // 변수 오버라이드 업데이트
  const updateOverride = (key: string, value: string) => {
    setVariableOverrides(prev =>
      prev.map(v => (v.key === key ? { ...v, overrideValue: value } : v)),
    );
  };

  return (
    <div className="editor-test-panel">
      <div className="test-panel-header">
        <h3>🧪 에디터 테스트</h3>
        <span className={`test-mode-badge ${testMode}`}>
          {testMode === 'idle' && '대기'}
          {testMode === 'running' && '실행 중'}
          {testMode === 'stepping' && '스텝 실행'}
          {testMode === 'paused' && '일시정지'}
        </span>
      </div>

      {/* 디바이스 선택 */}
      <div className="test-device-section">
        <label>편집용 디바이스</label>
        {editingDevices.length === 0 ? (
          <div className="no-editing-device">
            <span>편집용 디바이스가 없습니다</span>
            <small>디바이스 관리에서 역할을 '편집용'으로 변경하세요</small>
          </div>
        ) : (
          <div className="device-select-row">
            <select
              value={selectedDeviceId}
              onChange={(e) => setSelectedDeviceId(e.target.value)}
              disabled={testMode !== 'idle'}
            >
              <option value="">선택...</option>
              {editingDevices.map(d => (
                <option key={d.id} value={d.id}>
                  {d.alias || d.model} ({d.id})
                </option>
              ))}
            </select>
            {selectedDeviceId && (
              <div className="device-session-status">
                {!hasSession ? (
                  <button
                    className="btn-create-session"
                    onClick={handleCreateSession}
                    disabled={testMode !== 'idle'}
                  >
                    세션 연결
                  </button>
                ) : (
                  <span className="session-status">✅ 세션 활성</span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 패키지 정보 */}
      <div className="test-package-section">
        <label>패키지</label>
        {currentPackage ? (
          <div className="package-info">
            <span className="package-name">{currentPackage.name}</span>
            <span className="package-id">{currentPackage.packageName}</span>
          </div>
        ) : (
          <div className="no-package-warning">
            <span>⚠️ 패키지가 선택되지 않았습니다</span>
            <small>시나리오 편집 상단에서 패키지를 선택하세요</small>
          </div>
        )}
      </div>

      {/* 실행 컨트롤 */}
      <div className="test-controls">
        <button
          className="btn-run-all"
          onClick={handleRunAll}
          disabled={testMode === 'running' || !hasSession}
          title="전체 실행"
        >
          ▶ 전체 실행
        </button>
        <button
          className="btn-step"
          onClick={handleStep}
          disabled={testMode === 'running' || !hasSession}
          title="스텝 실행"
        >
          ⏭ 스텝
        </button>
        <button
          className="btn-stop"
          onClick={handleStop}
          disabled={testMode === 'idle'}
          title="중지"
        >
          ⏹ 중지
        </button>
      </div>

      {/* 변수 오버라이드 */}
      {variableOverrides.length > 0 && (
        <div className="variable-overrides">
          <button
            className="toggle-variables"
            onClick={() => setShowVariables(!showVariables)}
          >
            ⚙️ 변수 오버라이드 ({variableOverrides.filter(v => v.overrideValue).length}/{variableOverrides.length})
            <span className={`toggle-arrow ${showVariables ? 'open' : ''}`}>▼</span>
          </button>
          {showVariables && (
            <div className="variables-list">
              {variableOverrides.map(v => (
                <div key={v.key} className="variable-item">
                  <label>{v.key}</label>
                  <input
                    type="text"
                    placeholder={String(v.originalValue)}
                    value={v.overrideValue}
                    onChange={(e) => updateOverride(v.key, e.target.value)}
                    disabled={testMode !== 'idle'}
                  />
                  <span className="original-value">기본: {String(v.originalValue)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 실행 로그 */}
      <div className="test-logs">
        <div className="logs-header">
          <div className="logs-header-row">
            <span>실행 로그</span>
            <label className="auto-scroll-toggle">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
              />
              자동 스크롤
            </label>
          </div>
          <button className="btn-clear-logs" onClick={clearLogs}>
            🗑 초기화
          </button>
        </div>
        <div className="logs-content">
          {logs.length === 0 ? (
            <div className="no-logs">실행 로그가 없습니다</div>
          ) : (
            logs.map((log, idx) => (
              <div key={idx} className={`log-item ${log.status}`}>
                <span className="log-time">
                  {log.timestamp.toLocaleTimeString()}
                </span>
                <span className={`log-status ${log.status}`}>
                  {log.status === 'info' && 'ℹ️'}
                  {log.status === 'running' && '⏳'}
                  {log.status === 'passed' && '✅'}
                  {log.status === 'failed' && '❌'}
                  {log.status === 'warning' && '⚠️'}
                </span>
                <span className="log-message">{log.message}</span>
              </div>
            ))
          )}
          <div ref={logsEndRef} />
        </div>
      </div>
    </div>
  );
}
