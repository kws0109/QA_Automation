// frontend/src/components/Canvas/Canvas.tsx

import { useState, useRef } from 'react';
import type { FlowNode, Connection, NodeType } from '../../types';
import './Canvas.css';

const API_BASE = 'http://localhost:3001';

// 이미지 관련 액션 타입
const IMAGE_ACTION_TYPES = ['tapImage', 'waitUntilImage', 'waitUntilImageGone'];

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
}: CanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [connectingBranch, setConnectingBranch] = useState<string | null>(null);
  const [connectingTo, setConnectingTo] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const nodeType = e.dataTransfer.getData('nodeType') as NodeType;
    
    if (nodeType && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
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

  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    
    const node = nodes.find(n => n.id === nodeId);
    if (node) {
      setIsDragging(true);
      onNodeSelect?.(nodeId);
      setDragOffset({
        x: e.clientX - node.x,
        y: e.clientY - node.y,
      });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && selectedNodeId) {
      const newX = e.clientX - dragOffset.x;
      const newY = e.clientY - dragOffset.y;
      onNodeMove?.(selectedNodeId, newX, newY);
    }
    
    if (isConnecting && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      setConnectingTo({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    
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
      return '#6b7280';  // 기본 회색
    }
  };

  return (
    <div 
      className="canvas"
      ref={canvasRef}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={handleCanvasClick}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="canvas-grid" />

      <svg className="canvas-connections">
        {connections.map((conn, index) => {
          const fromNode = nodes.find(n => n.id === conn.from);
          const toNode = nodes.find(n => n.id === conn.to);
          
          if (!fromNode || !toNode) return null;
          
          // 출발 위치 (조건 노드 분기에 따라 다름)
          let startX = fromNode.x + 70;
          let startY = fromNode.y + 50;

          if (fromNode.type === 'condition') {
            if (conn.label === 'yes') {
              startX = fromNode.x - 2;        // 왼쪽
              startY = fromNode.y + 25;       // 중앙
            } else if (conn.label === 'no') {
              startX = fromNode.x + 142;      // 오른쪽
              startY = fromNode.y + 25;       // 중앙
            }
          }
          
          const endX = toNode.x + 70;
          const endY = toNode.y;
          
          const midY = (startY + endY) / 2;
          const isSelected = selectedConnectionIndex === index;
          const lineColor = getConnectionColor(conn.label);
          
          return (
            <g key={index}>
              <path
                d={`M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}`}
                className="connection-hitarea"
                onClick={(e) => handleConnectionClick(e, index)}
                onContextMenu={(e) => handleConnectionContextMenu(e, index)}
              />
              <path
                d={`M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}`}
                className={`connection-line ${isSelected ? 'selected' : ''}`}
                style={{ stroke: isSelected ? '#4fc3f7' : lineColor }}
              />
              <polygon
                points={`${endX},${endY} ${endX-5},${endY-8} ${endX+5},${endY-8}`}
                className={`connection-arrow ${isSelected ? 'selected' : ''}`}
                style={{ fill: isSelected ? '#4fc3f7' : lineColor }}
              />
              {/* 분기 라벨 */}
              {conn.label && (
                <text
                  x={startX + (endX - startX) * 0.3}
                  y={startY + (midY - startY) * 0.5}
                  className="connection-label"
                  style={{ fill: lineColor }}
                >
                  {conn.label === 'yes' ? 'Yes' : 'No'}
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
              
              let startX = fromNode.x + 70;
              let startY = fromNode.y + 50;
              
              if (fromNode.type === 'condition') {
                if (connectingBranch === 'yes') {
                  startX = fromNode.x - 2;
                  startY = fromNode.y + 25;
                } else if (connectingBranch === 'no') {
                  startX = fromNode.x + 142;
                  startY = fromNode.y + 25;
                }
              }
              
              // 곡선 조정
              const dx = connectingTo.x - startX;
              const controlX = startX + dx * 0.5;
              
              return `M ${startX} ${startY} C ${controlX} ${startY}, ${controlX} ${connectingTo.y}, ${connectingTo.x} ${connectingTo.y}`;
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
          className={`canvas-node ${selectedNodeId === node.id ? 'selected' : ''}`}
          style={{
            left: node.x,
            top: node.y,
            '--node-color': getNodeColor(node.type),
          } as React.CSSProperties}
          onClick={(e) => handleNodeClick(e, node.id)}
          onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
          onContextMenu={(e) => handleNodeContextMenu(e, node.id)}
        >
          {/* 입력 포트 (상단) */}
          {node.type !== 'start' && (
            <div 
              className="node-port input"
              onMouseUp={(e) => handleInputPortMouseUp(e, node.id)}
            />
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
                    src={`${API_BASE}/templates/${node.params.templateId}.png`}
                    alt="template"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {node.params?.conditionType && (
            <div className="node-body">
              {node.params.conditionType}
            </div>
          )}

          {/* 일반 출력 포트 (하단) */}
          {node.type !== 'end' && node.type !== 'condition' && (
            <div 
              className="node-port output"
              onMouseDown={(e) => handleOutputPortMouseDown(e, node.id, null)}
            />
          )}

          {/* 조건 노드: Yes 포트 (왼쪽) */}
          {node.type === 'condition' && (
            <div 
              className="node-port condition-yes"
              onMouseDown={(e) => handleOutputPortMouseDown(e, node.id, 'yes')}
              title="Yes (조건 참)"
            >
              Y
            </div>
          )}

          {/* 조건 노드: No 포트 (오른쪽) */}
          {node.type === 'condition' && (
            <div 
              className="node-port condition-no"
              onMouseDown={(e) => handleOutputPortMouseDown(e, node.id, 'no')}
              title="No (조건 거짓)"
            >
              N
            </div>
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