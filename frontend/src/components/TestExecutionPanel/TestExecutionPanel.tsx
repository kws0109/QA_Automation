// frontend/src/components/TestExecutionPanel/TestExecutionPanel.tsx
// 테스트 실행 패널 메인 컴포넌트 (Who/What/When)
// QueueSidebar는 ExecutionCenter 레벨에서 관리됨

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Socket } from 'socket.io-client';
import DeviceSelector from './DeviceSelector';
import ScenarioSelector from './ScenarioSelector';
import ExecutionOptions from './ExecutionOptions';
import type {
  DeviceDetailedInfo,
  SessionInfo,
  TestExecutionOptions,
  DeviceQueueStatus,
} from '../../types';
import './TestExecutionPanel.css';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:3001';

interface TestExecutionPanelProps {
  devices: DeviceDetailedInfo[];
  sessions: SessionInfo[];
  socket: Socket | null;
  onSessionChange: () => void;
  userName?: string;
}

const TestExecutionPanel: React.FC<TestExecutionPanelProps> = ({
  devices,
  sessions,
  socket,
  onSessionChange,
  userName = '',
}) => {
  // WHO
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);

  // WHAT
  const [selectedScenarioIds, setSelectedScenarioIds] = useState<string[]>([]);

  // WHEN
  const [executionOptions, setExecutionOptions] = useState<TestExecutionOptions>({
    repeatCount: 1,
    scenarioInterval: 5,
  });

  // 디바이스 큐 상태 (socket에서 직접 수신)
  const [deviceQueueStatus, setDeviceQueueStatus] = useState<DeviceQueueStatus[]>([]);

  // Socket 이벤트 리스너 설정 (디바이스 큐 상태만 관리)
  useEffect(() => {
    if (!socket) return;

    // 디바이스 큐 상태 업데이트
    const handleQueueStatusResponse = (data: { deviceStatuses?: DeviceQueueStatus[] }) => {
      if (data.deviceStatuses) {
        setDeviceQueueStatus(data.deviceStatuses);
      }
    };

    const handleQueueUpdated = () => {
      socket.emit('queue:status');
    };

    socket.on('queue:status:response', handleQueueStatusResponse);
    socket.on('queue:updated', handleQueueUpdated);

    // 초기 큐 상태 요청
    socket.emit('queue:status');

    return () => {
      socket.off('queue:status:response', handleQueueStatusResponse);
      socket.off('queue:updated', handleQueueUpdated);
    };
  }, [socket]);

  // 테스트 실행
  const handleExecute = async () => {
    if (selectedDeviceIds.length === 0) {
      alert('테스트할 디바이스를 선택해주세요.');
      return;
    }

    if (selectedScenarioIds.length === 0) {
      alert('테스트할 시나리오를 선택해주세요.');
      return;
    }

    const request = {
      deviceIds: selectedDeviceIds,
      scenarioIds: selectedScenarioIds,
      repeatCount: executionOptions.repeatCount,
      scenarioInterval: executionOptions.scenarioInterval * 1000,
      userName: userName || 'anonymous',
    };

    try {
      await axios.post(`${API_BASE}/api/test/execute`, request);
      // 실행 결과는 QueueSidebar에서 Socket을 통해 표시됨
    } catch (err) {
      const error = err as Error;
      alert(`테스트 실행에 실패했습니다: ${error.message}`);
    }
  };

  // 선택한 디바이스 중 바쁜 디바이스 수 계산
  const busyByOtherCount = selectedDeviceIds.filter(deviceId => {
    const status = deviceQueueStatus.find(s => s.deviceId === deviceId);
    return status?.status === 'busy_other';
  }).length;

  const busyByMeCount = selectedDeviceIds.filter(deviceId => {
    const status = deviceQueueStatus.find(s => s.deviceId === deviceId);
    return status?.status === 'busy_mine';
  }).length;

  const totalBusyCount = busyByOtherCount + busyByMeCount;
  const canExecute = selectedDeviceIds.length > 0 && selectedScenarioIds.length > 0;

  return (
    <div className="test-execution-panel">
      <div className="panel-header">
        <h2>테스트 실행</h2>
        <p className="panel-description">
          테스트할 디바이스와 시나리오를 선택하고 실행 옵션을 설정하세요.
        </p>
      </div>

      <div className="panel-body">
        {/* 테스트 설정 영역 */}
        <div className="settings-area">
          <div className="settings-row">
            {/* WHO - 디바이스 선택 */}
            <DeviceSelector
              devices={devices}
              sessions={sessions}
              selectedDeviceIds={selectedDeviceIds}
              onSelectionChange={setSelectedDeviceIds}
              onSessionChange={onSessionChange}
              disabled={false}
              deviceQueueStatus={deviceQueueStatus}
            />

            {/* WHAT - 시나리오 선택 */}
            <ScenarioSelector
              selectedScenarioIds={selectedScenarioIds}
              onSelectionChange={setSelectedScenarioIds}
              disabled={false}
            />

            {/* WHEN - 실행 옵션 */}
            <ExecutionOptions
              options={executionOptions}
              onOptionsChange={setExecutionOptions}
              disabled={false}
              onExecute={handleExecute}
              canExecute={canExecute}
              selectedDeviceCount={selectedDeviceIds.length}
              selectedScenarioCount={selectedScenarioIds.length}
              busyDeviceCount={totalBusyCount}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default TestExecutionPanel;
