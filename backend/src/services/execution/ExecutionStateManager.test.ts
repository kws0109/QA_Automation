// backend/src/services/execution/ExecutionStateManager.test.ts
// 순수 단위 테스트 - 외부 의존성 없는 메서드만 테스트

import { describe, it, expect, beforeEach } from 'vitest';
import { ExecutionStateManager } from './ExecutionStateManager';
import type { TestExecutionRequest, ScenarioQueueItem } from '../../types';
import type { ExecutionState } from './types';

describe('ExecutionStateManager', () => {
  let manager: ExecutionStateManager;

  beforeEach(() => {
    manager = new ExecutionStateManager();
  });

  describe('isRunning', () => {
    it('should return false when no executions are active', () => {
      expect(manager.isRunning()).toBe(false);
    });

    it('should return true when an execution is registered', () => {
      const state = createMockState('exec-1');
      manager.registerExecution('exec-1', state);
      expect(manager.isRunning()).toBe(true);
    });
  });

  describe('registerExecution / removeExecution', () => {
    it('should register an execution', () => {
      const state = createMockState('exec-1');
      manager.registerExecution('exec-1', state);

      expect(manager.isExecutionRunning('exec-1')).toBe(true);
      expect(manager.getActiveExecutionCount()).toBe(1);
    });

    it('should set currentExecutionId when registering', () => {
      const state = createMockState('exec-1');
      manager.registerExecution('exec-1', state);

      expect(manager.getCurrentExecutionId()).toBe('exec-1');
    });

    it('should remove an execution', () => {
      const state = createMockState('exec-1');
      manager.registerExecution('exec-1', state);

      const removed = manager.removeExecution('exec-1');

      expect(removed).toBe(true);
      expect(manager.isExecutionRunning('exec-1')).toBe(false);
      expect(manager.getActiveExecutionCount()).toBe(0);
    });

    it('should clear currentExecutionId when removing current execution', () => {
      const state = createMockState('exec-1');
      manager.registerExecution('exec-1', state);
      manager.removeExecution('exec-1');

      expect(manager.getCurrentExecutionId()).toBeNull();
    });
  });

  describe('getActiveExecutionIds', () => {
    it('should return all active execution IDs', () => {
      manager.registerExecution('exec-1', createMockState('exec-1'));
      manager.registerExecution('exec-2', createMockState('exec-2'));

      const ids = manager.getActiveExecutionIds();

      expect(ids).toContain('exec-1');
      expect(ids).toContain('exec-2');
      expect(ids.length).toBe(2);
    });
  });

  describe('requestStop / isStopRequested', () => {
    it('should set stopRequested flag', () => {
      const state = createMockState('exec-1');
      manager.registerExecution('exec-1', state);

      expect(manager.isStopRequested('exec-1')).toBe(false);

      manager.requestStop('exec-1');

      expect(manager.isStopRequested('exec-1')).toBe(true);
    });

    it('should return false for non-existent execution', () => {
      expect(manager.requestStop('non-existent')).toBe(false);
      expect(manager.isStopRequested('non-existent')).toBe(false);
    });
  });

  describe('initDeviceProgress', () => {
    it('should initialize device progress', () => {
      const state = createMockState('exec-1');
      manager.registerExecution('exec-1', state);

      const progress = manager.initDeviceProgress(state, 'device-1', 'Device 1', 5);

      expect(progress.deviceId).toBe('device-1');
      expect(progress.deviceName).toBe('Device 1');
      expect(progress.totalScenarios).toBe(5);
      expect(progress.currentScenarioIndex).toBe(0);
      expect(progress.status).toBe('running');
      expect(progress.completedScenarios).toBe(0);
      expect(progress.failedScenarios).toBe(0);
    });
  });

  describe('getStatus', () => {
    it('should return not running when no active executions', () => {
      const status = manager.getStatus();

      expect(status.isRunning).toBe(false);
      expect(status.progress.completed).toBe(0);
      expect(status.progress.total).toBe(0);
    });

    it('should return running status with progress', () => {
      const state = createMockState('exec-1', {
        deviceIds: ['device-1', 'device-2'],
        scenarioQueue: [
          createMockQueueItem('scenario-1', 1),
          createMockQueueItem('scenario-2', 2),
        ],
      });
      manager.registerExecution('exec-1', state);

      // Initialize progress for devices
      manager.initDeviceProgress(state, 'device-1', 'Device 1', 2);
      manager.initDeviceProgress(state, 'device-2', 'Device 2', 2);

      // Simulate some completed scenarios
      state.deviceProgress.get('device-1')!.completedScenarios = 1;

      const status = manager.getStatus('exec-1');

      expect(status.isRunning).toBe(true);
      expect(status.executionId).toBe('exec-1');
      expect(status.progress.total).toBe(4); // 2 scenarios * 2 devices
      expect(status.progress.completed).toBe(1);
      expect(status.progress.percentage).toBe(25);
    });
  });

  describe('storeScreenshot', () => {
    it('should store screenshot for device and scenario', () => {
      const state = createMockState('exec-1');
      manager.registerExecution('exec-1', state);

      const screenshot = {
        nodeId: 'node-1',
        timestamp: 1000,
        path: '/path/to/screenshot.png',
        type: 'error' as const,
      };

      manager.storeScreenshot('exec-1', 'device-1', 'scenario-1', 1, screenshot);

      const deviceScreenshots = state.deviceScreenshots.get('device-1');
      expect(deviceScreenshots).toBeDefined();

      const scenarioScreenshots = deviceScreenshots!.get('scenario-1-1');
      expect(scenarioScreenshots).toBeDefined();
      expect(scenarioScreenshots!.length).toBe(1);
      expect(scenarioScreenshots![0]).toEqual(screenshot);
    });
  });

  describe('reset', () => {
    it('should clear all executions', () => {
      manager.registerExecution('exec-1', createMockState('exec-1'));
      manager.registerExecution('exec-2', createMockState('exec-2'));

      manager.reset();

      expect(manager.isRunning()).toBe(false);
      expect(manager.getActiveExecutionCount()).toBe(0);
      expect(manager.getCurrentExecutionId()).toBeNull();
    });
  });

  describe('createExecutionState', () => {
    it('should create a valid execution state object', () => {
      const request: TestExecutionRequest = {
        scenarioIds: ['s1', 's2'],
        deviceIds: ['d1'],
        repeatCount: 1,
        scenarioInterval: 500,
      };
      const queue: ScenarioQueueItem[] = [createMockQueueItem('s1', 1)];
      const deviceNames = new Map([['d1', 'Test Device']]);

      const state = manager.createExecutionState(
        'exec-123',
        'report-123',
        request,
        queue,
        ['d1'],
        deviceNames,
      );

      expect(state.executionId).toBe('exec-123');
      expect(state.reportId).toBe('report-123');
      expect(state.request).toBe(request);
      expect(state.stopRequested).toBe(false);
      expect(state.scenarioQueue).toBe(queue);
      expect(state.deviceIds).toEqual(['d1']);
      expect(state.scenarioInterval).toBe(500);
      expect(state.deviceScreenshots.size).toBe(0);
      expect(state.deviceVideos.size).toBe(0);
    });
  });

  describe('getDeviceName', () => {
    it('should return device name from state', () => {
      const state = createMockState('exec-1');
      state.deviceNames.set('device-1', 'My Device');
      manager.registerExecution('exec-1', state);

      expect(manager.getDeviceName('device-1', 'exec-1')).toBe('My Device');
    });

    it('should return deviceId when name not found', () => {
      const state = createMockState('exec-1');
      manager.registerExecution('exec-1', state);

      expect(manager.getDeviceName('unknown-device', 'exec-1')).toBe('unknown-device');
    });
  });
});

// Helper functions
function createMockState(
  executionId: string,
  overrides?: Partial<{
    deviceIds: string[];
    scenarioQueue: ScenarioQueueItem[];
  }>
): ExecutionState {
  return {
    executionId,
    reportId: `report-${executionId}`,
    request: {
      scenarioIds: ['scenario-1'],
      deviceIds: ['device-1'],
      repeatCount: 1,
    } as TestExecutionRequest,
    stopRequested: false,
    scenarioQueue: overrides?.scenarioQueue || [],
    deviceProgress: new Map(),
    deviceNames: new Map([['device-1', 'Test Device']]),
    startedAt: new Date(),
    deviceIds: overrides?.deviceIds || ['device-1'],
    scenarioInterval: 0,
    deviceScreenshots: new Map(),
    deviceVideos: new Map(),
    deviceEnvironments: new Map(),
    deviceAppInfos: new Map(),
  };
}

function createMockQueueItem(scenarioId: string, order: number): ScenarioQueueItem {
  return {
    scenarioId,
    scenarioName: `Scenario ${order}`,
    packageId: 'pkg-1',
    packageName: 'Test Package',
    appPackage: 'com.test.app',
    categoryId: 'cat-1',
    categoryName: 'Test Category',
    order,
    repeatIndex: 1,
  };
}
