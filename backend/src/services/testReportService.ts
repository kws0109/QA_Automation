// backend/src/services/testReportService.ts
// 통합 테스트 리포트 서비스 (다중 시나리오 지원)

import fs from 'fs/promises';
import path from 'path';
import {
  TestReport,
  TestReportListItem,
  TestReportStats,
  TestExecutionInfo,
  ScenarioReportResult,
  DeviceScenarioResult,
  ScreenshotInfo,
  VideoInfo,
} from '../types';
import { sessionManager } from './sessionManager';
import { deviceManager } from './deviceManager';

const REPORTS_DIR = path.join(__dirname, '../../reports/test');
const SCREENSHOTS_DIR = path.join(__dirname, '../../reports/screenshots');
const VIDEOS_DIR = path.join(__dirname, '../../reports/videos');

/**
 * 통합 테스트 리포트 서비스
 */
class TestReportService {
  /**
   * 디렉토리 확인 및 생성
   */
  private async _ensureDir(dir: string): Promise<void> {
    try {
      await fs.access(dir);
    } catch {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  /**
   * 리포트 파일 경로
   */
  private _getReportPath(id: string): string {
    return path.join(REPORTS_DIR, `${id}.json`);
  }

  /**
   * 스크린샷 디렉토리 경로
   */
  private _getScreenshotDir(reportId: string, deviceId: string): string {
    return path.join(SCREENSHOTS_DIR, reportId, deviceId);
  }

  /**
   * 비디오 디렉토리 경로
   */
  private _getVideoDir(reportId: string): string {
    return path.join(VIDEOS_DIR, reportId);
  }

  /**
   * 리포트 ID 생성 (YYMMDD_HHMM_테스트명 또는 시나리오명)
   */
  private async _generateId(testName?: string, scenarioName?: string): Promise<string> {
    await this._ensureDir(REPORTS_DIR);

    const now = new Date();
    const dateTimeStr =
      now.getFullYear().toString().slice(2) +
      (now.getMonth() + 1).toString().padStart(2, '0') +
      now.getDate().toString().padStart(2, '0') +
      '_' +
      now.getHours().toString().padStart(2, '0') +
      now.getMinutes().toString().padStart(2, '0');

    // 이름 정제
    const name = testName || scenarioName || 'test';
    const safeName = name
      .replace(/[<>:"/\\|?*]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 50);

    const baseId = `${dateTimeStr}_${safeName}`;

    // 중복 확인
    const files = await fs.readdir(REPORTS_DIR);

    if (!files.includes(`${baseId}.json`)) {
      return baseId;
    }

    // 중복 시 순번 추가
    let counter = 2;
    while (files.includes(`${baseId}_${counter}.json`)) {
      counter++;
    }
    return `${baseId}_${counter}`;
  }

  /**
   * 스크린샷 캡처 및 저장
   */
  async captureScreenshot(
    reportId: string,
    deviceId: string,
    nodeId: string,
    type: 'step' | 'final' | 'failed'
  ): Promise<ScreenshotInfo | null> {
    console.log(`[TestReport] 스크린샷 캡처: ${deviceId}/${nodeId}/${type}`);

    try {
      const driver = sessionManager.getDriver(deviceId);
      if (!driver) {
        console.warn(`[TestReport] 스크린샷 캡처 실패: 드라이버 없음 (${deviceId})`);
        return null;
      }

      const screenshot = await driver.takeScreenshot();

      const screenshotDir = this._getScreenshotDir(reportId, deviceId);
      await this._ensureDir(screenshotDir);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${nodeId}_${type}_${timestamp}.png`;
      const filepath = path.join(screenshotDir, filename);

      await fs.writeFile(filepath, screenshot, 'base64');

      const relativePath = `screenshots/${reportId}/${deviceId}/${filename}`;

      return {
        nodeId,
        timestamp: new Date().toISOString(),
        path: relativePath,
        type,
      };
    } catch (err) {
      console.error(`[TestReport] 스크린샷 캡처 오류:`, err);
      return null;
    }
  }

  /**
   * 하이라이트 스크린샷 저장 (이미지 인식 결과)
   */
  async saveHighlightScreenshot(
    reportId: string,
    deviceId: string,
    nodeId: string,
    screenshotBuffer: Buffer,
    templateId: string,
    confidence: number
  ): Promise<ScreenshotInfo | null> {
    try {
      const screenshotDir = this._getScreenshotDir(reportId, deviceId);
      await this._ensureDir(screenshotDir);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${nodeId}_highlight_${timestamp}.png`;
      const filepath = path.join(screenshotDir, filename);

      await fs.writeFile(filepath, screenshotBuffer);

      const relativePath = `screenshots/${reportId}/${deviceId}/${filename}`;

      return {
        nodeId,
        timestamp: new Date().toISOString(),
        path: relativePath,
        type: 'highlight',
        templateId,
        confidence,
      };
    } catch (err) {
      console.error(`[TestReport] 하이라이트 스크린샷 저장 오류:`, err);
      return null;
    }
  }

  /**
   * 비디오 저장
   */
  async saveVideo(
    reportId: string,
    deviceId: string,
    videoBase64: string,
    duration: number
  ): Promise<VideoInfo | null> {
    try {
      const videoDir = this._getVideoDir(reportId);
      await this._ensureDir(videoDir);

      const filename = `${deviceId}.mp4`;
      const filepath = path.join(videoDir, filename);

      const buffer = Buffer.from(videoBase64, 'base64');
      await fs.writeFile(filepath, buffer);

      const stats = await fs.stat(filepath);
      const relativePath = `videos/${reportId}/${filename}`;

      console.log(`[TestReport] 비디오 저장: ${filename} (${(stats.size / 1024 / 1024).toFixed(2)}MB)`);

      return {
        path: relativePath,
        duration,
        size: stats.size,
      };
    } catch (err) {
      console.error(`[TestReport] 비디오 저장 오류:`, err);
      return null;
    }
  }

  /**
   * 통계 계산
   */
  private _calculateStats(scenarioResults: ScenarioReportResult[]): TestReportStats {
    // 디바이스 집계 (중복 제거)
    const deviceMap = new Map<string, { success: boolean; status: string }>();

    for (const scenario of scenarioResults) {
      for (const device of scenario.deviceResults) {
        const existing = deviceMap.get(device.deviceId);
        if (!existing) {
          deviceMap.set(device.deviceId, { success: device.success, status: device.status });
        } else {
          // 하나라도 실패하면 실패로 기록
          if (!device.success && device.status !== 'skipped') {
            deviceMap.set(device.deviceId, { success: false, status: device.status });
          }
        }
      }
    }

    let successDevices = 0;
    let failedDevices = 0;
    let skippedDevices = 0;

    for (const [, info] of deviceMap) {
      if (info.status === 'skipped') {
        skippedDevices++;
      } else if (info.success) {
        successDevices++;
      } else {
        failedDevices++;
      }
    }

    // 시나리오 통계
    let passedScenarios = 0;
    let failedScenarios = 0;
    let partialScenarios = 0;
    let skippedScenarios = 0;
    let totalSteps = 0;
    let passedSteps = 0;
    let failedSteps = 0;
    let totalDuration = 0;
    let scenarioDurationSum = 0;
    let deviceDurationSum = 0;
    let deviceCount = 0;

    for (const scenario of scenarioResults) {
      switch (scenario.status) {
        case 'passed':
          passedScenarios++;
          break;
        case 'failed':
          failedScenarios++;
          break;
        case 'partial':
          partialScenarios++;
          break;
        case 'skipped':
          skippedScenarios++;
          break;
      }

      scenarioDurationSum += scenario.duration;
      if (scenario.duration > totalDuration) {
        totalDuration = scenario.duration;
      }

      for (const device of scenario.deviceResults) {
        if (device.status !== 'skipped') {
          deviceDurationSum += device.duration;
          deviceCount++;

          for (const step of device.steps) {
            totalSteps++;
            if (step.status === 'passed') {
              passedSteps++;
            } else if (step.status === 'failed' || step.status === 'error') {
              failedSteps++;
            }
          }
        }
      }
    }

    return {
      totalDevices: deviceMap.size,
      successDevices,
      failedDevices,
      skippedDevices,
      totalScenarios: scenarioResults.length,
      passedScenarios,
      failedScenarios,
      partialScenarios,
      skippedScenarios,
      totalSteps,
      passedSteps,
      failedSteps,
      totalDuration,
      avgScenarioDuration: scenarioResults.length > 0
        ? Math.round(scenarioDurationSum / scenarioResults.length)
        : 0,
      avgDeviceDuration: deviceCount > 0
        ? Math.round(deviceDurationSum / deviceCount)
        : 0,
    };
  }

  /**
   * 리포트 상태 결정
   */
  private _determineStatus(
    scenarioResults: ScenarioReportResult[],
    forceCompleted?: boolean
  ): 'completed' | 'partial' | 'failed' | 'stopped' {
    if (scenarioResults.length === 0) {
      return 'failed';
    }

    const allPassed = scenarioResults.every(s => s.status === 'passed');
    const allFailed = scenarioResults.every(s => s.status === 'failed' || s.status === 'skipped');
    const hasPartial = scenarioResults.some(s => s.status === 'partial');
    const hasSkipped = scenarioResults.some(s =>
      s.deviceResults.some(d => d.status === 'skipped')
    );

    if (forceCompleted || hasSkipped) {
      return 'partial';
    }

    if (allPassed) {
      return 'completed';
    }

    if (allFailed) {
      return 'failed';
    }

    if (hasPartial) {
      return 'partial';
    }

    return 'partial';
  }

  /**
   * 통합 리포트 생성
   */
  async create(
    executionId: string,
    executionInfo: TestExecutionInfo,
    requestedDeviceIds: string[],
    requestedScenarioIds: string[],
    repeatCount: number,
    scenarioResults: ScenarioReportResult[],
    startedAt: Date,
    completedAt: Date
  ): Promise<TestReport> {
    await this._ensureDir(REPORTS_DIR);

    // 첫 번째 시나리오 이름 또는 테스트 이름 사용
    const firstScenarioName = scenarioResults[0]?.scenarioName;
    const id = await this._generateId(executionInfo.testName, firstScenarioName);
    const now = new Date().toISOString();

    const stats = this._calculateStats(scenarioResults);
    const status = this._determineStatus(scenarioResults, executionInfo.forceCompleted);

    const report: TestReport = {
      id,
      executionId,
      executionInfo,
      requestedDeviceIds,
      requestedScenarioIds,
      repeatCount,
      scenarioResults,
      stats,
      status,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      createdAt: now,
    };

    const filePath = this._getReportPath(id);
    await fs.writeFile(filePath, JSON.stringify(report, null, 2), 'utf-8');

    console.log(`[TestReport] 리포트 생성: ${id}`);
    console.log(`   - 시나리오: ${stats.totalScenarios}개 (성공: ${stats.passedScenarios}, 실패: ${stats.failedScenarios})`);
    console.log(`   - 디바이스: ${stats.totalDevices}개 (성공: ${stats.successDevices}, 실패: ${stats.failedDevices}, 건너뜀: ${stats.skippedDevices})`);
    console.log(`   - 소요시간: ${stats.totalDuration}ms`);

    return report;
  }

  /**
   * 모든 리포트 목록 조회
   */
  async getAll(): Promise<TestReportListItem[]> {
    await this._ensureDir(REPORTS_DIR);

    const files = await fs.readdir(REPORTS_DIR);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    const reports = await Promise.all(
      jsonFiles.map(async (file) => {
        const filePath = path.join(REPORTS_DIR, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const report = JSON.parse(content) as TestReport;

        return {
          id: report.id,
          executionId: report.executionId,
          testName: report.executionInfo.testName,
          requesterName: report.executionInfo.requesterName,
          scenarioCount: report.scenarioResults.length,
          deviceCount: report.stats.totalDevices,
          stats: report.stats,
          status: report.status,
          startedAt: report.startedAt,
          completedAt: report.completedAt,
          createdAt: report.createdAt,
        };
      })
    );

    // 최신순 정렬
    reports.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return reports;
  }

  /**
   * 특정 리포트 조회
   */
  async getById(id: string): Promise<TestReport> {
    const filePath = this._getReportPath(id);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as TestReport;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        throw new Error(`리포트를 찾을 수 없습니다: ${id}`);
      }
      throw error;
    }
  }

  /**
   * 스크린샷 파일 읽기
   */
  async getScreenshot(relativePath: string): Promise<Buffer> {
    const fullPath = path.join(__dirname, '../../reports', relativePath);

    try {
      return await fs.readFile(fullPath);
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        throw new Error(`스크린샷을 찾을 수 없습니다: ${relativePath}`);
      }
      throw error;
    }
  }

  /**
   * 비디오 파일 읽기
   */
  async getVideo(relativePath: string): Promise<Buffer> {
    const fullPath = path.join(__dirname, '../../reports', relativePath);

    try {
      return await fs.readFile(fullPath);
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        throw new Error(`비디오를 찾을 수 없습니다: ${relativePath}`);
      }
      throw error;
    }
  }

  /**
   * 리포트 삭제
   */
  async delete(id: string): Promise<{ success: boolean; message: string }> {
    const filePath = this._getReportPath(id);

    try {
      await fs.access(filePath);
      await fs.unlink(filePath);

      // 스크린샷 폴더 삭제
      const screenshotDir = path.join(SCREENSHOTS_DIR, id);
      try {
        await fs.rm(screenshotDir, { recursive: true, force: true });
      } catch {
        // 무시
      }

      // 비디오 폴더 삭제
      const videoDir = path.join(VIDEOS_DIR, id);
      try {
        await fs.rm(videoDir, { recursive: true, force: true });
      } catch {
        // 무시
      }

      console.log(`[TestReport] 리포트 삭제: ${id}`);

      return { success: true, message: '리포트가 삭제되었습니다.' };
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        throw new Error(`리포트를 찾을 수 없습니다: ${id}`);
      }
      throw error;
    }
  }

  /**
   * 모든 리포트 삭제
   */
  async deleteAll(): Promise<{ success: boolean; deletedCount: number }> {
    await this._ensureDir(REPORTS_DIR);

    const files = await fs.readdir(REPORTS_DIR);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    await Promise.all(
      jsonFiles.map(file => fs.unlink(path.join(REPORTS_DIR, file)))
    );

    // 스크린샷 폴더 삭제
    try {
      await fs.rm(SCREENSHOTS_DIR, { recursive: true, force: true });
    } catch {
      // 무시
    }

    // 비디오 폴더 삭제
    try {
      await fs.rm(VIDEOS_DIR, { recursive: true, force: true });
    } catch {
      // 무시
    }

    console.log(`[TestReport] 모든 리포트 삭제: ${jsonFiles.length}개`);

    return { success: true, deletedCount: jsonFiles.length };
  }

  /**
   * 디바이스 이름 조회
   */
  async getDeviceName(deviceId: string): Promise<string> {
    try {
      const device = await deviceManager.getDeviceDetailedInfo(deviceId);
      if (device) {
        return device.alias || `${device.brand} ${device.model}`;
      }
      return deviceId;
    } catch {
      return deviceId;
    }
  }
}

export const testReportService = new TestReportService();
