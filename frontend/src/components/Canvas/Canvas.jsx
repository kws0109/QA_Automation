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
  onConnectionSelect
}) {
  const canvasRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [contextMenu, setContextMenu] = useState(null);
  
  // 연결선 드래그 상태
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectingFrom, setConnectingFrom] = useState(null);
  const [connectingTo, setConnectingTo] = useState({ x: 0, y: 0 });

  // 드래그 앤 드롭으로 노드 추가
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

  // 노드 클릭 (선택)
  const handleNodeClick = (e, nodeId) => {
    e.stopPropagation();
    onNodeSelect && onNodeSelect(nodeId);
    onConnectionSelect && onConnectionSelect(null);
    closeContextMenu();
  };

  // 노드 드래그 시작
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

  // 마우스 이동
  const handleMouseMove = (e) => {
    // 노드 드래그
    if (isDragging && selectedNodeId) {
      const newX = e.clientX - dragOffset.x;
      const newY = e.clientY - dragOffset.y;
      onNodeMove && onNodeMove(selectedNodeId, newX, newY);
    }
    
    // 연결선 드래그
    if (isConnecting && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      setConnectingTo({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
  };

  // 마우스 업
  const handleMouseUp = () => {
    setIsDragging(false);
    
    // 연결선 드래그 종료
    if (isConnecting) {
      setIsConnecting(false);
      setConnectingFrom(null);
    }
  };

  // 캔버스 빈 영역 클릭
  const handleCanvasClick = (e) => {
    if (e.target === canvasRef.current || e.target.classList.contains('canvas-grid')) {
      onNodeSelect && onNodeSelect(null);
      onConnectionSelect && onConnectionSelect(null);
    }
    closeContextMenu();
  };

  // 출력 포트에서 드래그 시작
  const handleOutputPortMouseDown = (e, nodeId) => {
    e.stopPropagation();
    
    const node = nodes.find(n => n.id === nodeId);
    if (node && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      setIsConnecting(true);
      setConnectingFrom(nodeId);
      setConnectingTo({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
  };

  // 입력 포트에서 마우스 업 (연결 완료)
  const handleInputPortMouseUp = (e, nodeId) => {
    e.stopPropagation();
    
    if (isConnecting && connectingFrom && connectingFrom !== nodeId) {
      // 이미 존재하는 연결인지 확인
      const exists = connections.some(
        conn => conn.from === connectingFrom && conn.to === nodeId
      );
      
      if (!exists) {
        onConnectionAdd && onConnectionAdd(connectingFrom, nodeId);
      }
    }
    
    setIsConnecting(false);
    setConnectingFrom(null);
  };

  // 연결선 클릭
  const handleConnectionClick = (e, index) => {
    e.stopPropagation();
    onConnectionSelect && onConnectionSelect(index);
    onNodeSelect && onNodeSelect(null);
  };

  // 노드 우클릭
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

  // 연결선 우클릭
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

  // 컨텍스트 메뉴 닫기
  const closeContextMenu = () => {
    setContextMenu(null);
  };

  // 컨텍스트 메뉴 - 노드 삭제
  const handleContextDeleteNode = () => {
    if (contextMenu?.nodeId) {
      onNodeDelete && onNodeDelete(contextMenu.nodeId);
    }
    closeContextMenu();
  };

  // 컨텍스트 메뉴 - 연결선 삭제
  const handleContextDeleteConnection = () => {
    if (contextMenu?.connectionIndex !== undefined) {
      onConnectionDelete && onConnectionDelete(contextMenu.connectionIndex);
    }
    closeContextMenu();
  };

  // 노드 색상
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

  // 노드 아이콘
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
      {/* 그리드 배경 */}
      <div className="canvas-grid" />

      {/* 연결선 (SVG) */}
      <svg className="canvas-connections">
        {/* 기존 연결선 */}
        {connections.map((conn, index) => {
          const fromNode = nodes.find(n => n.id === conn.from);
          const toNode = nodes.find(n => n.id === conn.to);
          
          if (!fromNode || !toNode) return null;
          
          const startX = fromNode.x + 70;
          const startY = fromNode.y + 50;
          const endX = toNode.x + 70;
          const endY = toNode.y;
          
          const midY = (startY + endY) / 2;
          const isSelected = selectedConnectionIndex === index;
          
          return (
            <g key={index}>
              {/* 클릭 영역 (투명, 넓은 영역) */}
              <path
                d={`M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}`}
                className="connection-hitarea"
                onClick={(e) => handleConnectionClick(e, index)}
                onContextMenu={(e) => handleConnectionContextMenu(e, index)}
              />
              {/* 보이는 선 */}
              <path
                d={`M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}`}
                className={`connection-line ${isSelected ? 'selected' : ''}`}
              />
              {/* 화살표 */}
              <polygon
                points={`${endX},${endY} ${endX-5},${endY-8} ${endX+5},${endY-8}`}
                className={`connection-arrow ${isSelected ? 'selected' : ''}`}
              />
            </g>
          );
        })}

        {/* 드래그 중인 연결선 */}
        {isConnecting && connectingFrom && (
          <path
            d={(() => {
              const fromNode = nodes.find(n => n.id === connectingFrom);
              if (!fromNode) return '';
              
              const startX = fromNode.x + 70;
              const startY = fromNode.y + 50;
              const midY = (startY + connectingTo.y) / 2;
              
              return `M ${startX} ${startY} C ${startX} ${midY}, ${connectingTo.x} ${midY}, ${connectingTo.x} ${connectingTo.y}`;
            })()}
            className="connection-line connecting"
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
          {/* 입력 포트 (상단) - start 노드 제외 */}
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

          {/* 출력 포트 (하단) - end 노드 제외 */}
          {node.type !== 'end' && (
            <div 
              className="node-port output"
              onMouseDown={(e) => handleOutputPortMouseDown(e, node.id)}
            />
          )}
        </div>
      ))}

      {/* 빈 캔버스 안내 */}
      {nodes.length === 0 && (
        <div className="canvas-empty">
          <p>왼쪽에서 노드를 드래그하여 추가하세요</p>
        </div>
      )}

      {/* 우클릭 컨텍스트 메뉴 */}
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