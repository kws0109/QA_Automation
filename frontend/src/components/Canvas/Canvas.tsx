// frontend/src/components/Canvas/Canvas.tsx

import { useState, useRef, useMemo, useCallback } from 'react';
import type { NodeType } from '../../types';
import { API_BASE_URL } from '../../config/api';
import { useFlowEditor, useScenarioEditor, useEditorPreview } from '../../contexts';
import './Canvas.css';

// 이미지 관련 액션 타입
const IMAGE_ACTION_TYPES = ['tapImage', 'waitUntilImage', 'waitUntilImageGone'];

// 텍스트 OCR 관련 액션 타입
const TEXT_OCR_ACTION_TYPES = ['tapTextOcr', 'waitUntilTextOcr', 'waitUntilTextGoneOcr', 'assertTextOcr'];

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
    handleNodeSelect: onNodeSelect,
    handleNodeMove: onNodeMove,
    handleNodeAdd: onNodeAdd,
    handleNodeDelete: onNodeDelete,
    handleNodeInsertAfter: onNodeInsertAfter,
    handleNodeTypeChange: onNodeTypeChange,
    handleConnectionAdd: onConnectionAdd,
    handleConnectionDelete: onConnectionDelete,
    handleConnectionSelect: onConnectionSelect,
  } = useFlowEditor();

  const { currentScenarioName: scenarioName, currentScenarioId: scenarioId } = useScenarioEditor();
  const { highlightedNodeId, highlightStatus, setStartFromNodeId } = useEditorPreview();
  const canvasRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  
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

  // 콘텐츠 영역 너비 계산 (노드 위치 기반)
  const contentWidth = useMemo(() => {
    if (nodes.length === 0) return '100%';
    const rightmostX = Math.max(...nodes.map(n => n.x));
    // 가장 오른쪽 노드 + 노드 너비 + 여백
    return Math.max(rightmostX + NODE_WIDTH + 100, 1500);
  }, [nodes]);

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
    onNodeSelect?.(nodeId);
    onConnectionSelect?.(null);
    closeContextMenu();
  };

  // 노드 드래그 비활성화 - 클릭만 처리
  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    onNodeSelect?.(nodeId);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isConnecting && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const scrollLeft = canvasRef.current.scrollLeft;
      const scrollTop = canvasRef.current.scrollTop;
      setConnectingTo({
        x: e.clientX - rect.left + scrollLeft,
        y: e.clientY - rect.top + scrollTop,
      });
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
      setConnectingTo({
        x: e.clientX - rect.left + scrollLeft,
        y: e.clientY - rect.top + scrollTop,
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
  const createConnectionPath = (fromNode: FlowNode, toNode: FlowNode, branch: string | null): string => {
    const start = getOutputPortPosition(fromNode, branch);
    const end = getInputPortPosition(toNode);

    // 루프 연결 (되돌아가기): 아래로 우회
    if (start.x > end.x) {
      const fromHeight = getNodeHeight(fromNode.id);
      const toHeight = getNodeHeight(toNode.id);
      const loopY = Math.max(fromNode.y + fromHeight, toNode.y + toHeight) + 60;
      return `M ${start.x} ${start.y} L ${start.x + 30} ${start.y} C ${start.x + 30} ${loopY}, ${end.x - 30} ${loopY}, ${end.x - 30} ${end.y} L ${end.x} ${end.y}`;
    }

    // 컨디션 노드: Yes는 위로 살짝, No는 아래로 살짝 휘어지는 경로
    if (fromNode.type === 'condition') {
      const midX = (start.x + end.x) / 2;
      if (branch === 'yes') {
        // Yes: 위로 약간 곡선
        const curveY = Math.min(start.y, end.y) - 20;
        return `M ${start.x} ${start.y} C ${midX} ${curveY}, ${midX} ${end.y}, ${end.x} ${end.y}`;
      }
      if (branch === 'no') {
        // No: 아래로 약간 곡선
        const curveY = Math.max(start.y, end.y) + 20;
        return `M ${start.x} ${start.y} C ${midX} ${curveY}, ${midX} ${end.y}, ${end.x} ${end.y}`;
      }
    }

    // 일반 수평 연결
    const midX = (start.x + end.x) / 2;
    return `M ${start.x} ${start.y} C ${midX} ${start.y}, ${midX} ${end.y}, ${end.x} ${end.y}`;
  };

  // 화살표 (오른쪽을 향함 - 입력 포트 왼쪽에 표시)
  const getArrowPoints = (node: FlowNode): string => {
    const pos = getInputPortPosition(node);
    // 화살표가 입력 포트(좌측)를 향해 오른쪽으로 가리킴
    return `${pos.x - 12},${pos.y - 5} ${pos.x - 12},${pos.y + 5} ${pos.x - 4},${pos.y}`;
  };

  return (
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
    >
      {/* 시나리오 뱃지 (스크롤해도 고정) */}
      <div className={`scenario-badge ${scenarioId ? 'saved' : 'unsaved'}`}>
        <span className="scenario-badge-icon">{scenarioId ? '📄' : '📝'}</span>
        <span className="scenario-badge-name">{scenarioName || '임시 시나리오'}</span>
      </div>

      {/* 스크롤 가능한 콘텐츠 영역 */}
      <div
        className="canvas-content"
        style={{ width: typeof contentWidth === 'number' ? `${contentWidth}px` : contentWidth }}
      >
        <div className="canvas-grid" />

      <svg className="canvas-connections">
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
              const midX = (start.x + connectingTo.x) / 2;
              return `M ${start.x} ${start.y} C ${midX} ${start.y}, ${midX} ${connectingTo.y}, ${connectingTo.x} ${connectingTo.y}`;
            })()}
            className="connection-line connecting"
            style={{ stroke: getConnectionColor(connectingBranch) }}
          />
        )}
      </svg>

      {/* 노드 */}
      {nodes.map((node) => (
        <div
          key={node.id}
          ref={setNodeRef(node.id)}
          className={`canvas-node horizontal ${selectedNodeId === node.id ? 'selected' : ''} ${highlightedNodeId === node.id ? `highlight-${highlightStatus || 'pending'}` : ''}`}
          style={{
            left: node.x,
            top: node.y,
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
              {IMAGE_ACTION_TYPES.includes(node.params.actionType) && node.params.templateId && (
                <div className="template-preview">
                  <img
                    src={`${API_BASE_URL}/api/image/templates/${node.params.templateId}/image`}
                    alt="template"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
              )}
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
              {node.params.conditionType}
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
      ))}

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
    </div>
  );
}

export default Canvas;