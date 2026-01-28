// frontend/src/components/ScheduleManager/components/ScheduleList.tsx
// 스케줄 목록 컴포넌트

import { ScheduleListItem } from '../../../types';
import { getCronDescription } from './types';

interface ScheduleListProps {
  schedules: ScheduleListItem[];
  selectedScheduleId: string | null;
  showHistory: boolean;
  onSelectSchedule: (id: string) => void;
  onToggleEnabled: (id: string, currentEnabled: boolean, e: React.MouseEvent) => void;
  onToggleHistory: () => void;
  onStartCreate: () => void;
}

export default function ScheduleList({
  schedules,
  selectedScheduleId,
  showHistory,
  onSelectSchedule,
  onToggleEnabled,
  onToggleHistory,
  onStartCreate,
}: ScheduleListProps) {
  return (
    <div className="schedule-list-panel">
      <div className="schedule-list-header">
        <h2>스케줄</h2>
        <div className="header-actions">
          <button
            className={`btn-history ${showHistory ? 'active' : ''}`}
            onClick={onToggleHistory}
          >
            {showHistory ? '목록' : '이력'}
          </button>
          <button className="btn-new-schedule" onClick={onStartCreate}>
            + 새 스케줄
          </button>
        </div>
      </div>

      <div className="schedule-list-content">
        {schedules.length === 0 ? (
          <div className="schedule-list-empty">
            <p>등록된 스케줄이 없습니다</p>
          </div>
        ) : (
          schedules.map(s => (
            <div
              key={s.id}
              className={`schedule-item ${selectedScheduleId === s.id ? 'selected' : ''} ${!s.enabled ? 'disabled' : ''}`}
              onClick={() => onSelectSchedule(s.id)}
            >
              <div className="schedule-item-header">
                <span className="schedule-item-name">{s.name}</span>
                <div className="schedule-item-toggle">
                  <label className="toggle-switch" onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={s.enabled}
                      onChange={() => {}}
                      onClick={(e) => onToggleEnabled(s.id, s.enabled, e)}
                    />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>
              <div className="schedule-item-meta">
                <span>{s.suiteName}</span>
                <span className="schedule-item-cron">{getCronDescription(s.cronExpression)}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
