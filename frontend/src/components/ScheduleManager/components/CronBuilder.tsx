// frontend/src/components/ScheduleManager/components/CronBuilder.tsx
// Cron 표현식 빌더 컴포넌트

import {
  ScheduleTime,
  DayOption,
  DAY_LABELS,
  WEEKDAY_LABELS,
  getScheduleDescription,
} from './types';

interface CronBuilderProps {
  scheduleTime: ScheduleTime;
  onScheduleTimeChange: (updates: Partial<ScheduleTime>) => void;
}

export default function CronBuilder({
  scheduleTime,
  onScheduleTimeChange,
}: CronBuilderProps) {
  // 요일 토글 (custom 모드)
  const toggleCustomDay = (day: number) => {
    const newDays = scheduleTime.customDays.includes(day)
      ? scheduleTime.customDays.filter(d => d !== day)
      : [...scheduleTime.customDays, day];
    onScheduleTimeChange({ customDays: newDays });
  };

  return (
    <div className="schedule-time-section">
      <div className="schedule-row">
        <label className="schedule-label">반복</label>
        <select
          value={scheduleTime.dayOption}
          onChange={e => onScheduleTimeChange({ dayOption: e.target.value as DayOption, customDays: [] })}
          className="schedule-select"
        >
          {DAY_LABELS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {scheduleTime.dayOption === 'custom' && (
        <div className="weekday-selector">
          {WEEKDAY_LABELS.map((label, idx) => (
            <button
              key={idx}
              type="button"
              className={`weekday-btn ${scheduleTime.customDays.includes(idx) ? 'active' : ''}`}
              onClick={() => toggleCustomDay(idx)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="schedule-row">
        <label className="schedule-label">시간</label>
        <select
          value={scheduleTime.hour}
          onChange={e => onScheduleTimeChange({ hour: parseInt(e.target.value, 10) })}
          className="schedule-select time-select"
        >
          {Array.from({ length: 24 }, (_, i) => (
            <option key={i} value={i}>
              {i < 12 ? `오전 ${i === 0 ? 12 : i}시` : `오후 ${i === 12 ? 12 : i - 12}시`}
            </option>
          ))}
        </select>
        <select
          value={scheduleTime.minute}
          onChange={e => onScheduleTimeChange({ minute: parseInt(e.target.value, 10) })}
          className="schedule-select time-select"
        >
          {[0, 15, 30, 45].map(m => (
            <option key={m} value={m}>{m.toString().padStart(2, '0')}분</option>
          ))}
        </select>
      </div>

      <div className="schedule-summary">{getScheduleDescription(scheduleTime)}</div>
    </div>
  );
}
