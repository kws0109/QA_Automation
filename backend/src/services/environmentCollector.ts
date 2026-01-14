// backend/src/services/environmentCollector.ts
// 디바이스 환경 정보 및 앱 정보 수집 서비스

import { exec } from 'child_process';
import { promisify } from 'util';
import { Browser } from 'webdriverio';
import { DeviceEnvironment, AppInfo, DeviceLogs } from '../types/reportEnhanced';

const execAsync = promisify(exec);

/**
 * 환경 정보 수집 서비스
 * ADB 및 Appium을 통해 디바이스/앱 정보 수집
 */
class EnvironmentCollectorService {
  /**
   * 디바이스 환경 정보 수집
   */
  async collectDeviceEnvironment(deviceId: string): Promise<DeviceEnvironment> {
    const [
      basicInfo,
      batteryInfo,
      memoryInfo,
      storageInfo,
      networkInfo,
    ] = await Promise.all([
      this._getBasicInfo(deviceId),
      this._getBatteryInfo(deviceId),
      this._getMemoryInfo(deviceId),
      this._getStorageInfo(deviceId),
      this._getNetworkInfo(deviceId),
    ]);

    return {
      // 기본값 설정
      brand: 'Unknown',
      model: 'Unknown',
      manufacturer: 'Unknown',
      androidVersion: 'Unknown',
      sdkVersion: 0,
      screenResolution: 'Unknown',
      screenDensity: 0,
      cpuAbi: 'Unknown',
      totalMemory: 0,
      availableMemory: 0,
      totalStorage: 0,
      availableStorage: 0,
      batteryLevel: 0,
      batteryStatus: 'unknown',
      batteryTemperature: 0,
      networkType: 'unknown' as const,
      // 수집된 정보로 덮어쓰기
      ...basicInfo,
      ...batteryInfo,
      ...memoryInfo,
      ...storageInfo,
      ...networkInfo,
    };
  }

  /**
   * 앱 정보 수집 (Appium 드라이버 사용)
   */
  async collectAppInfo(
    driver: Browser,
    packageName: string,
    deviceId: string
  ): Promise<AppInfo> {
    const appInfo: AppInfo = {
      packageName,
    };

    try {
      // dumpsys package를 통해 앱 정보 조회 (Windows 호환: shell 내부에서 grep 실행)
      const { stdout } = await execAsync(
        `adb -s ${deviceId} shell "dumpsys package ${packageName} | grep -E 'versionName|versionCode|targetSdk|minSdk|firstInstallTime|lastUpdateTime'"`
      );

      const lines = stdout.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.includes('versionName=')) {
          appInfo.versionName = trimmed.split('versionName=')[1]?.trim();
        } else if (trimmed.includes('versionCode=')) {
          const match = trimmed.match(/versionCode=(\d+)/);
          if (match) appInfo.versionCode = parseInt(match[1], 10);
        } else if (trimmed.includes('targetSdk=')) {
          const match = trimmed.match(/targetSdk=(\d+)/);
          if (match) appInfo.targetSdk = parseInt(match[1], 10);
        } else if (trimmed.includes('minSdk=')) {
          const match = trimmed.match(/minSdk=(\d+)/);
          if (match) appInfo.minSdk = parseInt(match[1], 10);
        } else if (trimmed.includes('firstInstallTime=')) {
          appInfo.installedAt = trimmed.split('firstInstallTime=')[1]?.trim();
        } else if (trimmed.includes('lastUpdateTime=')) {
          appInfo.lastUpdatedAt = trimmed.split('lastUpdateTime=')[1]?.trim();
        }
      }

      // 앱 이름 가져오기
      try {
        const { stdout: labelOutput } = await execAsync(
          `adb -s ${deviceId} shell "pm dump ${packageName} | grep -A 1 'labelRes'"`
        );
        const labelMatch = labelOutput.match(/label=([^\n]+)/);
        if (labelMatch) {
          appInfo.appName = labelMatch[1].trim().replace(/"/g, '');
        }
      } catch {
        // 앱 이름 가져오기 실패 시 무시
      }

      // APK 서명 해시 (선택적)
      try {
        const { stdout: sigOutput } = await execAsync(
          `adb -s ${deviceId} shell "pm dump ${packageName} | grep -A 1 'signatures'"`
        );
        const sigMatch = sigOutput.match(/([a-fA-F0-9]{32,})/);
        if (sigMatch) {
          appInfo.signatureHash = sigMatch[1];
        }
      } catch {
        // 서명 정보 가져오기 실패 시 무시
      }
    } catch (error) {
      console.error(`[EnvironmentCollector] 앱 정보 수집 실패 (${packageName}):`, error);
    }

    return appInfo;
  }

  /**
   * Logcat 캡처
   */
  async captureLogcat(
    deviceId: string,
    packageName: string,
    startTime: Date,
    endTime: Date,
    logLevel: 'verbose' | 'debug' | 'info' | 'warn' | 'error' = 'info'
  ): Promise<DeviceLogs> {
    const levelMap: Record<string, string> = {
      verbose: 'V',
      debug: 'D',
      info: 'I',
      warn: 'W',
      error: 'E',
    };

    const levelFlag = levelMap[logLevel] || 'I';
    let logcat = '';
    let crashLogs = '';

    try {
      // 앱 패키지 기준으로 logcat 필터링
      // -d: dump and exit, -v time: 시간 포맷
      const { stdout } = await execAsync(
        `adb -s ${deviceId} shell "logcat -d -v time *:${levelFlag} | grep -E '${packageName}|AndroidRuntime|FATAL'"`,
        { maxBuffer: 10 * 1024 * 1024 } // 10MB 버퍼
      );

      // 시간 범위 필터링
      const lines = stdout.split('\n');
      const filteredLines: string[] = [];
      const crashLines: string[] = [];

      for (const line of lines) {
        // 시간 파싱 (mm-dd HH:mm:ss.SSS 형식)
        const timeMatch = line.match(/^(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3})/);
        if (timeMatch) {
          // 대략적인 시간 필터링 (정확한 연도 없음)
          filteredLines.push(line);

          // 크래시/에러 로그 분리
          if (
            line.includes('FATAL') ||
            line.includes('AndroidRuntime') ||
            line.includes('Exception') ||
            line.includes('Error')
          ) {
            crashLines.push(line);
          }
        }
      }

      logcat = filteredLines.join('\n');
      crashLogs = crashLines.join('\n');
    } catch (error) {
      console.error(`[EnvironmentCollector] Logcat 캡처 실패:`, error);
    }

    // ANR 트레이스 수집 (별도)
    let anrTraces = '';
    try {
      const { stdout: anrOutput } = await execAsync(
        `adb -s ${deviceId} shell "cat /data/anr/traces.txt 2>/dev/null | head -500"`,
        { maxBuffer: 5 * 1024 * 1024 }
      );
      if (anrOutput.includes(packageName)) {
        anrTraces = anrOutput;
      }
    } catch {
      // ANR 트레이스 없으면 무시
    }

    return {
      logcat: logcat.substring(0, 500000), // 최대 500KB
      capturedAt: new Date().toISOString(),
      captureStartTime: startTime.toISOString(),
      captureEndTime: endTime.toISOString(),
      logLevel,
      packageFilter: packageName,
      crashLogs: crashLogs || undefined,
      anrTraces: anrTraces || undefined,
    };
  }

  /**
   * 기본 디바이스 정보
   */
  private async _getBasicInfo(deviceId: string): Promise<Partial<DeviceEnvironment>> {
    try {
      const commands = {
        brand: `adb -s ${deviceId} shell getprop ro.product.brand`,
        model: `adb -s ${deviceId} shell getprop ro.product.model`,
        manufacturer: `adb -s ${deviceId} shell getprop ro.product.manufacturer`,
        androidVersion: `adb -s ${deviceId} shell getprop ro.build.version.release`,
        sdkVersion: `adb -s ${deviceId} shell getprop ro.build.version.sdk`,
        screenResolution: `adb -s ${deviceId} shell wm size`,
        screenDensity: `adb -s ${deviceId} shell wm density`,
        cpuAbi: `adb -s ${deviceId} shell getprop ro.product.cpu.abi`,
      };

      const results = await Promise.all(
        Object.entries(commands).map(async ([key, cmd]) => {
          try {
            const { stdout } = await execAsync(cmd);
            return [key, stdout.trim()];
          } catch {
            return [key, ''];
          }
        })
      );

      const info: Record<string, string> = Object.fromEntries(results);

      // 해상도 파싱 (Physical size: 1080x1920)
      const resMatch = info.screenResolution.match(/(\d+x\d+)/);
      const densityMatch = info.screenDensity.match(/(\d+)/);

      return {
        brand: info.brand || 'Unknown',
        model: info.model || 'Unknown',
        manufacturer: info.manufacturer || 'Unknown',
        androidVersion: info.androidVersion || 'Unknown',
        sdkVersion: parseInt(info.sdkVersion, 10) || 0,
        screenResolution: resMatch ? resMatch[1] : 'Unknown',
        screenDensity: densityMatch ? parseInt(densityMatch[1], 10) : 0,
        cpuAbi: info.cpuAbi || 'Unknown',
      };
    } catch (error) {
      console.error(`[EnvironmentCollector] 기본 정보 수집 실패:`, error);
      return {
        brand: 'Unknown',
        model: 'Unknown',
        manufacturer: 'Unknown',
        androidVersion: 'Unknown',
        sdkVersion: 0,
        screenResolution: 'Unknown',
        screenDensity: 0,
        cpuAbi: 'Unknown',
      };
    }
  }

  /**
   * 배터리 정보
   */
  private async _getBatteryInfo(deviceId: string): Promise<Partial<DeviceEnvironment>> {
    try {
      const { stdout } = await execAsync(
        `adb -s ${deviceId} shell dumpsys battery`
      );

      let level = 0;
      let status = 'unknown';
      let temperature = 0;

      const lines = stdout.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('level:')) {
          level = parseInt(trimmed.split(':')[1].trim(), 10);
        } else if (trimmed.startsWith('status:')) {
          const statusCode = parseInt(trimmed.split(':')[1].trim(), 10);
          const statusMap: Record<number, string> = {
            1: 'unknown',
            2: 'charging',
            3: 'discharging',
            4: 'not_charging',
            5: 'full',
          };
          status = statusMap[statusCode] || 'unknown';
        } else if (trimmed.startsWith('temperature:')) {
          temperature = parseInt(trimmed.split(':')[1].trim(), 10) / 10;
        }
      }

      return {
        batteryLevel: level,
        batteryStatus: status,
        batteryTemperature: temperature,
      };
    } catch (error) {
      console.error(`[EnvironmentCollector] 배터리 정보 수집 실패:`, error);
      return {
        batteryLevel: 0,
        batteryStatus: 'unknown',
        batteryTemperature: 0,
      };
    }
  }

  /**
   * 메모리 정보
   */
  private async _getMemoryInfo(deviceId: string): Promise<Partial<DeviceEnvironment>> {
    try {
      const { stdout } = await execAsync(
        `adb -s ${deviceId} shell cat /proc/meminfo`
      );

      let totalMemory = 0;
      let availableMemory = 0;

      const lines = stdout.split('\n');
      for (const line of lines) {
        if (line.startsWith('MemTotal:')) {
          const match = line.match(/(\d+)/);
          if (match) totalMemory = parseInt(match[1], 10) / 1024; // KB -> MB
        } else if (line.startsWith('MemAvailable:')) {
          const match = line.match(/(\d+)/);
          if (match) availableMemory = parseInt(match[1], 10) / 1024;
        }
      }

      return {
        totalMemory: Math.round(totalMemory),
        availableMemory: Math.round(availableMemory),
      };
    } catch (error) {
      console.error(`[EnvironmentCollector] 메모리 정보 수집 실패:`, error);
      return {
        totalMemory: 0,
        availableMemory: 0,
      };
    }
  }

  /**
   * 스토리지 정보
   */
  private async _getStorageInfo(deviceId: string): Promise<Partial<DeviceEnvironment>> {
    try {
      const { stdout } = await execAsync(
        `adb -s ${deviceId} shell df /data`
      );

      let totalStorage = 0;
      let availableStorage = 0;

      const lines = stdout.split('\n');
      for (const line of lines) {
        if (line.includes('/data')) {
          const parts = line.split(/\s+/);
          // df 출력: Filesystem 1K-blocks Used Available Use% Mounted
          if (parts.length >= 4) {
            totalStorage = parseInt(parts[1], 10) / (1024 * 1024); // KB -> GB
            availableStorage = parseInt(parts[3], 10) / (1024 * 1024);
          }
        }
      }

      return {
        totalStorage: Math.round(totalStorage * 10) / 10,
        availableStorage: Math.round(availableStorage * 10) / 10,
      };
    } catch (error) {
      console.error(`[EnvironmentCollector] 스토리지 정보 수집 실패:`, error);
      return {
        totalStorage: 0,
        availableStorage: 0,
      };
    }
  }

  /**
   * 네트워크 정보
   */
  private async _getNetworkInfo(deviceId: string): Promise<Partial<DeviceEnvironment>> {
    try {
      // WiFi 상태 확인 (Windows 호환: shell 내부에서 grep 실행)
      const { stdout: wifiOutput } = await execAsync(
        `adb -s ${deviceId} shell "dumpsys wifi | grep 'mWifiInfo'"`
      );

      let networkType: DeviceEnvironment['networkType'] = 'unknown';
      let wifiSsid: string | undefined;
      let ipAddress: string | undefined;
      let networkStrength: number | undefined;

      if (wifiOutput.includes('SSID:')) {
        networkType = 'wifi';
        const ssidMatch = wifiOutput.match(/SSID:\s*([^,]+)/);
        if (ssidMatch) wifiSsid = ssidMatch[1].trim().replace(/"/g, '');

        const rssiMatch = wifiOutput.match(/RSSI:\s*(-?\d+)/);
        if (rssiMatch) {
          const rssi = parseInt(rssiMatch[1], 10);
          // RSSI를 신호 강도로 변환 (0-4)
          if (rssi >= -50) networkStrength = 4;
          else if (rssi >= -60) networkStrength = 3;
          else if (rssi >= -70) networkStrength = 2;
          else if (rssi >= -80) networkStrength = 1;
          else networkStrength = 0;
        }
      }

      // IP 주소 가져오기 (Windows 호환: shell 내부에서 grep 실행)
      try {
        const { stdout: ipOutput } = await execAsync(
          `adb -s ${deviceId} shell "ip addr show wlan0 | grep 'inet '"`
        );
        const ipMatch = ipOutput.match(/inet\s+(\d+\.\d+\.\d+\.\d+)/);
        if (ipMatch) ipAddress = ipMatch[1];
      } catch {
        // WiFi IP 없으면 모바일 데이터 확인
        try {
          const { stdout: mobileOutput } = await execAsync(
            `adb -s ${deviceId} shell "ip addr show rmnet0 | grep 'inet '"`
          );
          const ipMatch = mobileOutput.match(/inet\s+(\d+\.\d+\.\d+\.\d+)/);
          if (ipMatch) {
            ipAddress = ipMatch[1];
            networkType = 'mobile';
          }
        } catch {
          // 네트워크 연결 없음
          if (networkType === 'unknown') networkType = 'none';
        }
      }

      return {
        networkType,
        wifiSsid,
        ipAddress,
        networkStrength,
      };
    } catch (error) {
      console.error(`[EnvironmentCollector] 네트워크 정보 수집 실패:`, error);
      return {
        networkType: 'unknown',
      };
    }
  }

  /**
   * 현재 Activity 가져오기
   */
  async getCurrentActivity(deviceId: string): Promise<string | undefined> {
    try {
      // Windows 호환: shell 내부에서 grep 실행
      const { stdout } = await execAsync(
        `adb -s ${deviceId} shell "dumpsys activity activities | grep 'mResumedActivity'"`
      );
      const match = stdout.match(/u0\s+([^\s}]+)/);
      return match ? match[1] : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * 앱 실행 상태 확인
   */
  async getAppState(
    deviceId: string,
    packageName: string
  ): Promise<'foreground' | 'background' | 'not_running' | 'crashed'> {
    try {
      // 앱이 실행 중인지 확인
      const { stdout: psOutput } = await execAsync(
        `adb -s ${deviceId} shell pidof ${packageName}`
      );

      if (!psOutput.trim()) {
        return 'not_running';
      }

      // 포그라운드인지 확인 (Windows 호환: shell 내부에서 grep 실행)
      const { stdout: activityOutput } = await execAsync(
        `adb -s ${deviceId} shell "dumpsys activity activities | grep 'mResumedActivity'"`
      );

      if (activityOutput.includes(packageName)) {
        return 'foreground';
      }

      return 'background';
    } catch (error) {
      // 에러 발생 시 (크래시 등)
      return 'not_running';
    }
  }
}

export const environmentCollector = new EnvironmentCollectorService();
