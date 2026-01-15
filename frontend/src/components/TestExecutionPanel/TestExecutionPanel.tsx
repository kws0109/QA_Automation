// frontend/src/components/TestExecutionPanel/TestExecutionPanel.tsx
// 테스트 실행 패널 메인 컴포넌트 (Who/What/When)
// 레이아웃: 메인 영역 + 큐 사이드바

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Socket } from 'socket.io-client';
import DeviceSelector from './DeviceSelector';
import ScenarioSelector from './ScenarioSelector';
import ExecutionOptions from './ExecutionOptions';
import QueueSidebar, { QueueStatus } from './QueueSidebar';
import TestDetailPanel from './TestDetailPanel';
import type {
  DeviceDetailedInfo,
  SessionInfo,
  TestExecutionOptions,
  DeviceProgress,
  DeviceQueueStatus,
} from '../../types';
import './TestExecutionPanel.css';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:3001';

interface ExecutionLog {
  timestamp: string;
  type: 'info' | 'success' | 'error' | 'warning';
  message: string;
  scenarioName?: string;
  deviceId?: string;
  deviceName?: string;
}

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

  // 실행 로그
  const [executionLogs, setExecutionLogs] = useState<ExecutionLog[]>([]);
  const [deviceProgressMap, setDeviceProgressMap] = useState<Map<string, DeviceProgress>>(new Map());

  // 큐 상태
  const [queueStatus, setQueueStatus] = useState<QueueStatus>({
    isProcessing: false,
    queueLength: 0,
    runningCount: 0,
    pendingTests: [],
    runningTests: [],
    completedTests: [],
    deviceStatuses: [],
  });

  // 선택된 큐 아이템 (상세 보기용)
  const [selectedQueueId, setSelectedQueueId] = useState<string | null>(null);

  // 디바이스 큐 상태 (잠금 상태) - QueueStatus에서 파생
  const deviceQueueStatus: DeviceQueueStatus[] = queueStatus.deviceStatuses;

  // 로그 추가 헬퍼
  const addLog = useCallback((
    type: ExecutionLog['type'],
    message: string,
    scenarioName?: string,
    deviceId?: string,
    deviceName?: string,
  ) => {
    setExecutionLogs(prev => [
      ...prev,
      {
        timestamp: new Date().toISOString(),
        type,
        message,
        scenarioName,
        deviceId,
        deviceName,
      },
    ]);
  }, []);

  // Socket 이벤트 리스너 설정
  useEffect(() => {
    if (!socket) return;

    // 시나리오 건너뛰기 알림
    const handleScenariosSkipped = (data: {
      executionId: string;
      skippedIds: string[];
      message: string;
    }) => {
      addLog('warning', data.message);
    };

    // 테스트 시작
    const handleTestStart = (data: {
      executionId: string;
      totalScenarios: number;
      totalDevices: number;
    }) => {
      setDeviceProgressMap(new Map());
      addLog('info', `테스트 시작: ${data.totalScenarios}개 시나리오 × ${data.totalDevices}대 디바이스`);
    };

    // 디바이스 시작
    const handleDeviceStart = (data: {
      deviceId: string;
      deviceName: string;
      totalScenarios: number;
    }) => {
      addLog('info', `디바이스 ${data.deviceName}: 테스트 시작`, undefined, data.deviceId, data.deviceName);
    };

    // 디바이스별 시나리오 시작
    const handleDeviceScenarioStart = (data: {
      deviceId: string;
      deviceName: string;
      scenarioId: string;
      scenarioName: string;
      packageName: string;
      categoryName: string;
      repeatIndex: number;
      order: number;
      total: number;
    }) => {
      addLog(
        'info',
        `[${data.order}/${data.total}] ${data.scenarioName} 시작`,
        data.scenarioName,
        data.deviceId,
        data.deviceName,
      );
    };

    // 디바이스별 시나리오 완료
    const handleDeviceScenarioComplete = (data: {
      deviceId: string;
      deviceName: string;
      scenarioId: string;
      scenarioName: string;
      repeatIndex: number;
      order: number;
      status: 'passed' | 'failed';
      duration: number;
      error?: string;
    }) => {
      const type = data.status === 'passed' ? 'success' : 'error';
      const durationSec = (data.duration / 1000).toFixed(1);
      const message = data.status === 'passed'
        ? `[${data.order}] ${data.scenarioName} 완료 (${durationSec}초)`
        : `[${data.order}] ${data.scenarioName} 실패: ${data.error || '알 수 없는 에러'}`;
      addLog(type, message, data.scenarioName, data.deviceId, data.deviceName);
    };

    // 디바이스별 노드 실행
    const handleDeviceNode = (data: {
      deviceId: string;
      deviceName: string;
      scenarioId: string;
      nodeId: string;
      nodeName: string;
      status: 'running' | 'passed' | 'failed';
      duration?: number;
      error?: string;
    }) => {
      if (data.status === 'failed') {
        addLog('error', `노드 실패: ${data.nodeName} - ${data.error}`, undefined, data.deviceId, data.deviceName);
      }
    };

    // 디바이스 완료
    const handleDeviceComplete = (data: {
      deviceId: string;
      deviceName: string;
      status: 'completed' | 'failed' | 'stopped';
      completedScenarios: number;
      failedScenarios: number;
      totalScenarios: number;
    }) => {
      const type = data.status === 'completed' ? 'success' : 'warning';
      const message = data.status === 'completed'
        ? `디바이스 ${data.deviceName}: 모든 시나리오 완료 (${data.completedScenarios}/${data.totalScenarios} 성공)`
        : `디바이스 ${data.deviceName}: ${data.status} (${data.completedScenarios} 성공, ${data.failedScenarios} 실패)`;
      addLog(type, message, undefined, data.deviceId, data.deviceName);
    };

    // 진행률 업데이트
    const handleProgress = (data: {
      deviceProgress: DeviceProgress[];
    }) => {
      const newMap = new Map<string, DeviceProgress>();
      for (const dp of data.deviceProgress) {
        newMap.set(dp.deviceId, dp);
      }
      setDeviceProgressMap(newMap);
    };

    // 테스트 완료
    const handleTestComplete = (data: {
      executionId: string;
      result: {
        summary: {
          totalScenarios: number;
          passedScenarios: number;
          failedScenarios: number;
          totalDevices: number;
          totalDuration: number;
        };
        status: string;
      };
    }) => {
      const { summary, status } = data.result;

      if (socket) {
        socket.emit('queue:status');
      }

      const durationSec = (summary.totalDuration / 1000).toFixed(1);
      const type = status === 'completed' ? 'success' : 'warning';
      addLog(
        type,
        `테스트 완료: ${summary.passedScenarios}/${summary.totalScenarios} 시나리오 성공, ${summary.totalDevices}대 디바이스, ${durationSec}초 (상태: ${status})`,
      );
    };

    // 테스트 중지 중
    const handleTestStopping = () => {
      addLog('warning', '테스트 중지 요청됨...');
    };

    // 테스트 준비 중
    const handleTestPreparing = (data: { deviceIds: string[]; scenarioIds: string[]; message: string }) => {
      addLog('info', `⏳ ${data.message}`);
    };

    // 세션 검증 중
    const handleSessionValidating = (data: { deviceIds: string[]; message: string }) => {
      addLog('info', `🔍 ${data.message}`);
    };

    // 세션 재생성됨
    const handleSessionRecreated = (data: { deviceIds: string[]; message: string }) => {
      addLog('warning', `🔄 ${data.message}: ${data.deviceIds.join(', ')}`);
    };

    // 세션 생성 실패
    const handleSessionFailed = (data: { deviceIds: string[]; message: string }) => {
      addLog('error', `❌ ${data.message}: ${data.deviceIds.join(', ')}`);
    };

    socket.on('test:preparing', handleTestPreparing);
    socket.on('test:session:validating', handleSessionValidating);
    socket.on('test:session:recreated', handleSessionRecreated);
    socket.on('test:session:failed', handleSessionFailed);
    socket.on('test:scenarios:skipped', handleScenariosSkipped);
    socket.on('test:start', handleTestStart);
    socket.on('test:device:start', handleDeviceStart);
    socket.on('test:device:scenario:start', handleDeviceScenarioStart);
    socket.on('test:device:scenario:complete', handleDeviceScenarioComplete);
    socket.on('test:device:node', handleDeviceNode);
    socket.on('test:device:complete', handleDeviceComplete);
    socket.on('test:progress', handleProgress);
    socket.on('test:complete', handleTestComplete);
    socket.on('test:stopping', handleTestStopping);

    return () => {
      socket.off('test:preparing', handleTestPreparing);
      socket.off('test:session:validating', handleSessionValidating);
      socket.off('test:session:recreated', handleSessionRecreated);
      socket.off('test:session:failed', handleSessionFailed);
      socket.off('test:scenarios:skipped', handleScenariosSkipped);
      socket.off('test:start', handleTestStart);
      socket.off('test:device:start', handleDeviceStart);
      socket.off('test:device:scenario:start', handleDeviceScenarioStart);
      socket.off('test:device:scenario:complete', handleDeviceScenarioComplete);
      socket.off('test:device:node', handleDeviceNode);
      socket.off('test:device:complete', handleDeviceComplete);
      socket.off('test:progress', handleProgress);
      socket.off('test:complete', handleTestComplete);
      socket.off('test:stopping', handleTestStopping);
    };
  }, [socket, addLog]);

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
      setExecutionLogs([]);
      setDeviceProgressMap(new Map());
      addLog('info', '테스트 실행 요청 중...');

      const response = await axios.post<{
        success: boolean;
        message: string;
        status: 'started' | 'queued' | 'partial';
        splitExecution?: {
          immediateDeviceIds: string[];
          queuedDeviceIds: string[];
        };
      }>(`${API_BASE}/api/test/execute`, request);

      const { status, message, splitExecution } = response.data;

      if (status === 'partial' && splitExecution) {
        addLog('info', `✅ ${splitExecution.immediateDeviceIds.length}대 즉시 실행`);
        addLog('warning', `⏳ ${splitExecution.queuedDeviceIds.length}대 대기열 추가`);
      } else if (status === 'queued') {
        addLog('warning', `⏳ ${message}`);
      } else if (status === 'started') {
        addLog('success', `✅ ${message}`);
      }
    } catch (err) {
      const error = err as Error;
      addLog('error', `테스트 실행 실패: ${error.message}`);
      alert(`테스트 실행에 실패했습니다: ${error.message}`);
    }
  };

  // 테스트 중지
  const handleStop = async () => {
    try {
      await axios.post(`${API_BASE}/api/test/stop`);
    } catch (err) {
      const error = err as Error;
      addLog('error', `테스트 중지 실패: ${error.message}`);
    }
  };

  // 큐 아이템 중지
  const handleStopQueueItem = async (queueId: string) => {
    if (socket) {
      socket.emit('queue:cancel', { queueId });
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
        {/* 메인 영역 */}
        <div className="main-area">
          <div className="panel-content">
            {/* 상세 보기 패널 (큐 아이템 선택 시) */}
            {selectedQueueId && (
              <TestDetailPanel
                selectedQueueId={selectedQueueId}
                queueStatus={queueStatus}
                logs={executionLogs}
                deviceProgress={deviceProgressMap}
                onClose={() => setSelectedQueueId(null)}
                onStop={handleStopQueueItem}
                userName={userName}
              />
            )}

            {/* 테스트 설정 영역 (상세 보기가 없을 때 또는 항상 하단에) */}
            <div className={`settings-area ${selectedQueueId ? 'compact' : ''}`}>
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

        {/* 큐 사이드바 */}
        {userName && (
          <QueueSidebar
            socket={socket}
            userName={userName}
            selectedQueueId={selectedQueueId}
            onSelectTest={setSelectedQueueId}
            queueStatus={queueStatus}
            onQueueStatusChange={setQueueStatus}
            deviceProgress={deviceProgressMap}
          />
        )}
      </div>
    </div>
  );
};

export default TestExecutionPanel;
