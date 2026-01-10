// frontend/src/App.tsx

import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { io, Socket } from 'socket.io-client';

import Header from './components/Header/Header';
import Sidebar from './components/Sidebar/Sidebar';
import Canvas from './components/Canvas/Canvas';
import Panel from './components/Panel/Panel';
import DevicePreview from './components/DevicePreview/DevicePreview';
import ScenarioModal from './components/ScenarioModal/ScenarioModal';
import TemplateModal from './components/TemplateModal/TemplateModal';
// 디바이스 관리 대시보드
import DeviceDashboard from './components/DeviceDashboard';
import ScenarioExecution from './components/ScenarioExecution';
import ParallelReports from './components/ParallelReports';
import ScheduleManager from './components/ScheduleManager/ScheduleManager';
import type { ImageTemplate, ScenarioSummary, ParallelLog, ParallelExecutionResult } from './types';

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
  const [isScenarioModalOpen, setIsScenarioModalOpen] = useState<boolean>(false);
  const [currentScenarioId, setCurrentScenarioId] = useState<string | null>(null);
  const [currentScenarioName, setCurrentScenarioName] = useState<string>('');
  // 템플릿 모달
  const [showTemplateModal, setShowTemplateModal] = useState<boolean>(false);
  const [templates, setTemplates] = useState<ImageTemplate[]>([]);

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

  // 시나리오 실행 탭 상태 (탭 전환 시에도 유지)
  const [executionSelectedDevices, setExecutionSelectedDevices] = useState<string[]>([]);
  const [executionSelectedScenarioId, setExecutionSelectedScenarioId] = useState<string>('');

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


  // 초기 로드 시 템플릿 목록도 불러오기
  useEffect(() => {
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


  // 시나리오 모달 열기
  const handleScenarioClick = () => {
    setIsScenarioModalOpen(true);
  };

  // 시나리오 불러오기
  const handleScenarioLoad = (scenario: Scenario) => {
    setNodes(scenario.nodes || []);
    setConnections(scenario.connections || []);
    setCurrentScenarioId(scenario.id || null);
    setCurrentScenarioName(scenario.name || '');
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
      // 새 시나리오인 경우 모달 열기
      setIsScenarioModalOpen(true);
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

  // 템플릿 목록 로드
  const fetchTemplates = async () => {
    try {
      const res = await axios.get<{ data: ImageTemplate[] }>(`${API_BASE}/api/image/templates`);
      setTemplates(res.data.data || []);
    } catch (err) {
      console.error('템플릿 목록 조회 실패:', err);
    }
  };

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
            <div className="scenario-info">
              <span className={`scenario-status ${currentScenarioId ? 'saved' : 'unsaved'}`}>
                {currentScenarioId ? '📄' : '📝'}
              </span>
              <span className="scenario-name">
                {currentScenarioName || '임시 시나리오'}
              </span>
            </div>
            <div className="scenario-actions">
              <button className="toolbar-btn" onClick={handleNewScenario} title="새 시나리오">
                ✨ 새로 만들기
              </button>
              <button className="toolbar-btn" onClick={handleScenarioClick} title="시나리오 불러오기">
                📂 불러오기
              </button>
              <button
                className={`toolbar-btn ${currentScenarioId ? 'primary' : ''}`}
                onClick={handleSaveScenario}
                title={currentScenarioId ? '저장' : '새로 저장'}
              >
                {currentScenarioId ? '💾 저장' : '💾 새로 저장'}
              </button>
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

      {/* 디바이스 관리 탭 */}
      {activeTab === 'devices' && (
        <div className="app-body">
          <DeviceDashboard />
        </div>
      )}

      {/* 시나리오 실행 탭 */}
      {activeTab === 'execution' && (
        <div className="app-body">
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
          />
        </div>
      )}

      {/* 리포트 탭 */}
      {activeTab === 'reports' && (
        <div className="app-body">
          <ParallelReports />
        </div>
      )}

      {/* 스케줄 관리 탭 */}
      {activeTab === 'schedules' && (
        <div className="app-body">
          <ScheduleManager
            scenarios={scenarios}
            onRefreshScenarios={fetchScenarios}
          />
        </div>
      )}

      <ScenarioModal
        isOpen={isScenarioModalOpen}
        onClose={() => {
          setIsScenarioModalOpen(false);
          fetchScenarios(); // 시나리오 목록 갱신
        }}
        onLoad={handleScenarioLoad}
        currentNodes={nodes}
        currentConnections={connections}
      />

      {/* 템플릿 모달 */}
      <TemplateModal
        isOpen={showTemplateModal}
        onClose={() => {
          setShowTemplateModal(false);
          fetchTemplates();
        }}
        onSelect={handleTemplateSelect}
      />
    </div>
  );
}

export default App;