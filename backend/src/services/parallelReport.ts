// backend/src/services/parallelReport.ts

import fs from 'fs/promises';
import path from 'path';
import {
  ParallelReport,
  ParallelReportListItem,
  ParallelReportStats,
  DeviceReportResult,
  ScreenshotInfo,
  VideoInfo,
  StepResult,
} from '../types';
import { sessionManager } from './sessionManager';
import { deviceManager } from './deviceManager';

const REPORTS_DIR = path.join(__dirname, '../../reports/parallel');
const SCREENSHOTS_DIR = path.join(__dirname, '../../reports/screenshots');
const VIDEOS_DIR = path.join(__dirname, '../../reports/videos');

/**
 * 병렬 실행 통합 리포트 서비스
 */
class ParallelReportService {
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
   * 리포트 ID 생성 (YYMMDD_HHMM_시나리오명)
   * 중복 시 _2, _3 등 순번 추가
   */
  private async _generateId(scenarioName: string): Promise<string> {
    await this._ensureDir(REPORTS_DIR);

    // 날짜+시간 포맷: YYMMDD_HHMM
    const now = new Date();
    const dateTimeStr =
      now.getFullYear().toString().slice(2) +
      (now.getMonth() + 1).toString().padStart(2, '0') +
      now.getDate().toString().padStart(2, '0') +
      '_' +
      now.getHours().toString().padStart(2, '0') +
      now.getMinutes().toString().padStart(2, '0');

    // 시나리오 이름 정제 (파일명에 사용 불가한 문자 제거)
    const safeName = scenarioName
      .replace(/[<>:"/\\|?*]/g, '')  // 파일명 금지 문자 제거
      .replace(/\s+/g, '_')           // 공백을 언더스코어로
      .substring(0, 50);              // 최대 50자

    const baseId = `${dateTimeStr}_${safeName}`;

    // 중복 확인
    const files = await fs.readdir(REPORTS_DIR);

    // 정확히 baseId.json이 없으면 그대로 사용
    if (!files.includes(`${baseId}.json`)) {
      return baseId;
    }

    // 중복 시 순번 추가 (_2, _3, ...)
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
    console.log(`📸 [${deviceId}] 스크린샷 캡처 시도: reportId=${reportId}, nodeId=${nodeId}, type=${type}`);

    try {
      const driver = sessionManager.getDriver(deviceId);
      if (!driver) {
        console.warn(`❌ [${deviceId}] 스크린샷 캡처 실패: 드라이버 없음`);
        return null;
      }

      // 스크린샷 캡처
      const screenshot = await driver.takeScreenshot();

      // 저장 경로 생성
      const screenshotDir = this._getScreenshotDir(reportId, deviceId);
      await this._ensureDir(screenshotDir);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${nodeId}_${type}_${timestamp}.png`;
      const filepath = path.join(screenshotDir, filename);

      // Base64 → 파일 저장
      await fs.writeFile(filepath, screenshot, 'base64');

      // 상대 경로 반환 (항상 forward slash 사용 - URL용)
      const relativePath = `screenshots/${reportId}/${deviceId}/${filename}`;

      console.log(`📸 [${deviceId}] 스크린샷 저장: ${filename}`);

      return {
        nodeId,
        timestamp: new Date().toISOString(),
        path: relativePath,
        type,
      };
    } catch (err) {
      console.error(`[${deviceId}] 스크린샷 캡처 오류:`, err);
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
    console.log(`🎯 [${deviceId}] 하이라이트 스크린샷 저장: reportId=${reportId}, nodeId=${nodeId}, templateId=${templateId}`);

    try {
      // 저장 경로 생성
      const screenshotDir = this._getScreenshotDir(reportId, deviceId);
      await this._ensureDir(screenshotDir);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${nodeId}_highlight_${timestamp}.png`;
      const filepath = path.join(screenshotDir, filename);

      // Buffer → 파일 저장
      await fs.writeFile(filepath, screenshotBuffer);

      // 상대 경로 반환 (항상 forward slash 사용 - URL용)
      const relativePath = `screenshots/${reportId}/${deviceId}/${filename}`;

      console.log(`🎯 [${deviceId}] 하이라이트 스크린샷 저장 완료: ${filename} (confidence: ${(confidence * 100).toFixed(1)}%)`);

      return {
        nodeId,
        timestamp: new Date().toISOString(),
        path: relativePath,
        type: 'highlight',
        templateId,
        confidence,
      };
    } catch (err) {
      console.error(`[${deviceId}] 하이라이트 스크린샷 저장 오류:`, err);
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
      // 저장 경로 생성
      const videoDir = this._getVideoDir(reportId);
      await this._ensureDir(videoDir);

      const filename = `${deviceId}.mp4`;
      const filepath = path.join(videoDir, filename);

      // Base64 → 파일 저장
      const buffer = Buffer.from(videoBase64, 'base64');

      // 디버그: Base64 데이터 해시 (처음 1000자)로 비교
      const dataHash = videoBase64.substring(0, 100);
      console.log(`🎬 [${deviceId}] 비디오 데이터 수신: base64 길이=${videoBase64.length}, 해시=${dataHash.substring(0, 20)}..., 버퍼 크기=${buffer.length}`);

      await fs.writeFile(filepath, buffer);

      // 파일 크기 확인
      const stats = await fs.stat(filepath);

      // 상대 경로 반환 (항상 forward slash)
      const relativePath = `videos/${reportId}/${filename}`;

      console.log(`🎬 [${deviceId}] 비디오 저장 완료: ${filename} (${(stats.size / 1024 / 1024).toFixed(2)}MB)`);

      return {
        path: relativePath,
        duration,
        size: stats.size,
      };
    } catch (err) {
      console.error(`[${deviceId}] 비디오 저장 오류:`, err);
      return null;
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
   * 통합 리포트 생성
   */
  async create(
    scenarioId: string,
    scenarioName: string,
    deviceResults: DeviceReportResult[],
    startedAt: Date,
    completedAt: Date
  ): Promise<ParallelReport> {
    await this._ensureDir(REPORTS_DIR);

    const id = await this._generateId(scenarioName);
    const now = new Date().toISOString();

    // 통계 계산
    const stats = this._calculateStats(deviceResults, completedAt.getTime() - startedAt.getTime());

    const report: ParallelReport = {
      id,
      scenarioId,
      scenarioName,
      deviceResults,
      stats,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      createdAt: now,
    };

    // 파일 저장
    const filePath = this._getReportPath(id);
    await fs.writeFile(filePath, JSON.stringify(report, null, 2), 'utf-8');

    console.log(`📊 통합 리포트 생성: ${scenarioName} (ID: ${id})`);
    console.log(`   - 디바이스: ${stats.totalDevices}개 (성공: ${stats.successDevices}, 실패: ${stats.failedDevices})`);
    console.log(`   - 소요시간: ${stats.totalDuration}ms`);

    return report;
  }

  /**
   * 통계 계산
   */
  private _calculateStats(
    deviceResults: DeviceReportResult[],
    totalDuration: number
  ): ParallelReportStats {
    const totalDevices = deviceResults.length;
    const successDevices = deviceResults.filter(r => r.success).length;
    const failedDevices = totalDevices - successDevices;

    let totalSteps = 0;
    let passedSteps = 0;
    let failedSteps = 0;
    let durationSum = 0;

    for (const result of deviceResults) {
      totalSteps += result.steps.length;
      passedSteps += result.steps.filter(s => s.status === 'passed').length;
      failedSteps += result.steps.filter(s => s.status === 'failed' || s.status === 'error').length;
      durationSum += result.duration;
    }

    return {
      totalDevices,
      successDevices,
      failedDevices,
      totalSteps,
      passedSteps,
      failedSteps,
      totalDuration,
      avgDuration: totalDevices > 0 ? Math.round(durationSum / totalDevices) : 0,
    };
  }

  /**
   * 모든 통합 리포트 목록 조회
   */
  async getAll(): Promise<ParallelReportListItem[]> {
    await this._ensureDir(REPORTS_DIR);

    const files = await fs.readdir(REPORTS_DIR);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    const reports = await Promise.all(
      jsonFiles.map(async (file) => {
        const filePath = path.join(REPORTS_DIR, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const report = JSON.parse(content) as ParallelReport;

        return {
          id: report.id,
          scenarioId: report.scenarioId,
          scenarioName: report.scenarioName,
          stats: report.stats,
          createdAt: report.createdAt,
        };
      })
    );

    // 최신순 정렬
    reports.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return reports;
  }

  /**
   * 특정 통합 리포트 조회
   */
  async getById(id: string): Promise<ParallelReport> {
    const filePath = this._getReportPath(id);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as ParallelReport;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        throw new Error(`통합 리포트를 찾을 수 없습니다: ${id}`);
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
   * 통합 리포트 삭제
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
        // 스크린샷 폴더가 없어도 무시
      }

      // 비디오 폴더 삭제
      const videoDir = path.join(VIDEOS_DIR, id);
      try {
        await fs.rm(videoDir, { recursive: true, force: true });
      } catch {
        // 비디오 폴더가 없어도 무시
      }

      console.log(`🗑️ 통합 리포트 삭제: ID ${id}`);

      return { success: true, message: '통합 리포트가 삭제되었습니다.' };
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        throw new Error(`통합 리포트를 찾을 수 없습니다: ${id}`);
      }
      throw error;
    }
  }

  /**
   * 모든 통합 리포트 삭제
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
      // 폴더가 없어도 무시
    }

    // 비디오 폴더 삭제
    try {
      await fs.rm(VIDEOS_DIR, { recursive: true, force: true });
    } catch {
      // 폴더가 없어도 무시
    }

    console.log(`🗑️ 모든 통합 리포트 삭제: ${jsonFiles.length}개`);

    return { success: true, deletedCount: jsonFiles.length };
  }

  /**
   * 디바이스 이름 조회
   */
  async getDeviceName(deviceId: string): Promise<string> {
    try {
      const device = await deviceManager.getDeviceDetailedInfo(deviceId);
      if (device) {
        return `${device.brand} ${device.model}`;
      }
      return deviceId;
    } catch {
      return deviceId;
    }
  }
}

export const parallelReportService = new ParallelReportService();
