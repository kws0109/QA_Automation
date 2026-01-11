import { exec } from 'child_process';
import { promisify } from 'util';
import { DeviceInfo, DeviceOS, SavedDevice } from '../types';
import { deviceStorageService } from './deviceStorage';

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
  batteryTemperature: number;  // 섭씨 온도
  cpuTemperature: number;      // 섭씨 온도
  memoryTotal: number;  // MB
  memoryAvailable: number;  // MB
  storageTotal: number;  // GB
  storageAvailable: number;  // GB

  // 저장된 정보 (영구 저장)
  alias?: string;
  firstConnectedAt?: string;
  lastConnectedAt?: string;
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
   * 동적 정보만 조회 (배터리, CPU 온도, 메모리, 스토리지)
   * 정적 정보는 deviceStorage에서 캐시된 값 사용
   */
  private async getDynamicInfo(deviceId: string): Promise<{
    batteryLevel: number;
    batteryStatus: DeviceDetailedInfo['batteryStatus'];
    batteryTemperature: number;
    cpuTemperature: number;
    memoryTotal: number;
    memoryAvailable: number;
    storageTotal: number;
    storageAvailable: number;
  }> {
    const [batteryInfo, cpuTemp, memInfo, storageInfo] = await Promise.all([
      this.getBatteryInfo(deviceId),
      this.getCpuTemperature(deviceId),
      this.getMemoryInfo(deviceId),
      this.getStorageInfo(deviceId),
    ]);

    return {
      ...batteryInfo,
      cpuTemperature: cpuTemp,
      ...memInfo,
      ...storageInfo,
    };
  }

  /**
   * 정적 정보 조회 (최초 연결 시 또는 캐시 없을 때만)
   */
  private async getStaticInfo(deviceId: string, basicInfo: DeviceInfo): Promise<{
    brand: string;
    manufacturer: string;
    screenResolution: string;
    screenDensity: number;
    cpuModel: string;
    cpuAbi: string;
    sdkVersion: number;
    buildNumber: string;
  }> {
    const [
      brand,
      manufacturer,
      screenSize,
      screenDensity,
      cpuModel,
      cpuAbi,
      sdkVersion,
      buildNumber,
    ] = await Promise.all([
      this.getDeviceProp(deviceId, 'ro.product.brand'),
      this.getDeviceProp(deviceId, 'ro.product.manufacturer'),
      this.getScreenSize(deviceId),
      this.getDeviceProp(deviceId, 'ro.sf.lcd_density'),
      this.getCpuModel(deviceId),
      this.getDeviceProp(deviceId, 'ro.product.cpu.abi'),
      this.getDeviceProp(deviceId, 'ro.build.version.sdk'),
      this.getDeviceProp(deviceId, 'ro.build.display.id'),
    ]);

    return {
      brand: brand || 'Unknown',
      manufacturer: manufacturer || 'Unknown',
      screenResolution: screenSize || 'Unknown',
      screenDensity: parseInt(screenDensity) || 0,
      cpuModel: cpuModel || 'Unknown',
      cpuAbi: cpuAbi || 'Unknown',
      sdkVersion: parseInt(sdkVersion) || 0,
      buildNumber: buildNumber || 'Unknown',
    };
  }

  /**
   * 디바이스 상세 정보 조회 (정적 정보 캐싱 + 동적 정보만 ADB 조회)
   */
  async getDeviceDetailedInfo(deviceId: string, basicInfo?: DeviceInfo): Promise<DeviceDetailedInfo | null> {
    // basicInfo가 제공되지 않으면 조회 (하위 호환성)
    const info = basicInfo || await this.getDeviceDetails(deviceId);
    if (!info || info.status !== 'connected') {
      return null;
    }

    try {
      // 1. 저장된 정적 정보 확인
      let savedDevice = await deviceStorageService.getById(deviceId);
      let staticInfo: {
        brand: string;
        manufacturer: string;
        screenResolution: string;
        screenDensity: number;
        cpuModel: string;
        cpuAbi: string;
        sdkVersion: number;
        buildNumber: string;
      };

      if (savedDevice) {
        // 캐시된 정적 정보 사용 (ADB 호출 없음!)
        staticInfo = {
          brand: savedDevice.brand,
          manufacturer: savedDevice.manufacturer,
          screenResolution: savedDevice.screenResolution,
          screenDensity: 0, // 저장 안 됨, 동적으로 조회
          cpuModel: 'Unknown', // 저장 안 됨
          cpuAbi: savedDevice.cpuAbi,
          sdkVersion: savedDevice.sdkVersion,
          buildNumber: 'Unknown', // 저장 안 됨
        };
      } else {
        // 첫 연결: 정적 정보 조회 후 저장
        staticInfo = await this.getStaticInfo(deviceId, info);

        // 저장
        savedDevice = await deviceStorageService.saveDevice({
          id: deviceId,
          brand: staticInfo.brand,
          manufacturer: staticInfo.manufacturer,
          model: info.model,
          androidVersion: info.osVersion,
          sdkVersion: staticInfo.sdkVersion,
          screenResolution: staticInfo.screenResolution,
          cpuAbi: staticInfo.cpuAbi,
        });
      }

      // 2. 동적 정보만 ADB 조회 (4개 명령만)
      const dynamicInfo = await this.getDynamicInfo(deviceId);

      return {
        ...info,
        ...staticInfo,
        ...dynamicInfo,
        alias: savedDevice?.alias,
        firstConnectedAt: savedDevice?.firstConnectedAt,
        lastConnectedAt: savedDevice?.lastConnectedAt,
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
   * 화면 크기 조회 (세로×가로 형식으로 반환)
   * 모바일 기기는 일반적으로 세로가 더 길므로: 큰값(세로) × 작은값(가로)
   */
  private async getScreenSize(deviceId: string): Promise<string> {
    try {
      const { stdout } = await execAsync(`adb -s ${deviceId} shell wm size`);
      const match = stdout.match(/(\d+)x(\d+)/);
      if (match) {
        const val1 = parseInt(match[1]);
        const val2 = parseInt(match[2]);
        // 세로(height)×가로(width) 형식: 큰값×작은값
        const height = Math.max(val1, val2);
        const width = Math.min(val1, val2);
        return `${height}x${width}`;
      }
      return 'Unknown';
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
    batteryTemperature: number;
  }> {
    try {
      const { stdout } = await execAsync(`adb -s ${deviceId} shell dumpsys battery`);

      const levelMatch = stdout.match(/level:\s*(\d+)/);
      const statusMatch = stdout.match(/status:\s*(\d+)/);
      const tempMatch = stdout.match(/temperature:\s*(\d+)/);

      const level = levelMatch ? parseInt(levelMatch[1]) : 0;
      const statusCode = statusMatch ? parseInt(statusMatch[1]) : 0;
      // 온도는 10분의 1도 단위로 반환됨 (예: 250 = 25.0°C)
      const temperature = tempMatch ? parseInt(tempMatch[1]) / 10 : 0;

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
        batteryTemperature: temperature,
      };
    } catch {
      return { batteryLevel: 0, batteryStatus: 'unknown', batteryTemperature: 0 };
    }
  }

  /**
   * CPU 온도 조회
   */
  private async getCpuTemperature(deviceId: string): Promise<number> {
    try {
      // thermal zone에서 CPU 온도 읽기 (cpu로 시작하는 첫 번째 항목)
      const { stdout } = await execAsync(
        `adb -s ${deviceId} shell "for i in /sys/class/thermal/thermal_zone*; do type=$(cat $i/type 2>/dev/null); temp=$(cat $i/temp 2>/dev/null); if echo $type | grep -q '^cpu'; then echo $temp; break; fi; done"`
      );

      const temp = parseInt(stdout.trim());
      if (!isNaN(temp) && temp > 0) {
        // 밀리도 단위 (1/1000 °C) → 섭씨 변환
        return Math.round(temp / 100) / 10;
      }
      return 0;
    } catch {
      return 0;
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
      // df -h 옵션으로 human-readable 형식 시도
      const { stdout } = await execAsync(`adb -s ${deviceId} shell df -h /data`);
      const lines = stdout.trim().split('\n');

      if (lines.length >= 2) {
        // 두 번째 줄에서 용량 정보 추출
        const parts = lines[1].split(/\s+/);
        if (parts.length >= 4) {
          // 단위가 K, M, G일 수 있음
          const parseSize = (str: string): number => {
            const num = parseFloat(str);
            if (str.toUpperCase().endsWith('G')) return num;
            if (str.toUpperCase().endsWith('M')) return num / 1024;
            if (str.toUpperCase().endsWith('K')) return num / (1024 * 1024);
            // 숫자만 있는 경우 1K 블록 단위로 가정
            return num / (1024 * 1024);
          };

          return {
            storageTotal: Math.round(parseSize(parts[1]) * 10) / 10,
            storageAvailable: Math.round(parseSize(parts[3]) * 10) / 10,
          };
        }
      }
      return { storageTotal: 0, storageAvailable: 0 };
    } catch {
      // df -h가 실패하면 기본 df 시도
      try {
        const { stdout } = await execAsync(`adb -s ${deviceId} shell df /data`);
        const lines = stdout.trim().split('\n');

        if (lines.length >= 2) {
          const parts = lines[1].split(/\s+/);
          if (parts.length >= 4) {
            // 기본 df는 1K 블록 단위
            const totalKB = parseInt(parts[1]) || 0;
            const availKB = parseInt(parts[3]) || 0;

            return {
              storageTotal: Math.round(totalKB / (1024 * 1024) * 10) / 10,
              storageAvailable: Math.round(availKB / (1024 * 1024) * 10) / 10,
            };
          }
        }
        return { storageTotal: 0, storageAvailable: 0 };
      } catch {
        return { storageTotal: 0, storageAvailable: 0 };
      }
    }
  }

  /**
   * 모든 디바이스의 상세 정보 조회 (병렬 처리)
   */
  async getAllDevicesDetailedInfo(): Promise<DeviceDetailedInfo[]> {
    // 1. scanDevices()는 한 번만 호출
    const devices = await this.scanDevices();

    // 2. 연결된 디바이스는 병렬로 상세 정보 조회
    const connectedDevices = devices.filter(d => d.status === 'connected');
    const offlineDevices = devices.filter(d => d.status !== 'connected');

    // 병렬 처리: basicInfo를 전달하여 중복 scanDevices() 방지
    const detailedResults = await Promise.allSettled(
      connectedDevices.map(device => this.getDeviceDetailedInfo(device.id, device))
    );

    const detailedInfos: DeviceDetailedInfo[] = [];

    // 성공한 결과만 추가
    for (const result of detailedResults) {
      if (result.status === 'fulfilled' && result.value) {
        detailedInfos.push(result.value);
      }
    }

    // 연결되지 않은 디바이스는 기본 정보만
    for (const device of offlineDevices) {
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
        batteryTemperature: 0,
        cpuTemperature: 0,
        memoryTotal: 0,
        memoryAvailable: 0,
        storageTotal: 0,
        storageAvailable: 0,
      });
    }

    return detailedInfos;
  }

  /**
   * 병합된 디바이스 목록 조회 (ADB + 저장된 디바이스)
   * - 연결된 디바이스: 실시간 정보 + 저장된 alias (이미 getDeviceDetailedInfo에서 처리)
   * - 오프라인 디바이스: 저장된 정보 + status='offline'
   */
  async getMergedDeviceList(): Promise<DeviceDetailedInfo[]> {
    // 1. 연결된 디바이스 상세 정보 조회 (이미 alias, firstConnectedAt 등 포함)
    const connectedDevices = await this.getAllDevicesDetailedInfo();
    const connectedIds = new Set(connectedDevices.map(d => d.id));

    // 2. 저장된 디바이스 로드 (오프라인 디바이스 표시용)
    const savedDevices = await deviceStorageService.getAll();

    // 3. 연결된 디바이스 목록 시작 (이미 저장/병합됨)
    const mergedDevices: DeviceDetailedInfo[] = [...connectedDevices];

    // 4. 오프라인 디바이스 추가 (저장되어 있지만 현재 연결 안 됨)
    for (const saved of savedDevices) {
      if (!connectedIds.has(saved.id)) {
        mergedDevices.push({
          id: saved.id,
          name: saved.model,
          model: saved.model,
          os: 'Android' as DeviceOS,
          osVersion: saved.androidVersion,
          status: 'offline',
          sessionActive: false,
          brand: saved.brand,
          manufacturer: saved.manufacturer,
          screenResolution: saved.screenResolution,
          screenDensity: 0,
          cpuModel: 'Unknown',
          cpuAbi: saved.cpuAbi,
          sdkVersion: saved.sdkVersion,
          buildNumber: 'Unknown',
          batteryLevel: 0,
          batteryStatus: 'unknown',
          batteryTemperature: 0,
          cpuTemperature: 0,
          memoryTotal: 0,
          memoryAvailable: 0,
          storageTotal: 0,
          storageAvailable: 0,
          alias: saved.alias,
          firstConnectedAt: saved.firstConnectedAt,
          lastConnectedAt: saved.lastConnectedAt,
        });
      }
    }

    // 5. 정렬: 연결된 디바이스 먼저, 그 다음 오프라인 (마지막 연결 시간순)
    mergedDevices.sort((a, b) => {
      // 연결 상태 우선
      if (a.status === 'connected' && b.status !== 'connected') return -1;
      if (a.status !== 'connected' && b.status === 'connected') return 1;

      // 같은 상태면 마지막 연결 시간순 (최신 먼저)
      const aTime = a.lastConnectedAt ? new Date(a.lastConnectedAt).getTime() : 0;
      const bTime = b.lastConnectedAt ? new Date(b.lastConnectedAt).getTime() : 0;
      return bTime - aTime;
    });

    return mergedDevices;
  }
}

export const deviceManager = new DeviceManager();