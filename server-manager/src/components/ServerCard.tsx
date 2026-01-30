import React from 'react';
import { ServerState } from '../types';
import { StatusIndicator } from './StatusIndicator';

interface ServerCardProps {
  server: ServerState;
  onStart: () => void;
  onStop: () => void;
  onRestart: () => void;
}

export const ServerCard: React.FC<ServerCardProps> = ({
  server,
  onStart,
  onStop,
  onRestart
}) => {
  const isRunning = server.status === 'running';
  const isPending = server.status === 'starting' || server.status === 'stopping';
  const canStart = server.status === 'stopped' || server.status === 'error';
  const canStop = server.status === 'running' || server.status === 'error';

  return (
    <div className={`server-card ${server.status}`}>
      <div className="server-header">
        <StatusIndicator status={server.status} />
        <h3 className="server-name">{server.name}</h3>
      </div>

      <div className="server-info">
        <div className="info-row">
          <span className="info-label">Port:</span>
          <span className="info-value">{server.port}</span>
        </div>
        <div className="info-row">
          <span className="info-label">PID:</span>
          <span className="info-value">{server.pid ?? '----'}</span>
        </div>
      </div>

      <div className="server-actions">
        <button
          className="btn btn-start"
          onClick={onStart}
          disabled={!canStart || isPending}
        >
          Start
        </button>
        <button
          className="btn btn-stop"
          onClick={onStop}
          disabled={!canStop || isPending}
        >
          Stop
        </button>
        <button
          className="btn btn-restart"
          onClick={onRestart}
          disabled={!isRunning || isPending}
        >
          Restart
        </button>
      </div>
    </div>
  );
};
