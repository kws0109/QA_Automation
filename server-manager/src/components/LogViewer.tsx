import React, { useEffect, useRef, useState } from 'react';
import { ServerState } from '../types';

interface LogViewerProps {
  servers: ServerState[];
  selectedServer: string;
  onSelectServer: (name: string) => void;
  onClearLogs: () => void;
}

export const LogViewer: React.FC<LogViewerProps> = ({
  servers,
  selectedServer,
  onSelectServer,
  onClearLogs
}) => {
  const logContainerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const currentServer = servers.find(s => s.name === selectedServer);
  const logs = currentServer?.logs || [];

  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleScroll = () => {
    if (logContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = logContainerRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
      setAutoScroll(isAtBottom);
    }
  };

  const formatLog = (log: string): React.ReactNode => {
    // Highlight errors
    if (log.includes('[stderr]') || log.toLowerCase().includes('error')) {
      return <span className="log-error">{log}</span>;
    }
    // Highlight warnings
    if (log.toLowerCase().includes('warn')) {
      return <span className="log-warn">{log}</span>;
    }
    // Highlight success messages
    if (log.includes('listening') || log.includes('ready') || log.includes('started')) {
      return <span className="log-success">{log}</span>;
    }
    return log;
  };

  return (
    <div className="log-viewer">
      <div className="log-header">
        <span className="log-title">Logs</span>
        <div className="log-controls">
          <select
            className="log-select"
            value={selectedServer}
            onChange={(e) => onSelectServer(e.target.value)}
          >
            {servers.map(server => (
              <option key={server.name} value={server.name}>
                {server.name}
              </option>
            ))}
          </select>
          <label className="auto-scroll-label">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
            />
            Auto-scroll
          </label>
          <button className="btn btn-clear" onClick={onClearLogs}>
            Clear
          </button>
        </div>
      </div>
      <div
        className="log-container"
        ref={logContainerRef}
        onScroll={handleScroll}
      >
        {logs.length === 0 ? (
          <div className="log-empty">No logs yet</div>
        ) : (
          logs.map((log, index) => (
            <div key={index} className="log-line">
              {formatLog(log)}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
