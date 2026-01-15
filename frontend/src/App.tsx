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
import ScenarioSummaryModal from './components/ScenarioSummaryModal';
// 디바이스 관리 대시보드
import DeviceDashboard from './components/DeviceDashboard';
import TestExecutionPanel from './components/TestExecutionPanel';
import TestReports from './components/TestReports';
import ScheduleManager from './components/ScheduleManager/ScheduleManager';
// 메트릭 대시보드
import MetricsDashboard from './components/MetricsDashboard';
// 닉네임 모달
import NicknameModal, { getNickname } from './components/NicknameModal';
// 자연어 변환기 (실험적 기능 - 삭제 가능)
import { NLConverter } from './components/NLConverter';
// 비디오 시나리오 변환기 (실험적 기능 - 삭제 가능)
import { VideoConverter } from './components/VideoConverter';
import type { ImageTemplate, ScenarioSummary, DeviceDetailedInfo, SessionInfo, DeviceExecutionStatus, Package } from './types';

// 탭 타입
type AppTab = 'scenario' | 'devices' | 'execution' | 'reports' | 'schedules' | 'dashboard' | 'experimental';

import type {
  FlowNode,
  Connection,
  Scenario,
  NodeType,
  DeviceElement,
} from './types';

import './App.css';

const API_BASE = 'http://127.0.0.1:3001';

function App() {
  const socketRef = useRef<Socket | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isSocketConnected, setIsSocketConnected] = useState<boolean>(false);

  // 닉네임 상태 (다중 사용자 큐 시스템)
  const [userName, setUserName] = useState<string>('');
  const [isNicknameModalOpen, setIsNicknameModalOpen] = useState<boolean>(false);

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
  // 디바이스 미리보기에서 선택된 디바이스 ID (템플릿 캡처에 사용)
  const [previewDeviceId, setPreviewDeviceId] = useState<string>('');

  // 현재 작업 중인 패키지 및 카테고리 (시나리오 편집 컨텍스트)
  const [selectedPackageId, setSelectedPackageId] = useState<string>('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [packages, setPackages] = useState<Package[]>([]);
  const [isPackageModalOpen, setIsPackageModalOpen] = useState<boolean>(false);
  // 시나리오 요약 모달
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState<boolean>(false);

  // 탭 상태 (기본: 통합 대시보드)
  const [activeTab, setActiveTab] = useState<AppTab>('dashboard');

  // 시나리오 목록 (실행 패널에서 사용)
  const [scenarios, setScenarios] = useState<ScenarioSummary[]>([]);

  // 대시보드에서 클릭한 리포트 ID (리포트 탭으로 전달)
  const [pendingReportId, setPendingReportId] = useState<string | undefined>();

  // 공유 데이터: devices, sessions (탭 간 공유)
  const [devices, setDevices] = useState<DeviceDetailedInfo[]>([]);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(true);
  const [devicesRefreshing, setDevicesRefreshing] = useState(false);

  // ========== 함수 정의 (useCallback) - useEffect 전에 선언 ==========

  // 시나리오 목록 로드
  const fetchScenarios = useCallback(async () => {
    try {
      const res = await axios.get<{ success: boolean; data: ScenarioSummary[] }>(
        `${API_BASE}/api/scenarios`,
      );
      if (res.data.success) {
        setScenarios(res.data.data || []);
      }
    } catch (err) {
      console.error('시나리오 목록 조회 실패:', err);
    }
  }, []);

  // 템플릿 목록 로드 (패키지별)
  const fetchTemplates = useCallback(async (packageId?: string) => {
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
  }, [selectedPackageId]);


  // 디바이스 목록 조회
  const fetchDevices = useCallback(async () => {
    try {
      const res = await axios.get<{ success: boolean; devices: DeviceDetailedInfo[] }>(
        `${API_BASE}/api/device/list/detailed`,
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
        `${API_BASE}/api/session/list`,
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

  // 탭 전환 시 시나리오 목록 갱신
  useEffect(() => {
    if (activeTab === 'execution') {
      fetchScenarios();
    }
  }, [activeTab, fetchScenarios]);


  // WebSocket 연결
  useEffect(() => {
    const newSocket = io(API_BASE);
    socketRef.current = newSocket;
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('✅ WebSocket 연결됨');
      setIsSocketConnected(true);
    });

    newSocket.on('disconnect', () => {
      console.log('❌ WebSocket 연결 해제');
      setIsSocketConnected(false);
    });

    // NOTE: 병렬 실행(parallelExecutor) 소켓 이벤트 삭제됨 (2026-01-13)
    // 테스트 실행 상태는 TestExecutionPanel에서 test:* 이벤트로 직접 처리

    return () => {
      newSocket.close();
    };
  }, []);

  // 닉네임 초기화: localStorage에서 불러오거나 모달 표시
  useEffect(() => {
    const savedNickname = getNickname();
    if (savedNickname) {
      setUserName(savedNickname);
    } else {
      // 닉네임이 없으면 모달 표시
      setIsNicknameModalOpen(true);
    }
  }, []);

  // 닉네임이 있고 소켓이 연결되면 user:identify 이벤트 전송
  useEffect(() => {
    if (userName && socketRef.current && isSocketConnected) {
      console.log('👤 사용자 식별 전송:', userName);
      socketRef.current.emit('user:identify', { userName });
    }
  }, [userName, isSocketConnected]);

  // 닉네임 설정 완료 핸들러
  const handleNicknameSet = useCallback((nickname: string) => {
    setUserName(nickname);
    setIsNicknameModalOpen(false);
    // 소켓이 연결되어 있으면 바로 identify 전송 (useEffect에서도 처리하지만 즉시 전송)
    if (socketRef.current && isSocketConnected) {
      socketRef.current.emit('user:identify', { userName: nickname });
    }
  }, [isSocketConnected]);

  // 패키지 목록 로드
  const fetchPackages = useCallback(async () => {
    try {
      const res = await axios.get<{ data: Package[] }>(`${API_BASE}/api/packages`);
      setPackages(res.data.data || []);
    } catch (err) {
      console.error('패키지 목록 조회 실패:', err);
    }
  }, []);

  // 초기 로드 시 패키지, 템플릿, 시나리오 목록 불러오기
  useEffect(() => {
    fetchPackages();
    fetchTemplates();
    fetchScenarios();
  }, [fetchPackages, fetchTemplates, fetchScenarios]);

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
  const handleNodeDelete = (nodeId: string) => {
    if (!nodeId) return;

    // 노드 삭제 후 남은 연결 계산
    const remainingConnections = connections.filter(
      conn => conn.from !== nodeId && conn.to !== nodeId,
    );

    setNodes(prev => prev.filter(node => node.id !== nodeId));
    setConnections(remainingConnections);
    setSelectedNodeId(prev => prev === nodeId ? null : prev);

    // 노드 위치 재정렬 (삭제 후 빈 공간 메우기)
    setTimeout(() => {
      setNodes(prev => {
        const startNode = prev.find(n => n.type === 'start');
        if (!startNode) return prev;

        // 연결 순서대로 노드 정렬 (BFS)
        const visited = new Set<string>();
        const orderedNodes: typeof prev = [];
        const queue = [startNode.id];

        while (queue.length > 0) {
          const nId = queue.shift()!;
          if (visited.has(nId)) continue;
          visited.add(nId);

          const node = prev.find(n => n.id === nId);
          if (node) orderedNodes.push(node);

          // 남은 연결에서 다음 노드 찾기
          remainingConnections.filter(c => c.from === nId).forEach(c => {
            if (!visited.has(c.to)) queue.push(c.to);
          });
        }

        // 방문하지 않은 노드도 추가
        prev.forEach(n => {
          if (!visited.has(n.id)) orderedNodes.push(n);
        });

        // 위치 재할당
        return orderedNodes.map((node, index) => ({
          ...node,
          x: 50 + index * 200,
          y: 200,
        }));
      });
    }, 50);
  };

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
    // 패키지 및 카테고리도 설정
    if (scenario.packageId) {
      setSelectedPackageId(scenario.packageId);
    }
    if (scenario.categoryId) {
      setSelectedCategoryId(scenario.categoryId);
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
  const handleSaveComplete = (scenarioId: string, scenarioName: string, packageId: string, categoryId: string) => {
    setCurrentScenarioId(scenarioId);
    setCurrentScenarioName(scenarioName);
    setSelectedPackageId(packageId);
    setSelectedCategoryId(categoryId);
    fetchScenarios();
  };

  // 레이아웃 상수 (Canvas와 동일)
  const NODE_GAP_X = 200;
  const START_X = 50;
  const START_Y = 200;

  // 다음 노드 위치 계산
  const getNextNodePosition = (): { x: number; y: number } => {
    if (nodes.length === 0) return { x: START_X, y: START_Y };
    const rightmostNode = nodes.reduce((prev, curr) => curr.x > prev.x ? curr : prev, nodes[0]);
    return { x: rightmostNode.x + NODE_GAP_X, y: START_Y };
  };

  // 노드 추가 (좌표 지정)
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

  // 노드 추가 (자동 위치 - 더블클릭용, 자동 연결 포함)
  const handleNodeAddAuto = (type: NodeType) => {
    const { x, y } = getNextNodePosition();
    const newNodeId = `node_${Date.now()}`;
    const newNode: FlowNode = {
      id: newNodeId,
      type,
      x,
      y,
      params: type === 'action' ? { actionType: '' } : {},
    };

    // 가장 오른쪽 노드 찾기 (연결 대상)
    const rightmostNode = nodes.length > 0
      ? nodes.reduce((prev, curr) => curr.x > prev.x ? curr : prev, nodes[0])
      : null;

    setNodes(prev => [...prev, newNode]);

    // 이전 노드가 있고, 해당 노드에서 나가는 연결이 없으면 자동 연결
    if (rightmostNode) {
      const hasOutgoing = connections.some(c => c.from === rightmostNode.id);
      if (!hasOutgoing) {
        setConnections(prev => [...prev, { from: rightmostNode.id, to: newNodeId }]);
      }
    }
  };

  // 선택한 노드 다음에 노드 삽입
  const handleNodeInsertAfter = (afterNodeId: string, nodeType: NodeType) => {
    const afterNode = nodes.find(n => n.id === afterNodeId);
    if (!afterNode) return;

    // 기존 연결 찾기 (afterNode에서 나가는 연결)
    const outgoingConnection = connections.find(c => c.from === afterNodeId);

    const newNodeId = `node_${Date.now()}`;
    const newNode: FlowNode = {
      id: newNodeId,
      type: nodeType,
      x: afterNode.x + NODE_GAP_X,
      y: afterNode.y,
      params: nodeType === 'action' ? { actionType: '' } : {},
    };

    // 새 연결 계산
    let updatedConnections: Connection[];
    if (outgoingConnection) {
      // 기존 연결 제거 후 새 연결 추가
      updatedConnections = [
        ...connections.filter(c => c.from !== afterNodeId || c.to !== outgoingConnection.to),
        { from: afterNodeId, to: newNodeId, label: outgoingConnection.label },
        { from: newNodeId, to: outgoingConnection.to },
      ];
    } else {
      // 나가는 연결이 없으면 단순히 새 연결만 추가
      updatedConnections = [
        ...connections,
        { from: afterNodeId, to: newNodeId },
      ];
    }

    // 연결 업데이트
    setConnections(updatedConnections);

    // 노드 추가 및 위치 재정렬 (새 연결 기반으로)
    setNodes(prev => {
      const nodesWithNew = [...prev, newNode];

      // 연결 순서대로 노드 정렬 (BFS)
      const startNode = nodesWithNew.find(n => n.type === 'start');
      if (!startNode) return nodesWithNew;

      const visited = new Set<string>();
      const orderedNodes: FlowNode[] = [];
      const queue = [startNode.id];

      while (queue.length > 0) {
        const nodeId = queue.shift()!;
        if (visited.has(nodeId)) continue;
        visited.add(nodeId);

        const node = nodesWithNew.find(n => n.id === nodeId);
        if (node) orderedNodes.push(node);

        // updatedConnections 기반으로 다음 노드 찾기
        updatedConnections.filter(c => c.from === nodeId).forEach(c => {
          if (!visited.has(c.to)) {
            queue.push(c.to);
          }
        });
      }

      // 방문하지 않은 노드도 추가
      nodesWithNew.forEach(n => {
        if (!visited.has(n.id)) {
          orderedNodes.push(n);
        }
      });

      // 위치 재할당
      return orderedNodes.map((node, index) => ({
        ...node,
        x: START_X + index * NODE_GAP_X,
        y: START_Y,
      }));
    });
  };

  // 노드 위치 재정렬 (좌→우 순서대로)
  const rearrangeNodes = () => {
    setNodes(prev => {
      // 연결 순서대로 노드 정렬
      const startNode = prev.find(n => n.type === 'start');
      if (!startNode) return prev;

      const visited = new Set<string>();
      const orderedNodes: FlowNode[] = [];
      const queue = [startNode.id];

      while (queue.length > 0) {
        const nodeId = queue.shift()!;
        if (visited.has(nodeId)) continue;
        visited.add(nodeId);

        const node = prev.find(n => n.id === nodeId);
        if (node) orderedNodes.push(node);

        // 이 노드에서 나가는 연결 찾기
        const outgoing = connections.filter(c => c.from === nodeId);
        outgoing.forEach(c => {
          if (!visited.has(c.to)) {
            queue.push(c.to);
          }
        });
      }

      // 방문하지 않은 노드도 추가
      prev.forEach(n => {
        if (!visited.has(n.id)) {
          orderedNodes.push(n);
        }
      });

      // 위치 재할당
      return orderedNodes.map((node, index) => ({
        ...node,
        x: START_X + index * NODE_GAP_X,
        y: START_Y,
      }));
    });
  };

  // 노드 타입 변경 확인 상태
  const [typeChangeConfirm, setTypeChangeConfirm] = useState<{
    nodeId: string;
    newType: NodeType;
  } | null>(null);

  // 노드 타입 변경 요청 (확인 모달 표시)
  const handleNodeTypeChangeRequest = (nodeId: string, newType: NodeType) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;

    // 같은 타입이면 무시
    if (node.type === newType) return;

    // 파라미터가 있으면 확인 모달 표시
    if (node.params && Object.keys(node.params).length > 0) {
      setTypeChangeConfirm({ nodeId, newType });
    } else {
      // 파라미터 없으면 바로 변경
      handleNodeTypeChange(nodeId, newType);
    }
  };

  // 노드 타입 변경 실행
  const handleNodeTypeChange = (nodeId: string, newType: NodeType) => {
    setNodes(prev => prev.map(node => {
      if (node.id !== nodeId) return node;
      return {
        ...node,
        type: newType,
        params: newType === 'action' ? { actionType: '' } : {},
      };
    }));
    setTypeChangeConfirm(null);
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

  // 디바이스별 실행 상태 (현재 미사용 - testExecutor 이벤트 기반으로 추후 구현 예정)
  // NOTE: 병렬 실행(parallelExecutor) 삭제로 실시간 상태 표시 비활성화됨 (2026-01-13)
  const deviceExecutionStatus = useMemo(() => {
    return new Map<string, DeviceExecutionStatus>();
  }, []);


  // 패키지 변경 시 템플릿 목록 갱신
  useEffect(() => {
    if (selectedPackageId) {
      fetchTemplates(selectedPackageId);
    }
  }, [selectedPackageId, fetchTemplates]);


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

  return (
    <div className="app">
      <Header
        isSocketConnected={isSocketConnected}
        userName={userName}
        onChangeNickname={() => setIsNicknameModalOpen(true)}
      />

      {/* 탭 네비게이션 */}
      <div className="app-tabs">
        <button
          className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          통합 대시보드
        </button>
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
        {/* 실험적 기능 탭 (삭제 가능) */}
        <button
          className={`tab-btn ${activeTab === 'experimental' ? 'active' : ''}`}
          onClick={() => setActiveTab('experimental')}
        >
          AI 변환
          <span className="tab-badge">Beta</span>
        </button>
      </div>

      {/* 통합 대시보드 탭 */}
      <div className="app-body" style={{ display: activeTab === 'dashboard' ? 'flex' : 'none' }}>
        <MetricsDashboard
          onNavigateToReports={(executionId) => {
            setPendingReportId(executionId);
            setActiveTab('reports');
          }}
        />
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
                className="toolbar-btn"
                onClick={() => setIsSummaryModalOpen(true)}
                title="시나리오 흐름 요약"
                disabled={nodes.length === 0}
              >
                📋 시나리오 요약
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
            <Sidebar onNodeAdd={handleNodeAddAuto} />

            {/* 중앙 영역: DevicePreview (상단) + Canvas (하단) */}
            <div className="editor-main">
              <DevicePreview
                onSelectCoordinate={handlePreviewCoordinate}
                onSelectElement={handlePreviewElement}
                onTemplateCreated={fetchTemplates}
                packageId={selectedPackageId}
                onDeviceIdChange={setPreviewDeviceId}
              />

              <Canvas
                nodes={nodes}
                connections={connections}
                selectedNodeId={selectedNodeId}
                selectedConnectionIndex={selectedConnectionIndex}
                onNodeSelect={handleNodeSelect}
                onNodeMove={handleNodeMove}
                onNodeAdd={handleNodeAdd}
                onNodeDelete={handleNodeDelete}
                onNodeInsertAfter={handleNodeInsertAfter}
                onNodeTypeChange={handleNodeTypeChangeRequest}
                onConnectionAdd={handleConnectionAdd}
                onConnectionDelete={handleConnectionDelete}
                onConnectionSelect={handleConnectionSelect}
                scenarioName={currentScenarioName}
                scenarioId={currentScenarioId}
              />
            </div>

            <Panel
              selectedNode={selectedNode}
              onNodeUpdate={handleNodeUpdate}
              onNodeDelete={handleNodeDelete}
              templates={templates}
              onOpenTemplateModal={() => setShowTemplateModal(true)}
              selectedDeviceId={previewDeviceId}
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
        <TestExecutionPanel
          devices={devices}
          sessions={sessions}
          socket={socket}
          onSessionChange={fetchSessions}
          userName={userName}
        />
      </div>

      {/* 리포트 탭 - CSS로 숨김 처리 (마운트 유지) */}
      <div className="app-body" style={{ display: activeTab === 'reports' ? 'flex' : 'none' }}>
        <TestReports
          socket={socket}
          initialReportId={pendingReportId}
          onReportIdConsumed={() => setPendingReportId(undefined)}
        />
      </div>

      {/* 스케줄 관리 탭 - CSS로 숨김 처리 (마운트 유지) */}
      <div className="app-body" style={{ display: activeTab === 'schedules' ? 'flex' : 'none' }}>
        <ScheduleManager
          scenarios={scenarios}
          onRefreshScenarios={fetchScenarios}
        />
      </div>

      {/* 실험적 기능 탭 - 자연어/비디오 변환기 (삭제 가능) */}
      <div className="app-body experimental-tab" style={{ display: activeTab === 'experimental' ? 'flex' : 'none' }}>
        <div className="experimental-panels">
          <NLConverter
            onApplyScenario={(scenario) => {
              // 변환된 시나리오를 캔버스에 적용
              setNodes(scenario.nodes.map((n, i) => ({
                id: n.id,
                type: n.type === 'start' ? 'start' : 'action',
                x: 100 + (i % 3) * 200,
                y: 100 + Math.floor(i / 3) * 150,
                params: n.type === 'action' ? { actionType: n.action || '', ...n.data } : {},
                label: n.label,
              })));
              setConnections(scenario.edges.map(e => ({
                from: e.source,
                to: e.target,
              })));
              setCurrentScenarioId(null);
              setCurrentScenarioName('');
              setActiveTab('scenario');
              alert('시나리오가 적용되었습니다. 노드를 검토하고 필요한 정보를 입력하세요.');
            }}
          />
          <VideoConverter
            devices={devices.map((d) => ({
              id: d.id,
              name: d.alias || d.model || d.id,
              model: d.model,
              status: d.status,
            }))}
            onApplyScenario={(scenario) => {
              // 변환된 시나리오를 캔버스에 적용
              setNodes(scenario.nodes.map((n, i) => ({
                id: n.id,
                type: n.type === 'start' ? 'start' : 'action',
                x: 100 + (i % 3) * 200,
                y: 100 + Math.floor(i / 3) * 150,
                params: n.type === 'action' ? { actionType: n.action || '', ...n.data } : {},
                label: n.label,
              })));
              setConnections(scenario.edges.map(e => ({
                from: e.source,
                to: e.target,
              })));
              setCurrentScenarioId(null);
              setCurrentScenarioName('');
              setActiveTab('scenario');
              alert('비디오에서 시나리오가 추출되었습니다. 노드를 검토하고 필요한 정보를 입력하세요.');
            }}
          />
        </div>
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
        selectedCategoryId={selectedCategoryId}
      />

      {/* 저장 모달 */}
      <ScenarioSaveModal
        isOpen={isSaveModalOpen}
        onClose={() => setIsSaveModalOpen(false)}
        onSaveComplete={handleSaveComplete}
        currentNodes={nodes}
        currentConnections={connections}
        selectedPackageId={selectedPackageId}
        selectedCategoryId={selectedCategoryId}
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
        deviceId={previewDeviceId}
      />

      {/* 패키지 관리 모달 */}
      <PackageModal
        isOpen={isPackageModalOpen}
        onClose={() => setIsPackageModalOpen(false)}
        onPackagesChange={fetchPackages}
      />

      {/* 시나리오 요약 모달 */}
      <ScenarioSummaryModal
        isOpen={isSummaryModalOpen}
        onClose={() => setIsSummaryModalOpen(false)}
        scenarioName={currentScenarioName || '새 시나리오'}
        scenarioId={currentScenarioId || undefined}
        nodes={nodes}
        connections={connections}
        templates={templates}
      />

      {/* 닉네임 설정 모달 (다중 사용자 큐 시스템) */}
      <NicknameModal
        isOpen={isNicknameModalOpen}
        onClose={handleNicknameSet}
        initialNickname={userName}
      />

      {/* 노드 타입 변경 확인 모달 */}
      {typeChangeConfirm && (
        <div className="modal-overlay" onClick={() => setTypeChangeConfirm(null)}>
          <div className="modal-content confirm-modal" onClick={e => e.stopPropagation()}>
            <h3>노드 타입 변경</h3>
            <p>노드 타입을 변경하면 기존 설정이 초기화됩니다.</p>
            <p>계속하시겠습니까?</p>
            <div className="modal-actions">
              <button
                className="btn-cancel"
                onClick={() => setTypeChangeConfirm(null)}
              >
                취소
              </button>
              <button
                className="btn-confirm"
                onClick={() => handleNodeTypeChange(typeChangeConfirm.nodeId, typeChangeConfirm.newType)}
              >
                변경
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;