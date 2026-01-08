import { exec } from 'child_process';
import { promisify } from 'util';
import { DeviceInfo, DeviceOS } from '../types';

const execAsync = promisify(exec);

// 디바이스 상세 정보 인터페이스
export interface DeviceDetailedInfo extends DeviceInfo {
  // 하드웨어 정보
  brand: string;
  manufacturer: string;
  screenResolution: string;
  screenDensity: number;

  // 시스템 정보
  cpuModel: string;  // CPU 모델명 (예: Qualcomm SDM845)
  cpuAbi: string;    // CPU ABI (예: arm64-v8a)
  sdkVersion: number;
  buildNumber: string;

  // 실시간 상태
  batteryLevel: number;
  batteryStatus: 'charging' | 'discharging' | 'full' | 'not charging' | 'unknown';
  memoryTotal: number;  // MB
  memoryAvailable: number;  // MB
  storageTotal: number;  // GB
  storageAvailable: number;  // GB
}

class DeviceManager {
  /**
   * ADB를 통해 연결된 모든 디바이스 조회
   */
  async scanDevices(): Promise<DeviceInfo[]> {
    try {
      const { stdout } = await execAsync('adb devices -l');
      const lines = stdout.trim().split('\n').slice(1); // 첫 줄 헤더 제외
      
      const devices: DeviceInfo[] = [];
      
      for (const line of lines) {
        if (!line.trim()) continue;
        
        const deviceInfo = await this.parseDeviceLine(line);
        if (deviceInfo) {
          devices.push(deviceInfo);
        }
      }
      
      return devices;
    } catch (error) {
      console.error('Failed to scan devices:', error);
      return [];
    }
  }

  /**
   * ADB 출력 라인 파싱
   */
  private async parseDeviceLine(line: string): Promise<DeviceInfo | null> {
    // 예: "emulator-5554 device product:sdk_gphone64_arm64 model:sdk_gphone64_arm64 device:emu64a"
    const match = line.match(/^(\S+)\s+(\S+)/);
    if (!match) return null;

    const [, id, status] = match;

    // 모델명 추출
    const modelMatch = line.match(/model:(\S+)/);
    const model = modelMatch ? modelMatch[1] : 'Unknown';

    // 디바이스명 추출
    const deviceMatch = line.match(/device:(\S+)/);
    const deviceName = deviceMatch ? deviceMatch[1] : id;

    // Android 버전 조회 (ADB로 연결된 것은 Android)
    const osVersion = await this.getAndroidVersion(id);

    return {
      id,
      name: deviceName,
      model,
      os: 'Android' as DeviceOS,
      osVersion,
      status: this.mapStatus(status),
      sessionActive: false
    };
  }

  /**
   * Android 버전 조회
   */
  private async getAndroidVersion(deviceId: string): Promise<string> {
    try {
      const { stdout } = await execAsync(
        `adb -s ${deviceId} shell getprop ro.build.version.release`
      );
      return stdout.trim() || 'Unknown';
    } catch {
      return 'Unknown';
    }
  }

  /**
   * 상태 매핑
   */
  private mapStatus(status: string): DeviceInfo['status'] {
    switch (status) {
      case 'device': return 'connected';
      case 'offline': return 'offline';
      case 'unauthorized': return 'unauthorized';
      default: return 'offline';
    }
  }

  /**
   * 단일 디바이스 상세 정보 조회
   */
  async getDeviceDetails(deviceId: string): Promise<DeviceInfo | null> {
    const devices = await this.scanDevices();
    return devices.find(d => d.id === deviceId) || null;
  }

  /**
   * 디바이스 상세 정보 조회 (하드웨어, 시스템, 실시간 상태)
   */
  async getDeviceDetailedInfo(deviceId: string): Promise<DeviceDetailedInfo | null> {
    const basicInfo = await this.getDeviceDetails(deviceId);
    if (!basicInfo || basicInfo.status !== 'connected') {
      return null;
    }

    try {
      // 병렬로 정보 조회
      const [
        brand,
        manufacturer,
        screenSize,
        screenDensity,
        cpuModel,
        cpuAbi,
        sdkVersion,
        buildNumber,
        batteryInfo,
        memInfo,
        storageInfo,
      ] = await Promise.all([
        this.getDeviceProp(deviceId, 'ro.product.brand'),
        this.getDeviceProp(deviceId, 'ro.product.manufacturer'),
        this.getScreenSize(deviceId),
        this.getDeviceProp(deviceId, 'ro.sf.lcd_density'),
        this.getCpuModel(deviceId),
        this.getDeviceProp(deviceId, 'ro.product.cpu.abi'),
        this.getDeviceProp(deviceId, 'ro.build.version.sdk'),
        this.getDeviceProp(deviceId, 'ro.build.display.id'),
        this.getBatteryInfo(deviceId),
        this.getMemoryInfo(deviceId),
        this.getStorageInfo(deviceId),
      ]);

      return {
        ...basicInfo,
        brand: brand || 'Unknown',
        manufacturer: manufacturer || 'Unknown',
        screenResolution: screenSize || 'Unknown',
        screenDensity: parseInt(screenDensity) || 0,
        cpuModel: cpuModel || 'Unknown',
        cpuAbi: cpuAbi || 'Unknown',
        sdkVersion: parseInt(sdkVersion) || 0,
        buildNumber: buildNumber || 'Unknown',
        ...batteryInfo,
        ...memInfo,
        ...storageInfo,
      };
    } catch (error) {
      console.error(`Failed to get detailed info for ${deviceId}:`, error);
      return null;
    }
  }

  /**
   * 디바이스 속성 조회
   */
  private async getDeviceProp(deviceId: string, prop: string): Promise<string> {
    try {
      const { stdout } = await execAsync(`adb -s ${deviceId} shell getprop ${prop}`);
      return stdout.trim();
    } catch {
      return '';
    }
  }

  /**
   * 화면 크기 조회
   */
  private async getScreenSize(deviceId: string): Promise<string> {
    try {
      const { stdout } = await execAsync(`adb -s ${deviceId} shell wm size`);
      const match = stdout.match(/(\d+x\d+)/);
      return match ? match[1] : 'Unknown';
    } catch {
      return 'Unknown';
    }
  }

  /**
   * CPU 모델명 조회
   */
  private async getCpuModel(deviceId: string): Promise<string> {
    try {
      const { stdout } = await execAsync(`adb -s ${deviceId} shell "cat /proc/cpuinfo | grep Hardware"`);
      // "Hardware	: Qualcomm Technologies, Inc SDM845" 형식에서 모델명 추출
      const match = stdout.match(/Hardware\s*:\s*(.+)/);
      if (match) {
        let cpuModel = match[1].trim();
        // "Qualcomm Technologies, Inc " 접두사 간소화
        cpuModel = cpuModel.replace('Qualcomm Technologies, Inc ', 'Snapdragon ');
        return cpuModel;
      }
      return 'Unknown';
    } catch {
      return 'Unknown';
    }
  }

  /**
   * 배터리 정보 조회
   */
  private async getBatteryInfo(deviceId: string): Promise<{
    batteryLevel: number;
    batteryStatus: DeviceDetailedInfo['batteryStatus'];
  }> {
    try {
      const { stdout } = await execAsync(`adb -s ${deviceId} shell dumpsys battery`);

      const levelMatch = stdout.match(/level:\s*(\d+)/);
      const statusMatch = stdout.match(/status:\s*(\d+)/);

      const level = levelMatch ? parseInt(levelMatch[1]) : 0;
      const statusCode = statusMatch ? parseInt(statusMatch[1]) : 0;

      // 배터리 상태 코드: 1=unknown, 2=charging, 3=discharging, 4=not charging, 5=full
      const statusMap: Record<number, DeviceDetailedInfo['batteryStatus']> = {
        1: 'unknown',
        2: 'charging',
        3: 'discharging',
        4: 'not charging',
        5: 'full',
      };

      return {
        batteryLevel: level,
        batteryStatus: statusMap[statusCode] || 'unknown',
      };
    } catch {
      return { batteryLevel: 0, batteryStatus: 'unknown' };
    }
  }

  /**
   * 메모리 정보 조회
   */
  private async getMemoryInfo(deviceId: string): Promise<{
    memoryTotal: number;
    memoryAvailable: number;
  }> {
    try {
      const { stdout } = await execAsync(`adb -s ${deviceId} shell cat /proc/meminfo`);

      const totalMatch = stdout.match(/MemTotal:\s*(\d+)/);
      const availMatch = stdout.match(/MemAvailable:\s*(\d+)/);

      // kB to MB
      const total = totalMatch ? Math.round(parseInt(totalMatch[1]) / 1024) : 0;
      const available = availMatch ? Math.round(parseInt(availMatch[1]) / 1024) : 0;

      return {
        memoryTotal: total,
        memoryAvailable: available,
      };
    } catch {
      return { memoryTotal: 0, memoryAvailable: 0 };
    }
  }

  /**
   * 스토리지 정보 조회
   */
  private async getStorageInfo(deviceId: string): Promise<{
    storageTotal: number;
    storageAvailable: number;
  }> {
    try {
      const { stdout } = await execAsync(`adb -s ${deviceId} shell df /data`);
      const lines = stdout.trim().split('\n');

      if (lines.length >= 2) {
        // 두 번째 줄에서 용량 정보 추출
        const parts = lines[1].split(/\s+/);
        if (parts.length >= 4) {
          // 단위가 K, M, G일 수 있음
          const parseSize = (str: string): number => {
            const num = parseFloat(str);
            if (str.endsWith('G')) return num;
            if (str.endsWith('M')) return num / 1024;
            if (str.endsWith('K')) return num / (1024 * 1024);
            return num / (1024 * 1024 * 1024); // bytes
          };

          return {
            storageTotal: Math.round(parseSize(parts[1]) * 10) / 10,
            storageAvailable: Math.round(parseSize(parts[3]) * 10) / 10,
          };
        }
      }
      return { storageTotal: 0, storageAvailable: 0 };
    } catch {
      return { storageTotal: 0, storageAvailable: 0 };
    }
  }

  /**
   * 모든 디바이스의 상세 정보 조회
   */
  async getAllDevicesDetailedInfo(): Promise<DeviceDetailedInfo[]> {
    const devices = await this.scanDevices();
    const detailedInfos: DeviceDetailedInfo[] = [];

    for (const device of devices) {
      if (device.status === 'connected') {
        const detailed = await this.getDeviceDetailedInfo(device.id);
        if (detailed) {
          detailedInfos.push(detailed);
        }
      } else {
        // 연결되지 않은 디바이스는 기본 정보만
        detailedInfos.push({
          ...device,
          brand: 'Unknown',
          manufacturer: 'Unknown',
          screenResolution: 'Unknown',
          screenDensity: 0,
          cpuModel: 'Unknown',
          cpuAbi: 'Unknown',
          sdkVersion: 0,
          buildNumber: 'Unknown',
          batteryLevel: 0,
          batteryStatus: 'unknown',
          memoryTotal: 0,
          memoryAvailable: 0,
          storageTotal: 0,
          storageAvailable: 0,
        });
      }
    }

    return detailedInfos;
  }
}

export const deviceManager = new DeviceManager();