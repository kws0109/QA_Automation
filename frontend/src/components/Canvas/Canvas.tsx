// frontend/src/components/Canvas/Canvas.tsx

import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import type { NodeType } from '../../types';
import { API_BASE_URL } from '../../config/api';
import { useFlowEditor, useScenarioEditor, useEditorPreview } from '../../contexts';
import './Canvas.css';

// 줌 관련 상수
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 2.0;
const ZOOM_STEP = 0.1;
const ZOOM_DEFAULT = 1.0;

// 이미지 관련 액션 타입
const IMAGE_ACTION_TYPES = ['tapImage', 'waitUntilImage', 'waitUntilImageGone'];

// 텍스트 OCR 관련 액션 타입
const TEXT_OCR_ACTION_TYPES = ['tapTextOcr', 'waitUntilTextOcr', 'waitUntilTextGoneOcr', 'assertTextOcr'];

// 이미지 관련 조건 타입
const IMAGE_CONDITION_TYPES = ['imageExists', 'imageNotExists'];

// OCR 텍스트 관련 조건 타입
const OCR_CONDITION_TYPES = ['ocrTextExists', 'ocrTextNotExists'];

// 템플릿 이미지 URL 생성 (정적 파일 경로 사용 - 인증 불필요)
// params에 저장된 packageId와 filename 사용 (우선), 없으면 templates 배열에서 조회
const getTemplateImageUrl = (
  params: { templateId?: string; templatePackageId?: string; templateFilename?: string } | undefined,
  templates: Array<{ id: string; packageId?: string; filename: string }>
): string | null => {
  if (!params?.templateId) return null;

  // params에 저장된 정보 사용 (새로 저장된 노드)
  if (params.templateFilename) {
    return params.templatePackageId
      ? `${API_BASE_URL}/templates/${params.templatePackageId}/${params.templateFilename}`
      : `${API_BASE_URL}/templates/${params.templateFilename}`;
  }

  // templates 배열에서 조회 (이전에 저장된 노드 호환)
  const template = templates.find(t => t.id === params.templateId);
  if (!template) {
    return null;
  }
  return template.packageId
    ? `${API_BASE_URL}/templates/${template.packageId}/${template.filename}`
    : `${API_BASE_URL}/templates/${template.filename}`;
};

// 레이아웃 상수 (좌→우 배치)
const NODE_WIDTH = 140;
const NODE_HEIGHT_DEFAULT = 80;
const NODE_GAP_X = 200;
const START_X = 50;
const START_Y = 200;

interface ContextMenuState {
  x: number;
  y: number;
  nodeId?: string;
  connectionIndex?: number;
  type: 'node' | 'connection';
  showSubMenu?: 'insert' | 'changeType' | null;
}

// 노드 타입 목록 (서브메뉴용)
const NODE_TYPE_LIST: { type: NodeType; icon: string; label: string }[] = [
  { type: 'start', icon: '▶', label: 'Start' },
  { type: 'action', icon: '⚡', label: 'Action' },
  { type: 'condition', icon: '?', label: 'Condition' },
  { type: 'loop', icon: '↻', label: 'Loop' },
  { type: 'end', icon: '■', label: 'End' },
];

/**
 * Canvas 컴포넌트
 * - Context에서 직접 상태를 가져옴 (Props Drilling 제거)
 */
function Canvas() {
  // Context에서 상태 가져오기
  const {
    nodes,
    connections,
    selectedNodeId,
    selectedConnectionIndex,
    selectedNodeIds,
    handleNodeSelect: onNodeSelect,
    handleNodeSelectToggle: onNodeSelectToggle,
    handleNodeMove: onNodeMove,
    handleNodeAdd: onNodeAdd,
    handleNodeDelete: onNodeDelete,
    handleNodeInsertAfter: onNodeInsertAfter,
    handleNodeTypeChange: onNodeTypeChange,
    handleConnectionAdd: onConnectionAdd,
    handleConnectionDelete: onConnectionDelete,
    handleConnectionSelect: onConnectionSelect,
    handleRearrangeGrid: onRearrangeGrid,
  } = useFlowEditor();

  const { currentScenarioName: scenarioName, currentScenarioId: scenarioId, templates } = useScenarioEditor();
  const { highlightedNodeId, highlightStatus, setStartFromNodeId } = useEditorPreview();
  const canvasRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // 노드 검색
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // 줌 상태
  const [zoom, setZoom] = useState(ZOOM_DEFAULT);

  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [connectingBranch, setConnectingBranch] = useState<string | null>(null);
  const [connectingTo, setConnectingTo] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // 노드 높이 측정 (동적 연결선 계산용)
  const [nodeHeights, setNodeHeights] = useState<Record<string, number>>({});
  const nodeRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // 노드 ref 콜백 - 높이 측정
  const setNodeRef = useCallback((nodeId: string) => (el: HTMLDivElement | null) => {
    nodeRefs.current[nodeId] = el;
    if (el) {
      const height = el.offsetHeight;
      setNodeHeights(prev => {
        if (prev[nodeId] !== height) {
          return { ...prev, [nodeId]: height };
        }
        return prev;
      });
    }
  }, []);

  // 노드 높이 가져오기 (측정된 값 또는 기본값)
  const getNodeHeight = useCallback((nodeId: string): number => {
    return nodeHeights[nodeId] || NODE_HEIGHT_DEFAULT;
  }, [nodeHeights]);

  // 노드 검색 결과 (ID, 라벨, 액션타입으로 검색)
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase().trim();
    return nodes.filter(node => {
      const idMatch = node.id.toLowerCase().includes(query);
      const labelMatch = node.label?.toLowerCase().includes(query);
      const actionMatch = node.params?.actionType?.toLowerCase().includes(query);
      const textMatch = node.params?.text?.toLowerCase().includes(query);
      return idMatch || labelMatch || actionMatch || textMatch;
    }).slice(0, 20); // 최대 20개 결과
  }, [nodes, searchQuery]);

  // 노드로 스크롤 및 선택
  const scrollToNode = useCallback((nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (node && canvasRef.current) {
      // 줌을 고려하여 노드 중앙으로 스크롤
      const canvasRect = canvasRef.current.getBoundingClientRect();
      const nodeHeight = getNodeHeight(nodeId);

      const nodeCenterX = (node.x + NODE_WIDTH / 2) * zoom;
      const nodeCenterY = (node.y + nodeHeight / 2) * zoom;

      const scrollLeft = nodeCenterX - canvasRect.width / 2;
      const scrollTop = nodeCenterY - canvasRect.height / 2;

      canvasRef.current.scrollTo({
        left: Math.max(0, scrollLeft),
        top: Math.max(0, scrollTop),
        behavior: 'smooth'
      });
    }
    // 노드 선택
    onNodeSelect?.(nodeId);
    // 검색 UI 닫기
    setShowSearchResults(false);
    setSearchQuery('');
  }, [onNodeSelect, nodes, zoom, getNodeHeight]);

  // 검색창 단축키 (Ctrl+F)
  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setShowSearchResults(false);
      setSearchQuery('');
      searchInputRef.current?.blur();
    } else if (e.key === 'Enter' && searchResults.length > 0) {
      scrollToNode(searchResults[0].id);
    }
  }, [searchResults, scrollToNode]);

  // 줌 컨트롤 함수들
  const handleZoomIn = useCallback(() => {
    setZoom(prev => Math.min(ZOOM_MAX, Math.round((prev + ZOOM_STEP) * 100) / 100));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom(prev => Math.max(ZOOM_MIN, Math.round((prev - ZOOM_STEP) * 100) / 100));
  }, []);

  const handleZoomReset = useCallback(() => {
    setZoom(ZOOM_DEFAULT);
  }, []);

  // 전체 보기 (모든 노드가 보이도록 줌 조정)
  const handleFitToView = useCallback(() => {
    if (nodes.length === 0 || !canvasRef.current) return;

    const canvasRect = canvasRef.current.getBoundingClientRect();
    const padding = 100; // 여백

    // 노드 범위 계산
    const minX = Math.min(...nodes.map(n => n.x));
    const maxX = Math.max(...nodes.map(n => n.x)) + NODE_WIDTH;
    const minY = Math.min(...nodes.map(n => n.y));
    const maxY = Math.max(...nodes.map(n => n.y)) + NODE_HEIGHT_DEFAULT;

    const contentWidth = maxX - minX + padding * 2;
    const contentHeight = maxY - minY + padding * 2;

    // 캔버스에 맞는 줌 레벨 계산
    const zoomX = canvasRect.width / contentWidth;
    const zoomY = canvasRect.height / contentHeight;
    const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.min(zoomX, zoomY)));

    setZoom(Math.round(newZoom * 100) / 100);

    // 콘텐츠 중앙으로 스크롤
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    setTimeout(() => {
      if (canvasRef.current) {
        canvasRef.current.scrollTo({
          left: centerX * newZoom - canvasRect.width / 2,
          top: centerY * newZoom - canvasRect.height / 2,
          behavior: 'smooth'
        });
      }
    }, 50);
  }, [nodes]);

  // 마우스 휠 줌 (Ctrl + 휠)
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      setZoom(prev => {
        const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round((prev + delta) * 100) / 100));
        return newZoom;
      });
    }
  }, []);

  // 키보드 단축키 (Ctrl+0: 100% 리셋, Ctrl++: 줌인, Ctrl+-: 줌아웃)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === '0') {
          e.preventDefault();
          handleZoomReset();
        } else if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          handleZoomIn();
        } else if (e.key === '-') {
          e.preventDefault();
          handleZoomOut();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleZoomIn, handleZoomOut, handleZoomReset]);

  // 콘텐츠 영역 크기 계산 (노드 위치 기반)
  const contentWidth = useMemo(() => {
    if (nodes.length === 0) return '100%';
    const rightmostX = Math.max(...nodes.map(n => n.x));
    // 가장 오른쪽 노드 + 노드 너비 + 여백
    return Math.max(rightmostX + NODE_WIDTH + 100, 1500);
  }, [nodes]);

  const contentHeight = useMemo(() => {
    if (nodes.length === 0) return '100%';
    // 각 노드의 하단 위치 계산 (y + 높이)
    const bottommost = Math.max(...nodes.map(n => n.y + (nodeHeights[n.id] || NODE_HEIGHT_DEFAULT)));
    // 가장 아래 노드 + 여백
    return Math.max(bottommost + 200, 800);
  }, [nodes, nodeHeights]);

  // 다음 노드 위치 계산 (자동 배치)
  const getNextNodePosition = (): { x: number; y: number } => {
    if (nodes.length === 0) return { x: START_X, y: START_Y };
    const rightmostNode = nodes.reduce((prev, curr) => curr.x > prev.x ? curr : prev, nodes[0]);
    return { x: rightmostNode.x + NODE_GAP_X, y: START_Y };
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const nodeType = e.dataTransfer.getData('nodeType') as NodeType;
    if (nodeType) {
      const { x, y } = getNextNodePosition();
      onNodeAdd?.(nodeType, x, y);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleNodeClick = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();

    // Shift 또는 Ctrl 키와 함께 클릭: 다중 선택
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      onNodeSelectToggle?.(nodeId, true);
    } else {
      // 일반 클릭: 해당 노드만 선택
      onNodeSelectToggle?.(nodeId, false);
    }
    onConnectionSelect?.(null);
    closeContextMenu();
  };

  // 노드 드래그 비활성화 - 클릭만 처리
  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    // handleNodeClick에서 처리하므로 여기서는 별도 처리 불필요
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const scrollLeft = canvasRef.current.scrollLeft;
      const scrollTop = canvasRef.current.scrollTop;
      // 줌을 고려하여 좌표 변환
      const x = (e.clientX - rect.left + scrollLeft) / zoom;
      const y = (e.clientY - rect.top + scrollTop) / zoom;

      // 연결 중일 때 연결선 끝점 업데이트
      if (isConnecting) {
        setConnectingTo({ x, y });
      }
    }
  };

  const handleMouseUp = () => {
    if (isConnecting) {
      setIsConnecting(false);
      setConnectingFrom(null);
      setConnectingBranch(null);
    }
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target === canvasRef.current || target.classList.contains('canvas-grid')) {
      onNodeSelect?.(null);
      onConnectionSelect?.(null);
    }
    closeContextMenu();
  };

  // 출력 포트 드래그 시작 (분기 지원)
  const handleOutputPortMouseDown = (e: React.MouseEvent, nodeId: string, branch: string | null = null) => {
    e.stopPropagation();

    const node = nodes.find(n => n.id === nodeId);
    if (node && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const scrollLeft = canvasRef.current.scrollLeft;
      const scrollTop = canvasRef.current.scrollTop;
      setIsConnecting(true);
      setConnectingFrom(nodeId);
      setConnectingBranch(branch);
      // 줌을 고려하여 좌표 변환
      setConnectingTo({
        x: (e.clientX - rect.left + scrollLeft) / zoom,
        y: (e.clientY - rect.top + scrollTop) / zoom,
      });
    }
  };

  // 입력 포트 마우스 업 (연결 완료)
  const handleInputPortMouseUp = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();

    if (isConnecting && connectingFrom && connectingFrom !== nodeId) {
      const exists = connections.some(
        conn => conn.from === connectingFrom && conn.to === nodeId && conn.label === connectingBranch,
      );

      if (!exists) {
        onConnectionAdd?.(connectingFrom, nodeId, connectingBranch);
      }
    }

    setIsConnecting(false);
    setConnectingFrom(null);
    setConnectingBranch(null);
  };

  const handleConnectionClick = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    onConnectionSelect?.(index);
    onNodeSelect?.(null);
  };

  const handleNodeContextMenu = (e: React.MouseEvent, nodeId: string) => {
    e.preventDefault();
    e.stopPropagation();
    onNodeSelect?.(nodeId);
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      nodeId,
      type: 'node',
    });
  };

  const handleConnectionContextMenu = (e: React.MouseEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    onConnectionSelect?.(index);
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      connectionIndex: index,
      type: 'connection',
    });
  };

  const closeContextMenu = () => {
    setContextMenu(null);
  };

  const handleContextDeleteNode = () => {
    if (contextMenu?.nodeId) {
      onNodeDelete?.(contextMenu.nodeId);
    }
    closeContextMenu();
  };

  const handleContextDeleteConnection = () => {
    if (contextMenu?.connectionIndex !== undefined) {
      onConnectionDelete?.(contextMenu.connectionIndex);
    }
    closeContextMenu();
  };

  // 서브메뉴 토글
  const handleShowInsertMenu = () => {
    setContextMenu(prev => prev ? { ...prev, showSubMenu: 'insert' } : null);
  };

  const handleShowChangeTypeMenu = () => {
    setContextMenu(prev => prev ? { ...prev, showSubMenu: 'changeType' } : null);
  };

  // 선택한 노드 다음에 노드 삽입
  const handleInsertNode = (nodeType: NodeType) => {
    if (contextMenu?.nodeId) {
      onNodeInsertAfter?.(contextMenu.nodeId, nodeType);
    }
    closeContextMenu();
  };

  // 노드 타입 변경
  const handleChangeNodeType = (newType: NodeType) => {
    if (contextMenu?.nodeId) {
      onNodeTypeChange?.(contextMenu.nodeId, newType);
    }
    closeContextMenu();
  };

  // 여기서부터 실행
  const handleRunFromHere = () => {
    if (contextMenu?.nodeId) {
      setStartFromNodeId(contextMenu.nodeId);
    }
    closeContextMenu();
  };

  const getNodeColor = (type: NodeType): string => {
    const colors: Record<NodeType, string> = {
      start: '#4caf50',
      action: '#2196f3',
      condition: '#ff9800',
      loop: '#9c27b0',
      end: '#f44336',
    };
    return colors[type] || '#666';
  };

  const getNodeIcon = (type: NodeType): string => {
    const icons: Record<NodeType, string> = {
      start: '▶️',
      action: '⚡',
      condition: '❓',
      loop: '🔄',
      end: '⏹️',
    };
    return icons[type] || '📦';
  };

  // 연결선 색상 (분기별)
  const getConnectionColor = (branch: string | null | undefined): string => {
    switch (branch) {
    case 'yes':
      return '#4caf50';  // 녹색
    case 'no':
      return '#f44336';  // 빨간색
    case 'loop':
      return '#a855f7';  // 보라색
    case 'exit':
      return '#6b7280';  // 회색
    default:
      return '#6b7280';
    }
  };

  // 좌→우 레이아웃: 포트 위치 계산 (실제 노드 높이 사용)
  const getOutputPortPosition = (node: FlowNode, branch: string | null): { x: number; y: number } => {
    const nodeHeight = getNodeHeight(node.id);
    if (node.type === 'condition') {
      // 조건 Yes: 우측 상단 (CSS: right: -14px, top: 15%)
      if (branch === 'yes') return { x: node.x + NODE_WIDTH, y: node.y + nodeHeight * 0.15 };
      // 조건 No: 우측 하단 (CSS: right: -14px, bottom: 15%)
      if (branch === 'no') return { x: node.x + NODE_WIDTH, y: node.y + nodeHeight * 0.85 };
    }
    // 일반 출력: 우측 중앙 (CSS: right: -8px, top: 50%)
    return { x: node.x + NODE_WIDTH, y: node.y + nodeHeight / 2 };
  };

  const getInputPortPosition = (node: FlowNode): { x: number; y: number } => {
    const nodeHeight = getNodeHeight(node.id);
    // 입력: 좌측 중앙 (CSS: left: -8px, top: 50%)
    return { x: node.x, y: node.y + nodeHeight / 2 };
  };

  // 수평 연결선 경로 생성
  // 연결선이 다른 노드를 침범하지 않도록 시작/도착 노드 바로 옆에서 꺾임
  const createConnectionPath = (fromNode: FlowNode, toNode: FlowNode, branch: string | null): string => {
    const start = getOutputPortPosition(fromNode, branch);
    const end = getInputPortPosition(toNode);

    // 꺾이는 지점: 시작 노드 바로 옆, 도착 노드 바로 옆
    const startTurnX = start.x + 25;
    const endTurnX = end.x - 25;

    // 왼쪽으로 되돌아가는 연결 (줄바꿈 또는 루프백)
    if (start.x > end.x) {
      const fromHeight = getNodeHeight(fromNode.id);
      const toHeight = getNodeHeight(toNode.id);

      // 그리드 줄바꿈: fromNode가 윗줄, toNode가 아랫줄 (다음 줄로 진행)
      if (fromNode.y < toNode.y) {
        // 두 줄 사이로 연결선이 지나가도록 (1줄 하단과 2줄 상단 사이)
        const midY = (fromNode.y + fromHeight + toNode.y) / 2;
        return `M ${start.x} ${start.y} L ${startTurnX} ${start.y} L ${startTurnX} ${midY} L ${endTurnX} ${midY} L ${endTurnX} ${end.y} L ${end.x} ${end.y}`;
      }

      // 실제 루프백 (같은 줄이나 위쪽 줄로 돌아가기)
      // Yes 분기: 위쪽으로 우회
      if (branch === 'yes') {
        const loopY = Math.min(fromNode.y, toNode.y) - 50;
        return `M ${start.x} ${start.y} L ${startTurnX} ${start.y} L ${startTurnX} ${loopY} L ${endTurnX} ${loopY} L ${endTurnX} ${end.y} L ${end.x} ${end.y}`;
      }

      // No 분기 및 일반: 아래쪽으로 우회
      const loopY = Math.max(fromNode.y + fromHeight, toNode.y + toHeight) + 50;
      return `M ${start.x} ${start.y} L ${startTurnX} ${start.y} L ${startTurnX} ${loopY} L ${endTurnX} ${loopY} L ${endTurnX} ${end.y} L ${end.x} ${end.y}`;
    }

    // 일반 연결 (오른쪽으로)
    // Y가 같으면 (같은 줄 인접 노드): 직선 연결
    if (Math.abs(start.y - end.y) < 10) {
      return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
    }

    // Y가 다르면 (컨디션 분기 등): 위/아래로 우회하여 다른 노드를 침범하지 않도록
    const fromHeight = getNodeHeight(fromNode.id);
    const toHeight = getNodeHeight(toNode.id);
    const goingUp = toNode.y < fromNode.y;  // 윗줄로 가는지 여부

    if (branch === 'yes') {
      // Yes 분기: 윗줄로 가면 아래로 우회, 아랫줄로 가면 위로 우회
      const turnY = goingUp
        ? Math.max(fromNode.y + fromHeight, toNode.y + toHeight) + 40
        : Math.min(fromNode.y, toNode.y) - 40;
      return `M ${start.x} ${start.y} L ${startTurnX} ${start.y} L ${startTurnX} ${turnY} L ${endTurnX} ${turnY} L ${endTurnX} ${end.y} L ${end.x} ${end.y}`;
    } else if (branch === 'no') {
      // No 분기: 윗줄로 가면 위로 우회, 아랫줄로 가면 아래로 우회
      const turnY = goingUp
        ? Math.min(fromNode.y, toNode.y) - 40
        : Math.max(fromNode.y + fromHeight, toNode.y + toHeight) + 40;
      return `M ${start.x} ${start.y} L ${startTurnX} ${start.y} L ${startTurnX} ${turnY} L ${endTurnX} ${turnY} L ${endTurnX} ${end.y} L ${end.x} ${end.y}`;
    }

    // 일반 연결 (분기 아님): 두 줄 사이로 통과
    const midY = goingUp
      ? Math.min(fromNode.y, toNode.y + toHeight) - 40
      : (fromNode.y + fromHeight + toNode.y) / 2;
    return `M ${start.x} ${start.y} L ${startTurnX} ${start.y} L ${startTurnX} ${midY} L ${endTurnX} ${midY} L ${endTurnX} ${end.y} L ${end.x} ${end.y}`
  };

  // 화살표 (오른쪽을 향함 - 입력 포트 왼쪽에 표시)
  const getArrowPoints = (node: FlowNode): string => {
    const pos = getInputPortPosition(node);
    // 화살표가 입력 포트(좌측)를 향해 오른쪽으로 가리킴
    return `${pos.x - 12},${pos.y - 5} ${pos.x - 12},${pos.y + 5} ${pos.x - 4},${pos.y}`;
  };

  return (
    <div className="canvas-container">
      {/* 줌 컨트롤 패널 - 스크롤 영역 외부에 배치하여 항상 고정 */}
      <div className="zoom-controls">
        <button
          className="zoom-btn"
          onClick={handleZoomIn}
          disabled={zoom >= ZOOM_MAX}
          title="줌 인 (Ctrl++)"
        >
          +
        </button>
        <span className="zoom-level" title="줌 레벨">
          {Math.round(zoom * 100)}%
        </span>
        <button
          className="zoom-btn"
          onClick={handleZoomOut}
          disabled={zoom <= ZOOM_MIN}
          title="줌 아웃 (Ctrl+-)"
        >
          −
        </button>
        <div className="zoom-divider" />
        <button
          className="zoom-btn zoom-fit"
          onClick={handleFitToView}
          title="전체 보기"
        >
          ⊡
        </button>
        <button
          className="zoom-btn zoom-reset"
          onClick={handleZoomReset}
          title="100%로 리셋 (Ctrl+0)"
        >
          1:1
        </button>
        <div className="zoom-divider" />
        <button
          className="zoom-btn zoom-grid"
          onClick={() => onRearrangeGrid?.()}
          title="그리드 정렬 (6개/줄)"
        >
          ⋮⋮
        </button>
      </div>

      <div
        className="canvas horizontal-layout"
        ref={canvasRef}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleCanvasClick}
        onContextMenu={(e) => e.preventDefault()}
        onWheel={handleWheel}
      >
        {/* 시나리오 뱃지 (스크롤해도 고정) */}
        <div className={`scenario-badge ${scenarioId ? 'saved' : 'unsaved'}`}>
          <span className="scenario-badge-icon">{scenarioId ? '📄' : '📝'}</span>
          <span className="scenario-badge-name">{scenarioName || '임시 시나리오'}</span>
        </div>

        {/* 노드 검색 (스크롤해도 고정) */}
        <div className="node-search-container">
          <div className="node-search-input-wrapper">
            <span className="node-search-icon">🔍</span>
            <input
              ref={searchInputRef}
              type="text"
              className="node-search-input"
              placeholder="노드 검색 (ID, 라벨, 액션)"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowSearchResults(true);
              }}
              onFocus={() => setShowSearchResults(true)}
              onKeyDown={handleSearchKeyDown}
            />
            {searchQuery && (
              <button
                className="node-search-clear"
                onClick={() => {
                  setSearchQuery('');
                  setShowSearchResults(false);
                }}
              >
                ✕
              </button>
            )}
          </div>
          {showSearchResults && searchQuery && (
            <div className="node-search-results">
              {searchResults.length > 0 ? (
                searchResults.map(node => (
                  <div
                    key={node.id}
                    className="node-search-result-item"
                    onClick={() => scrollToNode(node.id)}
                  >
                    <span className="result-type">{node.type}</span>
                    <span className="result-id">{node.id}</span>
                    {node.label && <span className="result-label">{node.label}</span>}
                    {node.params?.actionType && (
                      <span className="result-action">{node.params.actionType}</span>
                    )}
                  </div>
                ))
              ) : (
                <div className="node-search-no-results">검색 결과 없음</div>
              )}
            </div>
          )}
        </div>

        {/* 스크롤 가능한 콘텐츠 영역 */}
      <div
        className="canvas-content"
        style={{
          width: typeof contentWidth === 'number' ? `${contentWidth * zoom}px` : contentWidth,
          height: typeof contentHeight === 'number' ? `${contentHeight * zoom}px` : contentHeight,
        }}
      >
        <div className="canvas-grid" />

      <svg className="canvas-connections" style={{ transform: `scale(${zoom})`, transformOrigin: '0 0' }}>
        {connections.map((conn, index) => {
          const fromNode = nodes.find(n => n.id === conn.from);
          const toNode = nodes.find(n => n.id === conn.to);
          if (!fromNode || !toNode) return null;

          const pathD = createConnectionPath(fromNode, toNode, conn.label ?? null);
          const isSelected = selectedConnectionIndex === index;
          const lineColor = getConnectionColor(conn.label);
          const isLoopBack = fromNode.x > toNode.x;

          const startPos = getOutputPortPosition(fromNode, conn.label ?? null);
          const labelX = startPos.x + 20;
          const labelY = startPos.y + (conn.label === 'yes' ? -15 : conn.label === 'no' ? 15 : 0);

          return (
            <g key={index}>
              <path d={pathD} className="connection-hitarea"
                onClick={(e) => handleConnectionClick(e, index)}
                onContextMenu={(e) => handleConnectionContextMenu(e, index)} />
              <path d={pathD}
                className={`connection-line ${isSelected ? 'selected' : ''} ${isLoopBack ? 'loop-back' : ''}`}
                style={{ stroke: isSelected ? '#4fc3f7' : lineColor }} />
              <polygon points={getArrowPoints(toNode)}
                className={`connection-arrow ${isSelected ? 'selected' : ''}`}
                style={{ fill: isSelected ? '#4fc3f7' : lineColor }} />
              {conn.label && (
                <text x={labelX} y={labelY} className="connection-label" style={{ fill: lineColor }}>
                  {conn.label === 'yes' ? 'Yes' : conn.label === 'no' ? 'No' : ''}
                </text>
              )}
            </g>
          );
        })}

        {isConnecting && connectingFrom && (
          <path
            d={(() => {
              const fromNode = nodes.find(n => n.id === connectingFrom);
              if (!fromNode) return '';
              const start = getOutputPortPosition(fromNode, connectingBranch);
              const endX = connectingTo.x;
              const endY = connectingTo.y;

              // 꺾이는 지점: 시작 노드 바로 옆, 도착 지점 바로 옆
              const startTurnX = start.x + 25;
              const endTurnX = endX - 25;

              // 왼쪽으로 연결 (줄바꿈 또는 루프백)
              if (start.x > endX) {
                const fromHeight = getNodeHeight(fromNode.id);

                // 그리드 줄바꿈: 아래쪽 줄로 연결하는 경우
                if (fromNode.y + fromHeight < endY) {
                  // 두 줄 사이로 연결선이 지나가도록
                  const midY = (fromNode.y + fromHeight + endY) / 2;
                  return `M ${start.x} ${start.y} L ${startTurnX} ${start.y} L ${startTurnX} ${midY} L ${endTurnX} ${midY} L ${endTurnX} ${endY} L ${endX} ${endY}`;
                }

                // Yes 분기: 위쪽으로 우회
                if (connectingBranch === 'yes') {
                  const loopY = fromNode.y - 50;
                  return `M ${start.x} ${start.y} L ${startTurnX} ${start.y} L ${startTurnX} ${loopY} L ${endTurnX} ${loopY} L ${endTurnX} ${endY} L ${endX} ${endY}`;
                }

                // No 분기 및 일반: 아래쪽으로 우회
                const loopY = fromNode.y + fromHeight + 50;
                return `M ${start.x} ${start.y} L ${startTurnX} ${start.y} L ${startTurnX} ${loopY} L ${endTurnX} ${loopY} L ${endTurnX} ${endY} L ${endX} ${endY}`;
              }

              // 일반 연결 (오른쪽으로)
              // Y가 같으면 직선
              if (Math.abs(start.y - endY) < 10) {
                return `M ${start.x} ${start.y} L ${endX} ${endY}`;
              }

              // Y가 다르면: 위/아래로 우회
              const fromHeight = getNodeHeight(fromNode.id);
              const goingUp = endY < fromNode.y;  // 윗줄로 가는지 여부

              if (connectingBranch === 'yes') {
                // Yes 분기: 윗줄로 가면 아래로 우회, 아랫줄로 가면 위로 우회
                const turnY = goingUp
                  ? Math.max(fromNode.y + fromHeight, endY) + 40
                  : Math.min(fromNode.y, endY) - 40;
                return `M ${start.x} ${start.y} L ${startTurnX} ${start.y} L ${startTurnX} ${turnY} L ${endTurnX} ${turnY} L ${endTurnX} ${endY} L ${endX} ${endY}`;
              } else if (connectingBranch === 'no') {
                // No 분기: 윗줄로 가면 위로 우회, 아랫줄로 가면 아래로 우회
                const turnY = goingUp
                  ? Math.min(fromNode.y, endY) - 40
                  : Math.max(fromNode.y + fromHeight, endY) + 40;
                return `M ${start.x} ${start.y} L ${startTurnX} ${start.y} L ${startTurnX} ${turnY} L ${endTurnX} ${turnY} L ${endTurnX} ${endY} L ${endX} ${endY}`;
              }

              // 일반 연결: 두 지점 사이로 통과
              const midY = goingUp
                ? Math.min(fromNode.y, endY) - 40
                : (fromNode.y + fromHeight + endY) / 2;
              return `M ${start.x} ${start.y} L ${startTurnX} ${start.y} L ${startTurnX} ${midY} L ${endTurnX} ${midY} L ${endTurnX} ${endY} L ${endX} ${endY}`;
            })()}
            className="connection-line connecting"
            style={{ stroke: getConnectionColor(connectingBranch) }}
          />
        )}
      </svg>

      {/* 노드 */}
      {nodes.map((node) => {
        const isSelected = selectedNodeIds.has(node.id);
        const isMultiSelected = selectedNodeIds.size > 1 && isSelected;
        const isPrimarySelected = selectedNodeId === node.id;

        return (
        <div
          key={node.id}
          ref={setNodeRef(node.id)}
          className={`canvas-node horizontal ${isPrimarySelected ? 'selected' : ''} ${isMultiSelected ? 'multi-selected' : ''} ${isSelected && !isPrimarySelected ? 'in-selection' : ''} ${highlightedNodeId === node.id ? `highlight-${highlightStatus || 'pending'}` : ''}`}
          style={{
            left: node.x * zoom,
            top: node.y * zoom,
            transform: `scale(${zoom})`,
            transformOrigin: '0 0',
            '--node-color': getNodeColor(node.type),
          } as React.CSSProperties}
          onClick={(e) => handleNodeClick(e, node.id)}
          onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
          onContextMenu={(e) => handleNodeContextMenu(e, node.id)}
        >
          {/* 입력 포트 (좌측) */}
          {node.type !== 'start' && (
            <div className="node-port port-left" onMouseUp={(e) => handleInputPortMouseUp(e, node.id)} />
          )}
          
          <div className="node-header">
            <span className="node-icon">{getNodeIcon(node.type)}</span>
            <span className="node-type">{node.type}</span>
          </div>

          {/* 노드 라벨 (설명) */}
          {node.label && (
            <div className="node-label" title={node.label}>
              {node.label}
            </div>
          )}

          {node.params?.actionType && (
            <div className="node-body">
              <span className="action-type-label">{node.params.actionType}</span>
              {/* 이미지 액션: 템플릿 미리보기 */}
              {IMAGE_ACTION_TYPES.includes(node.params.actionType) && node.params.templateId && (() => {
                const imgUrl = getTemplateImageUrl(node.params, templates);
                return imgUrl ? (
                  <div className="template-preview">
                    <img
                      src={imgUrl}
                      alt="template"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                ) : null;
              })()}
              {/* 텍스트 OCR 액션: 텍스트 표시 */}
              {TEXT_OCR_ACTION_TYPES.includes(node.params.actionType) && node.params.text && (
                <div className="text-preview" title={node.params.text}>
                  "{node.params.text}"
                </div>
              )}
            </div>
          )}

          {node.params?.conditionType && (
            <div className="node-body">
              <span className="condition-type-label">{node.params.conditionType}</span>
              {/* 이미지 조건: 템플릿 미리보기 */}
              {IMAGE_CONDITION_TYPES.includes(node.params.conditionType) && node.params.templateId && (() => {
                const imgUrl = getTemplateImageUrl(node.params, templates);
                return imgUrl ? (
                  <div className="template-preview">
                    <img
                      src={imgUrl}
                      alt="template"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                ) : null;
              })()}
              {/* OCR 조건: 텍스트 표시 */}
              {OCR_CONDITION_TYPES.includes(node.params.conditionType) && node.params.text && (
                <div className="text-preview" title={node.params.text}>
                  "{node.params.text}"
                </div>
              )}
            </div>
          )}

          {/* 출력 포트 (우측) */}
          {node.type !== 'end' && node.type !== 'condition' && (
            <div className="node-port port-right" onMouseDown={(e) => handleOutputPortMouseDown(e, node.id, null)} />
          )}

          {/* 조건 노드: Yes (상단), No (하단) */}
          {node.type === 'condition' && (
            <>
              <div className="node-port condition-yes-horizontal"
                onMouseDown={(e) => handleOutputPortMouseDown(e, node.id, 'yes')} title="Yes (조건 참)">Y</div>
              <div className="node-port condition-no-horizontal"
                onMouseDown={(e) => handleOutputPortMouseDown(e, node.id, 'no')} title="No (조건 거짓)">N</div>
            </>
          )}
        </div>
        );
      })}

      {nodes.length === 0 && (
        <div className="canvas-empty">
          <p>왼쪽에서 노드를 드래그하여 추가하세요</p>
        </div>
      )}
      </div>{/* canvas-content 닫기 */}

      {contextMenu && (
        <div
          className="context-menu-wrapper"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {/* 메인 메뉴 */}
          <div className="context-menu">
            {/* 노드 컨텍스트 메뉴 */}
            {contextMenu.type === 'node' && (
              <>
                <button
                  onClick={handleRunFromHere}
                  onMouseEnter={() => setContextMenu(prev => prev ? { ...prev, showSubMenu: null } : null)}
                >
                  ▶️ 여기서부터 실행
                </button>
                <button
                  className={`has-submenu ${contextMenu.showSubMenu === 'changeType' ? 'active' : ''}`}
                  onMouseEnter={handleShowChangeTypeMenu}
                >
                  🔄 타입 변경 ▶
                </button>
                <button
                  className={`has-submenu ${contextMenu.showSubMenu === 'insert' ? 'active' : ''}`}
                  onMouseEnter={handleShowInsertMenu}
                >
                  ➕ 노드 삽입 ▶
                </button>
                <button
                  onClick={handleContextDeleteNode}
                  onMouseEnter={() => setContextMenu(prev => prev ? { ...prev, showSubMenu: null } : null)}
                >
                  🗑️ 노드 삭제
                </button>
              </>
            )}

            {/* 연결선 컨텍스트 메뉴 */}
            {contextMenu.type === 'connection' && (
              <button
                onClick={handleContextDeleteConnection}
              >
                🗑️ 연결 삭제
              </button>
            )}
          </div>

          {/* 노드 타입 변경 서브메뉴 */}
          {contextMenu.type === 'node' && contextMenu.showSubMenu === 'changeType' && (
            <div className="context-submenu">
              {NODE_TYPE_LIST.map(item => {
                const currentNode = nodes.find(n => n.id === contextMenu.nodeId);
                const isCurrentType = currentNode?.type === item.type;
                return (
                  <button
                    key={item.type}
                    onClick={() => handleChangeNodeType(item.type)}
                    disabled={isCurrentType}
                    className={isCurrentType ? 'current-type' : ''}
                  >
                    {item.icon} {item.label} {isCurrentType && '✓'}
                  </button>
                );
              })}
            </div>
          )}

          {/* 노드 삽입 서브메뉴 */}
          {contextMenu.type === 'node' && contextMenu.showSubMenu === 'insert' && (
            <div className="context-submenu">
              {NODE_TYPE_LIST.filter(item => item.type !== 'start' && item.type !== 'end').map(item => (
                <button
                  key={item.type}
                  onClick={() => handleInsertNode(item.type)}
                >
                  {item.icon} {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      </div>{/* canvas 닫기 */}
    </div>
  );
}

export default Canvas;