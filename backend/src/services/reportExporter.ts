// backend/src/services/reportExporter.ts

import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';
import {
  ParallelReport,
  DeviceReportResult,
  ScreenshotInfo,
  StepResult,
} from '../types';
import { parallelReportService } from './parallelReport';

export interface ExportOptions {
  includeScreenshots: boolean;
  paperSize?: 'A4' | 'Letter';
  orientation?: 'portrait' | 'landscape';
}

interface EmbeddedScreenshot extends ScreenshotInfo {
  dataUri: string;
}

interface DeviceResultWithEmbedded extends Omit<DeviceReportResult, 'screenshots'> {
  screenshots: EmbeddedScreenshot[];
}

interface ProcessedReport extends Omit<ParallelReport, 'deviceResults'> {
  deviceResults: DeviceResultWithEmbedded[];
}

/**
 * 리포트 내보내기 서비스
 */
class ReportExporter {
  /**
   * 스크린샷 파일을 Base64 Data URI로 변환
   */
  private async _toBase64DataUri(screenshotPath: string): Promise<string> {
    try {
      const buffer = await parallelReportService.getScreenshot(screenshotPath);
      const base64 = buffer.toString('base64');
      return `data:image/png;base64,${base64}`;
    } catch (err) {
      console.warn(`스크린샷 로드 실패: ${screenshotPath}`, err);
      return '';
    }
  }

  /**
   * 리포트 데이터에 스크린샷 Base64 임베딩
   */
  private async _processReportWithEmbeddedImages(
    report: ParallelReport,
    includeScreenshots: boolean
  ): Promise<ProcessedReport> {
    const processedDeviceResults: DeviceResultWithEmbedded[] = [];

    for (const deviceResult of report.deviceResults) {
      const embeddedScreenshots: EmbeddedScreenshot[] = [];

      if (includeScreenshots) {
        for (const screenshot of deviceResult.screenshots) {
          const dataUri = await this._toBase64DataUri(screenshot.path);
          embeddedScreenshots.push({
            ...screenshot,
            dataUri,
          });
        }
      }

      processedDeviceResults.push({
        ...deviceResult,
        screenshots: embeddedScreenshots,
      });
    }

    return {
      ...report,
      deviceResults: processedDeviceResults,
    };
  }

  /**
   * 날짜 포맷팅
   */
  private _formatDate(isoString: string): string {
    const date = new Date(isoString);
    return date.toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  /**
   * 시간 포맷팅 (ms → 읽기 쉬운 형태)
   */
  private _formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}초`;
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(0);
    return `${minutes}분 ${seconds}초`;
  }

  /**
   * 상태별 클래스명
   */
  private _getStatusClass(status: string): string {
    switch (status) {
      case 'passed': return 'status-passed';
      case 'failed': return 'status-failed';
      case 'error': return 'status-error';
      case 'skipped': return 'status-skipped';
      default: return '';
    }
  }

  /**
   * 상태별 텍스트
   */
  private _getStatusText(status: string): string {
    switch (status) {
      case 'passed': return '성공';
      case 'failed': return '실패';
      case 'error': return '오류';
      case 'skipped': return '건너뜀';
      default: return status;
    }
  }

  /**
   * 스크린샷 타입별 텍스트
   */
  private _getScreenshotTypeText(type: string): string {
    switch (type) {
      case 'step': return '단계';
      case 'error': return '오류';
      case 'final': return '최종';
      default: return type;
    }
  }

  /**
   * 단계 테이블 HTML 생성
   */
  private _generateStepsTableHtml(steps: StepResult[]): string {
    if (steps.length === 0) {
      return '<p class="no-data">실행된 단계가 없습니다.</p>';
    }

    const rows = steps.map((step, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${step.nodeName || step.nodeId}</td>
        <td>${step.nodeType}</td>
        <td class="${this._getStatusClass(step.status)}">${this._getStatusText(step.status)}</td>
        <td>${step.duration ? this._formatDuration(step.duration) : '-'}</td>
        <td class="error-message">${step.error || '-'}</td>
      </tr>
    `).join('');

    return `
      <table class="steps-table">
        <thead>
          <tr>
            <th>#</th>
            <th>단계명</th>
            <th>타입</th>
            <th>상태</th>
            <th>소요시간</th>
            <th>오류</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    `;
  }

  /**
   * 스크린샷 그리드 HTML 생성
   */
  private _generateScreenshotsHtml(screenshots: EmbeddedScreenshot[]): string {
    if (screenshots.length === 0) {
      return '';
    }

    const items = screenshots.map(screenshot => `
      <div class="screenshot-item">
        <img src="${screenshot.dataUri}" alt="${screenshot.nodeId}" />
        <div class="screenshot-info">
          <span class="screenshot-type type-${screenshot.type}">${this._getScreenshotTypeText(screenshot.type)}</span>
          <span class="screenshot-node">${screenshot.nodeId}</span>
        </div>
      </div>
    `).join('');

    return `
      <div class="screenshots-section">
        <h3>스크린샷</h3>
        <div class="screenshots-grid">
          ${items}
        </div>
      </div>
    `;
  }

  /**
   * 디바이스 섹션 HTML 생성
   */
  private _generateDeviceSectionHtml(deviceResult: DeviceResultWithEmbedded, index: number): string {
    const statusClass = deviceResult.success ? 'success' : 'failed';
    const statusText = deviceResult.success ? '성공' : '실패';
    const pageBreak = index > 0 ? 'page-break' : '';

    return `
      <section class="device-section ${pageBreak}">
        <div class="device-header">
          <div class="device-info">
            <h2 class="device-name">${deviceResult.deviceName}</h2>
            <span class="device-id">${deviceResult.deviceId}</span>
          </div>
          <div class="device-meta">
            <span class="device-status ${statusClass}">${statusText}</span>
            <span class="device-duration">${this._formatDuration(deviceResult.duration)}</span>
          </div>
        </div>

        ${deviceResult.error ? `<div class="device-error">오류: ${deviceResult.error}</div>` : ''}

        <div class="steps-section">
          <h3>실행 단계 (${deviceResult.steps.length}개)</h3>
          ${this._generateStepsTableHtml(deviceResult.steps)}
        </div>

        ${this._generateScreenshotsHtml(deviceResult.screenshots)}
      </section>
    `;
  }

  /**
   * HTML 생성
   */
  async generateHTML(
    report: ParallelReport,
    options: ExportOptions
  ): Promise<string> {
    const processedReport = await this._processReportWithEmbeddedImages(
      report,
      options.includeScreenshots
    );

    const successRate = report.stats.totalDevices > 0
      ? Math.round((report.stats.successDevices / report.stats.totalDevices) * 100)
      : 0;

    const deviceSections = processedReport.deviceResults
      .map((dr, index) => this._generateDeviceSectionHtml(dr, index))
      .join('');

    const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${report.scenarioName} - 병렬 실행 리포트</title>
  <style>
    /* CSS Variables - Catppuccin Mocha Theme */
    :root {
      --bg-primary: #1e1e2e;
      --bg-secondary: #313244;
      --bg-tertiary: #181825;
      --text-primary: #cdd6f4;
      --text-secondary: #a6adc8;
      --text-muted: #6c7086;
      --accent-blue: #89b4fa;
      --accent-green: #a6e3a1;
      --accent-red: #f38ba8;
      --accent-yellow: #f9e2af;
      --accent-purple: #cba6f7;
      --border: #45475a;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans KR', sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      line-height: 1.6;
      padding: 40px;
    }

    /* Print Styles */
    @media print {
      body {
        background: white;
        color: #333;
        padding: 20px;
      }
      :root {
        --bg-primary: #ffffff;
        --bg-secondary: #f5f5f5;
        --bg-tertiary: #eeeeee;
        --text-primary: #333333;
        --text-secondary: #666666;
        --text-muted: #999999;
        --border: #dddddd;
      }
      .page-break {
        page-break-before: always;
      }
    }

    /* Header */
    .report-header {
      text-align: center;
      margin-bottom: 40px;
      padding-bottom: 20px;
      border-bottom: 2px solid var(--border);
    }

    .report-header h1 {
      font-size: 28px;
      margin-bottom: 12px;
      color: var(--accent-blue);
    }

    .report-meta {
      display: flex;
      justify-content: center;
      flex-wrap: wrap;
      gap: 24px;
      font-size: 14px;
      color: var(--text-secondary);
    }

    .report-meta span {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    /* Statistics Grid */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 16px;
      margin-bottom: 40px;
    }

    .stat-card {
      background: var(--bg-secondary);
      border-radius: 8px;
      padding: 20px;
      text-align: center;
    }

    .stat-label {
      font-size: 12px;
      color: var(--text-secondary);
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .stat-value {
      font-size: 24px;
      font-weight: 600;
    }

    .stat-value.success { color: var(--accent-green); }
    .stat-value.failed { color: var(--accent-red); }
    .stat-value.neutral { color: var(--accent-blue); }

    /* Device Section */
    .device-section {
      background: var(--bg-secondary);
      border-radius: 8px;
      padding: 24px;
      margin-bottom: 24px;
    }

    .device-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 20px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border);
    }

    .device-info .device-name {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 4px;
    }

    .device-info .device-id {
      font-size: 12px;
      color: var(--text-muted);
      font-family: monospace;
    }

    .device-meta {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .device-status {
      padding: 4px 12px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
    }

    .device-status.success {
      background: rgba(166, 227, 161, 0.2);
      color: var(--accent-green);
    }

    .device-status.failed {
      background: rgba(243, 139, 168, 0.2);
      color: var(--accent-red);
    }

    .device-duration {
      font-size: 14px;
      color: var(--text-secondary);
    }

    .device-error {
      background: rgba(243, 139, 168, 0.1);
      border: 1px solid var(--accent-red);
      border-radius: 6px;
      padding: 12px;
      margin-bottom: 20px;
      color: var(--accent-red);
      font-size: 13px;
    }

    /* Steps Section */
    .steps-section {
      margin-bottom: 24px;
    }

    .steps-section h3,
    .screenshots-section h3 {
      font-size: 14px;
      color: var(--text-secondary);
      margin-bottom: 12px;
      font-weight: 500;
    }

    .steps-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }

    .steps-table th,
    .steps-table td {
      padding: 10px 12px;
      text-align: left;
      border-bottom: 1px solid var(--border);
    }

    .steps-table th {
      background: var(--bg-tertiary);
      color: var(--text-secondary);
      font-weight: 500;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .steps-table .status-passed { color: var(--accent-green); }
    .steps-table .status-failed { color: var(--accent-red); }
    .steps-table .status-error { color: var(--accent-red); }
    .steps-table .status-skipped { color: var(--text-muted); }

    .steps-table .error-message {
      max-width: 200px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 11px;
      color: var(--text-muted);
    }

    .no-data {
      color: var(--text-muted);
      font-style: italic;
      padding: 20px;
      text-align: center;
    }

    /* Screenshots Section */
    .screenshots-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 12px;
    }

    .screenshot-item {
      background: var(--bg-tertiary);
      border-radius: 8px;
      overflow: hidden;
    }

    .screenshot-item img {
      width: 100%;
      height: auto;
      display: block;
    }

    .screenshot-info {
      padding: 8px 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
    }

    .screenshot-type {
      padding: 2px 8px;
      border-radius: 4px;
      font-weight: 500;
    }

    .screenshot-type.type-step {
      background: rgba(137, 180, 250, 0.2);
      color: var(--accent-blue);
    }

    .screenshot-type.type-error {
      background: rgba(243, 139, 168, 0.2);
      color: var(--accent-red);
    }

    .screenshot-type.type-final {
      background: rgba(166, 227, 161, 0.2);
      color: var(--accent-green);
    }

    .screenshot-node {
      color: var(--text-muted);
      font-family: monospace;
    }

    /* Footer */
    .report-footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid var(--border);
      text-align: center;
      font-size: 12px;
      color: var(--text-muted);
    }
  </style>
</head>
<body>
  <!-- Header -->
  <header class="report-header">
    <h1>${report.scenarioName}</h1>
    <div class="report-meta">
      <span>리포트 ID: ${report.id}</span>
      <span>실행일: ${this._formatDate(report.startedAt)}</span>
      <span>생성일: ${this._formatDate(report.createdAt)}</span>
    </div>
  </header>

  <!-- Statistics -->
  <section class="stats-grid">
    <div class="stat-card">
      <div class="stat-label">성공률</div>
      <div class="stat-value ${successRate >= 50 ? 'success' : 'failed'}">${successRate}%</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">디바이스</div>
      <div class="stat-value neutral">${report.stats.totalDevices}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">성공</div>
      <div class="stat-value success">${report.stats.successDevices}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">실패</div>
      <div class="stat-value failed">${report.stats.failedDevices}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">전체 단계</div>
      <div class="stat-value neutral">${report.stats.totalSteps}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">총 소요시간</div>
      <div class="stat-value neutral">${this._formatDuration(report.stats.totalDuration)}</div>
    </div>
  </section>

  <!-- Device Results -->
  ${deviceSections}

  <!-- Footer -->
  <footer class="report-footer">
    Generated by Game QA Automation Tool | ${new Date().toISOString()}
  </footer>
</body>
</html>`;

    return html;
  }

  /**
   * PDF 생성
   */
  async generatePDF(
    report: ParallelReport,
    options: ExportOptions
  ): Promise<Buffer> {
    // HTML 먼저 생성
    const html = await this.generateHTML(report, {
      includeScreenshots: options.includeScreenshots,
    });

    // Puppeteer로 PDF 변환
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });

      const pdfBuffer = await page.pdf({
        format: options.paperSize || 'A4',
        landscape: options.orientation === 'landscape',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '15mm',
          bottom: '20mm',
          left: '15mm',
        },
      });

      return Buffer.from(pdfBuffer);
    } finally {
      await browser.close();
    }
  }
}

export const reportExporter = new ReportExporter();
