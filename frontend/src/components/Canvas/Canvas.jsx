// frontend/src/components/Canvas/Canvas.jsx

import { useState, useRef } from 'react';
import './Canvas.css';

function Canvas({ 
  nodes, 
  connections, 
  selectedNodeId,
  onNodeSelect, 
  onNodeMove,
  onNodeAdd,
  onNodeDelete
}) {
  const canvasRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [contextMenu, setContextMenu] = useState(null);

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
    e.stopPropagation();  // 캔버스 클릭 이벤트 전파 방지
    onNodeSelect && onNodeSelect(nodeId);
    closeContextMenu();
  };

  // 노드 드래그 시작
  const handleNodeMouseDown = (e, nodeId) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    
    const node = nodes.find(n => n.id === nodeId);
    if (node) {
      setIsDragging(true);
      setDragOffset({
        x: e.clientX - node.x,
        y: e.clientY - node.y,
      });
    }
  };

  // 노드 드래그 중
  const handleMouseMove = (e) => {
    if (isDragging && selectedNodeId) {
      const newX = e.clientX - dragOffset.x;
      const newY = e.clientY - dragOffset.y;
      onNodeMove && onNodeMove(selectedNodeId, newX, newY);
    }
  };

  // 노드 드래그 종료
  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // 캔버스 빈 영역 클릭 (선택 해제)
  const handleCanvasClick = (e) => {
    // 캔버스 자체를 클릭했을 때만 선택 해제
    if (e.target === canvasRef.current || e.target.classList.contains('canvas-grid')) {
      onNodeSelect && onNodeSelect(null);
    }
    closeContextMenu();
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
    });
  };

  // 컨텍스트 메뉴 닫기
  const closeContextMenu = () => {
    setContextMenu(null);
  };

  // 컨텍스트 메뉴에서 삭제
  const handleContextDelete = () => {
    if (contextMenu?.nodeId) {
      onNodeDelete && onNodeDelete(contextMenu.nodeId);
    }
    closeContextMenu();
  };

  // 노드 색상 반환
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

  // 노드 아이콘 반환
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
        {connections.map((conn, index) => {
          const fromNode = nodes.find(n => n.id === conn.from);
          const toNode = nodes.find(n => n.id === conn.to);
          
          if (!fromNode || !toNode) return null;
          
          const startX = fromNode.x + 70;
          const startY = fromNode.y + 40;
          const endX = toNode.x + 70;
          const endY = toNode.y;
          
          const midY = (startY + endY) / 2;
          
          return (
            <path
              key={index}
              d={`M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}`}
              className="connection-line"
            />
          );
        })}
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
          <div className="node-header">
            <span className="node-icon">{getNodeIcon(node.type)}</span>
            <span className="node-type">{node.type}</span>
          </div>
          {node.params?.actionType && (
            <div className="node-body">
              {node.params.actionType}
            </div>
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
          <button onClick={handleContextDelete}>🗑️ 삭제</button>
        </div>
      )}
    </div>
  );
}

export default Canvas;