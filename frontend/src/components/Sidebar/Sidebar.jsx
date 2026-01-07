// frontend/src/components/Sidebar/Sidebar.jsx

import './Sidebar.css';

// 노드 타입 정의
const NODE_TYPES = [
  { type: 'start', icon: '▶', label: 'Start', color: '#22c55e' },
  { type: 'action', icon: '⚡', label: 'Action', color: '#3b82f6' },
  { type: 'condition', icon: '?', label: 'Condition', color: '#f59e0b' },
  { type: 'loop', icon: '↻', label: 'Loop', color: '#a855f7' },  // 보라색
  { type: 'end', icon: '■', label: 'End', color: '#ef4444' },
];

function Sidebar({ onDragStart }) {
  const handleDragStart = (e, nodeType) => {
    e.dataTransfer.setData('nodeType', nodeType);
    if (onDragStart) {
      onDragStart(nodeType);
    }
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h2>노드</h2>
      </div>
      
      <div className="sidebar-content">
        {NODE_TYPES.map((node) => (
          <div
            key={node.type}
            className="node-item"
            draggable
            onDragStart={(e) => handleDragStart(e, node.type)}
            style={{ '--node-color': node.color }}
          >
            <span className="node-icon">{node.icon}</span>
            <span className="node-label">{node.label}</span>
          </div>
        ))}
      </div>
      
      <div className="sidebar-footer">
        <p className="sidebar-hint">드래그하여 캔버스에 추가</p>
      </div>
    </aside>
  );
}

export default Sidebar;