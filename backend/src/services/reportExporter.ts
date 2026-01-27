// backend/src/services/reportExporter.ts
// 통합 테스트 리포트 내보내기 서비스 (HTML/PDF)

import fs from 'fs/promises';
import path from 'path';
import puppeteer from 'puppeteer';
import { TestReport, DeviceScenarioResult, ScenarioReportResult } from '../types/testReport';
import { StepResult, ScreenshotInfo } from '../types/execution';
import { DeviceEnvironment, AppInfo, FailureAnalysis, FlakyAnalysis } from '../types/reportEnhanced';
import {
  SuiteExecutionResult,
  DeviceSuiteResult,
  ScenarioSuiteResult,
  StepSuiteResult,
  DeviceSuiteEnvironment,
  AppSuiteInfo,
  ScreenshotInfo as SuiteScreenshotInfo,
} from '../types/suite';

export interface ExportOptions {
  includeScreenshots: boolean;
  paperSize?: 'A4' | 'Letter';
  orientation?: 'portrait' | 'landscape';
}

const REPORTS_DIR = path.join(__dirname, '../../reports');
const SCREENSHOTS_DIR = path.join(REPORTS_DIR, 'screenshots');

/**
 * 리포트 내보내기 서비스
 */
class ReportExporter {
  /**
   * 스크린샷 파일을 Base64 Data URI로 변환
   */
  private async _toBase64DataUri(filePath: string): Promise<string | null> {
    try {
      const fullPath = path.join(REPORTS_DIR, filePath);
      const buffer = await fs.readFile(fullPath);
      const ext = path.extname(filePath).toLowerCase();
      const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';
      return `data:${mimeType};base64,${buffer.toString('base64')}`;
    } catch (error) {
      console.warn(`[ReportExporter] 스크린샷 로드 실패: ${filePath}`);
      return null;
    }
  }

  /**
   * 날짜 포맷팅
   */
  private _formatDate(dateStr: string): string {
    const date = new Date(dateStr);
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
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const min = Math.floor(ms / 60000);
    const sec = Math.round((ms % 60000) / 1000);
    return `${min}분 ${sec}초`;
  }

  /**
   * 상태별 클래스명
   */
  private _getStatusClass(status: string): string {
    switch (status) {
      case 'passed':
      case 'completed':
        return 'status-passed';
      case 'failed':
      case 'error':
        return 'status-failed';
      case 'partial':
        return 'status-partial';
      case 'waiting':
        return 'status-waiting';
      case 'skipped':
        return 'status-skipped';
      default:
        return 'status-unknown';
    }
  }

  /**
   * 상태별 텍스트
   */
  private _getStatusText(status: string): string {
    switch (status) {
      case 'passed':
        return '성공';
      case 'failed':
        return '실패';
      case 'error':
        return '오류';
      case 'partial':
        return '일부 성공';
      case 'waiting':
        return '대기';
      case 'skipped':
        return '건너뜀';
      case 'completed':
        return '완료';
      case 'stopped':
        return '중단됨';
      default:
        return status;
    }
  }

  /**
   * 환경 정보 HTML 생성
   */
  private _generateEnvironmentHtml(env?: DeviceEnvironment, appInfo?: AppInfo): string {
    if (!env && !appInfo) return '';

    let html = '<div class="env-section"><h4>환경 정보</h4><div class="env-grid">';

    if (env) {
      html += `
        <div class="env-group">
          <div class="env-group-title">디바이스</div>
          <div class="env-item"><span class="env-label">모델:</span> ${env.brand} ${env.model}</div>
          <div class="env-item"><span class="env-label">Android:</span> ${env.androidVersion} (SDK ${env.sdkVersion})</div>
          <div class="env-item"><span class="env-label">해상도:</span> ${env.screenResolution} (${env.screenDensity}dpi)</div>
          <div class="env-item"><span class="env-label">CPU:</span> ${env.cpuAbi}</div>
        </div>
        <div class="env-group">
          <div class="env-group-title">상태</div>
          <div class="env-item"><span class="env-label">배터리:</span> ${env.batteryLevel}% (${env.batteryStatus}, ${env.batteryTemperature}°C)</div>
          <div class="env-item"><span class="env-label">메모리:</span> ${env.availableMemory}MB / ${env.totalMemory}MB</div>
          <div class="env-item"><span class="env-label">저장공간:</span> ${env.availableStorage}GB / ${env.totalStorage}GB</div>
          <div class="env-item"><span class="env-label">네트워크:</span> ${env.networkType}${env.wifiSsid ? ` (${env.wifiSsid})` : ''}</div>
        </div>
      `;
    }

    if (appInfo) {
      html += `
        <div class="env-group">
          <div class="env-group-title">앱 정보</div>
          <div class="env-item"><span class="env-label">패키지:</span> ${appInfo.packageName}</div>
          ${appInfo.appName ? `<div class="env-item"><span class="env-label">앱 이름:</span> ${appInfo.appName}</div>` : ''}
          ${appInfo.versionName ? `<div class="env-item"><span class="env-label">버전:</span> ${appInfo.versionName} (${appInfo.versionCode || '-'})</div>` : ''}
          ${appInfo.targetSdk ? `<div class="env-item"><span class="env-label">Target SDK:</span> ${appInfo.targetSdk}</div>` : ''}
        </div>
      `;
    }

    html += '</div></div>';
    return html;
  }

  /**
   * 성능 요약 HTML 생성
   */
  private _generatePerformanceSummaryHtml(performanceSummary?: DeviceScenarioResult['performanceSummary']): string {
    if (!performanceSummary) return '';

    return `
      <div class="perf-section">
        <h4>성능 메트릭</h4>
        <div class="perf-grid">
          <div class="perf-item">
            <span class="perf-label">평균 단계 시간</span>
            <span class="perf-value">${this._formatDuration(performanceSummary.avgStepDuration)}</span>
          </div>
          <div class="perf-item">
            <span class="perf-label">최대 단계 시간</span>
            <span class="perf-value">${this._formatDuration(performanceSummary.maxStepDuration)}</span>
          </div>
          <div class="perf-item">
            <span class="perf-label">최소 단계 시간</span>
            <span class="perf-value">${this._formatDuration(performanceSummary.minStepDuration)}</span>
          </div>
          <div class="perf-item">
            <span class="perf-label">총 대기 시간</span>
            <span class="perf-value">${this._formatDuration(performanceSummary.totalWaitTime)}</span>
          </div>
          <div class="perf-item">
            <span class="perf-label">총 액션 시간</span>
            <span class="perf-value">${this._formatDuration(performanceSummary.totalActionTime)}</span>
          </div>
          ${performanceSummary.imageMatchCount ? `
            <div class="perf-item perf-item-full">
              <span class="perf-label">이미지 매칭</span>
              <span class="perf-value">${performanceSummary.imageMatchCount}회 (평균 ${this._formatDuration(performanceSummary.imageMatchAvgTime || 0)})</span>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  /**
   * 실패 분석 HTML 생성
   */
  private _generateFailureAnalysisHtml(analysis?: FailureAnalysis): string {
    if (!analysis) return '';

    // 실패 유형에 따른 심각도 결정
    const getSeverity = (type: string): string => {
      if (['app_crash', 'session_error', 'connection_error'].includes(type)) return 'critical';
      if (['timeout', 'resource_exhausted'].includes(type)) return 'high';
      if (['element_not_found', 'image_not_matched', 'text_not_found'].includes(type)) return 'medium';
      return 'low';
    };

    const severity = getSeverity(analysis.failureType);
    const severityClass = severity === 'critical' ? 'severity-critical' :
                          severity === 'high' ? 'severity-high' :
                          severity === 'medium' ? 'severity-medium' : 'severity-low';

    // context 정보 문자열로 변환
    const contextStr = analysis.context
      ? `${analysis.context.attemptedAction || ''}${analysis.context.actionParams ? ` (${JSON.stringify(analysis.context.actionParams)})` : ''}`
      : '';

    return `
      <div class="failure-analysis">
        <div class="failure-header">
          <span class="failure-type">${this._getFailureTypeText(analysis.failureType)}</span>
          <span class="failure-severity ${severityClass}">${severity.toUpperCase()}</span>
        </div>
        ${contextStr ? `<div class="failure-context">${contextStr}</div>` : ''}
        <div class="failure-message">${analysis.errorMessage}</div>
        ${analysis.stackTrace ? `<pre class="failure-stack">${analysis.stackTrace.substring(0, 500)}...</pre>` : ''}
      </div>
    `;
  }

  /**
   * 실패 유형 텍스트
   */
  private _getFailureTypeText(type: string): string {
    const map: Record<string, string> = {
      timeout: '시간 초과',
      element_not_found: '요소 없음',
      image_not_matched: '이미지 매칭 실패',
      text_not_found: '텍스트 없음',
      assertion_failed: '검증 실패',
      app_crash: '앱 크래시',
      app_not_running: '앱 미실행',
      session_error: '세션 오류',
      connection_error: '연결 오류',
      network_error: '네트워크 오류',
      permission_denied: '권한 거부',
      resource_exhausted: '리소스 부족',
      unknown: '알 수 없음',
    };
    return map[type] || type;
  }

  /**
   * Flaky 분석 요약 HTML 생성
   */
  private _generateFlakySummaryHtml(flakyAnalysis?: FlakyAnalysis[]): string {
    if (!flakyAnalysis || flakyAnalysis.length === 0) return '';

    const flakyTests = flakyAnalysis.filter(a => a.isFlaky);
    if (flakyTests.length === 0) return '';

    const rows = flakyTests.map(a => `
      <tr>
        <td>${a.scenarioId}</td>
        <td>${a.deviceId}</td>
        <td>${a.successRate.toFixed(1)}%</td>
        <td class="flaky-score">${a.flakyScore}</td>
        <td>${a.flakyReason || '-'}</td>
      </tr>
    `).join('');

    return `
      <div class="flaky-section">
        <h3>⚠️ Flaky 테스트 감지 (${flakyTests.length}건)</h3>
        <table class="flaky-table">
          <thead>
            <tr>
              <th>시나리오</th>
              <th>디바이스</th>
              <th>성공률</th>
              <th>Flaky Score</th>
              <th>원인</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;
  }

  /**
   * 단계 테이블 HTML 생성
   */
  private _generateStepsTableHtml(steps: StepResult[]): string {
    // waiting 상태는 중간 상태이므로 제외
    const filteredSteps = steps.filter((s) => s.status !== 'waiting');

    if (filteredSteps.length === 0) {
      return '<p class="no-steps">실행된 단계가 없습니다.</p>';
    }

    const rows = filteredSteps
      .map(
        (step, idx) => {
          const hasFailureAnalysis = step.failureAnalysis && (step.status === 'failed' || step.status === 'error');
          const imageMatchTime = step.performance?.imageMatch?.matchTime;
          const perfInfo = step.performance
            ? `<span class="perf-badge" title="액션: ${this._formatDuration(step.performance.actionTime || 0)}, 대기: ${this._formatDuration(step.performance.waitTime || 0)}">${imageMatchTime ? `🖼️${this._formatDuration(imageMatchTime)}` : ''}</span>`
            : '';

          return `
      <tr class="${hasFailureAnalysis ? 'has-failure-analysis' : ''}">
        <td>${idx + 1}</td>
        <td>${step.nodeName || step.nodeId} ${perfInfo}</td>
        <td>${step.nodeType}</td>
        <td class="${this._getStatusClass(step.status)}">${this._getStatusText(step.status)}</td>
        <td>${step.duration !== undefined ? this._formatDuration(step.duration) : '-'}</td>
        <td class="error-message">${step.error || '-'}</td>
      </tr>
      ${hasFailureAnalysis ? `<tr class="failure-row"><td colspan="6">${this._generateFailureAnalysisHtml(step.failureAnalysis)}</td></tr>` : ''}
    `;
        }
      )
      .join('');

    return `
      <table class="steps-table">
        <thead>
          <tr>
            <th>#</th>
            <th>단계명</th>
            <th>타입</th>
            <th>상태</th>
            <th>소요시간</th>
            <th>에러</th>
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
  private async _generateScreenshotsHtml(
    screenshots: ScreenshotInfo[],
    includeScreenshots: boolean
  ): Promise<string> {
    if (!includeScreenshots || screenshots.length === 0) {
      return '';
    }

    const screenshotItems = await Promise.all(
      screenshots.map(async (ss) => {
        const dataUri = await this._toBase64DataUri(ss.path);
        if (!dataUri) return '';

        const typeText =
          ss.type === 'highlight'
            ? '이미지 인식'
            : ss.type === 'failed'
              ? '실패 시점'
              : ss.type === 'final'
                ? '완료'
                : '단계';

        return `
          <div class="screenshot-item">
            <img src="${dataUri}" alt="Screenshot" />
            <div class="screenshot-info">
              <span class="screenshot-type">${typeText}</span>
              ${ss.confidence ? `<span class="confidence">${(ss.confidence * 100).toFixed(1)}%</span>` : ''}
            </div>
          </div>
        `;
      })
    );

    const validItems = screenshotItems.filter((item) => item);
    if (validItems.length === 0) return '';

    return `
      <div class="screenshots-section">
        <h4>스크린샷</h4>
        <div class="screenshots-grid">
          ${validItems.join('')}
        </div>
      </div>
    `;
  }

  /**
   * 디바이스 섹션 HTML 생성
   */
  private async _generateDeviceSectionHtml(
    device: DeviceScenarioResult,
    includeScreenshots: boolean
  ): Promise<string> {
    const screenshotsHtml = await this._generateScreenshotsHtml(
      device.screenshots,
      includeScreenshots
    );

    // QA 확장 섹션 생성
    const environmentHtml = this._generateEnvironmentHtml(device.environment, device.appInfo);
    const performanceHtml = this._generatePerformanceSummaryHtml(device.performanceSummary);

    return `
      <div class="device-section">
        <div class="device-header ${this._getStatusClass(device.status)}">
          <span class="device-name">${device.deviceName || device.deviceId}</span>
          <span class="device-status">${this._getStatusText(device.status)}</span>
          <span class="device-duration">${this._formatDuration(device.duration)}</span>
        </div>
        ${device.error ? `<div class="device-error">${device.error}</div>` : ''}
        ${device.skippedReason ? `<div class="device-skipped-reason">건너뜀 사유: ${device.skippedReason}</div>` : ''}
        ${environmentHtml}
        ${performanceHtml}
        ${this._generateStepsTableHtml(device.steps)}
        ${screenshotsHtml}
      </div>
    `;
  }

  /**
   * 시나리오 섹션 HTML 생성
   */
  private async _generateScenarioSectionHtml(
    scenario: ScenarioReportResult,
    includeScreenshots: boolean
  ): Promise<string> {
    const deviceSections = await Promise.all(
      scenario.deviceResults.map((device) =>
        this._generateDeviceSectionHtml(device, includeScreenshots)
      )
    );

    return `
      <div class="scenario-section">
        <div class="scenario-header ${this._getStatusClass(scenario.status)}">
          <div class="scenario-title">
            <span class="scenario-order">#${scenario.order}</span>
            <span class="scenario-name">${scenario.scenarioName}</span>
            ${scenario.repeatIndex > 1 ? `<span class="repeat-badge">${scenario.repeatIndex}회차</span>` : ''}
          </div>
          <div class="scenario-meta">
            <span class="package-name">${scenario.packageName}</span>
            <span class="category-name">${scenario.categoryName}</span>
            <span class="scenario-status">${this._getStatusText(scenario.status)}</span>
            <span class="scenario-duration">${this._formatDuration(scenario.duration)}</span>
          </div>
        </div>
        <div class="scenario-devices">
          ${deviceSections.join('')}
        </div>
      </div>
    `;
  }

  /**
   * HTML 스타일 (VS Code Dark+ 테마)
   */
  private _getStyles(): string {
    return `
      <style>
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        body {
          font-family: 'Segoe UI', 'Consolas', -apple-system, BlinkMacSystemFont, sans-serif;
          background: #1e1e1e;
          color: #d4d4d4;
          line-height: 1.6;
          padding: 24px;
        }

        .report-container {
          max-width: 1200px;
          margin: 0 auto;
        }

        .report-header {
          background: #252526;
          border: 1px solid #3c3c3c;
          border-radius: 6px;
          padding: 24px;
          margin-bottom: 24px;
        }

        .report-title {
          font-size: 24px;
          font-weight: 600;
          color: #569cd6;
          margin-bottom: 16px;
        }

        .report-meta {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
        }

        .meta-item {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .meta-label {
          font-size: 12px;
          color: #6a9955;
          text-transform: uppercase;
        }

        .meta-value {
          font-size: 16px;
          font-weight: 500;
          color: #9cdcfe;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 16px;
          margin-bottom: 24px;
        }

        .stat-card {
          background: #252526;
          border: 1px solid #3c3c3c;
          border-radius: 6px;
          padding: 16px;
          text-align: center;
        }

        .stat-value {
          font-size: 28px;
          font-weight: 700;
          color: #569cd6;
        }

        .stat-label {
          font-size: 12px;
          color: #808080;
          margin-top: 4px;
        }

        .stat-card.success .stat-value { color: #4ec9b0; }
        .stat-card.failed .stat-value { color: #f14c4c; }
        .stat-card.partial .stat-value { color: #dcdcaa; }

        .scenario-section {
          background: #252526;
          border: 1px solid #3c3c3c;
          border-radius: 6px;
          margin-bottom: 24px;
          overflow: hidden;
        }

        .scenario-header {
          padding: 16px 20px;
          border-left: 4px solid #3c3c3c;
        }

        .scenario-header.status-passed { border-color: #4ec9b0; background: rgba(78, 201, 176, 0.1); }
        .scenario-header.status-failed { border-color: #f14c4c; background: rgba(241, 76, 76, 0.1); }
        .scenario-header.status-partial { border-color: #dcdcaa; background: rgba(220, 220, 170, 0.1); }

        .scenario-title {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 8px;
        }

        .scenario-order {
          font-size: 14px;
          color: #808080;
        }

        .scenario-name {
          font-size: 18px;
          font-weight: 600;
          color: #dcdcaa;
        }

        .repeat-badge {
          background: #569cd6;
          color: #1e1e1e;
          font-size: 11px;
          padding: 2px 8px;
          border-radius: 4px;
          font-weight: 600;
        }

        .scenario-meta {
          display: flex;
          gap: 16px;
          font-size: 13px;
          color: #9cdcfe;
        }

        .scenario-devices {
          padding: 16px 20px;
        }

        .device-section {
          background: #1e1e1e;
          border: 1px solid #3c3c3c;
          border-radius: 6px;
          padding: 16px;
          margin-bottom: 12px;
        }

        .device-section:last-child {
          margin-bottom: 0;
        }

        .device-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 12px;
          border-radius: 4px;
          margin-bottom: 12px;
        }

        .device-header.status-passed { background: rgba(78, 201, 176, 0.15); }
        .device-header.status-failed { background: rgba(241, 76, 76, 0.15); }
        .device-header.status-skipped { background: rgba(128, 128, 128, 0.15); }

        .device-name {
          font-weight: 600;
          color: #4ec9b0;
        }

        .device-status {
          font-size: 13px;
        }

        .device-error {
          background: rgba(241, 76, 76, 0.15);
          color: #f14c4c;
          padding: 8px 12px;
          border-radius: 4px;
          font-size: 13px;
          margin-bottom: 12px;
          border-left: 3px solid #f14c4c;
        }

        .device-skipped-reason {
          background: rgba(128, 128, 128, 0.15);
          color: #808080;
          padding: 8px 12px;
          border-radius: 4px;
          font-size: 13px;
          margin-bottom: 12px;
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
          border-bottom: 1px solid #3c3c3c;
        }

        .steps-table th {
          background: #2d2d2d;
          color: #d4d4d4;
          font-weight: 600;
        }

        .steps-table tr:last-child td {
          border-bottom: none;
        }

        .steps-table tr:hover {
          background: rgba(255, 255, 255, 0.04);
        }

        .steps-table .status-passed { color: #4ec9b0; }
        .steps-table .status-failed { color: #f14c4c; }
        .steps-table .status-waiting { color: #dcdcaa; }

        .error-message {
          max-width: 300px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: #f14c4c;
          font-size: 12px;
        }

        .no-steps {
          color: #808080;
          font-style: italic;
          padding: 12px;
        }

        .screenshots-section {
          margin-top: 16px;
        }

        .screenshots-section h4 {
          font-size: 14px;
          color: #9cdcfe;
          margin-bottom: 12px;
        }

        .screenshots-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 12px;
        }

        .screenshot-item {
          position: relative;
          background: #2d2d2d;
          border: 1px solid #3c3c3c;
          border-radius: 6px;
          overflow: hidden;
        }

        .screenshot-item img {
          width: 100%;
          height: auto;
          display: block;
        }

        .screenshot-info {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          background: rgba(0, 0, 0, 0.8);
          padding: 6px 8px;
          display: flex;
          justify-content: space-between;
          font-size: 11px;
        }

        .screenshot-type {
          color: #569cd6;
        }

        .confidence {
          color: #4ec9b0;
        }

        /* QA 확장 스타일 - 환경 정보 */
        .env-section {
          background: #2d2d2d;
          border: 1px solid #3c3c3c;
          border-radius: 6px;
          padding: 12px;
          margin-bottom: 12px;
        }

        .env-section h4 {
          font-size: 13px;
          color: #569cd6;
          margin-bottom: 10px;
        }

        .env-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 12px;
        }

        .env-group {
          background: #1e1e1e;
          border: 1px solid #3c3c3c;
          border-radius: 4px;
          padding: 10px;
        }

        .env-group-title {
          font-size: 11px;
          color: #c586c0;
          text-transform: uppercase;
          margin-bottom: 8px;
          font-weight: 600;
        }

        .env-item {
          font-size: 12px;
          margin-bottom: 4px;
        }

        .env-label {
          color: #808080;
        }

        /* QA 확장 스타일 - 성능 메트릭 */
        .perf-section {
          background: #2d2d2d;
          border: 1px solid #3c3c3c;
          border-radius: 6px;
          padding: 12px;
          margin-bottom: 12px;
        }

        .perf-section h4 {
          font-size: 13px;
          color: #4ec9b0;
          margin-bottom: 10px;
        }

        .perf-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 8px;
        }

        .perf-item {
          background: #1e1e1e;
          border: 1px solid #3c3c3c;
          border-radius: 4px;
          padding: 8px 12px;
          text-align: center;
        }

        .perf-label {
          display: block;
          font-size: 10px;
          color: #808080;
          margin-bottom: 4px;
        }

        .perf-value {
          font-size: 14px;
          font-weight: 600;
          color: #569cd6;
        }

        .perf-badge {
          font-size: 10px;
          color: #9cdcfe;
          margin-left: 4px;
        }

        /* QA 확장 스타일 - 실패 분석 */
        .failure-analysis {
          background: rgba(241, 76, 76, 0.1);
          border-left: 3px solid #f14c4c;
          padding: 12px;
          margin: 8px 0;
          border-radius: 0 4px 4px 0;
        }

        .failure-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }

        .failure-type {
          font-weight: 600;
          color: #f14c4c;
        }

        .failure-severity {
          font-size: 10px;
          padding: 2px 6px;
          border-radius: 4px;
          font-weight: 600;
        }

        .severity-critical { background: #f14c4c; color: #1e1e1e; }
        .severity-high { background: #ce9178; color: #1e1e1e; }
        .severity-medium { background: #dcdcaa; color: #1e1e1e; }
        .severity-low { background: #3c3c3c; color: #d4d4d4; }

        .failure-context {
          font-size: 12px;
          color: #9cdcfe;
          margin-bottom: 8px;
        }

        .failure-suggestion {
          font-size: 12px;
          color: #4ec9b0;
          background: rgba(78, 201, 176, 0.1);
          padding: 6px 10px;
          border-radius: 4px;
          margin-bottom: 8px;
        }

        .failure-stack {
          font-family: 'Consolas', 'Monaco', monospace;
          font-size: 11px;
          background: #1e1e1e;
          padding: 8px;
          border-radius: 4px;
          overflow-x: auto;
          color: #808080;
          max-height: 100px;
          overflow-y: auto;
          border: 1px solid #3c3c3c;
        }

        .has-failure-analysis td {
          border-bottom-color: #f14c4c;
        }

        .failure-row td {
          padding: 0;
          border-bottom: 1px solid #3c3c3c;
        }

        /* QA 확장 스타일 - Flaky 테스트 */
        .flaky-section {
          background: rgba(220, 220, 170, 0.1);
          border: 1px solid #dcdcaa;
          border-radius: 6px;
          padding: 16px;
          margin-bottom: 24px;
        }

        .flaky-section h3 {
          color: #dcdcaa;
          font-size: 16px;
          margin-bottom: 12px;
        }

        .flaky-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }

        .flaky-table th,
        .flaky-table td {
          padding: 8px 12px;
          text-align: left;
          border-bottom: 1px solid #3c3c3c;
        }

        .flaky-table th {
          background: #2d2d2d;
          color: #d4d4d4;
        }

        .flaky-score {
          font-weight: 600;
          color: #ce9178;
        }

        .footer {
          text-align: center;
          padding: 24px;
          color: #808080;
          font-size: 12px;
          border-top: 1px solid #3c3c3c;
          margin-top: 24px;
        }

        @media print {
          /* 기본 배경/텍스트 */
          body {
            background: white !important;
            color: #1e1e1e !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          /* 컨테이너 */
          .report-container {
            max-width: 100% !important;
            padding: 0 !important;
          }

          /* 헤더/카드/섹션 배경 */
          .report-header,
          .stat-card,
          .scenario-section,
          .device-section,
          .env-section,
          .env-group,
          .perf-section,
          .perf-item {
            background: #f8f8f8 !important;
            border: 1px solid #ccc !important;
          }

          .scenario-header,
          .device-header {
            border-color: #333 !important;
          }

          /* 상태별 헤더 배경 (인쇄에서도 구분) */
          .scenario-header.status-passed { background: rgba(0, 128, 0, 0.1) !important; border-left-color: #008000 !important; }
          .scenario-header.status-failed { background: rgba(200, 0, 0, 0.1) !important; border-left-color: #cc0000 !important; }
          .scenario-header.status-partial { background: rgba(200, 150, 0, 0.1) !important; border-left-color: #cc9900 !important; }
          .device-header.status-passed { background: rgba(0, 128, 0, 0.15) !important; }
          .device-header.status-failed { background: rgba(200, 0, 0, 0.15) !important; }

          /* 테이블 */
          .steps-table th {
            background: #e8e8e8 !important;
            color: #1e1e1e !important;
          }

          .steps-table td {
            border-color: #ccc !important;
            color: #1e1e1e !important;
          }

          /* 제목 텍스트 */
          .report-title,
          .scenario-name,
          .device-name,
          .env-section h4,
          .perf-section h4,
          .env-group-title,
          .flaky-section h3 {
            color: #1e1e1e !important;
          }

          /* 레이블 텍스트 (회색 → 진한 회색) */
          .meta-label,
          .stat-label,
          .scenario-order,
          .env-label,
          .perf-label,
          .no-steps {
            color: #555 !important;
          }

          /* 값 텍스트 (밝은 색 → 진한 색) */
          .meta-value,
          .scenario-meta,
          .perf-value,
          .screenshot-type,
          .confidence {
            color: #0066cc !important;
          }

          .stat-value {
            color: #0066cc !important;
          }

          .stat-card.success .stat-value { color: #008000 !important; }
          .stat-card.failed .stat-value { color: #cc0000 !important; }
          .stat-card.partial .stat-value { color: #cc9900 !important; }

          /* 상태 텍스트 */
          .steps-table .status-passed,
          .status-passed { color: #008000 !important; }
          .steps-table .status-failed,
          .status-failed { color: #cc0000 !important; }
          .steps-table .status-waiting,
          .status-waiting { color: #cc9900 !important; }

          /* 에러 메시지 */
          .error-message,
          .device-error {
            color: #cc0000 !important;
            background: rgba(200, 0, 0, 0.05) !important;
          }

          /* 실패 분석 */
          .failure-analysis {
            background: rgba(200, 0, 0, 0.05) !important;
            border-left-color: #cc0000 !important;
          }
          .failure-type { color: #cc0000 !important; }
          .failure-context { color: #333 !important; }
          .failure-suggestion {
            color: #006600 !important;
            background: rgba(0, 100, 0, 0.05) !important;
          }
          .failure-stack {
            background: #f0f0f0 !important;
            color: #333 !important;
            border-color: #ccc !important;
          }

          /* Flaky 섹션 */
          .flaky-section {
            background: rgba(200, 150, 0, 0.05) !important;
            border-color: #cc9900 !important;
          }

          /* 스크린샷 */
          .screenshot-item {
            page-break-inside: avoid !important;
          }
          .screenshot-info {
            background: rgba(0, 0, 0, 0.7) !important;
            color: white !important;
          }
          .screenshot-info .screenshot-type,
          .screenshot-info .confidence {
            color: white !important;
          }

          /* 푸터 */
          .footer {
            color: #666 !important;
            border-top-color: #ccc !important;
          }

          /* ===== 페이지 분할 규칙 ===== */

          /* 섹션 내부에서 분할 방지 */
          .scenario-section,
          .device-section,
          .env-section,
          .perf-section,
          .stat-card {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }

          /* 헤더 다음에 분할 방지 */
          .scenario-header,
          .device-header,
          h1, h2, h3, h4 {
            page-break-after: avoid !important;
            break-after: avoid !important;
          }

          /* 시나리오 섹션 전에 분할 허용 */
          .scenario-section {
            page-break-before: auto !important;
          }

          /* 테이블 행 분할 방지 */
          .steps-table tr {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }

          /* 테이블 헤더 반복 */
          .steps-table thead {
            display: table-header-group !important;
          }

          /* 스크린샷 그리드 분할 방지 */
          .screenshots-grid {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      </style>
    `;
  }

  /**
   * HTML 생성
   */
  async generateHTML(report: TestReport, options: ExportOptions): Promise<string> {
    const scenarioSections = await Promise.all(
      report.scenarioResults.map((scenario) =>
        this._generateScenarioSectionHtml(scenario, options.includeScreenshots)
      )
    );

    const html = `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>테스트 리포트 - ${report.executionInfo.testName || report.id}</title>
  ${this._getStyles()}
</head>
<body>
  <div class="report-container">
    <header class="report-header">
      <h1 class="report-title">${report.executionInfo.testName || '테스트 리포트'}</h1>
      <div class="report-meta">
        <div class="meta-item">
          <span class="meta-label">리포트 ID</span>
          <span class="meta-value">${report.id}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">요청자</span>
          <span class="meta-value">${report.executionInfo.requesterName || '-'}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">시작 시간</span>
          <span class="meta-value">${this._formatDate(report.startedAt)}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">완료 시간</span>
          <span class="meta-value">${this._formatDate(report.completedAt)}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">상태</span>
          <span class="meta-value ${this._getStatusClass(report.status)}">${this._getStatusText(report.status)}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">평균 소요시간</span>
          <span class="meta-value">${this._formatDuration(report.stats.totalDuration)}</span>
        </div>
      </div>
    </header>

    <section class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${report.stats.totalScenarios}</div>
        <div class="stat-label">전체 시나리오</div>
      </div>
      <div class="stat-card success">
        <div class="stat-value">${report.stats.passedScenarios}</div>
        <div class="stat-label">성공</div>
      </div>
      <div class="stat-card failed">
        <div class="stat-value">${report.stats.failedScenarios}</div>
        <div class="stat-label">실패</div>
      </div>
      <div class="stat-card partial">
        <div class="stat-value">${report.stats.partialScenarios}</div>
        <div class="stat-label">일부 성공</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${report.stats.totalDevices}</div>
        <div class="stat-label">디바이스</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${report.stats.passedSteps}/${report.stats.totalSteps}</div>
        <div class="stat-label">단계 (성공/전체)</div>
      </div>
    </section>

    ${this._generateFlakySummaryHtml(report.flakyAnalysis)}

    <section class="scenarios">
      ${scenarioSections.join('')}
    </section>

    <footer class="footer">
      Generated by Game Automation Tool &bull; ${this._formatDate(new Date().toISOString())}
    </footer>
  </div>
</body>
</html>
    `;

    return html;
  }

  /**
   * PDF 생성
   */
  async generatePDF(report: TestReport, options: ExportOptions): Promise<Buffer> {
    // HTML 먼저 생성
    console.log('[ReportExporter] HTML 생성 중...');
    const html = await this.generateHTML(report, options);
    console.log(`[ReportExporter] HTML 생성 완료 (${(html.length / 1024).toFixed(1)}KB)`);

    // Puppeteer로 PDF 변환
    console.log('[ReportExporter] Puppeteer 브라우저 시작...');
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',  // 메모리 부족 방지
        '--disable-gpu',
      ],
    });

    try {
      const page = await browser.newPage();

      // 타임아웃 증가 및 대기 조건 완화
      // Base64 이미지는 네트워크 요청이 아니므로 domcontentloaded로 충분
      console.log('[ReportExporter] HTML 콘텐츠 설정 중...');
      await page.setContent(html, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,  // 60초
      });

      console.log('[ReportExporter] PDF 생성 중...');
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
        timeout: 120000,  // 2분
      });

      console.log(`[ReportExporter] PDF 생성 완료 (${(pdfBuffer.length / 1024).toFixed(1)}KB)`);
      return Buffer.from(pdfBuffer);
    } finally {
      await browser.close();
    }
  }

  // ========== Suite 리포트 내보내기 ==========

  /**
   * Suite 환경 정보 HTML 생성
   */
  private _generateSuiteEnvironmentHtml(env?: DeviceSuiteEnvironment, appInfo?: AppSuiteInfo): string {
    if (!env && !appInfo) return '';

    let html = '<div class="env-section"><h4>환경 정보</h4><div class="env-grid">';

    if (env) {
      html += `
        <div class="env-group">
          <div class="env-group-title">디바이스</div>
          <div class="env-item"><span class="env-label">모델:</span> ${env.brand} ${env.model}</div>
          <div class="env-item"><span class="env-label">Android:</span> ${env.androidVersion} (SDK ${env.sdkVersion})</div>
          <div class="env-item"><span class="env-label">해상도:</span> ${env.screenResolution}</div>
        </div>
        <div class="env-group">
          <div class="env-group-title">상태</div>
          <div class="env-item"><span class="env-label">배터리:</span> ${env.batteryLevel}% (${env.batteryStatus})</div>
          <div class="env-item"><span class="env-label">메모리:</span> ${env.availableMemory}MB / ${env.totalMemory}MB</div>
          <div class="env-item"><span class="env-label">네트워크:</span> ${env.networkType}</div>
        </div>
      `;
    }

    if (appInfo) {
      html += `
        <div class="env-group">
          <div class="env-group-title">앱 정보</div>
          <div class="env-item"><span class="env-label">패키지:</span> ${appInfo.packageName}</div>
          ${appInfo.appName ? `<div class="env-item"><span class="env-label">앱 이름:</span> ${appInfo.appName}</div>` : ''}
          ${appInfo.versionName ? `<div class="env-item"><span class="env-label">버전:</span> ${appInfo.versionName} (${appInfo.versionCode || '-'})</div>` : ''}
        </div>
      `;
    }

    html += '</div></div>';
    return html;
  }

  /**
   * Suite 스텝 테이블 HTML 생성
   */
  private _generateSuiteStepsTableHtml(steps: StepSuiteResult[]): string {
    // waiting 상태는 중간 상태이므로 제외
    const filteredSteps = steps.filter((s) => s.status !== 'waiting');

    if (filteredSteps.length === 0) {
      return '<p class="no-steps">실행된 단계가 없습니다.</p>';
    }

    const rows = filteredSteps
      .map((step, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td>${step.nodeName || step.nodeId}</td>
          <td>${step.actionType}</td>
          <td class="${this._getStatusClass(step.status)}">${this._getStatusText(step.status)}</td>
          <td>${step.duration !== undefined ? this._formatDuration(step.duration) : '-'}</td>
          <td class="error-message">${step.error || '-'}</td>
        </tr>
      `)
      .join('');

    return `
      <table class="steps-table">
        <thead>
          <tr>
            <th>#</th>
            <th>단계명</th>
            <th>액션</th>
            <th>상태</th>
            <th>소요시간</th>
            <th>에러</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    `;
  }

  /**
   * Suite 스크린샷 그리드 HTML 생성
   */
  private async _generateSuiteScreenshotsHtml(
    screenshots: SuiteScreenshotInfo[],
    includeScreenshots: boolean
  ): Promise<string> {
    if (!includeScreenshots || screenshots.length === 0) {
      return '';
    }

    const screenshotItems = await Promise.all(
      screenshots.map(async (ss) => {
        const dataUri = await this._toBase64DataUri(ss.path);
        if (!dataUri) return '';

        const typeText =
          ss.type === 'highlight'
            ? '이미지 인식'
            : ss.type === 'failed'
              ? '실패 시점'
              : ss.type === 'final'
                ? '완료'
                : ss.type === 'error'
                  ? '에러'
                  : '단계';

        return `
          <div class="screenshot-item">
            <img src="${dataUri}" alt="Screenshot" />
            <div class="screenshot-info">
              <span class="screenshot-type">${typeText}</span>
              ${ss.confidence ? `<span class="confidence">${(ss.confidence * 100).toFixed(1)}%</span>` : ''}
            </div>
          </div>
        `;
      })
    );

    const validItems = screenshotItems.filter((item) => item);
    if (validItems.length === 0) return '';

    return `
      <div class="screenshots-section">
        <h4>스크린샷</h4>
        <div class="screenshots-grid">
          ${validItems.join('')}
        </div>
      </div>
    `;
  }

  /**
   * Suite 시나리오 섹션 HTML 생성
   */
  private async _generateSuiteScenarioHtml(
    scenario: ScenarioSuiteResult,
    includeScreenshots: boolean
  ): Promise<string> {
    const screenshotsHtml = await this._generateSuiteScreenshotsHtml(
      scenario.screenshots,
      includeScreenshots
    );

    return `
      <div class="scenario-card">
        <div class="scenario-card-header ${this._getStatusClass(scenario.status)}">
          <span class="scenario-card-name">${scenario.scenarioName}</span>
          <span class="scenario-card-status">${this._getStatusText(scenario.status)}</span>
          <span class="scenario-card-duration">${this._formatDuration(scenario.duration)}</span>
        </div>
        ${scenario.error ? `<div class="scenario-error">${scenario.error}</div>` : ''}
        ${this._generateSuiteStepsTableHtml(scenario.stepResults)}
        ${screenshotsHtml}
      </div>
    `;
  }

  /**
   * Suite 디바이스 섹션 HTML 생성
   */
  private async _generateSuiteDeviceSectionHtml(
    device: DeviceSuiteResult,
    includeScreenshots: boolean
  ): Promise<string> {
    const scenarioSections = await Promise.all(
      device.scenarioResults.map((scenario) =>
        this._generateSuiteScenarioHtml(scenario, includeScreenshots)
      )
    );

    const environmentHtml = this._generateSuiteEnvironmentHtml(device.environment, device.appInfo);

    const passRate = device.stats.total > 0
      ? ((device.stats.passed / device.stats.total) * 100).toFixed(1)
      : '0';

    return `
      <div class="device-section">
        <div class="device-header ${device.stats.failed > 0 ? 'status-failed' : 'status-passed'}">
          <span class="device-name">${device.deviceName || device.deviceId}</span>
          <span class="device-stats">${device.stats.passed}/${device.stats.total} 성공 (${passRate}%)</span>
          <span class="device-duration">${this._formatDuration(device.duration)}</span>
        </div>
        ${environmentHtml}
        <div class="device-scenarios">
          ${scenarioSections.join('')}
        </div>
      </div>
    `;
  }

  /**
   * Suite HTML 생성
   */
  async generateSuiteHTML(report: SuiteExecutionResult, options: ExportOptions): Promise<string> {
    const deviceSections = await Promise.all(
      report.deviceResults.map((device) =>
        this._generateSuiteDeviceSectionHtml(device, options.includeScreenshots)
      )
    );

    const passRate = report.stats.totalExecutions > 0
      ? ((report.stats.passed / report.stats.totalExecutions) * 100).toFixed(1)
      : '0';

    const html = `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Suite 리포트 - ${report.suiteName}</title>
  ${this._getStyles()}
  <style>
    /* Suite 전용 추가 스타일 */
    .scenario-card {
      background: #1e1e1e;
      border: 1px solid #3c3c3c;
      border-radius: 6px;
      margin-bottom: 16px;
      overflow: hidden;
    }

    .scenario-card:last-child {
      margin-bottom: 0;
    }

    .scenario-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      border-left: 4px solid #3c3c3c;
    }

    .scenario-card-header.status-passed { border-color: #4ec9b0; background: rgba(78, 201, 176, 0.1); }
    .scenario-card-header.status-failed { border-color: #f14c4c; background: rgba(241, 76, 76, 0.1); }
    .scenario-card-header.status-skipped { border-color: #808080; background: rgba(128, 128, 128, 0.1); }

    .scenario-card-name {
      font-weight: 600;
      color: #dcdcaa;
    }

    .scenario-card-status {
      font-size: 13px;
    }

    .scenario-card-duration {
      font-size: 13px;
      color: #808080;
    }

    .scenario-error {
      background: rgba(241, 76, 76, 0.15);
      color: #f14c4c;
      padding: 8px 16px;
      font-size: 13px;
      border-left: 3px solid #f14c4c;
    }

    .device-scenarios {
      padding: 16px;
    }

    .device-stats {
      font-size: 14px;
      color: #9cdcfe;
    }

    /* Suite 전용 인쇄 스타일 */
    @media print {
      .scenario-card {
        background: #f8f8f8 !important;
        border-color: #ccc !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }

      .scenario-card-header {
        page-break-after: avoid !important;
        break-after: avoid !important;
      }

      .scenario-card-header.status-passed {
        border-color: #008000 !important;
        background: rgba(0, 128, 0, 0.1) !important;
      }
      .scenario-card-header.status-failed {
        border-color: #cc0000 !important;
        background: rgba(200, 0, 0, 0.1) !important;
      }
      .scenario-card-header.status-skipped {
        border-color: #666 !important;
        background: rgba(100, 100, 100, 0.1) !important;
      }

      .scenario-card-name {
        color: #1e1e1e !important;
      }

      .scenario-card-duration,
      .device-stats {
        color: #555 !important;
      }

      .scenario-error {
        background: rgba(200, 0, 0, 0.05) !important;
        color: #cc0000 !important;
        border-left-color: #cc0000 !important;
      }
    }
  </style>
</head>
<body>
  <div class="report-container">
    <header class="report-header">
      <h1 class="report-title">📦 ${report.suiteName}</h1>
      <div class="report-meta">
        <div class="meta-item">
          <span class="meta-label">리포트 ID</span>
          <span class="meta-value">${report.id}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Suite ID</span>
          <span class="meta-value">${report.suiteId}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">시작 시간</span>
          <span class="meta-value">${this._formatDate(report.startedAt)}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">완료 시간</span>
          <span class="meta-value">${this._formatDate(report.completedAt)}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">성공률</span>
          <span class="meta-value ${report.stats.failed > 0 ? 'status-failed' : 'status-passed'}">${passRate}%</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">총 소요시간</span>
          <span class="meta-value">${this._formatDuration(report.totalDuration)}</span>
        </div>
      </div>
    </header>

    <section class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${report.stats.totalDevices}</div>
        <div class="stat-label">디바이스</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${report.stats.totalScenarios}</div>
        <div class="stat-label">시나리오</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${report.stats.totalExecutions}</div>
        <div class="stat-label">총 실행 수</div>
      </div>
      <div class="stat-card success">
        <div class="stat-value">${report.stats.passed}</div>
        <div class="stat-label">성공</div>
      </div>
      <div class="stat-card failed">
        <div class="stat-value">${report.stats.failed}</div>
        <div class="stat-label">실패</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${report.stats.skipped}</div>
        <div class="stat-label">건너뜀</div>
      </div>
    </section>

    <section class="devices">
      ${deviceSections.join('')}
    </section>

    <footer class="footer">
      Generated by Game Automation Tool &bull; ${this._formatDate(new Date().toISOString())}
    </footer>
  </div>
</body>
</html>
    `;

    return html;
  }

  /**
   * Suite PDF 생성
   */
  async generateSuitePDF(report: SuiteExecutionResult, options: ExportOptions): Promise<Buffer> {
    console.log('[ReportExporter] Suite HTML 생성 중...');
    const html = await this.generateSuiteHTML(report, options);
    console.log(`[ReportExporter] Suite HTML 생성 완료 (${(html.length / 1024).toFixed(1)}KB)`);

    console.log('[ReportExporter] Puppeteer 브라우저 시작...');
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });

    try {
      const page = await browser.newPage();

      console.log('[ReportExporter] Suite HTML 콘텐츠 설정 중...');
      await page.setContent(html, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });

      console.log('[ReportExporter] Suite PDF 생성 중...');
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
        timeout: 120000,
      });

      console.log(`[ReportExporter] Suite PDF 생성 완료 (${(pdfBuffer.length / 1024).toFixed(1)}KB)`);
      return Buffer.from(pdfBuffer);
    } finally {
      await browser.close();
    }
  }
}

export const reportExporter = new ReportExporter();
