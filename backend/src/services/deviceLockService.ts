// backend/src/services/deviceLockService.ts
// 디바이스 잠금 관리 서비스
// 다중 사용자 환경에서 디바이스 동시 사용 방지

import { Server as SocketIOServer } from 'socket.io';
import { DeviceLock, DeviceQueueStatus } from '../types/queue';

/**
 * 디바이스 잠금 관리 서비스
 *
 * 역할:
 * - 디바이스별 잠금 상태 관리
 * - 사용자별 잠금 추적
 * - 실시간 상태 브로드캐스트
 */
class DeviceLockService {
  private locks: Map<string, DeviceLock> = new Map();
  private io: SocketIOServer | null = null;

  /**
   * Socket.IO 인스턴스 설정
   */
  setSocketIO(io: SocketIOServer): void {
    this.io = io;
  }

  /**
   * 디바이스들 잠금
   * @returns 잠금 성공 여부 (하나라도 이미 잠겨있으면 false)
   */
  lockDevices(
    deviceIds: string[],
    executionId: string,
    userName: string,
    testName?: string
  ): { success: boolean; busyDevices?: string[] } {
    // 이미 잠긴 디바이스 확인
    const busyDevices = deviceIds.filter(id => this.locks.has(id));

    if (busyDevices.length > 0) {
      return { success: false, busyDevices };
    }

    // 모든 디바이스 잠금
    const now = new Date();
    for (const deviceId of deviceIds) {
      this.locks.set(deviceId, {
        deviceId,
        executionId,
        lockedBy: userName,
        lockedAt: now,
        testName,
      });
    }

    console.log(`[DeviceLockService] 디바이스 잠금: ${deviceIds.join(', ')} by ${userName}`);
    this.broadcastLockStatus();

    return { success: true };
  }

  /**
   * 디바이스들 잠금 해제
   */
  unlockDevices(deviceIds: string[]): void {
    let unlocked = false;

    for (const deviceId of deviceIds) {
      if (this.locks.has(deviceId)) {
        this.locks.delete(deviceId);
        unlocked = true;
      }
    }

    if (unlocked) {
      console.log(`[DeviceLockService] 디바이스 잠금 해제: ${deviceIds.join(', ')}`);
      this.broadcastLockStatus();
    }
  }

  /**
   * 특정 실행 ID의 모든 디바이스 잠금 해제
   */
  unlockByExecutionId(executionId: string): string[] {
    const unlockedDevices: string[] = [];

    for (const [deviceId, lock] of this.locks.entries()) {
      if (lock.executionId === executionId) {
        this.locks.delete(deviceId);
        unlockedDevices.push(deviceId);
      }
    }

    if (unlockedDevices.length > 0) {
      console.log(`[DeviceLockService] 실행 ${executionId} 디바이스 잠금 해제: ${unlockedDevices.join(', ')}`);
      this.broadcastLockStatus();
    }

    return unlockedDevices;
  }

  /**
   * 디바이스 사용 중 여부 확인
   */
  isDeviceBusy(deviceId: string): boolean {
    return this.locks.has(deviceId);
  }

  /**
   * 여러 디바이스 중 사용 중인 것들 반환
   */
  getBusyDevices(deviceIds: string[]): string[] {
    return deviceIds.filter(id => this.locks.has(id));
  }

  /**
   * 사용 가능한 디바이스들 반환
   */
  getAvailableDevices(deviceIds: string[]): string[] {
    return deviceIds.filter(id => !this.locks.has(id));
  }

  /**
   * 모든 잠금 정보 조회
   */
  getAllLocks(): DeviceLock[] {
    return Array.from(this.locks.values());
  }

  /**
   * 특정 디바이스의 잠금 정보 조회
   */
  getLock(deviceId: string): DeviceLock | null {
    return this.locks.get(deviceId) || null;
  }

  /**
   * 디바이스 소유자 조회
   */
  getDeviceOwner(deviceId: string): string | null {
    const lock = this.locks.get(deviceId);
    return lock ? lock.lockedBy : null;
  }

  /**
   * 특정 사용자가 잠근 디바이스 목록
   */
  getDevicesByUser(userName: string): string[] {
    const devices: string[] = [];
    for (const [deviceId, lock] of this.locks.entries()) {
      if (lock.lockedBy === userName) {
        devices.push(deviceId);
      }
    }
    return devices;
  }

  /**
   * 디바이스 상태 목록 생성 (UI용)
   * @param allDeviceIds 전체 디바이스 ID 목록
   * @param deviceNames 디바이스 ID → 이름 매핑
   * @param currentUserName 현재 사용자 이름 (본인 여부 판단용)
   */
  getDeviceStatuses(
    allDeviceIds: string[],
    deviceNames: Map<string, string>,
    currentUserName?: string
  ): DeviceQueueStatus[] {
    return allDeviceIds.map(deviceId => {
      const lock = this.locks.get(deviceId);
      const deviceName = deviceNames.get(deviceId) || deviceId;

      if (!lock) {
        return {
          deviceId,
          deviceName,
          status: 'available' as const,
        };
      }

      const isMine = currentUserName && lock.lockedBy === currentUserName;
      return {
        deviceId,
        deviceName,
        status: isMine ? 'busy_mine' as const : 'busy_other' as const,
        lockedBy: lock.lockedBy,
        testName: lock.testName,
        executionId: lock.executionId,
      };
    });
  }

  /**
   * 잠금 상태 브로드캐스트
   */
  private broadcastLockStatus(): void {
    if (!this.io) return;

    const locks = this.getAllLocks();
    this.io.emit('device:locks_updated', { locks });
  }

  /**
   * 모든 잠금 해제 (서버 재시작 등)
   */
  clearAllLocks(): void {
    const count = this.locks.size;
    this.locks.clear();

    if (count > 0) {
      console.log(`[DeviceLockService] 모든 잠금 해제 (${count}개)`);
      this.broadcastLockStatus();
    }
  }

  /**
   * 현재 잠금 수
   */
  getLockCount(): number {
    return this.locks.size;
  }
}

// 싱글톤 인스턴스
export const deviceLockService = new DeviceLockService();
