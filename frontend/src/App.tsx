// frontend/src/App.tsx

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import axios from 'axios';
import { io, Socket } from 'socket.io-client';

import Header from './components/Header/Header';
import Sidebar from './components/Sidebar/Sidebar';
import Canvas from './components/Canvas/Canvas';
import Panel from './components/Panel/Panel';
import DevicePreview from './components/DevicePreview/DevicePreview';
import ScenarioLoadModal from './components/ScenarioLoadModal/ScenarioLoadModal';
import ScenarioSaveModal from './components/ScenarioSaveModal/ScenarioSaveModal';
import TemplateModal from './components/TemplateModal/TemplateModal';
import PackageModal from './components/PackageModal/PackageModal';
// 디바이스 관리 대시보드
import DeviceDashboard from './components/DeviceDashboard';
import ScenarioExecution from './components/ScenarioExecution';
import ParallelReports from './components/ParallelReports';
import ScheduleManager from './components/ScheduleManager/ScheduleManager';
import type { ImageTemplate, ScenarioSummary, ParallelLog, ParallelExecutionResult, DeviceDetailedInfo, SessionInfo, DeviceExecutionStatus, Package } from './types';

// 탭 타입
type AppTab = 'scenario' | 'devices' | 'execution' | 'reports' | 'schedules';

import type {
  FlowNode,
  Connection,
  Scenario,
  NodeType,
  DeviceElement,
} from './types';

import './App.css';

const API_BASE = 'http://localhost:3001';

function App() {
  const socketRef = useRef<Socket | null>(null);
  const [isSocketConnected, setIsSocketConnected] = useState<boolean>(false);
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedConnectionIndex, setSelectedConnectionIndex] = useState<number | null>(null);
  const [isLoadModalOpen, setIsLoadModalOpen] = useState<boolean>(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState<boolean>(false);
  const [currentScenarioId, setCurrentScenarioId] = useState<string | null>(null);
  const [currentScenarioName, setCurrentScenarioName] = useState<string>('');
  // 템플릿 모달
  const [showTemplateModal, setShowTemplateModal] = useState<boolean>(false);
  const [templates, setTemplates] = useState<ImageTemplate[]>([]);

  // 현재 작업 중인 패키지 (시나리오 편집 컨텍스트)
  const [selectedPackageId, setSelectedPackageId] = useState<string>('');
  const [packages, setPackages] = useState<Package[]>([]);
  const [isPackageModalOpen, setIsPackageModalOpen] = useState<boolean>(false);

  // 탭 상태
  const [activeTab, setActiveTab] = useState<AppTab>('scenario');

  // 탭 전환 시 시나리오 목록 갱신
  useEffect(() => {
    if (activeTab === 'execution') {
      fetchScenarios();
    }
  }, [activeTab]);

  // 병렬 실행 관련 상태
  const [isParallelRunning, setIsParallelRunning] = useState<boolean>(false);
  const [parallelLogs, setParallelLogs] = useState<ParallelLog[]>([]);
  const [lastParallelResult, setLastParallelResult] = useState<ParallelExecutionResult | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioSummary[]>([]);
  // 디바이스별 실행 중인 시나리오 정보 추적
  const [runningScenarioByDevice, setRunningScenarioByDevice] = useState<Map<string, { scenarioId: string; scenarioName: string }>>(new Map());

  // 시나리오 실행 탭 상태 (탭 전환 시에도 유지)
  const [executionSelectedDevices, setExecutionSelectedDevices] = useState<string[]>([]);
  const [executionSelectedScenarioId, setExecutionSelectedScenarioId] = useState<string>('');

  // 공유 데이터: devices, sessions (탭 간 공유)
  const [devices, setDevices] = useState<DeviceDetailedInfo[]>([]);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(true);
  const [devicesRefreshing, setDevicesRefreshing] = useState(false);

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

  // 디바이스/세션 수동 새로고침
  const handleRefreshDevices = useCallback(async () => {
    setDevicesRefreshing(true);
    await Promise.all([fetchDevices(), fetchSessions()]);
    setDevicesRefreshing(false);
  }, [fetchDevices, fetchSessions]);

  // 디바이스/세션 초기 로드 및 폴링
  useEffect(() => {
    const loadData = async () => {
      setDevicesLoading(true);
      await Promise.all([fetchDevices(), fetchSessions()]);
      setDevicesLoading(false);
    };
    loadData();

    // 10초마다 갱신
    const interval = setInterval(() => {
      fetchDevices();
      fetchSessions();
    }, 10000);

    return () => clearInterval(interval);
  }, [fetchDevices, fetchSessions]);

  // WebSocket 연결
  useEffect(() => {
    const newSocket = io(API_BASE);
    socketRef.current = newSocket;

    newSocket.on('connect', () => {
      console.log('✅ WebSocket 연결됨');
      setIsSocketConnected(true);
    });

    newSocket.on('disconnect', () => {
      console.log('❌ WebSocket 연결 해제');
      setIsSocketConnected(false);
    });

    // 병렬 실행 이벤트
    newSocket.on('parallel:start', (data: { scenarioId: string; scenarioName: string; deviceIds: string[] }) => {
      console.log('[Parallel] 시작:', data);
      setIsParallelRunning(true);
      setParallelLogs([]);
      setLastParallelResult(null);
    });

    newSocket.on('parallel:complete', (data: { scenarioId: string; results: { deviceId: string; success: boolean; duration: number; error?: string }[] }) => {
      console.log('[Parallel] 완료:', data);
      setIsParallelRunning(false);
    });

    newSocket.on('device:scenario:start', (data: { deviceId: string; scenarioId: string; scenarioName: string }) => {
      const log: ParallelLog = {
        deviceId: data.deviceId,
        timestamp: new Date().toISOString(),
        nodeId: 'scenario',
        status: 'start',
        message: `시나리오 시작: ${data.scenarioName}`,
      };
      setParallelLogs(prev => [...prev, log]);
      // 디바이스별 실행 중인 시나리오 정보 저장
      setRunningScenarioByDevice(prev => new Map(prev).set(data.deviceId, {
        scenarioId: data.scenarioId,
        scenarioName: data.scenarioName,
      }));
    });

    newSocket.on('device:scenario:complete', (data: { deviceId: string; status: string; duration: number; error?: string }) => {
      const log: ParallelLog = {
        deviceId: data.deviceId,
        timestamp: new Date().toISOString(),
        nodeId: 'scenario',
        status: data.status === 'success' ? 'success' : 'error',
        message: data.status === 'success'
          ? `시나리오 완료 (${(data.duration / 1000).toFixed(2)}초)`
          : `시나리오 실패: ${data.error}`,
      };
      setParallelLogs(prev => [...prev, log]);
      // 완료된 디바이스는 실행 목록에서 제거
      setRunningScenarioByDevice(prev => {
        const newMap = new Map(prev);
        newMap.delete(data.deviceId);
        return newMap;
      });
    });

    newSocket.on('device:node', (data: { deviceId: string; nodeId: string; status: string; message: string }) => {
      const log: ParallelLog = {
        deviceId: data.deviceId,
        timestamp: new Date().toISOString(),
        nodeId: data.nodeId,
        status: data.status as 'start' | 'success' | 'error' | 'skip',
        message: data.message,
      };
      setParallelLogs(prev => [...prev, log]);
    });

    return () => {
      newSocket.close();
    };
  }, []);


  // 패키지 목록 로드
  const fetchPackages = async () => {
    try {
      const res = await axios.get<{ data: Package[] }>(`${API_BASE}/api/packages`);
      setPackages(res.data.data || []);
    } catch (err) {
      console.error('패키지 목록 조회 실패:', err);
    }
  };

  // 초기 로드 시 템플릿 목록도 불러오기
  useEffect(() => {
    fetchPackages();
    fetchTemplates();
    fetchScenarios();
  }, []);

  // 시나리오 목록 로드
  const fetchScenarios = async () => {
    try {
      const res = await axios.get<{ success: boolean; data: ScenarioSummary[] }>(
        `${API_BASE}/api/scenarios`
      );
      if (res.data.success) {
        setScenarios(res.data.data || []);
      }
    } catch (err) {
      console.error('시나리오 목록 조회 실패:', err);
    }
  };

  // 템플릿 모달 열기 이벤트 리스너
  useEffect(() => {
    const handleOpenTemplateModal = () => {
      setShowTemplateModal(true);
    };

    window.addEventListener('openTemplateModal', handleOpenTemplateModal);
    return () => {
      window.removeEventListener('openTemplateModal', handleOpenTemplateModal);
    };
  }, []);

  // 노드 삭제
  const handleNodeDelete = useCallback((nodeId: string) => {
    if (!nodeId) return;
    
    setNodes(prev => prev.filter(node => node.id !== nodeId));
    setConnections(prev => prev.filter(
      conn => conn.from !== nodeId && conn.to !== nodeId,
    ));
    setSelectedNodeId(prev => prev === nodeId ? null : prev);
  }, []);

  // 연결선 삭제
  const handleConnectionDelete = useCallback((index: number) => {
    setConnections(prev => prev.filter((_, i) => i !== index));
    setSelectedConnectionIndex(null);
  }, []);

  // 키보드 이벤트
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }
      
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        
        if (selectedNodeId) {
          handleNodeDelete(selectedNodeId);
        } else if (selectedConnectionIndex !== null) {
          handleConnectionDelete(selectedConnectionIndex);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNodeId, selectedConnectionIndex, handleNodeDelete, handleConnectionDelete]);


  // 불러오기 모달 열기
  const handleLoadClick = () => {
    setIsLoadModalOpen(true);
  };

  // 저장 모달 열기
  const handleSaveClick = () => {
    setIsSaveModalOpen(true);
  };

  // 시나리오 불러오기
  const handleScenarioLoad = (scenario: Scenario) => {
    setNodes(scenario.nodes || []);
    setConnections(scenario.connections || []);
    setCurrentScenarioId(scenario.id || null);
    setCurrentScenarioName(scenario.name || '');
    // 패키지도 설정
    if (scenario.packageId) {
      setSelectedPackageId(scenario.packageId);
    }
  };

  // 새 시나리오 만들기
  const handleNewScenario = () => {
    if (nodes.length > 0 && !window.confirm('현재 작업을 지우고 새 시나리오를 만드시겠습니까?')) {
      return;
    }
    setNodes([]);
    setConnections([]);
    setCurrentScenarioId(null);
    setCurrentScenarioName('');
    setSelectedNodeId(null);
    setSelectedConnectionIndex(null);
  };

  // 시나리오 저장 (덮어쓰기)
  const handleSaveScenario = async () => {
    if (!currentScenarioId) {
      // 새 시나리오인 경우 저장 모달 열기
      setIsSaveModalOpen(true);
      return;
    }

    // 기존 시나리오 덮어쓰기 확인
    if (!window.confirm(`"${currentScenarioName}" 시나리오를 덮어쓰시겠습니까?`)) {
      return;
    }

    try {
      await axios.put(`${API_BASE}/api/scenarios/${currentScenarioId}`, {
        name: currentScenarioName,
        nodes,
        connections,
      });
      alert('저장되었습니다!');
    } catch (err) {
      const error = err as { response?: { data?: { message?: string } } };
      alert('저장 실패: ' + (error.response?.data?.message || '알 수 없는 에러'));
    }
  };

  // 저장 완료 후 콜백
  const handleSaveComplete = (scenarioId: string, scenarioName: string, packageId: string) => {
    setCurrentScenarioId(scenarioId);
    setCurrentScenarioName(scenarioName);
    setSelectedPackageId(packageId);
    fetchScenarios();
  };

  // 노드 추가
  const handleNodeAdd = (type: NodeType, x: number, y: number) => {
    const newNode: FlowNode = {
      id: `node_${Date.now()}`,
      type,
      x,
      y,
      params: type === 'action' ? { actionType: '' } : {},
    };
    setNodes(prev => [...prev, newNode]);
  };

  // 연결선 추가
  const handleConnectionAdd = (fromId: string, toId: string, branch: string | null = null) => {
    setConnections(prev => [...prev, { from: fromId, to: toId, label: branch || undefined }]);
  };

  // 노드 선택
  const handleNodeSelect = (nodeId: string | null) => {
    setSelectedNodeId(nodeId);
  };

  // 연결선 선택
  const handleConnectionSelect = (index: number | null) => {
    setSelectedConnectionIndex(index);
  };

  // 노드 이동
  const handleNodeMove = (nodeId: string, x: number, y: number) => {
    setNodes(prev => prev.map(node => 
      node.id === nodeId ? { ...node, x, y } : node,
    ));
  };

  // 노드 업데이트
  const handleNodeUpdate = (nodeId: string, updates: Partial<FlowNode>) => {
    setNodes(prev => prev.map(node =>
      node.id === nodeId ? { ...node, ...updates } : node,
    ));
  };

  // DevicePreview에서 좌표 선택
  const handlePreviewCoordinate = (x: number, y: number) => {
    if (!selectedNodeId) {
      alert('먼저 노드를 선택하세요.');
      return;
    }
    
    const node = nodes.find(n => n.id === selectedNodeId);
    if (node?.type !== 'action') {
      alert('액션 노드를 선택하세요.');
      return;
    }

    const updatedParams = {
      ...node.params,
      x,
      y,
    };
    handleNodeUpdate(selectedNodeId, { params: updatedParams });
  };

  // DevicePreview에서 요소 선택
  const handlePreviewElement = (element: DeviceElement) => {
    if (!selectedNodeId) {
      alert('먼저 노드를 선택하세요.');
      return;
    }
    
    const node = nodes.find(n => n.id === selectedNodeId);
    if (node?.type !== 'action' && node?.type !== 'condition') {
      alert('액션 또는 조건 노드를 선택하세요.');
      return;
    }

    const updatedParams = { ...node.params };
    
    if (element.resourceId) {
      updatedParams.selectorType = 'id';
      updatedParams.selector = element.resourceId;
    } else if (element.text) {
      updatedParams.selectorType = 'text';
      updatedParams.selector = element.text;
    } else if (element.contentDesc) {
      updatedParams.selectorType = 'accessibility id';
      updatedParams.selector = element.contentDesc;
    }

    handleNodeUpdate(selectedNodeId, { params: updatedParams });
  };

  const selectedNode = nodes.find(n => n.id === selectedNodeId);

  // 디바이스별 실행 상태 계산 (최적화: useMemo 사용)
  const deviceExecutionStatus = useMemo(() => {
    const statusMap = new Map<string, DeviceExecutionStatus>();

    // 실행 중인 디바이스만 처리
    runningScenarioByDevice.forEach((scenarioInfo, deviceId) => {
      // 시나리오의 총 노드 수 조회
      const scenario = scenarios.find(s => s.id === scenarioInfo.scenarioId);
      const totalSteps = scenario?.nodeCount || 0;

      // 해당 디바이스의 완료된 노드 수 계산 (success 상태인 고유 노드 ID 카운트)
      const completedNodes = new Set<string>();
      let latestLog: ParallelLog | undefined;

      for (let i = 0; i < parallelLogs.length; i++) {
        const log = parallelLogs[i];
        if (log.deviceId === deviceId) {
          // 'scenario' nodeId는 제외 (시나리오 시작/완료 로그)
          if (log.nodeId !== 'scenario' && (log.status === 'success' || log.status === 'error')) {
            completedNodes.add(log.nodeId);
          }
          latestLog = log;
        }
      }

      if (latestLog) {
        statusMap.set(deviceId, {
          scenarioName: scenarioInfo.scenarioName,
          currentNodeId: latestLog.nodeId,
          status: latestLog.status === 'start' ? 'running' : latestLog.status as 'running' | 'waiting' | 'success' | 'error',
          message: latestLog.message,
          currentStep: completedNodes.size,
          totalSteps,
        });
      }
    });

    return statusMap;
  }, [parallelLogs, runningScenarioByDevice, scenarios]);

  // 템플릿 목록 로드 (패키지별)
  const fetchTemplates = async (packageId?: string) => {
    try {
      const pkgId = packageId ?? selectedPackageId;
      const url = pkgId
        ? `${API_BASE}/api/image/templates?packageId=${pkgId}`
        : `${API_BASE}/api/image/templates`;
      const res = await axios.get<{ data: ImageTemplate[] }>(url);
      setTemplates(res.data.data || []);
    } catch (err) {
      console.error('템플릿 목록 조회 실패:', err);
    }
  };

  // 패키지 변경 시 템플릿 목록 갱신
  useEffect(() => {
    if (selectedPackageId) {
      fetchTemplates(selectedPackageId);
    }
  }, [selectedPackageId]);

  // 템플릿 선택 시 현재 노드에 적용
  const handleTemplateSelect = (template: ImageTemplate) => {
    if (selectedNodeId) {
      const node = nodes.find(n => n.id === selectedNodeId);
      if (node) {
        handleNodeUpdate(selectedNodeId, {
          params: {
            ...node.params,
            templateId: template.id,
            templateName: template.name,
          },
        });
      }
    }
    setShowTemplateModal(false);
    fetchTemplates(); // 목록 갱신
  };

  // 병렬 실행 완료 핸들러
  const handleParallelExecutionComplete = (result: ParallelExecutionResult) => {
    setLastParallelResult(result);
    setIsParallelRunning(false);
  };

  return (
    <div className="app">
      <Header isSocketConnected={isSocketConnected} />

      {/* 탭 네비게이션 */}
      <div className="app-tabs">
        <button
          className={`tab-btn ${activeTab === 'scenario' ? 'active' : ''}`}
          onClick={() => setActiveTab('scenario')}
        >
          시나리오 편집
        </button>
        <button
          className={`tab-btn ${activeTab === 'devices' ? 'active' : ''}`}
          onClick={() => setActiveTab('devices')}
        >
          디바이스 관리
        </button>
        <button
          className={`tab-btn ${activeTab === 'execution' ? 'active' : ''}`}
          onClick={() => setActiveTab('execution')}
        >
          시나리오 실행
          {isParallelRunning && <span className="tab-badge">실행중</span>}
        </button>
        <button
          className={`tab-btn ${activeTab === 'reports' ? 'active' : ''}`}
          onClick={() => setActiveTab('reports')}
        >
          실행 리포트
        </button>
        <button
          className={`tab-btn ${activeTab === 'schedules' ? 'active' : ''}`}
          onClick={() => setActiveTab('schedules')}
        >
          스케줄 관리
        </button>
      </div>

      {/* 시나리오 편집 탭 */}
      {activeTab === 'scenario' && (
        <>
          {/* 시나리오 툴바 */}
          <div className="scenario-toolbar">
            {/* 패키지 선택 */}
            <div className="package-selector">
              <label>패키지:</label>
              <select
                value={selectedPackageId}
                onChange={(e) => setSelectedPackageId(e.target.value)}
              >
                <option value="">-- 패키지 선택 --</option>
                {packages.map((pkg) => (
                  <option key={pkg.id} value={pkg.id}>
                    {pkg.name}
                  </option>
                ))}
              </select>
              <button
                className="package-manage-btn"
                onClick={() => setIsPackageModalOpen(true)}
                title="패키지 관리"
              >
                패키지 관리
              </button>
              {!selectedPackageId && (
                <span className="package-hint">패키지를 선택하세요</span>
              )}
            </div>

            <div className="scenario-actions">
              <button className="toolbar-btn" onClick={handleNewScenario} title="새 시나리오" disabled={!selectedPackageId}>
                ✨ 새로 만들기
              </button>
              <button className="toolbar-btn" onClick={handleLoadClick} title="시나리오 불러오기">
                📂 불러오기
              </button>
              <button
                className={`toolbar-btn ${currentScenarioId ? 'primary' : ''}`}
                onClick={handleSaveScenario}
                title={currentScenarioId ? '덮어쓰기' : '새로 저장'}
                disabled={!selectedPackageId}
              >
                {currentScenarioId ? '💾 덮어쓰기' : '💾 저장'}
              </button>
              {currentScenarioId && (
                <button
                  className="toolbar-btn"
                  onClick={handleSaveClick}
                  title="다른 이름으로 저장"
                  disabled={!selectedPackageId}
                >
                  📄 다른 이름으로 저장
                </button>
              )}
            </div>
          </div>

          <div className="app-body">
            <Sidebar />

            <Canvas
              nodes={nodes}
              connections={connections}
              selectedNodeId={selectedNodeId}
              selectedConnectionIndex={selectedConnectionIndex}
              onNodeSelect={handleNodeSelect}
              onNodeMove={handleNodeMove}
              onNodeAdd={handleNodeAdd}
              onNodeDelete={handleNodeDelete}
              onConnectionAdd={handleConnectionAdd}
              onConnectionDelete={handleConnectionDelete}
              onConnectionSelect={handleConnectionSelect}
              scenarioName={currentScenarioName}
              scenarioId={currentScenarioId}
            />

            <Panel
              selectedNode={selectedNode}
              onNodeUpdate={handleNodeUpdate}
              onNodeDelete={handleNodeDelete}
              templates={templates}
              onOpenTemplateModal={() => setShowTemplateModal(true)}
            />

            <DevicePreview
              onSelectCoordinate={handlePreviewCoordinate}
              onSelectElement={handlePreviewElement}
              onTemplateCreated={fetchTemplates}
            />
          </div>
        </>
      )}

      {/* 디바이스 관리 탭 - CSS로 숨김 처리 (마운트 유지) */}
      <div className="app-body" style={{ display: activeTab === 'devices' ? 'flex' : 'none' }}>
        <DeviceDashboard
          devices={devices}
          sessions={sessions}
          loading={devicesLoading}
          refreshing={devicesRefreshing}
          onRefresh={handleRefreshDevices}
          onSessionChange={fetchSessions}
          executionStatus={deviceExecutionStatus}
        />
      </div>

      {/* 시나리오 실행 탭 - CSS로 숨김 처리 (마운트 유지) */}
      <div className="app-body" style={{ display: activeTab === 'execution' ? 'flex' : 'none' }}>
        <ScenarioExecution
          scenarios={scenarios}
          parallelLogs={parallelLogs}
          isParallelRunning={isParallelRunning}
          lastParallelResult={lastParallelResult}
          onParallelRunningChange={setIsParallelRunning}
          onParallelComplete={handleParallelExecutionComplete}
          selectedDevices={executionSelectedDevices}
          onSelectedDevicesChange={setExecutionSelectedDevices}
          selectedScenarioId={executionSelectedScenarioId}
          onSelectedScenarioIdChange={setExecutionSelectedScenarioId}
          devices={devices}
          sessions={sessions}
          loading={devicesLoading}
          refreshing={devicesRefreshing}
          onRefresh={handleRefreshDevices}
          onSessionChange={fetchSessions}
        />
      </div>

      {/* 리포트 탭 - CSS로 숨김 처리 (마운트 유지) */}
      <div className="app-body" style={{ display: activeTab === 'reports' ? 'flex' : 'none' }}>
        <ParallelReports />
      </div>

      {/* 스케줄 관리 탭 - CSS로 숨김 처리 (마운트 유지) */}
      <div className="app-body" style={{ display: activeTab === 'schedules' ? 'flex' : 'none' }}>
        <ScheduleManager
          scenarios={scenarios}
          onRefreshScenarios={fetchScenarios}
        />
      </div>

      {/* 불러오기 모달 */}
      <ScenarioLoadModal
        isOpen={isLoadModalOpen}
        onClose={() => {
          setIsLoadModalOpen(false);
          fetchScenarios();
        }}
        onLoad={handleScenarioLoad}
        selectedPackageId={selectedPackageId}
      />

      {/* 저장 모달 */}
      <ScenarioSaveModal
        isOpen={isSaveModalOpen}
        onClose={() => setIsSaveModalOpen(false)}
        onSaveComplete={handleSaveComplete}
        currentNodes={nodes}
        currentConnections={connections}
        selectedPackageId={selectedPackageId}
      />

      {/* 템플릿 모달 */}
      <TemplateModal
        isOpen={showTemplateModal}
        onClose={() => {
          setShowTemplateModal(false);
          fetchTemplates(selectedPackageId);
        }}
        onSelect={handleTemplateSelect}
        packageId={selectedPackageId}
      />

      {/* 패키지 관리 모달 */}
      <PackageModal
        isOpen={isPackageModalOpen}
        onClose={() => setIsPackageModalOpen(false)}
        onPackagesChange={fetchPackages}
      />
    </div>
  );
}

export default App;