// backend/src/services/slackNotificationService.ts
// Slack 알림 서비스 (환경 변수 기반 설정)
// 테스트 완료/실패 시 Slack으로 결과 전송
// R2 활성화 시 HTML 리포트를 업로드하여 공개 URL 제공

import { TestReport, ScenarioReportResult } from '../types/testReport';
import { SuiteExecutionResult } from '../types/suite';
import { r2Uploader } from './r2Uploader';
import { reportExporter } from './reportExporter';

// Slack Block Kit 타입
interface SlackBlock {
  type: string;
  text?: {
    type: string;
    text: string;
    emoji?: boolean;
  };
  fields?: Array<{
    type: string;
    text: string;
  }>;
  elements?: Array<{
    type: string;
    text?: {
      type: string;
      text: string;
      emoji?: boolean;
    };
    url?: string;
    action_id?: string;
  }>;
}

interface SlackMessage {
  text: string;  // Fallback text
  blocks: SlackBlock[];
}

class SlackNotificationService {
  /**
   * 환경 변수에서 설정 읽기
   */
  private get webhookUrl(): string | undefined {
    return process.env.SLACK_WEBHOOK_URL;
  }

  private get botToken(): string | undefined {
    return process.env.SLACK_BOT_TOKEN;
  }

  private get defaultChannelId(): string | undefined {
    return process.env.SLACK_DEFAULT_CHANNEL_ID;
  }

  private get notifyOnSuccess(): boolean {
    return process.env.SLACK_NOTIFY_ON_SUCCESS !== 'false';
  }

  private get notifyOnFailure(): boolean {
    return process.env.SLACK_NOTIFY_ON_FAILURE !== 'false';
  }

  private get notifyOnPartial(): boolean {
    return process.env.SLACK_NOTIFY_ON_PARTIAL !== 'false';
  }

  private get mentionOnFailure(): boolean {
    return process.env.SLACK_MENTION_ON_FAILURE !== 'false';
  }

  /**
   * 설정 여부 확인
   */
  isConfigured(): boolean {
    return !!(this.webhookUrl || (this.botToken && this.defaultChannelId));
  }

  /**
   * 현재 설정 상태 조회 (민감 정보 마스킹)
   */
  getSettings(): {
    isConfigured: boolean;
    hasWebhook: boolean;
    hasBotToken: boolean;
    notifyOnSuccess: boolean;
    notifyOnFailure: boolean;
    notifyOnPartial: boolean;
    mentionOnFailure: boolean;
    r2Enabled: boolean;
    r2PublicUrl: string;
  } {
    const r2Status = r2Uploader.getStatus();
    return {
      isConfigured: this.isConfigured(),
      hasWebhook: !!this.webhookUrl,
      hasBotToken: !!this.botToken,
      notifyOnSuccess: this.notifyOnSuccess,
      notifyOnFailure: this.notifyOnFailure,
      notifyOnPartial: this.notifyOnPartial,
      mentionOnFailure: this.mentionOnFailure,
      r2Enabled: r2Status.configured,
      r2PublicUrl: r2Status.publicUrl,
    };
  }

  /**
   * Slack Webhook으로 메시지 전송
   */
  private async sendWebhook(message: SlackMessage): Promise<boolean> {
    if (!this.webhookUrl) {
      return false;
    }

    try {
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[SlackNotification] Webhook 전송 실패:', errorText);
        return false;
      }

      console.log('[SlackNotification] Webhook 전송 성공');
      return true;
    } catch (error) {
      console.error('[SlackNotification] Webhook 전송 오류:', error);
      return false;
    }
  }

  /**
   * Slack Bot API로 메시지 전송
   */
  private async sendBotMessage(channelId: string, message: SlackMessage): Promise<boolean> {
    if (!this.botToken) {
      return false;
    }

    try {
      const response = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.botToken}`,
        },
        body: JSON.stringify({
          channel: channelId,
          text: message.text,
          blocks: message.blocks,
        }),
      });

      const result = await response.json() as { ok: boolean; error?: string };

      if (!result.ok) {
        console.error('[SlackNotification] Bot 메시지 전송 실패:', result.error);
        return false;
      }

      console.log('[SlackNotification] Bot 메시지 전송 성공');
      return true;
    } catch (error) {
      console.error('[SlackNotification] Bot 메시지 전송 오류:', error);
      return false;
    }
  }

  /**
   * 사용자에게 DM 전송
   */
  async sendDM(slackUserId: string, message: SlackMessage): Promise<boolean> {
    if (!this.botToken) {
      return false;
    }

    try {
      // conversations.open으로 DM 채널 ID 획득
      const openResponse = await fetch('https://slack.com/api/conversations.open', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.botToken}`,
        },
        body: JSON.stringify({ users: slackUserId }),
      });

      const openResult = await openResponse.json() as { ok: boolean; channel?: { id: string }; error?: string };

      if (!openResult.ok || !openResult.channel) {
        console.error('[SlackNotification] DM 채널 열기 실패:', openResult.error);
        return false;
      }

      // DM 채널로 메시지 전송
      return await this.sendBotMessage(openResult.channel.id, message);
    } catch (error) {
      console.error('[SlackNotification] DM 전송 오류:', error);
      return false;
    }
  }

  /**
   * 테스트 완료 알림 전송
   * R2 활성화 시 HTML 리포트를 업로드하고 공개 URL 포함
   */
  async notifyTestComplete(
    report: TestReport,
    options?: {
      reportUrl?: string;
      requesterSlackId?: string;
    }
  ): Promise<void> {
    if (!this.isConfigured()) {
      return;
    }

    const isSuccess = report.status === 'completed' && report.stats.failedScenarios === 0;
    const isPartial = report.status === 'partial';
    const isFailure = report.status === 'failed' || report.stats.failedScenarios > 0;

    // 알림 조건 확인
    if (isSuccess && !this.notifyOnSuccess) return;
    if (isPartial && !this.notifyOnPartial) return;
    if (isFailure && !this.notifyOnFailure) return;

    // R2 활성화 시 HTML 리포트 업로드 (R2 URL 우선)
    let reportUrl = options?.reportUrl;
    if (r2Uploader.isEnabled()) {
      try {
        const htmlContent = await reportExporter.generateHTML(report, {
          includeScreenshots: true,
        });
        const uploadedUrl = await r2Uploader.uploadReport(report.id, htmlContent, 'test');
        if (uploadedUrl) {
          reportUrl = uploadedUrl;  // R2 URL로 덮어쓰기
          console.log(`[SlackNotification] 리포트 업로드 완료: ${reportUrl}`);
        }
      } catch (error) {
        console.error('[SlackNotification] 리포트 업로드 실패:', error);
        // 실패 시 기존 reportUrl 유지
      }
    }

    const message = this.buildTestReportMessage(report, { ...options, reportUrl });

    // Webhook 또는 Bot으로 전송
    if (this.webhookUrl) {
      await this.sendWebhook(message);
    } else if (this.botToken && this.defaultChannelId) {
      await this.sendBotMessage(this.defaultChannelId, message);
    }

    // 요청자에게 DM 전송 (실패 시)
    if (isFailure && options?.requesterSlackId && this.botToken) {
      await this.sendDM(options.requesterSlackId, message);
    }
  }

  /**
   * Suite 완료 알림 전송
   * R2 활성화 시 HTML 리포트를 업로드하고 공개 URL 포함
   */
  async notifySuiteComplete(
    result: SuiteExecutionResult,
    options?: {
      reportUrl?: string;
      requesterSlackId?: string;
      requesterName?: string;
    }
  ): Promise<void> {
    if (!this.isConfigured()) {
      return;
    }

    const isSuccess = result.stats.failed === 0;
    const isPartial = result.stats.failed > 0 && result.stats.passed > 0;

    // 알림 조건 확인
    if (isSuccess && !this.notifyOnSuccess) return;
    if (isPartial && !this.notifyOnPartial) return;
    if (!isSuccess && !this.notifyOnFailure) return;

    // R2 활성화 시 HTML 리포트 업로드 (R2 URL 우선)
    let reportUrl = options?.reportUrl;
    if (r2Uploader.isEnabled()) {
      try {
        const htmlContent = await reportExporter.generateSuiteHTML(result, {
          includeScreenshots: true,
        });
        const uploadedUrl = await r2Uploader.uploadReport(result.id, htmlContent, 'suite');
        if (uploadedUrl) {
          reportUrl = uploadedUrl;  // R2 URL로 덮어쓰기
          console.log(`[SlackNotification] Suite 리포트 업로드 완료: ${reportUrl}`);
        }
      } catch (error) {
        console.error('[SlackNotification] Suite 리포트 업로드 실패:', error);
        // 실패 시 기존 reportUrl 유지
      }
    }

    const message = this.buildSuiteReportMessage(result, { ...options, reportUrl });

    // Webhook 또는 Bot으로 전송
    if (this.webhookUrl) {
      await this.sendWebhook(message);
    } else if (this.botToken && this.defaultChannelId) {
      await this.sendBotMessage(this.defaultChannelId, message);
    }

    // 요청자에게 DM 전송 (실패 시)
    if (!isSuccess && options?.requesterSlackId && this.botToken) {
      await this.sendDM(options.requesterSlackId, message);
    }
  }

  /**
   * 테스트 리포트 메시지 빌드 (Block Kit)
   */
  private buildTestReportMessage(
    report: TestReport,
    options?: { reportUrl?: string; requesterSlackId?: string }
  ): SlackMessage {
    const { stats, executionInfo, status } = report;
    const isSuccess = status === 'completed' && stats.failedScenarios === 0;
    const emoji = isSuccess ? ':white_check_mark:' : ':x:';
    const statusText = isSuccess ? '성공' : status === 'partial' ? '부분 성공' : '실패';

    // 실패한 시나리오 목록
    const failedScenarios = report.scenarioResults
      .filter(s => s.status === 'failed')
      .slice(0, 3);

    const testName = executionInfo?.testName || '테스트';
    const requesterName = executionInfo?.requesterName || '알 수 없음';
    const duration = this.formatDuration(stats.totalDuration);

    // 요청자 표시: Slack ID가 있으면 멘션, 없으면 이름만
    const requesterDisplay = options?.requesterSlackId
      ? `<@${options.requesterSlackId}>`
      : requesterName;

    const blocks: SlackBlock[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${emoji} 테스트 ${statusText}: ${testName}`,
          emoji: true,
        },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*시나리오*\n${stats.passedScenarios}/${stats.totalScenarios} 성공` },
          { type: 'mrkdwn', text: `*디바이스*\n${stats.successDevices}/${stats.totalDevices} 성공` },
          { type: 'mrkdwn', text: `*소요 시간*\n${duration}` },
          { type: 'mrkdwn', text: `*요청자*\n${requesterDisplay}` },
        ],
      },
    ];

    // 실패한 시나리오 표시
    if (failedScenarios.length > 0) {
      const failedList = failedScenarios
        .map(s => `• ${s.scenarioName} (${s.packageName} > ${s.categoryName})`)
        .join('\n');

      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*실패한 시나리오:*\n${failedList}`,
        },
      });

      // 실패 원인 표시 (첫 번째 실패)
      const firstFailure = this.getFirstFailure(failedScenarios);
      if (firstFailure) {
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*실패 원인:*\n\`\`\`${firstFailure}\`\`\``,
          },
        });
      }
    }

    // 리포트 링크 버튼
    if (options?.reportUrl) {
      blocks.push({
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: ':bar_chart: 상세 리포트 보기',
              emoji: true,
            },
            url: options.reportUrl,
            action_id: 'view_report',
          },
        ],
      });
    }

    // 실패 시 @channel 멘션
    let fallbackText = `${emoji} 테스트 ${statusText}: ${testName}`;
    if (!isSuccess && this.mentionOnFailure) {
      fallbackText = `<!channel> ${fallbackText}`;
    }

    return {
      text: fallbackText,
      blocks,
    };
  }

  /**
   * Suite 리포트 메시지 빌드 (Block Kit)
   */
  private buildSuiteReportMessage(
    result: SuiteExecutionResult,
    options?: { reportUrl?: string; requesterSlackId?: string; requesterName?: string }
  ): SlackMessage {
    const { stats, suiteName } = result;
    const isSuccess = stats.failed === 0;
    const emoji = isSuccess ? ':white_check_mark:' : ':x:';
    const statusText = isSuccess ? '성공' : '실패';
    const duration = this.formatDuration(result.totalDuration);

    // 요청자 표시: Slack ID가 있으면 멘션, 없으면 이름만
    const requesterDisplay = options?.requesterSlackId
      ? `<@${options.requesterSlackId}>`
      : (options?.requesterName || '-');

    // 실패한 디바이스/시나리오
    const failures: string[] = [];
    for (const device of result.deviceResults) {
      for (const scenario of device.scenarioResults) {
        if (scenario.status === 'failed') {
          failures.push(`${device.deviceName}: ${scenario.scenarioName}`);
        }
      }
    }

    const blocks: SlackBlock[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${emoji} Suite ${statusText}: ${suiteName}`,
          emoji: true,
        },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*시나리오*\n${stats.passed}/${stats.totalExecutions} 성공` },
          { type: 'mrkdwn', text: `*디바이스*\n${stats.totalDevices}대` },
          { type: 'mrkdwn', text: `*소요 시간*\n${duration}` },
          { type: 'mrkdwn', text: `*요청자*\n${requesterDisplay}` },
        ],
      },
    ];

    // 실패 목록
    if (failures.length > 0) {
      const failedList = failures.slice(0, 5).join('\n• ');
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*실패 목록:*\n• ${failedList}${failures.length > 5 ? `\n...외 ${failures.length - 5}건` : ''}`,
        },
      });
    }

    // 리포트 링크
    if (options?.reportUrl) {
      blocks.push({
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: ':bar_chart: 상세 리포트 보기',
              emoji: true,
            },
            url: options.reportUrl,
            action_id: 'view_suite_report',
          },
        ],
      });
    }

    let fallbackText = `${emoji} Suite ${statusText}: ${suiteName}`;
    if (!isSuccess && this.mentionOnFailure) {
      fallbackText = `<!channel> ${fallbackText}`;
    }

    return {
      text: fallbackText,
      blocks,
    };
  }

  /**
   * 첫 번째 실패 원인 추출
   */
  private getFirstFailure(scenarios: ScenarioReportResult[]): string | null {
    for (const scenario of scenarios) {
      for (const device of scenario.deviceResults) {
        if (!device.success && device.error) {
          return `[${device.deviceName}] ${device.error}`.slice(0, 200);
        }
        for (const step of device.steps || []) {
          if (step.status === 'failed' && step.error) {
            return `[${device.deviceName}] ${step.nodeName}: ${step.error}`.slice(0, 200);
          }
        }
      }
    }
    return null;
  }

  /**
   * 시간 포맷팅 (ms → m:ss)
   */
  private formatDuration(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    if (minutes === 0) {
      return `${seconds}초`;
    }
    return `${minutes}분 ${seconds}초`;
  }

  /**
   * 연결 테스트
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    const testMessage: SlackMessage = {
      text: ':test_tube: QA Automation 알림 연결 테스트',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: ':test_tube: *QA Automation 알림 연결 테스트*\n이 메시지가 보이면 Slack 연동이 정상적으로 설정된 것입니다.',
          },
        },
      ],
    };

    if (this.webhookUrl) {
      const success = await this.sendWebhook(testMessage);
      return {
        success,
        message: success ? 'Webhook 연결 성공' : 'Webhook 연결 실패',
      };
    }

    if (this.botToken && this.defaultChannelId) {
      const success = await this.sendBotMessage(this.defaultChannelId, testMessage);
      return {
        success,
        message: success ? 'Bot 연결 성공' : 'Bot 연결 실패',
      };
    }

    return {
      success: false,
      message: 'SLACK_WEBHOOK_URL 또는 SLACK_BOT_TOKEN이 .env에 설정되지 않았습니다.',
    };
  }
}

// 싱글톤 인스턴스
export const slackNotificationService = new SlackNotificationService();
