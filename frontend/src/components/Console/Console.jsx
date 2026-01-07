// frontend/src/components/Console/Console.jsx

import { useEffect, useRef } from 'react';
import './Console.css';

function Console({ logs, isRunning }) {
  const consoleRef = useRef(null);

  // 새 로그 추가 시 자동 스크롤
  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [logs]);

  const getStatusIcon = (status) => {
    const icons = {
      start: '🚀',
      success: '✅',
      error: '❌',
      skip: '⏭️',
      stop: '⏹️',
    };
    return icons[status] || '📌';
  };

  return (
    <div className="console">
      <div className="console-header">
        <h2>📋 실행 로그</h2>
        {isRunning && <span className="console-running">● 실행 중</span>}
      </div>
      
      <div className="console-content" ref={consoleRef}>
        {logs.length === 0 ? (
          <div className="console-empty">실행 로그가 없습니다</div>
        ) : (
          logs.map((log, index) => (
            <div key={index} className={`console-entry ${log.status}`}>
              <span className="console-time">
                {new Date(log.timestamp).toLocaleTimeString()}
              </span>
              <span className="console-icon">{getStatusIcon(log.status)}</span>
              <span className="console-node">[{log.nodeId}]</span>
              <span className="console-message">{log.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default Console;