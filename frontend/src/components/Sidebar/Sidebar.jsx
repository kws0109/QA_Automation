// frontend/src/components/Sidebar/Sidebar.jsx

import './Sidebar.css';

// 노드 타입 정의
const NODE_TYPES = [
  { type: 'start', label: '시작', icon: '▶️', color: '#4caf50' },
  { type: 'action', label: '액션', icon: '⚡', color: '#2196f3' },
  { type: 'condition', label: '조건', icon: '❓', color: '#ff9800' },
  { type: 'loop', label: '반복', icon: '🔄', color: '#9c27b0' },
  { type: 'end', label: '종료', icon: '⏹️', color: '#f44336' },
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