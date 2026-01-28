// frontend/src/components/ScheduleManager/components/ScheduleForm.tsx
// 스케줄 생성/편집 폼 컴포넌트

import { useState } from 'react';
import { CreateScheduleRequest, TestSuite } from '../../../types';
import { ScheduleTime, SuiteInfo } from './types';
import CronBuilder from './CronBuilder';

interface ScheduleFormProps {
  formData: CreateScheduleRequest;
  scheduleTime: ScheduleTime;
  suites: TestSuite[];
  onFormDataChange: (data: CreateScheduleRequest) => void;
  onScheduleTimeChange: (updates: Partial<ScheduleTime>) => void;
  initialShowAdvanced?: boolean;
}

export default function ScheduleForm({
  formData,
  scheduleTime,
  suites,
  onFormDataChange,
  onScheduleTimeChange,
  initialShowAdvanced = false,
}: ScheduleFormProps) {
  const [showAdvanced, setShowAdvanced] = useState(initialShowAdvanced);

  // 선택된 Suite 정보 가져오기
  const getSelectedSuiteInfo = (suiteId: string): SuiteInfo | null => {
    const suite = suites.find(s => s.id === suiteId);
    if (!suite) return null;
    return {
      name: suite.name,
      scenarioCount: suite.scenarioIds.length,
      deviceCount: suite.deviceIds.length,
    };
  };

  const suiteInfo = formData.suiteId ? getSelectedSuiteInfo(formData.suiteId) : null;

  return (
    <div className="schedule-form">
      <div className="form-group">
        <label>스케줄 이름 *</label>
        <input
          type="text"
          value={formData.name}
          onChange={e => onFormDataChange({ ...formData, name: e.target.value })}
          placeholder="예: 매일 아침 테스트"
        />
      </div>

      <div className="form-group">
        <label>실행할 묶음 *</label>
        <select
          value={formData.suiteId}
          onChange={e => onFormDataChange({ ...formData, suiteId: e.target.value })}
        >
          <option value="">묶음 선택</option>
          {suites.map(s => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {suiteInfo && (
          <div className="suite-info">
            <span className="suite-info-item">시나리오 {suiteInfo.scenarioCount}개</span>
            <span className="suite-info-item">디바이스 {suiteInfo.deviceCount}대</span>
          </div>
        )}
        {suites.length === 0 && (
          <div className="no-suites-warning">
            등록된 묶음이 없습니다. 먼저 묶음 관리에서 묶음을 생성해주세요.
          </div>
        )}
      </div>

      <div className="form-group">
        <label>실행 주기 *</label>
        <CronBuilder
          scheduleTime={scheduleTime}
          onScheduleTimeChange={onScheduleTimeChange}
        />
      </div>

      <div className="advanced-toggle">
        <button
          type="button"
          className="btn-advanced-toggle"
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          고급 옵션 {showAdvanced ? '' : ''}
        </button>
      </div>

      {showAdvanced && (
        <div className="advanced-options">
          <div className="form-group-inline">
            <label>반복 횟수</label>
            <input
              type="number"
              min={1}
              max={100}
              value={formData.repeatCount ?? 1}
              onChange={e => onFormDataChange({ ...formData, repeatCount: parseInt(e.target.value, 10) || 1 })}
            />
            <span className="unit">회</span>
          </div>
          <div className="form-group-inline">
            <label>시나리오 간격</label>
            <input
              type="number"
              min={0}
              max={60000}
              step={1000}
              value={formData.scenarioInterval ?? 0}
              onChange={e => onFormDataChange({ ...formData, scenarioInterval: parseInt(e.target.value, 10) || 0 })}
            />
            <span className="unit">ms</span>
          </div>
        </div>
      )}

      <div className="form-group">
        <label>설명 (선택)</label>
        <textarea
          value={formData.description}
          onChange={e => onFormDataChange({ ...formData, description: e.target.value })}
          placeholder="스케줄에 대한 설명"
          rows={2}
        />
      </div>
    </div>
  );
}
