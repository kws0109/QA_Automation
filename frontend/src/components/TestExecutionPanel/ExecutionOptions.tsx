// frontend/src/components/TestExecutionPanel/ExecutionOptions.tsx
// WHEN 섹션: 실행 옵션 설정 + 실행 버튼

import React from 'react';
import type { TestExecutionOptions } from '../../types';

interface ExecutionOptionsProps {
  options: TestExecutionOptions;
  onOptionsChange: (options: TestExecutionOptions) => void;
  disabled?: boolean;
  // 실행 버튼 관련
  onExecute: () => void;
  onStop: () => void;
  canExecute: boolean;
  isRunning: boolean;
  selectedDeviceCount: number;
  selectedScenarioCount: number;
  // 대기열 상태
  busyDeviceCount?: number;  // 선택한 디바이스 중 다른 사용자가 사용 중인 디바이스 수
}

const ExecutionOptions: React.FC<ExecutionOptionsProps> = ({
  options,
  onOptionsChange,
  disabled = false,
  onExecute,
  onStop,
  canExecute,
  isRunning,
  selectedDeviceCount,
  selectedScenarioCount,
  busyDeviceCount = 0,
}) => {
  const handleRepeatCountChange = (repeatCount: number) => {
    onOptionsChange({
      ...options,
      repeatCount: Math.max(1, Math.min(10, repeatCount)),
    });
  };

  const handleIntervalChange = (interval: number) => {
    onOptionsChange({
      ...options,
      scenarioInterval: Math.max(0, Math.min(60, interval)),
    });
  };

  return (
    <div className="execution-options execution-section">
      <div className="section-header">
        <h3>실행 옵션</h3>
      </div>

      <div className="section-content">
        <div className="options-grid">
        {/* 반복 횟수 */}
        <div className="option-group">
          <label className="option-label">반복 횟수</label>
          <div className="repeat-count-input">
            <button
              type="button"
              onClick={() => handleRepeatCountChange(options.repeatCount - 1)}
              disabled={disabled || options.repeatCount <= 1}
              className="count-btn"
            >
              -
            </button>
            <input
              type="number"
              value={options.repeatCount}
              onChange={e => handleRepeatCountChange(parseInt(e.target.value) || 1)}
              min={1}
              max={10}
              disabled={disabled}
            />
            <button
              type="button"
              onClick={() => handleRepeatCountChange(options.repeatCount + 1)}
              disabled={disabled || options.repeatCount >= 10}
              className="count-btn"
            >
              +
            </button>
            <span className="unit">회</span>
          </div>
          <span className="hint">선택한 시나리오 세트를 {options.repeatCount}회 반복 실행합니다</span>
        </div>

        {/* 시나리오 간 인터벌 */}
        <div className="option-group">
          <label className="option-label">시나리오 인터벌</label>
          <div className="repeat-count-input">
            <button
              type="button"
              onClick={() => handleIntervalChange(options.scenarioInterval - 1)}
              disabled={disabled || options.scenarioInterval <= 0}
              className="count-btn"
            >
              -
            </button>
            <input
              type="number"
              value={options.scenarioInterval}
              onChange={e => handleIntervalChange(parseInt(e.target.value) || 0)}
              min={0}
              max={60}
              disabled={disabled}
            />
            <button
              type="button"
              onClick={() => handleIntervalChange(options.scenarioInterval + 1)}
              disabled={disabled || options.scenarioInterval >= 60}
              className="count-btn"
            >
              +
            </button>
            <span className="unit">초</span>
          </div>
          <span className="hint">시나리오 완료 후 다음 시나리오 시작 전 대기 시간</span>
        </div>
        </div>

        {/* 실행 버튼 */}
        <div className="execute-section">
          {!isRunning ? (
            <button
              type="button"
              onClick={onExecute}
              disabled={!canExecute}
              className={`execute-btn ${busyDeviceCount > 0 ? 'queue-mode' : ''}`}
            >
              {busyDeviceCount > 0
                ? `테스트 예약 (${busyDeviceCount}대 대기 중)`
                : '테스트 시작'
              }
            </button>
          ) : (
            <button
              type="button"
              onClick={onStop}
              className="stop-btn"
            >
              테스트 중지
            </button>
          )}
          {selectedScenarioCount > 0 && selectedDeviceCount > 0 && (
            <div className="execute-summary">
              {selectedScenarioCount}개 시나리오 × {selectedDeviceCount}대 디바이스 × {options.repeatCount}회
              {busyDeviceCount > 0 && (
                <span className="queue-warning">
                  {busyDeviceCount}대 디바이스 대기 필요
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExecutionOptions;
