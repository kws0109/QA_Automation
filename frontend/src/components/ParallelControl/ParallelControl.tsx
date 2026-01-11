// frontend/src/components/ParallelControl/ParallelControl.tsx

import { useState } from 'react';
import axios from 'axios';
import { ScenarioSummary, ParallelExecutionResult } from '../../types';
import './ParallelControl.css';

const API_BASE = 'http://127.0.0.1:3001';

interface ParallelControlProps {
  selectedDevices: string[];
  scenarios: ScenarioSummary[];
  isRunning: boolean;
  onRunningChange: (running: boolean) => void;
  onExecutionComplete: (result: ParallelExecutionResult) => void;
}

export default function ParallelControl({
  selectedDevices,
  scenarios,
  isRunning,
  onRunningChange,
  onExecutionComplete,
}: ParallelControlProps) {
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('');
  const [executing, setExecuting] = useState(false);

  // 병렬 실행 시작
  const handleExecute = async () => {
    if (!selectedScenarioId) {
      alert('시나리오를 선택하세요.');
      return;
    }

    if (selectedDevices.length === 0) {
      alert('실행할 디바이스를 선택하세요.');
      return;
    }

    setExecuting(true);
    onRunningChange(true);

    try {
      const res = await axios.post<{
        success: boolean;
        result: ParallelExecutionResult;
        error?: string;
      }>(`${API_BASE}/api/session/execute-parallel`, {
        scenarioId: selectedScenarioId,
        deviceIds: selectedDevices,
      });

      if (res.data.success && res.data.result) {
        onExecutionComplete(res.data.result);
      } else {
        alert(`실행 실패: ${res.data.error || '알 수 없는 오류'}`);
      }
    } catch (err) {
      const error = err as Error;
      alert(`병렬 실행 오류: ${error.message}`);
    } finally {
      setExecuting(false);
      onRunningChange(false);
    }
  };

  // 실행 중지
  const handleStop = async () => {
    try {
      await axios.post(`${API_BASE}/api/session/parallel/stop-all`);
    } catch (err) {
      console.error('실행 중지 실패:', err);
    }
  };

  const selectedScenario = scenarios.find(s => s.id === selectedScenarioId);

  return (
    <div className="parallel-control">
      <div className="parallel-control-header">
        <h3>병렬 실행</h3>
      </div>

      <div className="parallel-control-body">
        {/* 시나리오 선택 */}
        <div className="control-field">
          <label>시나리오</label>
          <select
            value={selectedScenarioId}
            onChange={e => setSelectedScenarioId(e.target.value)}
            disabled={isRunning}
          >
            <option value="">-- 선택 --</option>
            {scenarios.map(scenario => (
              <option key={scenario.id} value={scenario.id}>
                {scenario.name} ({scenario.nodeCount} nodes)
              </option>
            ))}
          </select>
        </div>

        {/* 선택된 디바이스 표시 */}
        <div className="control-field">
          <label>대상 디바이스</label>
          <div className="selected-devices">
            {selectedDevices.length === 0 ? (
              <span className="no-selection">디바이스를 선택하세요</span>
            ) : (
              <span className="device-count">
                {selectedDevices.length}개 선택됨
              </span>
            )}
          </div>
        </div>

        {/* 실행 정보 미리보기 */}
        {selectedScenarioId && selectedDevices.length > 0 && (
          <div className="execution-preview">
            <div className="preview-item">
              <span className="preview-label">시나리오:</span>
              <span className="preview-value">{selectedScenario?.name}</span>
            </div>
            <div className="preview-item">
              <span className="preview-label">디바이스:</span>
              <span className="preview-value">{selectedDevices.length}개</span>
            </div>
          </div>
        )}

        {/* 실행 버튼 */}
        <div className="control-actions">
          {isRunning ? (
            <button
              className="btn-stop"
              onClick={handleStop}
            >
              중지
            </button>
          ) : (
            <button
              className="btn-execute"
              onClick={handleExecute}
              disabled={!selectedScenarioId || selectedDevices.length === 0 || executing}
            >
              {executing ? '실행 중...' : '병렬 실행'}
            </button>
          )}
        </div>

        {/* 실행 중 상태 표시 */}
        {isRunning && (
          <div className="running-indicator">
            <div className="spinner" />
            <span>병렬 실행 중...</span>
          </div>
        )}
      </div>
    </div>
  );
}
