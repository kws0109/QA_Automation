// frontend/src/components/ScheduleManager/components/HistoryPanel.tsx
// 실행 이력 패널 컴포넌트

import { ScheduleHistory } from '../../../types';
import { formatTime } from './types';

interface HistoryPanelProps {
  history: ScheduleHistory[];
}

export default function HistoryPanel({ history }: HistoryPanelProps) {
  return (
    <div className="history-panel">
      <div className="history-header">
        <h2>실행 이력</h2>
      </div>
      <div className="history-content">
        {history.length === 0 ? (
          <div className="history-empty">
            <p>실행 이력이 없습니다</p>
          </div>
        ) : (
          <div className="history-list">
            {history.map(h => (
              <div key={h.id} className={`history-item ${h.success ? 'success' : 'failed'}`}>
                <div className={`history-item-status ${h.success ? 'success' : 'failed'}`} />
                <div className="history-item-info">
                  <div className="history-item-name">{h.scheduleName}</div>
                  <div className="history-item-suite">{h.suiteName}</div>
                  {h.error && <div className="history-item-error">{h.error}</div>}
                </div>
                <div className="history-item-time">
                  <div>{formatTime(h.startedAt)}</div>
                  <div>~ {formatTime(h.completedAt)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
