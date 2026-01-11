// frontend/src/components/TestExecutionPanel/TestExecutionPanel.tsx
// 테스트 실행 패널 메인 컴포넌트 (Who/What/When)
// 방식 2: 각 디바이스가 독립적으로 시나리오 세트를 순차 실행

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Socket } from 'socket.io-client';
import DeviceSelector from './DeviceSelector';
import ScenarioSelector from './ScenarioSelector';
import ExecutionOptions from './ExecutionOptions';
import ExecutionProgress from './ExecutionProgress';
import type {
  DeviceDetailedInfo,
  SessionInfo,
  TestExecutionOptions,
  TestExecutionStatus,
  ScenarioQueueItem,
  TestExecutionRequest,
  DeviceProgress,
} from '../../types';
import './TestExecutionPanel.css';

const API_BASE = 'http://localhost:3001';

interface ExecutionLog {
  timestamp: string;
  type: 'info' | 'success' | 'error' | 'warning';
  message: string;
  scenarioName?: string;
  deviceId?: string;
}

interface TestExecutionPanelProps {
  devices: DeviceDetailedInfo[];
  sessions: SessionInfo[];
  socket: Socket | null;
  onSessionChange: () => void;
}

const TestExecutionPanel: React.FC<TestExecutionPanelProps> = ({
  devices,
  sessions,
  socket,
  onSessionChange,
}) => {
  // WHO
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);

  // WHAT
  const [selectedScenarioIds, setSelectedScenarioIds] = useState<string[]>([]);

  // WHEN
  const [executionOptions, setExecutionOptions] = useState<TestExecutionOptions>({
    repeatCount: 1,
  });

  // 실행 상태
  const [executionStatus, setExecutionStatus] = useState<TestExecutionStatus>({
    isRunning: false,
    progress: { completed: 0, total: 0, percentage: 0 },
  });
  const [executionQueue, setExecutionQueue] = useState<ScenarioQueueItem[]>([]);
  const [executionLogs, setExecutionLogs] = useState<ExecutionLog[]>([]);
  const [deviceProgressMap, setDeviceProgressMap] = useState<Map<string, DeviceProgress>>(new Map());

  // 로그 추가 헬퍼
  const addLog = useCallback((
    type: ExecutionLog['type'],
    message: string,
    scenarioName?: string,
    deviceId?: string,
  ) => {
    setExecutionLogs(prev => [
      ...prev,
      {
        timestamp: new Date().toISOString(),
        type,
        message,
        scenarioName,
        deviceId,
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
      queue: ScenarioQueueItem[];
      totalScenarios: number;
      totalDevices: number;
    }) => {
      setExecutionStatus(prev => ({
        ...prev,
        isRunning: true,
        executionId: data.executionId,
        progress: { completed: 0, total: data.totalScenarios * data.totalDevices, percentage: 0 },
        startedAt: new Date().toISOString(),
      }));
      setExecutionQueue(data.queue);
      setDeviceProgressMap(new Map());
      addLog('info', `테스트 시작: ${data.totalScenarios}개 시나리오 × ${data.totalDevices}대 디바이스`);
    };

    // 디바이스 시작
    const handleDeviceStart = (data: {
      deviceId: string;
      totalScenarios: number;
    }) => {
      addLog('info', `디바이스 ${data.deviceId}: 테스트 시작`, undefined, data.deviceId);
    };

    // 디바이스별 시나리오 시작
    const handleDeviceScenarioStart = (data: {
      deviceId: string;
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
      );
    };

    // 디바이스별 시나리오 완료
    const handleDeviceScenarioComplete = (data: {
      deviceId: string;
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
      addLog(type, message, data.scenarioName, data.deviceId);
    };

    // 디바이스별 노드 실행
    const handleDeviceNode = (data: {
      deviceId: string;
      scenarioId: string;
      nodeId: string;
      nodeName: string;
      status: 'running' | 'passed' | 'failed';
      duration?: number;
      error?: string;
    }) => {
      // 실패한 노드만 로그에 추가
      if (data.status === 'failed') {
        addLog('error', `노드 실패: ${data.nodeName} - ${data.error}`, undefined, data.deviceId);
      }
    };

    // 디바이스 완료
    const handleDeviceComplete = (data: {
      deviceId: string;
      status: 'completed' | 'failed' | 'stopped';
      completedScenarios: number;
      failedScenarios: number;
      totalScenarios: number;
    }) => {
      const type = data.status === 'completed' ? 'success' : 'warning';
      const message = data.status === 'completed'
        ? `디바이스 ${data.deviceId}: 모든 시나리오 완료 (${data.completedScenarios}/${data.totalScenarios} 성공)`
        : `디바이스 ${data.deviceId}: ${data.status} (${data.completedScenarios} 성공, ${data.failedScenarios} 실패)`;
      addLog(type, message, undefined, data.deviceId);
    };

    // 진행률 업데이트
    const handleProgress = (data: {
      completed: number;
      total: number;
      percentage: number;
      deviceProgress: DeviceProgress[];
    }) => {
      setExecutionStatus(prev => ({
        ...prev,
        progress: { completed: data.completed, total: data.total, percentage: data.percentage },
      }));

      // 디바이스별 진행 상황 업데이트
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
      setExecutionStatus(prev => ({
        ...prev,
        isRunning: false,
        currentScenario: undefined,
      }));

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

    // 세션 없는 디바이스 자동 생성
    const devicesWithoutSession = selectedDeviceIds.filter(
      id => !sessions.some(s => s.deviceId === id && s.status === 'active'),
    );

    if (devicesWithoutSession.length > 0) {
      addLog('info', `${devicesWithoutSession.length}개 디바이스 세션 생성 중...`);

      try {
        await Promise.all(
          devicesWithoutSession.map(deviceId =>
            axios.post(`${API_BASE}/api/session/create`, { deviceId }),
          ),
        );
        onSessionChange();
        addLog('success', '세션 생성 완료');
      } catch (err) {
        const error = err as Error;
        addLog('error', `세션 생성 실패: ${error.message}`);
        alert('세션 생성에 실패했습니다. 디바이스 연결 상태를 확인해주세요.');
        return;
      }
    }

    // 실행 요청
    const request: TestExecutionRequest = {
      deviceIds: selectedDeviceIds,
      scenarioIds: selectedScenarioIds,
      repeatCount: executionOptions.repeatCount,
    };

    try {
      setExecutionLogs([]);
      setDeviceProgressMap(new Map());
      addLog('info', '테스트 실행 요청 중...');

      await axios.post(`${API_BASE}/api/test/execute`, request);
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

  // 진행 상황 닫기 (초기화)
  const handleClose = () => {
    setExecutionQueue([]);
    setExecutionLogs([]);
    setDeviceProgressMap(new Map());
    setExecutionStatus({
      isRunning: false,
      progress: { completed: 0, total: 0, percentage: 0 },
    });
  };

  // 실행 가능 여부
  const canExecute = !executionStatus.isRunning &&
    selectedDeviceIds.length > 0 &&
    selectedScenarioIds.length > 0;

  return (
    <div className="test-execution-panel">
      <div className="panel-header">
        <h2>테스트 실행</h2>
        <p className="panel-description">
          테스트할 디바이스와 시나리오를 선택하고 실행 옵션을 설정하세요.
        </p>
      </div>

      <div className="panel-content">
        {/* 실행 진행 상황 - 상단 전체 너비 */}
        {(executionStatus.isRunning || executionQueue.length > 0) && (
          <ExecutionProgress
            status={executionStatus}
            queue={executionQueue}
            logs={executionLogs}
            deviceProgress={deviceProgressMap}
            onStop={handleStop}
            onClose={handleClose}
          />
        )}

        {/* 설정 UI - 하단 가로 배치 */}
        <div className="settings-row">
          {/* WHO - 디바이스 선택 */}
          <DeviceSelector
            devices={devices}
            sessions={sessions}
            selectedDeviceIds={selectedDeviceIds}
            onSelectionChange={setSelectedDeviceIds}
            onSessionChange={onSessionChange}
            disabled={executionStatus.isRunning}
          />

          {/* WHAT - 시나리오 선택 */}
          <ScenarioSelector
            selectedScenarioIds={selectedScenarioIds}
            onSelectionChange={setSelectedScenarioIds}
            disabled={executionStatus.isRunning}
          />

          {/* WHEN - 실행 옵션 */}
          <ExecutionOptions
            options={executionOptions}
            onOptionsChange={setExecutionOptions}
            disabled={executionStatus.isRunning}
            onExecute={handleExecute}
            onStop={handleStop}
            canExecute={canExecute}
            isRunning={executionStatus.isRunning}
            selectedDeviceCount={selectedDeviceIds.length}
            selectedScenarioCount={selectedScenarioIds.length}
          />
        </div>
      </div>
    </div>
  );
};

export default TestExecutionPanel;
