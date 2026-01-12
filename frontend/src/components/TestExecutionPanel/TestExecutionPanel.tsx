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
import TestQueuePanel from './TestQueuePanel';
import type {
  DeviceDetailedInfo,
  SessionInfo,
  TestExecutionOptions,
  TestExecutionStatus,
  ScenarioQueueItem,
  DeviceProgress,
  DeviceQueueStatus,
} from '../../types';
import './TestExecutionPanel.css';

const API_BASE = 'http://127.0.0.1:3001';

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
  userName?: string;  // 다중 사용자 큐 시스템용
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

  // 실행 상태
  const [executionStatus, setExecutionStatus] = useState<TestExecutionStatus>({
    isRunning: false,
    progress: { completed: 0, total: 0, percentage: 0 },
  });
  const [executionQueue, setExecutionQueue] = useState<ScenarioQueueItem[]>([]);
  const [executionLogs, setExecutionLogs] = useState<ExecutionLog[]>([]);
  const [deviceProgressMap, setDeviceProgressMap] = useState<Map<string, DeviceProgress>>(new Map());
  const [isProgressCollapsed, setIsProgressCollapsed] = useState(true);

  // 디바이스 큐 상태 (잠금 상태)
  const [deviceQueueStatus, setDeviceQueueStatus] = useState<DeviceQueueStatus[]>([]);

  // 내 실행 중인 테스트 수 (큐 시스템에서)
  const [myRunningTestCount, setMyRunningTestCount] = useState(0);

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
      setIsProgressCollapsed(false);  // 테스트 시작 시 자동으로 펼치기
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
      // 실패한 노드만 로그에 추가
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

      // 테스트 완료 시 실행 중 카운트 즉시 리셋
      setMyRunningTestCount(0);

      // 큐 상태 즉시 갱신 요청
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

    // 테스트 준비 중 (즉시 피드백)
    const handleTestPreparing = (data: { deviceIds: string[]; scenarioIds: string[]; message: string }) => {
      addLog('info', `⏳ ${data.message}`);
      setIsProgressCollapsed(false);  // 준비 시작 시 자동으로 펼치기
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

  // 큐 상태 조회 (디바이스 잠금 상태)
  useEffect(() => {
    if (!socket) return;

    // 큐 상태 응답 핸들러
    const handleQueueStatusResponse = (data: {
      deviceStatuses?: DeviceQueueStatus[];
      runningTests?: Array<{ requesterName: string }>;
    }) => {
      if (data.deviceStatuses) {
        setDeviceQueueStatus(data.deviceStatuses);
      }
      // 현재 사용자의 실행 중인 테스트 수 계산
      if (data.runningTests) {
        const myCount = data.runningTests.filter(t => t.requesterName === userName).length;
        setMyRunningTestCount(myCount);
      }
    };

    // 큐 상태 변경 시 (브로드캐스트) - 다시 상태 요청
    const handleQueueUpdated = () => {
      socket.emit('queue:status');
    };

    socket.on('queue:status:response', handleQueueStatusResponse);
    socket.on('queue:updated', handleQueueUpdated);

    // 초기 큐 상태 요청
    socket.emit('queue:status');

    // 5초마다 큐 상태 갱신
    const interval = setInterval(() => {
      socket.emit('queue:status');
    }, 5000);

    return () => {
      socket.off('queue:status:response', handleQueueStatusResponse);
      socket.off('queue:updated', handleQueueUpdated);
      clearInterval(interval);
    };
  }, [socket, userName]);

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

    // 실행 요청 (세션 검증/생성은 백엔드에서 자동 처리)
    const request = {
      deviceIds: selectedDeviceIds,
      scenarioIds: selectedScenarioIds,
      repeatCount: executionOptions.repeatCount,
      scenarioInterval: executionOptions.scenarioInterval * 1000, // 초 → ms 변환
      userName: userName || 'anonymous',  // 큐 시스템용
    };

    try {
      setExecutionLogs([]);
      setDeviceProgressMap(new Map());
      setIsProgressCollapsed(false);  // 실행 시 진행 상황 펼치기
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

      // 응답에 따른 로그 표시
      const { status, message, splitExecution } = response.data;

      if (status === 'partial' && splitExecution) {
        // 분할 실행: 일부 즉시, 일부 대기
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

  // 진행 상황 지우기 (초기화)
  const handleClear = () => {
    setExecutionQueue([]);
    setExecutionLogs([]);
    setDeviceProgressMap(new Map());
    setExecutionStatus({
      isRunning: false,
      progress: { completed: 0, total: 0, percentage: 0 },
    });
  };

  // 진행 상황 접기/펼치기
  const handleToggleCollapse = () => {
    setIsProgressCollapsed(prev => !prev);
  };

  // 선택한 디바이스 중 바쁜 디바이스 수 계산 (다른 사용자가 사용 중)
  const busyByOtherCount = selectedDeviceIds.filter(deviceId => {
    const status = deviceQueueStatus.find(s => s.deviceId === deviceId);
    return status?.status === 'busy_other';
  }).length;

  // 선택한 디바이스 중 내가 사용 중인 디바이스 수
  const busyByMeCount = selectedDeviceIds.filter(deviceId => {
    const status = deviceQueueStatus.find(s => s.deviceId === deviceId);
    return status?.status === 'busy_mine';
  }).length;

  // 전체 바쁜 디바이스 수 (큐 대기 필요)
  const totalBusyCount = busyByOtherCount + busyByMeCount;

  // 실행 가능 여부 (디바이스와 시나리오만 선택되면 항상 실행/큐잉 가능)
  const canExecute = selectedDeviceIds.length > 0 && selectedScenarioIds.length > 0;

  return (
    <div className="test-execution-panel">
      <div className="panel-header">
        <h2>테스트 실행</h2>
        <p className="panel-description">
          테스트할 디바이스와 시나리오를 선택하고 실행 옵션을 설정하세요.
        </p>
      </div>

      {/* 대기열 패널 - 스크롤 영역 밖에 고정 */}
      {userName && (
        <div className="queue-container">
          <TestQueuePanel
            socket={socket}
            userName={userName}
          />
        </div>
      )}

      <div className="panel-content">
        {/* 실행 진행 상황 - 상단 전체 너비 (항상 표시, 접기/펼치기 가능) */}
        <ExecutionProgress
          status={executionStatus}
          queue={executionQueue}
          logs={executionLogs}
          deviceProgress={deviceProgressMap}
          onStop={handleStop}
          onClear={handleClear}
          isCollapsed={isProgressCollapsed}
          onToggleCollapse={handleToggleCollapse}
        />

        {/* 설정 UI - 하단 가로 배치 */}
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
            onStop={handleStop}
            canExecute={canExecute}
            isRunning={false}
            selectedDeviceCount={selectedDeviceIds.length}
            selectedScenarioCount={selectedScenarioIds.length}
            busyDeviceCount={totalBusyCount}
          />
        </div>
      </div>
    </div>
  );
};

export default TestExecutionPanel;
