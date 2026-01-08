// frontend/src/components/ParallelLogs/ParallelLogs.tsx

import { useState, useEffect, useRef } from 'react';
import { ParallelLog, ParallelExecutionResult } from '../../types';
import './ParallelLogs.css';

interface ParallelLogsProps {
  logs: ParallelLog[];
  deviceIds: string[];
  isRunning: boolean;
  lastResult: ParallelExecutionResult | null;
}

export default function ParallelLogs({
  logs,
  deviceIds,
  isRunning,
  lastResult,
}: ParallelLogsProps) {
  const [selectedDevice, setSelectedDevice] = useState<string | 'all'>('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // 자동 스크롤
  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  // 필터된 로그
  const filteredLogs = selectedDevice === 'all'
    ? logs
    : logs.filter(log => log.deviceId === selectedDevice);

  // 디바이스별 로그 카운트
  const getLogCount = (deviceId: string) => {
    return logs.filter(log => log.deviceId === deviceId).length;
  };

  // 디바이스별 상태 (마지막 로그 기준)
  const getDeviceStatus = (deviceId: string) => {
    const deviceLogs = logs.filter(log => log.deviceId === deviceId);
    if (deviceLogs.length === 0) return 'pending';
    const lastLog = deviceLogs[deviceLogs.length - 1];
    return lastLog.status;
  };

  // 상태별 아이콘
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success': return '✓';
      case 'error': return '✗';
      case 'start': return '▶';
      case 'skip': return '⊘';
      default: return '●';
    }
  };

  // 상태별 색상 클래스
  const getStatusClass = (status: string) => {
    switch (status) {
      case 'success': return 'status-success';
      case 'error': return 'status-error';
      case 'start': return 'status-running';
      case 'skip': return 'status-skip';
      default: return 'status-pending';
    }
  };

  // 시간 포맷
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const timeStr = date.toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const ms = date.getMilliseconds().toString().padStart(3, '0');
    return `${timeStr}.${ms}`;
  };

  // 디바이스 ID 짧게 표시
  const shortDeviceId = (deviceId: string) => {
    if (deviceId.length > 12) {
      return deviceId.substring(0, 12) + '...';
    }
    return deviceId;
  };

  return (
    <div className="parallel-logs">
      <div className="logs-header">
        <h3>병렬 실행 로그</h3>
        <div className="logs-controls">
          <label className="auto-scroll">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={e => setAutoScroll(e.target.checked)}
            />
            자동 스크롤
          </label>
        </div>
      </div>

      {/* 디바이스 탭 */}
      {deviceIds.length > 0 && (
        <div className="device-tabs">
          <button
            className={`tab ${selectedDevice === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedDevice('all')}
          >
            전체 ({logs.length})
          </button>
          {deviceIds.map(deviceId => (
            <button
              key={deviceId}
              className={`tab ${selectedDevice === deviceId ? 'active' : ''} ${getStatusClass(getDeviceStatus(deviceId))}`}
              onClick={() => setSelectedDevice(deviceId)}
            >
              <span className="tab-icon">{getStatusIcon(getDeviceStatus(deviceId))}</span>
              {shortDeviceId(deviceId)} ({getLogCount(deviceId)})
            </button>
          ))}
        </div>
      )}

      {/* 로그 목록 */}
      <div className="logs-content">
        {filteredLogs.length === 0 ? (
          <div className="logs-empty">
            {isRunning ? '실행 대기 중...' : '로그가 없습니다.'}
          </div>
        ) : (
          filteredLogs.map((log, index) => (
            <div
              key={index}
              className={`log-entry ${getStatusClass(log.status)}`}
            >
              <span className="log-time">{formatTime(log.timestamp)}</span>
              <span className="log-device">[{shortDeviceId(log.deviceId)}]</span>
              <span className="log-icon">{getStatusIcon(log.status)}</span>
              <span className="log-message">{log.message}</span>
            </div>
          ))
        )}
        <div ref={logsEndRef} />
      </div>

      {/* 실행 결과 요약 */}
      {lastResult && !isRunning && (
        <div className="result-summary">
          <div className="summary-header">실행 완료</div>
          <div className="summary-content">
            <div className="summary-item">
              <span className="summary-label">총 소요시간:</span>
              <span className="summary-value">{(lastResult.totalDuration / 1000).toFixed(2)}초</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">성공:</span>
              <span className="summary-value success">
                {lastResult.results.filter(r => r.success).length}
              </span>
            </div>
            <div className="summary-item">
              <span className="summary-label">실패:</span>
              <span className="summary-value error">
                {lastResult.results.filter(r => !r.success).length}
              </span>
            </div>
          </div>
          <div className="device-results">
            {lastResult.results.map(result => (
              <div
                key={result.deviceId}
                className={`device-result ${result.success ? 'success' : 'error'}`}
              >
                <span className="result-device">{shortDeviceId(result.deviceId)}</span>
                <span className="result-status">
                  {result.success ? '성공' : '실패'}
                </span>
                <span className="result-duration">{(result.duration / 1000).toFixed(2)}초</span>
                {result.error && (
                  <span className="result-error" title={result.error}>
                    {result.error.substring(0, 30)}...
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
