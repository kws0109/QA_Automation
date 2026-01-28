// backend/src/services/execution/ExecutionMediaManager.ts
// 실행 중 미디어(스크린샷, 비디오) 관리

import type { ScreenshotInfo, VideoInfo } from '../../types';
import type { ExecutionState } from './types';
import { testReportService } from '../testReportService';
import { screenRecorder } from '../videoAnalyzer';
import { createLogger } from '../../utils/logger';

const logger = createLogger('ExecutionMediaManager');

/**
 * 실행 미디어 관리자
 * 스크린샷 캡처 및 비디오 녹화를 관리합니다.
 */
export class ExecutionMediaManager {
  /**
   * 스크린샷 캡처 및 저장
   */
  async captureAndStoreScreenshot(
    state: ExecutionState,
    deviceId: string,
    scenarioId: string,
    repeatIndex: number,
    nodeId: string,
    type: 'step' | 'final' | 'failed' | 'highlight'
  ): Promise<ScreenshotInfo | null> {
    try {
      const screenshot = await testReportService.captureScreenshot(
        state.reportId,
        deviceId,
        nodeId,
        type
      );

      if (screenshot) {
        // 스크린샷 맵 초기화
        if (!state.deviceScreenshots.has(deviceId)) {
          state.deviceScreenshots.set(deviceId, new Map());
        }
        const deviceMap = state.deviceScreenshots.get(deviceId)!;

        const scenarioKey = `${scenarioId}-${repeatIndex}`;
        if (!deviceMap.has(scenarioKey)) {
          deviceMap.set(scenarioKey, []);
        }
        deviceMap.get(scenarioKey)!.push(screenshot);

        return screenshot;
      }
    } catch (err) {
      logger.error(`[ExecutionMediaManager] 스크린샷 캡처 실패:`, err as Error);
    }

    return null;
  }

  /**
   * 비디오 녹화 시작
   */
  async startVideoRecording(
    state: ExecutionState,
    deviceId: string,
    scenarioId: string,
    repeatIndex: number,
  ): Promise<void> {
    try {
      const scenarioKey = `${scenarioId}-${repeatIndex}`;

      // 시나리오별 비디오 저장을 위한 폴더 구조
      await screenRecorder.startRecording(
        deviceId,
        state.reportId,
        scenarioKey
      );

      logger.info(`[ExecutionMediaManager] 비디오 녹화 시작: ${deviceId} - ${scenarioKey}`);
    } catch (err) {
      logger.error(`[ExecutionMediaManager] 비디오 녹화 시작 실패:`, err as Error);
    }
  }

  /**
   * 비디오 녹화 중지
   */
  async stopVideoRecording(
    state: ExecutionState,
    deviceId: string,
    scenarioId: string,
    repeatIndex: number,
  ): Promise<VideoInfo | null> {
    try {
      const scenarioKey = `${scenarioId}-${repeatIndex}`;
      const videoInfo = await screenRecorder.stopRecording(deviceId);

      if (videoInfo) {
        // 비디오 저장
        if (!state.deviceVideos.has(deviceId)) {
          state.deviceVideos.set(deviceId, new Map());
        }
        state.deviceVideos.get(deviceId)!.set(scenarioKey, videoInfo);

        logger.info(`[ExecutionMediaManager] 비디오 녹화 완료: ${deviceId} - ${scenarioKey}`);
        return videoInfo;
      }
    } catch (err) {
      logger.error(`[ExecutionMediaManager] 비디오 녹화 중지 실패:`, err as Error);
    }

    return null;
  }

  /**
   * 시나리오 스크린샷 조회
   */
  getScenarioScreenshots(
    state: ExecutionState,
    deviceId: string,
    scenarioId: string,
    repeatIndex: number,
  ): ScreenshotInfo[] {
    const deviceMap = state.deviceScreenshots.get(deviceId);
    if (!deviceMap) return [];

    const scenarioKey = `${scenarioId}-${repeatIndex}`;
    return deviceMap.get(scenarioKey) || [];
  }

  /**
   * 시나리오 비디오 조회
   */
  getScenarioVideo(
    state: ExecutionState,
    deviceId: string,
    scenarioId: string,
    repeatIndex: number,
  ): VideoInfo | undefined {
    const deviceMap = state.deviceVideos.get(deviceId);
    if (!deviceMap) return undefined;

    const scenarioKey = `${scenarioId}-${repeatIndex}`;
    return deviceMap.get(scenarioKey);
  }

  /**
   * 디바이스의 모든 스크린샷 조회
   */
  getDeviceScreenshots(
    state: ExecutionState,
    deviceId: string,
  ): Map<string, ScreenshotInfo[]> | undefined {
    return state.deviceScreenshots.get(deviceId);
  }

  /**
   * 디바이스의 모든 비디오 조회
   */
  getDeviceVideos(
    state: ExecutionState,
    deviceId: string,
  ): Map<string, VideoInfo> | undefined {
    return state.deviceVideos.get(deviceId);
  }

  /**
   * 하이라이트 스크린샷 저장 (이미지 매칭 결과)
   */
  storeHighlightScreenshot(
    state: ExecutionState,
    deviceId: string,
    nodeId: string,
    path: string,
  ): void {
    // 현재 진행 중인 시나리오 정보 조회
    const progress = state.deviceProgress.get(deviceId);
    if (!progress) return;

    const scenarioKey = `${progress.currentScenarioId}-${1}`; // repeatIndex는 나중에 추적 필요

    // 스크린샷 맵 초기화
    if (!state.deviceScreenshots.has(deviceId)) {
      state.deviceScreenshots.set(deviceId, new Map());
    }
    const deviceMap = state.deviceScreenshots.get(deviceId)!;

    if (!deviceMap.has(scenarioKey)) {
      deviceMap.set(scenarioKey, []);
    }

    deviceMap.get(scenarioKey)!.push({
      nodeId,
      timestamp: Date.now(),
      path,
      type: 'highlight',
    });
  }
}

// 싱글톤 인스턴스
export const executionMediaManager = new ExecutionMediaManager();
