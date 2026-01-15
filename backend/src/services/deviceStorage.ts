// backend/src/services/deviceStorage.ts

import fs from 'fs/promises';
import path from 'path';
import { SavedDevice, DeviceRole } from '../types';

// 디바이스 저장 경로
const DEVICES_DIR = path.join(__dirname, '../../devices');
const WIFI_CONFIG_FILE = path.join(DEVICES_DIR, '_wifi-devices.json');

// WiFi ADB 연결 정보
export interface WifiDeviceConfig {
  ip: string;
  port: number;
  deviceId: string;  // 연결 시 사용되는 ID (예: 192.168.1.100:5555)
  originalDeviceId?: string;  // 원래 USB device ID (예: emulator-5554)
  alias?: string;
  lastConnected?: string;
  autoReconnect: boolean;
}

class DeviceStorageService {
  /**
   * 저장 폴더 확인 및 생성
   */
  private async _ensureDir(): Promise<void> {
    try {
      await fs.access(DEVICES_DIR);
    } catch {
      await fs.mkdir(DEVICES_DIR, { recursive: true });
    }
  }

  /**
   * 디바이스 파일 경로 생성
   * deviceId에 특수문자가 있을 수 있으므로 안전하게 처리
   */
  private _getFilePath(id: string): string {
    // deviceId를 파일명으로 안전하게 변환 (예: emulator-5554 -> emulator-5554.json)
    const safeId = id.replace(/[<>:"/\\|?*]/g, '_');
    return path.join(DEVICES_DIR, `${safeId}.json`);
  }

  /**
   * 디바이스 정보 저장 또는 업데이트
   * 이미 저장된 디바이스면 lastConnectedAt만 갱신, 없으면 새로 저장
   */
  async saveDevice(device: Omit<SavedDevice, 'firstConnectedAt' | 'lastConnectedAt'> & { alias?: string }): Promise<SavedDevice> {
    await this._ensureDir();

    const now = new Date().toISOString();
    const filePath = this._getFilePath(device.id);

    let savedDevice: SavedDevice;
    let isNewDevice = false;

    try {
      // 기존 디바이스가 있으면 읽어오기
      const content = await fs.readFile(filePath, 'utf-8');
      const existing = JSON.parse(content) as SavedDevice;

      // 기존 데이터 유지하면서 업데이트
      savedDevice = {
        ...device,
        alias: existing.alias,  // 기존 별칭 유지
        firstConnectedAt: existing.firstConnectedAt,
        lastConnectedAt: now,
      };
    } catch {
      // 새 디바이스
      isNewDevice = true;
      savedDevice = {
        ...device,
        firstConnectedAt: now,
        lastConnectedAt: now,
      };
    }

    await fs.writeFile(filePath, JSON.stringify(savedDevice, null, 2), 'utf-8');

    // 새 디바이스일 때만 로그 출력
    if (isNewDevice) {
      console.log(`📱 새 디바이스 저장: ${device.model} (ID: ${device.id})`);
    }

    return savedDevice;
  }

  /**
   * 모든 저장된 디바이스 조회
   */
  async getAll(): Promise<SavedDevice[]> {
    await this._ensureDir();

    const files = await fs.readdir(DEVICES_DIR);
    // _wifi-devices.json은 WiFi 설정 파일이므로 제외
    const jsonFiles = files.filter(f => f.endsWith('.json') && !f.startsWith('_'));

    const devices = await Promise.all(
      jsonFiles.map(async (file) => {
        const filePath = path.join(DEVICES_DIR, file);
        const content = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(content) as SavedDevice;
      })
    );

    // 마지막 연결 시간순 정렬 (최신순)
    devices.sort((a, b) =>
      new Date(b.lastConnectedAt).getTime() - new Date(a.lastConnectedAt).getTime()
    );

    return devices;
  }

  /**
   * 특정 디바이스 조회
   */
  async getById(id: string): Promise<SavedDevice | null> {
    const filePath = this._getFilePath(id);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as SavedDevice;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * 디바이스 별칭 수정
   */
  async updateAlias(id: string, alias: string): Promise<SavedDevice> {
    const filePath = this._getFilePath(id);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const device = JSON.parse(content) as SavedDevice;

      const updated: SavedDevice = {
        ...device,
        alias: alias.trim() || undefined,  // 빈 문자열이면 제거
      };

      await fs.writeFile(filePath, JSON.stringify(updated, null, 2), 'utf-8');
      console.log(`✏️ 디바이스 별칭 수정: ${id} → ${alias || '(없음)'}`);

      return updated;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        throw new Error(`저장된 디바이스를 찾을 수 없습니다: ${id}`);
      }
      throw error;
    }
  }

  /**
   * 디바이스 역할 수정
   * @param id 디바이스 ID
   * @param role 역할 ('editing' | 'testing')
   */
  async updateRole(id: string, role: DeviceRole): Promise<SavedDevice> {
    const filePath = this._getFilePath(id);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const device = JSON.parse(content) as SavedDevice;

      const updated: SavedDevice = {
        ...device,
        role,
      };

      await fs.writeFile(filePath, JSON.stringify(updated, null, 2), 'utf-8');
      console.log(`🏷️ 디바이스 역할 수정: ${id} → ${role}`);

      return updated;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        throw new Error(`저장된 디바이스를 찾을 수 없습니다: ${id}`);
      }
      throw error;
    }
  }

  /**
   * 저장된 디바이스 삭제
   */
  async delete(id: string): Promise<{ success: boolean; message: string }> {
    const filePath = this._getFilePath(id);

    try {
      await fs.access(filePath);
      await fs.unlink(filePath);

      console.log(`🗑️ 디바이스 삭제: ${id}`);
      return { success: true, message: `디바이스가 삭제되었습니다: ${id}` };
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        throw new Error(`저장된 디바이스를 찾을 수 없습니다: ${id}`);
      }
      throw error;
    }
  }

  // ==================== WiFi ADB 설정 관리 ====================

  /**
   * WiFi 설정 파일 읽기
   */
  private async _readWifiConfigs(): Promise<WifiDeviceConfig[]> {
    await this._ensureDir();

    try {
      const content = await fs.readFile(WIFI_CONFIG_FILE, 'utf-8');
      return JSON.parse(content) as WifiDeviceConfig[];
    } catch {
      return [];
    }
  }

  /**
   * WiFi 설정 파일 쓰기
   */
  private async _writeWifiConfigs(configs: WifiDeviceConfig[]): Promise<void> {
    await this._ensureDir();
    await fs.writeFile(WIFI_CONFIG_FILE, JSON.stringify(configs, null, 2), 'utf-8');
  }

  /**
   * WiFi 디바이스 설정 저장
   */
  async saveWifiConfig(config: Omit<WifiDeviceConfig, 'autoReconnect'> & { autoReconnect?: boolean }): Promise<WifiDeviceConfig> {
    const configs = await this._readWifiConfigs();
    const key = `${config.ip}:${config.port}`;

    // 기존 설정 찾기
    const existingIndex = configs.findIndex(c => `${c.ip}:${c.port}` === key);

    const newConfig: WifiDeviceConfig = {
      ...config,
      deviceId: `${config.ip}:${config.port}`,
      autoReconnect: config.autoReconnect ?? true,
      lastConnected: new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      // 기존 설정 업데이트 (alias, originalDeviceId 유지)
      configs[existingIndex] = {
        ...configs[existingIndex],
        ...newConfig,
        alias: configs[existingIndex].alias || newConfig.alias,
        originalDeviceId: configs[existingIndex].originalDeviceId || newConfig.originalDeviceId,
      };
    } else {
      // 새 설정 추가
      configs.push(newConfig);
      console.log(`📶 WiFi 디바이스 설정 저장: ${key}`);
    }

    await this._writeWifiConfigs(configs);
    return existingIndex >= 0 ? configs[existingIndex] : newConfig;
  }

  /**
   * 모든 WiFi 디바이스 설정 조회
   */
  async getAllWifiConfigs(): Promise<WifiDeviceConfig[]> {
    return this._readWifiConfigs();
  }

  /**
   * 특정 WiFi 디바이스 설정 조회
   */
  async getWifiConfig(ip: string, port: number): Promise<WifiDeviceConfig | null> {
    const configs = await this._readWifiConfigs();
    return configs.find(c => c.ip === ip && c.port === port) || null;
  }

  /**
   * WiFi 디바이스 설정 삭제
   */
  async deleteWifiConfig(ip: string, port: number): Promise<boolean> {
    const configs = await this._readWifiConfigs();
    const key = `${ip}:${port}`;
    const initialLength = configs.length;

    const filtered = configs.filter(c => `${c.ip}:${c.port}` !== key);

    if (filtered.length < initialLength) {
      await this._writeWifiConfigs(filtered);
      console.log(`🗑️ WiFi 디바이스 설정 삭제: ${key}`);
      return true;
    }

    return false;
  }

  /**
   * WiFi 디바이스 자동 재연결 설정 변경
   */
  async updateWifiAutoReconnect(ip: string, port: number, autoReconnect: boolean): Promise<WifiDeviceConfig | null> {
    const configs = await this._readWifiConfigs();
    const index = configs.findIndex(c => c.ip === ip && c.port === port);

    if (index < 0) {
      return null;
    }

    configs[index].autoReconnect = autoReconnect;
    await this._writeWifiConfigs(configs);
    console.log(`⚙️ WiFi 자동 재연결 설정 변경: ${ip}:${port} → ${autoReconnect ? 'ON' : 'OFF'}`);

    return configs[index];
  }

  /**
   * WiFi 디바이스 별칭 수정
   */
  async updateWifiAlias(ip: string, port: number, alias: string): Promise<WifiDeviceConfig | null> {
    const configs = await this._readWifiConfigs();
    const index = configs.findIndex(c => c.ip === ip && c.port === port);

    if (index < 0) {
      return null;
    }

    configs[index].alias = alias.trim() || undefined;
    await this._writeWifiConfigs(configs);
    console.log(`✏️ WiFi 디바이스 별칭 수정: ${ip}:${port} → ${alias || '(없음)'}`);

    return configs[index];
  }
}

export const deviceStorageService = new DeviceStorageService();
export default deviceStorageService;
