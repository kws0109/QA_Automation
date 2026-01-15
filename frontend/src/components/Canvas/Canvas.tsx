// frontend/src/components/Canvas/Canvas.tsx

import { useState, useRef } from 'react';
import type { FlowNode, Connection, NodeType } from '../../types';
import './Canvas.css';

const API_BASE = 'http://127.0.0.1:3001';

// 이미지 관련 액션 타입
const IMAGE_ACTION_TYPES = ['tapImage', 'waitUntilImage', 'waitUntilImageGone'];

// 텍스트 OCR 관련 액션 타입
const TEXT_OCR_ACTION_TYPES = ['tapTextOcr', 'waitUntilTextOcr', 'waitUntilTextGoneOcr', 'assertTextOcr'];

// 레이아웃 상수 (좌→우 배치)
const NODE_WIDTH = 140;
const NODE_HEIGHT = 80;
const NODE_GAP_X = 200;
const START_X = 50;
const START_Y = 200;

interface ContextMenuState {
  x: number;
  y: number;
  nodeId?: string;
  connectionIndex?: number;
  type: 'node' | 'connection';
}

interface CanvasProps {
  nodes: FlowNode[];
  connections: Connection[];
  selectedNodeId: string | null;
  selectedConnectionIndex: number | null;
  onNodeSelect?: (nodeId: string | null) => void;
  onNodeMove?: (nodeId: string, x: number, y: number) => void;
  onNodeAdd?: (type: NodeType, x: number, y: number) => void;
  onNodeDelete?: (nodeId: string) => void;
  onConnectionAdd?: (fromId: string, toId: string, branch: string | null) => void;
  onConnectionDelete?: (index: number) => void;
  onConnectionSelect?: (index: number | null) => void;
  // 시나리오 정보
  scenarioName?: string;
  scenarioId?: string | null;
}

function Canvas({
  nodes,
  connections,
  selectedNodeId,
  selectedConnectionIndex,
  onNodeSelect,
  onNodeMove,
  onNodeAdd,
  onNodeDelete,
  onConnectionAdd,
  onConnectionDelete,
  onConnectionSelect,
  scenarioName,
  scenarioId,
}: CanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [connectingBranch, setConnectingBranch] = useState<string | null>(null);
  const [connectingTo, setConnectingTo] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

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
      setConnectingTo({ x: e.clientX - rect.left, y: e.clientY - rect.top });
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
      setIsConnecting(true);
      setConnectingFrom(nodeId);
      setConnectingBranch(branch);
      setConnectingTo({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
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

  // 좌→우 레이아웃: 포트 위치 계산
  const getOutputPortPosition = (node: FlowNode, branch: string | null): { x: number; y: number } => {
    if (node.type === 'condition') {
      if (branch === 'yes') return { x: node.x + NODE_WIDTH / 2, y: node.y - 2 };
      if (branch === 'no') return { x: node.x + NODE_WIDTH / 2, y: node.y + NODE_HEIGHT + 2 };
    }
    return { x: node.x + NODE_WIDTH + 2, y: node.y + NODE_HEIGHT / 2 };
  };

  const getInputPortPosition = (node: FlowNode): { x: number; y: number } => {
    return { x: node.x - 2, y: node.y + NODE_HEIGHT / 2 };
  };

  // 수평 연결선 경로 생성
  const createConnectionPath = (fromNode: FlowNode, toNode: FlowNode, branch: string | null): string => {
    const start = getOutputPortPosition(fromNode, branch);
    const end = getInputPortPosition(toNode);

    if (fromNode.type === 'condition') {
      if (branch === 'yes') {
        const midY = Math.min(start.y, end.y) - 40;
        return `M ${start.x} ${start.y} C ${start.x} ${midY}, ${end.x} ${midY}, ${end.x} ${end.y}`;
      }
      if (branch === 'no') {
        const midY = Math.max(start.y, end.y) + 40;
        return `M ${start.x} ${start.y} C ${start.x} ${midY}, ${end.x} ${midY}, ${end.x} ${end.y}`;
      }
    }

    // 루프 연결 (되돌아가기): 아래로 우회
    if (start.x > end.x) {
      const loopY = Math.max(fromNode.y, toNode.y) + NODE_HEIGHT + 60;
      return `M ${start.x} ${start.y} L ${start.x + 30} ${start.y} C ${start.x + 30} ${loopY}, ${end.x - 30} ${loopY}, ${end.x - 30} ${end.y} L ${end.x} ${end.y}`;
    }

    // 일반 수평 연결
    const midX = (start.x + end.x) / 2;
    return `M ${start.x} ${start.y} C ${midX} ${start.y}, ${midX} ${end.y}, ${end.x} ${end.y}`;
  };

  // 화살표 (좌측을 향함)
  const getArrowPoints = (node: FlowNode): string => {
    const pos = getInputPortPosition(node);
    return `${pos.x},${pos.y} ${pos.x - 8},${pos.y - 5} ${pos.x - 8},${pos.y + 5}`;
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
      {/* 시나리오 뱃지 */}
      <div className={`scenario-badge ${scenarioId ? 'saved' : 'unsaved'}`}>
        <span className="scenario-badge-icon">{scenarioId ? '📄' : '📝'}</span>
        <span className="scenario-badge-name">{scenarioName || '임시 시나리오'}</span>
      </div>

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
          className={`canvas-node horizontal ${selectedNodeId === node.id ? 'selected' : ''}`}
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
                    src={`${API_BASE}/api/image/templates/${node.params.templateId}/image`}
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

      {contextMenu && (
        <div 
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {contextMenu.type === 'node' && (
            <button onClick={handleContextDeleteNode}>🗑️ 노드 삭제</button>
          )}
          {contextMenu.type === 'connection' && (
            <button onClick={handleContextDeleteConnection}>🗑️ 연결 삭제</button>
          )}
        </div>
      )}
    </div>
  );
}

export default Canvas;