import React from 'react';
import { ServerStatus } from '../types';

interface StatusIndicatorProps {
  status: ServerStatus;
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({ status }) => {
  const getStatusClass = (): string => {
    switch (status) {
      case 'running':
        return 'status-running';
      case 'starting':
      case 'stopping':
        return 'status-pending';
      case 'error':
        return 'status-error';
      case 'stopped':
      default:
        return 'status-stopped';
    }
  };

  const getStatusText = (): string => {
    switch (status) {
      case 'running':
        return 'Running';
      case 'starting':
        return 'Starting...';
      case 'stopping':
        return 'Stopping...';
      case 'error':
        return 'Error';
      case 'stopped':
      default:
        return 'Stopped';
    }
  };

  return (
    <div className={`status-indicator ${getStatusClass()}`}>
      <span className="status-dot"></span>
      <span className="status-text">{getStatusText()}</span>
    </div>
  );
};
