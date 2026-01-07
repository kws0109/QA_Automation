// frontend/src/components/Console/Console.tsx

import { useEffect, useRef } from 'react';
import type { ExecutionLog, ExecutionStatus } from '../../types';
import './Console.css';

interface ConsoleProps {
  logs: ExecutionLog[];
  isRunning: boolean;
}

function Console({ logs, isRunning }: ConsoleProps) {
  const consoleRef = useRef<HTMLDivElement>(null);

  // 새 로그 추가 시 자동 스크롤
  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [logs]);

  const getStatusIcon = (status: ExecutionStatus | string): string => {
    const icons: Record<string, string> = {
      start: '🚀',
      running: '🚀',
      success: '✅',
      error: '❌',
      skipped: '⏭️',
      skip: '⏭️',
      stopped: '⏹️',
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