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
}) => {
  const handleRepeatCountChange = (repeatCount: number) => {
    onOptionsChange({
      ...options,
      repeatCount: Math.max(1, Math.min(10, repeatCount)),
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

        {/* 실행 방식 안내 */}
        <div className="option-group">
          <label className="option-label">실행 방식</label>
          <div className="execution-info">
            <p>각 디바이스가 독립적으로 시나리오 세트를 순차 실행합니다.</p>
          </div>
        </div>
        </div>

        {/* 실행 버튼 */}
        <div className="execute-section">
          {!isRunning ? (
            <button
              type="button"
              onClick={onExecute}
              disabled={!canExecute}
              className="execute-btn"
            >
              테스트 시작
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExecutionOptions;
