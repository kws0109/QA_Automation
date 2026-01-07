// frontend/src/components/Canvas/Canvas.jsx

import { useState, useRef } from 'react';
import './Canvas.css';

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
}) {
  const canvasRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [contextMenu, setContextMenu] = useState(null);
  
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectingFrom, setConnectingFrom] = useState(null);
  const [connectingBranch, setConnectingBranch] = useState(null);
  const [connectingTo, setConnectingTo] = useState({ x: 0, y: 0 });

  const handleDrop = (e) => {
    e.preventDefault();
    const nodeType = e.dataTransfer.getData('nodeType');
    
    if (nodeType && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      onNodeAdd && onNodeAdd(nodeType, x, y);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleNodeClick = (e, nodeId) => {
    e.stopPropagation();
    onNodeSelect && onNodeSelect(nodeId);
    onConnectionSelect && onConnectionSelect(null);
    closeContextMenu();
  };

  const handleNodeMouseDown = (e, nodeId) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    
    const node = nodes.find(n => n.id === nodeId);
    if (node) {
      setIsDragging(true);
      onNodeSelect && onNodeSelect(nodeId);
      setDragOffset({
        x: e.clientX - node.x,
        y: e.clientY - node.y,
      });
    }
  };

  const handleMouseMove = (e) => {
    if (isDragging && selectedNodeId) {
      const newX = e.clientX - dragOffset.x;
      const newY = e.clientY - dragOffset.y;
      onNodeMove && onNodeMove(selectedNodeId, newX, newY);
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

  const handleCanvasClick = (e) => {
    if (e.target === canvasRef.current || e.target.classList.contains('canvas-grid')) {
      onNodeSelect && onNodeSelect(null);
      onConnectionSelect && onConnectionSelect(null);
    }
    closeContextMenu();
  };

  // 출력 포트 드래그 시작 (분기 지원)
  const handleOutputPortMouseDown = (e, nodeId, branch = null) => {
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
  const handleInputPortMouseUp = (e, nodeId) => {
    e.stopPropagation();
    
    if (isConnecting && connectingFrom && connectingFrom !== nodeId) {
      const exists = connections.some(
        conn => conn.from === connectingFrom && conn.to === nodeId && conn.branch === connectingBranch,
      );
      
      if (!exists) {
        onConnectionAdd && onConnectionAdd(connectingFrom, nodeId, connectingBranch);
      }
    }
    
    setIsConnecting(false);
    setConnectingFrom(null);
    setConnectingBranch(null);
  };

  const handleConnectionClick = (e, index) => {
    e.stopPropagation();
    onConnectionSelect && onConnectionSelect(index);
    onNodeSelect && onNodeSelect(null);
  };

  const handleNodeContextMenu = (e, nodeId) => {
    e.preventDefault();
    e.stopPropagation();
    onNodeSelect && onNodeSelect(nodeId);
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      nodeId,
      type: 'node',
    });
  };

  const handleConnectionContextMenu = (e, index) => {
    e.preventDefault();
    e.stopPropagation();
    onConnectionSelect && onConnectionSelect(index);
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
      onNodeDelete && onNodeDelete(contextMenu.nodeId);
    }
    closeContextMenu();
  };

  const handleContextDeleteConnection = () => {
    if (contextMenu?.connectionIndex !== undefined) {
      onConnectionDelete && onConnectionDelete(contextMenu.connectionIndex);
    }
    closeContextMenu();
  };

  const getNodeColor = (type) => {
    const colors = {
      start: '#4caf50',
      action: '#2196f3',
      condition: '#ff9800',
      loop: '#9c27b0',
      end: '#f44336',
    };
    return colors[type] || '#666';
  };

  const getNodeIcon = (type) => {
    const icons = {
      start: '▶️',
      action: '⚡',
      condition: '❓',
      loop: '🔄',
      end: '⏹️',
    };
    return icons[type] || '📦';
  };

  // 연결선 색상 (분기별)
  const getConnectionColor = (branch) => {
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
            if (conn.branch === 'yes') {
              startX = fromNode.x - 2;        // 왼쪽
              startY = fromNode.y + 25;       // 중앙
            } else if (conn.branch === 'no') {
              startX = fromNode.x + 142;      // 오른쪽
              startY = fromNode.y + 25;       // 중앙
            }
          }
          
          const endX = toNode.x + 70;
          const endY = toNode.y;
          
          const midY = (startY + endY) / 2;
          const isSelected = selectedConnectionIndex === index;
          const lineColor = getConnectionColor(conn.branch);
          
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
              {conn.branch && (
                <text
                  x={startX + (endX - startX) * 0.3}
                  y={startY + (midY - startY) * 0.5}
                  className="connection-label"
                  style={{ fill: lineColor }}
                >
                  {conn.branch === 'yes' ? 'Yes' : 'No'}
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
          }}
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
          
          {node.params?.actionType && (
            <div className="node-body">
              {node.params.actionType}
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