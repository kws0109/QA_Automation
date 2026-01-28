// frontend/src/hooks/useQueueStatus.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isMyTest,
  isMyCompletedTest,
  formatDuration,
  formatDateTime,
  getWaitTimeText,
  getElapsedTime,
  canForceComplete,
} from './useQueueStatus';
import type { QueuedTest, CompletedTest } from '../types';

describe('useQueueStatus utility functions', () => {
  describe('isMyTest', () => {
    it('should return true when requesterName matches userName', () => {
      const test = { requesterName: 'john' } as QueuedTest;
      expect(isMyTest(test, 'john')).toBe(true);
    });

    it('should return false when requesterName does not match', () => {
      const test = { requesterName: 'john' } as QueuedTest;
      expect(isMyTest(test, 'jane')).toBe(false);
    });
  });

  describe('isMyCompletedTest', () => {
    it('should return true when requesterName matches userName', () => {
      const test = { requesterName: 'john' } as CompletedTest;
      expect(isMyCompletedTest(test, 'john')).toBe(true);
    });

    it('should return false when requesterName does not match', () => {
      const test = { requesterName: 'john' } as CompletedTest;
      expect(isMyCompletedTest(test, 'jane')).toBe(false);
    });
  });

  describe('formatDuration', () => {
    it('should format milliseconds as seconds when under 60 seconds', () => {
      expect(formatDuration(5000)).toBe('5초');
      expect(formatDuration(30000)).toBe('30초');
      expect(formatDuration(59000)).toBe('59초');
    });

    it('should format milliseconds as minutes and seconds when 60 seconds or more', () => {
      expect(formatDuration(60000)).toBe('1분 0초');
      expect(formatDuration(90000)).toBe('1분 30초');
      expect(formatDuration(125000)).toBe('2분 5초');
    });
  });

  describe('formatDateTime', () => {
    it('should format date string to MM/DD HH:mm format', () => {
      const dateStr = '2024-03-15T14:30:00.000Z';
      const result = formatDateTime(dateStr);

      // Note: Result depends on local timezone, so we just check format
      expect(result).toMatch(/^\d{2}\/\d{2} \d{2}:\d{2}$/);
    });
  });

  describe('getWaitTimeText', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return seconds for wait time under 60 seconds', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const test = { createdAt: new Date(now - 30000).toISOString() } as QueuedTest;
      expect(getWaitTimeText(test)).toBe('30초');
    });

    it('should return minutes for wait time 60 seconds or more', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const test = { createdAt: new Date(now - 120000).toISOString() } as QueuedTest;
      expect(getWaitTimeText(test)).toBe('2분');
    });
  });

  describe('getElapsedTime', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return "-" when startedAt is not set', () => {
      const test = {} as QueuedTest;
      expect(getElapsedTime(test)).toBe('-');
    });

    it('should format elapsed time as seconds when under 60 seconds', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const test = { startedAt: new Date(now - 45000).toISOString() } as QueuedTest;
      expect(getElapsedTime(test)).toBe('45초');
    });

    it('should format elapsed time as M:SS when 60 seconds or more', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const test = { startedAt: new Date(now - 125000).toISOString() } as QueuedTest;
      expect(getElapsedTime(test)).toBe('2:05');
    });
  });

  describe('canForceComplete', () => {
    it('should return true when there are pending devices and no running devices', () => {
      const test = {
        pendingDevices: ['device-1', 'device-2'],
        runningDevices: [],
      } as unknown as QueuedTest;
      expect(canForceComplete(test)).toBe(true);
    });

    it('should return false when there are running devices', () => {
      const test = {
        pendingDevices: ['device-1'],
        runningDevices: ['device-2'],
      } as unknown as QueuedTest;
      expect(canForceComplete(test)).toBe(false);
    });

    it('should return false when there are no pending devices', () => {
      const test = {
        pendingDevices: [],
        runningDevices: [],
      } as unknown as QueuedTest;
      expect(canForceComplete(test)).toBe(false);
    });

    it('should handle undefined pendingDevices and runningDevices', () => {
      const test = {} as QueuedTest;
      expect(canForceComplete(test)).toBe(false);
    });
  });
});
