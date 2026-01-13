import { exec } from 'child_process';
import { promisify } from 'util';
import { DeviceInfo, DeviceOS, SavedDevice } from '../types';
import { deviceStorageService, WifiDeviceConfig } from './deviceStorage';

const execAsync = promisify(exec);

// WifiDeviceConfig는 deviceStorage에서 재export
export { WifiDeviceConfig } from './deviceStorage';

// WiFi ADB 연결 결과
export interface WifiConnectionResult {
  success: boolean;
  deviceId?: string;  // 연결된 디바이스 ID (예: 192.168.1.100:5555)
  message: string;
}

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
  // ==================== 보안: 입력 검증 메서드 ====================

  /**
   * IPv4 주소 형식 검증
   * @param ip IP 주소 문자열
   * @returns 유효한 IPv4 주소인지 여부
   */
  private isValidIp(ip: string): boolean {
    if (!ip || typeof ip !== 'string') return false;

    // IPv4 형식 검증 (0-255 범위)
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return ipv4Regex.test(ip);
  }

  /**
   * 포트 번호 검증
   * @param port 포트 번호
   * @returns 유효한 포트 번호인지 여부 (1-65535)
   */
  private isValidPort(port: number): boolean {
    return Number.isInteger(port) && port >= 1 && port <= 65535;
  }

  /**
   * 디바이스 ID 검증 (Command Injection 방지)
   * 허용 문자: 알파벳, 숫자, 하이픈, 콜론, 점, 언더스코어
   * @param deviceId 디바이스 ID
   * @returns 안전한 디바이스 ID인지 여부
   */
  private isValidDeviceId(deviceId: string): boolean {
    if (!deviceId || typeof deviceId !== 'string') return false;

    // 안전한 문자만 허용 (쉘 메타문자 차단)
    const safePattern = /^[a-zA-Z0-9\-\.:_]+$/;
    return safePattern.test(deviceId) && deviceId.length <= 100;
  }

  /**
   * WiFi 디바이스 ID 검증 (IP:PORT 형식)
   * @param deviceId 디바이스 ID
   * @returns 유효한 WiFi 디바이스 ID인지 여부
   */
  private isValidWifiDeviceId(deviceId: string): boolean {
    if (!deviceId || typeof deviceId !== 'string') return false;

    const parts = deviceId.split(':');
    if (parts.length !== 2) return false;

    const [ip, portStr] = parts;
    const port = parseInt(portStr, 10);

    return this.isValidIp(ip) && this.isValidPort(port);
  }

  // ==================== 디바이스 조회 메서드 ====================

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
    // 방어적 검증: deviceId가 유효한 형식인지 확인
    if (!this.isValidDeviceId(deviceId)) {
      console.log(`[DeviceManager] 유효하지 않은 deviceId: ${deviceId}`);
      return null;
    }

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
   * - WiFi/USB 중복 제거: 같은 디바이스가 WiFi와 USB로 동시 연결된 경우 WiFi만 표시
   */
  async getMergedDeviceList(): Promise<DeviceDetailedInfo[]> {
    // 1. 연결된 디바이스 상세 정보 조회 (이미 alias, firstConnectedAt 등 포함)
    const connectedDevices = await this.getAllDevicesDetailedInfo();
    const connectedIds = new Set(connectedDevices.map(d => d.id));

    // 2. WiFi 설정 로드 (USB ↔ WiFi 매핑 정보)
    const wifiConfigs = await deviceStorageService.getAllWifiConfigs();

    // 3. WiFi로 연결된 디바이스의 원본 USB ID 집합 생성
    // WiFi가 연결된 상태이면 해당 USB ID는 목록에서 제외
    const wifiConnectedOriginalIds = new Set<string>();
    for (const config of wifiConfigs) {
      if (config.originalDeviceId && connectedIds.has(config.deviceId)) {
        // WiFi 디바이스가 연결되어 있으면 원본 USB ID 기록
        wifiConnectedOriginalIds.add(config.originalDeviceId);
      }
    }

    // 4. 저장된 디바이스 로드 (오프라인 디바이스 표시용)
    const savedDevices = await deviceStorageService.getAll();

    // 5. 연결된 디바이스 목록 시작 (WiFi와 중복되는 USB 제외)
    const mergedDevices: DeviceDetailedInfo[] = connectedDevices.filter(device => {
      // WiFi 디바이스는 항상 포함
      if (this.isWifiDevice(device.id)) {
        return true;
      }
      // USB 디바이스는 WiFi 연결이 없는 경우만 포함
      if (wifiConnectedOriginalIds.has(device.id)) {
        return false;
      }
      return true;
    });

    // 6. 오프라인 디바이스 추가 (저장되어 있지만 현재 연결 안 됨)
    // WiFi로 연결된 원본 USB 디바이스도 제외
    const finalConnectedIds = new Set(mergedDevices.map(d => d.id));
    for (const saved of savedDevices) {
      if (!finalConnectedIds.has(saved.id) && !wifiConnectedOriginalIds.has(saved.id)) {
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

    // 7. 정렬: 연결된 디바이스 먼저, 그 다음 오프라인 (마지막 연결 시간순)
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

  // ==================== WiFi ADB 관련 메서드 ====================

  /**
   * WiFi 디바이스인지 확인 (IP:포트 형식)
   */
  isWifiDevice(deviceId: string): boolean {
    return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d+$/.test(deviceId);
  }

  /**
   * 디바이스의 WiFi IP 주소 조회
   */
  async getDeviceWifiIp(deviceId: string): Promise<string | null> {
    // 보안: deviceId 검증
    if (!this.isValidDeviceId(deviceId)) {
      console.log(`📶 [WiFi] 유효하지 않은 deviceId: ${deviceId}`);
      return null;
    }

    console.log(`📶 [WiFi] IP 주소 조회 시작: ${deviceId}`);

    // 방법 1: wlan0 인터페이스
    try {
      const { stdout } = await execAsync(
        `adb -s ${deviceId} shell "ip addr show wlan0 2>/dev/null | grep 'inet '"`
      );
      console.log(`📶 [WiFi] wlan0 결과: ${stdout.trim()}`);
      const match = stdout.match(/inet\s+(\d+\.\d+\.\d+\.\d+)/);
      if (match) {
        console.log(`📶 [WiFi] wlan0에서 IP 발견: ${match[1]}`);
        return match[1];
      }
    } catch (e) {
      console.log(`📶 [WiFi] wlan0 조회 실패`);
    }

    // 방법 2: ip route로 기본 게이트웨이의 src 주소
    try {
      const { stdout } = await execAsync(
        `adb -s ${deviceId} shell "ip route 2>/dev/null | grep 'src'"`
      );
      console.log(`📶 [WiFi] ip route 결과: ${stdout.trim()}`);
      const match = stdout.match(/src\s+(\d+\.\d+\.\d+\.\d+)/);
      if (match) {
        console.log(`📶 [WiFi] ip route에서 IP 발견: ${match[1]}`);
        return match[1];
      }
    } catch (e) {
      console.log(`📶 [WiFi] ip route 조회 실패`);
    }

    // 방법 3: ifconfig (구형 디바이스)
    try {
      const { stdout } = await execAsync(
        `adb -s ${deviceId} shell "ifconfig wlan0 2>/dev/null"`
      );
      console.log(`📶 [WiFi] ifconfig 결과: ${stdout.trim()}`);
      const match = stdout.match(/inet addr:(\d+\.\d+\.\d+\.\d+)/);
      if (match) {
        console.log(`📶 [WiFi] ifconfig에서 IP 발견: ${match[1]}`);
        return match[1];
      }
    } catch (e) {
      console.log(`📶 [WiFi] ifconfig 조회 실패`);
    }

    // 방법 4: getprop (WiFi IP를 시스템 속성에서 조회)
    try {
      const { stdout } = await execAsync(
        `adb -s ${deviceId} shell "getprop dhcp.wlan0.ipaddress 2>/dev/null"`
      );
      const ip = stdout.trim();
      console.log(`📶 [WiFi] getprop dhcp.wlan0 결과: ${ip}`);
      if (ip && /^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
        console.log(`📶 [WiFi] getprop에서 IP 발견: ${ip}`);
        return ip;
      }
    } catch (e) {
      console.log(`📶 [WiFi] getprop dhcp 조회 실패`);
    }

    // 방법 5: WiFi 관련 모든 인터페이스 검색
    try {
      const { stdout } = await execAsync(
        `adb -s ${deviceId} shell "ip addr 2>/dev/null"`
      );
      console.log(`📶 [WiFi] ip addr 전체 결과 (첫 500자): ${stdout.substring(0, 500)}`);

      // wlan으로 시작하는 모든 인터페이스에서 IP 찾기
      const wlanMatch = stdout.match(/wlan\d+[\s\S]*?inet\s+(\d+\.\d+\.\d+\.\d+)/);
      if (wlanMatch) {
        console.log(`📶 [WiFi] wlan* 인터페이스에서 IP 발견: ${wlanMatch[1]}`);
        return wlanMatch[1];
      }

      // 192.168.x.x 또는 10.x.x.x 패턴의 사설 IP 찾기 (127.0.0.1 제외)
      const privateIpMatch = stdout.match(/inet\s+((?:192\.168\.|10\.|172\.(?:1[6-9]|2\d|3[01])\.)\d+\.\d+)/);
      if (privateIpMatch) {
        console.log(`📶 [WiFi] 사설 IP 발견: ${privateIpMatch[1]}`);
        return privateIpMatch[1];
      }
    } catch (e) {
      console.log(`📶 [WiFi] ip addr 전체 조회 실패`);
    }

    console.log(`📶 [WiFi] 모든 방법으로 IP 조회 실패`);
    return null;
  }

  /**
   * 디바이스의 MAC 주소 조회
   */
  async getDeviceMacAddress(deviceId: string): Promise<string | null> {
    // 방어적 검증: deviceId가 유효한 형식인지 확인
    if (!this.isValidDeviceId(deviceId)) {
      console.log(`[DeviceManager] 유효하지 않은 deviceId: ${deviceId}`);
      return null;
    }

    try {
      const { stdout } = await execAsync(
        `adb -s ${deviceId} shell cat /sys/class/net/wlan0/address`
      );
      return stdout.trim() || null;
    } catch {
      return null;
    }
  }

  /**
   * USB 연결된 디바이스를 tcpip 모드로 전환
   * @param deviceId USB 디바이스 ID
   * @param port tcpip 포트 (기본: 5555)
   */
  async enableTcpipMode(deviceId: string, port: number = 5555): Promise<WifiConnectionResult> {
    try {
      console.log(`📶 [WiFi] tcpip 모드 활성화 시도: ${deviceId}, 포트: ${port}`);

      // 보안: 입력 검증
      if (!this.isValidDeviceId(deviceId)) {
        console.log(`📶 [WiFi] 유효하지 않은 deviceId: ${deviceId}`);
        return {
          success: false,
          message: '유효하지 않은 디바이스 ID입니다. 특수문자를 포함할 수 없습니다.',
        };
      }

      if (!this.isValidPort(port)) {
        console.log(`📶 [WiFi] 유효하지 않은 포트: ${port}`);
        return {
          success: false,
          message: '포트는 1-65535 범위의 정수여야 합니다.',
        };
      }

      // 이미 WiFi 디바이스인 경우
      if (this.isWifiDevice(deviceId)) {
        console.log(`📶 [WiFi] 이미 WiFi 디바이스: ${deviceId}`);
        return {
          success: false,
          message: '이미 WiFi로 연결된 디바이스입니다.',
        };
      }

      // 에뮬레이터 체크
      if (deviceId.startsWith('emulator-')) {
        console.log(`📶 [WiFi] 에뮬레이터는 WiFi 전환 불가: ${deviceId}`);
        return {
          success: false,
          message: '에뮬레이터는 WiFi ADB로 전환할 수 없습니다. 실제 디바이스만 가능합니다.',
        };
      }

      // IP 주소 먼저 조회 (WiFi 연결 확인)
      const ip = await this.getDeviceWifiIp(deviceId);
      console.log(`📶 [WiFi] 디바이스 IP 조회 결과: ${ip || '없음'}`);

      if (!ip) {
        return {
          success: false,
          message: 'WiFi IP 주소를 찾을 수 없습니다. 디바이스가 WiFi에 연결되어 있는지 확인하세요.',
        };
      }

      // tcpip 모드 활성화
      console.log(`📶 [WiFi] tcpip 명령 실행: adb -s ${deviceId} tcpip ${port}`);
      const { stdout, stderr } = await execAsync(`adb -s ${deviceId} tcpip ${port}`);
      console.log(`📶 [WiFi] tcpip 결과 - stdout: ${stdout}, stderr: ${stderr}`);

      if (stderr && stderr.includes('error')) {
        return {
          success: false,
          message: `tcpip 모드 활성화 실패: ${stderr}`,
        };
      }

      // tcpip 모드 전환 대기
      await this._delay(2000);

      return {
        success: true,
        deviceId: `${ip}:${port}`,
        message: `tcpip 모드 활성화 완료. WiFi 연결 가능: ${ip}:${port}`,
      };
    } catch (error) {
      const err = error as Error;
      console.error(`📶 [WiFi] tcpip 모드 활성화 오류:`, err);
      return {
        success: false,
        message: `tcpip 모드 활성화 실패: ${err.message}`,
      };
    }
  }

  /**
   * WiFi ADB로 디바이스 연결
   * @param ip 디바이스 IP 주소
   * @param port tcpip 포트 (기본: 5555)
   */
  async connectWifiDevice(ip: string, port: number = 5555, originalDeviceId?: string): Promise<WifiConnectionResult> {
    try {
      // 보안: 입력 검증
      if (!this.isValidIp(ip)) {
        console.log(`📶 [WiFi] 유효하지 않은 IP 주소: ${ip}`);
        return {
          success: false,
          message: '유효하지 않은 IP 주소 형식입니다. (예: 192.168.1.100)',
        };
      }

      if (!this.isValidPort(port)) {
        console.log(`📶 [WiFi] 유효하지 않은 포트: ${port}`);
        return {
          success: false,
          message: '포트는 1-65535 범위의 정수여야 합니다.',
        };
      }

      if (originalDeviceId && !this.isValidDeviceId(originalDeviceId)) {
        console.log(`📶 [WiFi] 유효하지 않은 원본 deviceId: ${originalDeviceId}`);
        return {
          success: false,
          message: '유효하지 않은 원본 디바이스 ID입니다.',
        };
      }

      const deviceId = `${ip}:${port}`;
      console.log(`📶 [WiFi] WiFi 연결 시도: ${deviceId}${originalDeviceId ? ` (원본: ${originalDeviceId})` : ''}`);

      // 이미 연결되어 있는지 확인
      const devices = await this.scanDevices();
      const existing = devices.find(d => d.id === deviceId);
      if (existing && existing.status === 'connected') {
        console.log(`📶 [WiFi] 이미 연결됨: ${deviceId}`);
        return {
          success: true,
          deviceId,
          message: '이미 연결되어 있습니다.',
        };
      }

      // 연결 시도
      console.log(`📶 [WiFi] adb connect 명령 실행: adb connect ${deviceId}`);
      const { stdout, stderr } = await execAsync(`adb connect ${deviceId}`);
      console.log(`📶 [WiFi] adb connect 결과 - stdout: ${stdout}, stderr: ${stderr}`);

      if (stdout.includes('connected') || stdout.includes('already connected')) {
        // WiFi 디바이스 설정 저장 (원본 USB ID 포함)
        await deviceStorageService.saveWifiConfig({
          ip,
          port,
          deviceId: deviceId,
          originalDeviceId: originalDeviceId,  // USB 전환 시 원본 ID 저장
          lastConnected: new Date().toISOString(),
          autoReconnect: true,
        });

        console.log(`📶 [WiFi] 연결 성공: ${deviceId}`);
        return {
          success: true,
          deviceId,
          message: `WiFi ADB 연결 성공: ${deviceId}`,
        };
      }

      // 연결 실패 원인 분석
      let failReason = stdout || stderr;
      if (stdout.includes('failed to connect') || stdout.includes('unable to connect')) {
        failReason = `연결 실패: ${deviceId}에 연결할 수 없습니다. PC와 디바이스가 같은 WiFi 네트워크에 있는지 확인하세요.`;
      } else if (stdout.includes('connection refused')) {
        failReason = `연결 거부됨: 디바이스에서 tcpip 모드가 활성화되지 않았거나, 방화벽이 차단하고 있습니다.`;
      }

      console.log(`📶 [WiFi] 연결 실패: ${failReason}`);
      return {
        success: false,
        message: failReason,
      };
    } catch (error) {
      const err = error as Error;
      console.error(`📶 [WiFi] 연결 오류:`, err);
      return {
        success: false,
        message: `연결 실패: ${err.message}`,
      };
    }
  }

  /**
   * WiFi ADB 연결 해제
   * @param deviceId 디바이스 ID (IP:포트 형식)
   */
  async disconnectWifiDevice(deviceId: string): Promise<WifiConnectionResult> {
    try {
      // 보안: WiFi 디바이스 ID 형식 검증
      if (!this.isValidWifiDeviceId(deviceId)) {
        console.log(`📶 [WiFi] 유효하지 않은 WiFi deviceId: ${deviceId}`);
        return {
          success: false,
          message: '유효하지 않은 WiFi 디바이스 ID입니다. (예: 192.168.1.100:5555)',
        };
      }

      if (!this.isWifiDevice(deviceId)) {
        return {
          success: false,
          message: 'WiFi 디바이스가 아닙니다.',
        };
      }

      const { stdout } = await execAsync(`adb disconnect ${deviceId}`);

      if (stdout.includes('disconnected')) {
        return {
          success: true,
          deviceId,
          message: `연결 해제 완료: ${deviceId}`,
        };
      }

      return {
        success: true,
        deviceId,
        message: stdout.trim(),
      };
    } catch (error) {
      const err = error as Error;
      return {
        success: false,
        message: `연결 해제 실패: ${err.message}`,
      };
    }
  }

  /**
   * USB 디바이스를 WiFi ADB로 전환 (tcpip 활성화 + 연결)
   * @param usbDeviceId USB 디바이스 ID
   * @param port tcpip 포트 (기본: 5555)
   */
  async switchToWifi(usbDeviceId: string, port: number = 5555): Promise<WifiConnectionResult> {
    console.log(`📶 [WiFi] USB → WiFi 전환 시작: ${usbDeviceId}`);

    // 1. tcpip 모드 활성화
    const tcpipResult = await this.enableTcpipMode(usbDeviceId, port);
    if (!tcpipResult.success) {
      console.log(`📶 [WiFi] tcpip 모드 활성화 실패:`, tcpipResult.message);
      return tcpipResult;
    }

    // 2. IP 주소 추출
    const ip = tcpipResult.deviceId?.split(':')[0];
    if (!ip) {
      console.log(`📶 [WiFi] IP 주소 추출 실패`);
      return {
        success: false,
        message: 'IP 주소를 추출할 수 없습니다.',
      };
    }

    // 3. WiFi로 연결
    console.log(`📶 [WiFi] WiFi 연결 시도 전 2초 대기...`);
    await this._delay(2000); // 모드 전환 대기 (늘림)
    const connectResult = await this.connectWifiDevice(ip, port, usbDeviceId);

    if (connectResult.success) {
      console.log(`📶 [WiFi] USB → WiFi 전환 성공: ${connectResult.deviceId}`);
    } else {
      console.log(`📶 [WiFi] WiFi 연결 실패:`, connectResult.message);
    }

    return connectResult;
  }

  /**
   * 저장된 모든 WiFi 디바이스 재연결
   */
  async reconnectAllWifiDevices(): Promise<{
    total: number;
    success: number;
    failed: number;
    results: WifiConnectionResult[];
  }> {
    const wifiConfigs = await deviceStorageService.getAllWifiConfigs();
    const results: WifiConnectionResult[] = [];
    let success = 0;
    let failed = 0;

    for (const config of wifiConfigs) {
      if (!config.autoReconnect) continue;

      const result = await this.connectWifiDevice(config.ip, config.port);
      results.push(result);

      if (result.success) {
        success++;
      } else {
        failed++;
      }
    }

    return {
      total: wifiConfigs.length,
      success,
      failed,
      results,
    };
  }

  /**
   * WiFi 디바이스 목록 조회 (연결된 것만)
   */
  async getConnectedWifiDevices(): Promise<DeviceInfo[]> {
    const devices = await this.scanDevices();
    return devices.filter(d => this.isWifiDevice(d.id));
  }

  /**
   * 저장된 WiFi 디바이스 설정 목록 조회
   */
  async getSavedWifiConfigs(): Promise<WifiDeviceConfig[]> {
    return deviceStorageService.getAllWifiConfigs();
  }

  /**
   * WiFi 디바이스 설정 삭제
   */
  async deleteWifiConfig(ip: string, port: number): Promise<boolean> {
    return deviceStorageService.deleteWifiConfig(ip, port);
  }

  /**
   * 지연 대기 (내부용)
   */
  private _delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const deviceManager = new DeviceManager();