// frontend/src/components/SlackSettings/SlackSettings.tsx
// Slack 알림 설정 상태 확인 컴포넌트 (읽기 전용)

import { useState, useEffect } from 'react';
import { apiClient, API_BASE_URL } from '../../config/api';
import './SlackSettings.css';

interface SlackSettingsData {
  isConfigured: boolean;
  hasWebhook: boolean;
  hasBotToken: boolean;
  notifyOnSuccess: boolean;
  notifyOnFailure: boolean;
  notifyOnPartial: boolean;
  mentionOnFailure: boolean;
  r2Enabled: boolean;
  r2PublicUrl: string;
}

export default function SlackSettings() {
  const [settings, setSettings] = useState<SlackSettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await apiClient.get(`${API_BASE_URL}/api/slack/settings`);
      if (response.data.success) {
        setSettings(response.data.data);
      }
    } catch (error) {
      console.error('Failed to fetch Slack settings:', error);
      showMessage('error', '설정을 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const handleTestConnection = async () => {
    setTesting(true);
    try {
      const response = await apiClient.post(`${API_BASE_URL}/api/slack/test`);
      if (response.data.success) {
        showMessage('success', '테스트 메시지가 전송되었습니다. Slack을 확인해주세요.');
      } else {
        showMessage('error', response.data.message || '연결 테스트에 실패했습니다.');
      }
    } catch (error) {
      console.error('Failed to test connection:', error);
      showMessage('error', '연결 테스트에 실패했습니다.');
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return <div className="slack-settings loading">설정 로딩 중...</div>;
  }

  return (
    <div className="slack-settings">
      <h2>Slack 알림 설정</h2>

      {message && (
        <div className={`message ${message.type}`}>
          {message.text}
        </div>
      )}

      {/* 연결 상태 */}
      <div className="settings-section">
        <h3>연결 상태</h3>
        <div className="status-indicator">
          <span className={`status-dot ${settings?.isConfigured ? 'connected' : 'disconnected'}`} />
          <span>{settings?.isConfigured ? '연결됨' : '미설정'}</span>
        </div>

        {settings?.isConfigured && (
          <div className="connection-details">
            {settings.hasWebhook && <span className="configured-badge">Webhook</span>}
            {settings.hasBotToken && <span className="configured-badge">Bot Token</span>}
          </div>
        )}

        {settings?.isConfigured && (
          <button
            className="btn-test"
            onClick={handleTestConnection}
            disabled={testing}
          >
            {testing ? '테스트 중...' : '연결 테스트'}
          </button>
        )}
      </div>

      {/* 알림 설정 상태 */}
      <div className="settings-section">
        <h3>알림 조건</h3>
        <div className="settings-list">
          <div className="setting-item">
            <span className={`setting-indicator ${settings?.notifyOnSuccess ? 'enabled' : 'disabled'}`} />
            <span>성공 시 알림</span>
          </div>
          <div className="setting-item">
            <span className={`setting-indicator ${settings?.notifyOnFailure ? 'enabled' : 'disabled'}`} />
            <span>실패 시 알림</span>
          </div>
          <div className="setting-item">
            <span className={`setting-indicator ${settings?.notifyOnPartial ? 'enabled' : 'disabled'}`} />
            <span>부분 성공 시 알림</span>
          </div>
          <div className="setting-item">
            <span className={`setting-indicator ${settings?.mentionOnFailure ? 'enabled' : 'disabled'}`} />
            <span>실패 시 @channel 멘션</span>
          </div>
        </div>
      </div>

      {/* R2 클라우드 스토리지 상태 */}
      <div className="settings-section">
        <h3>리포트 공유 (R2)</h3>
        <div className="status-indicator">
          <span className={`status-dot ${settings?.r2Enabled ? 'connected' : 'disconnected'}`} />
          <span>{settings?.r2Enabled ? '활성화됨' : '비활성화'}</span>
        </div>
        {settings?.r2Enabled && settings?.r2PublicUrl && (
          <p className="description" style={{ marginTop: 8 }}>
            리포트 URL: <code>{settings.r2PublicUrl}</code>
          </p>
        )}
        {!settings?.r2Enabled && (
          <p className="description" style={{ marginTop: 8, color: 'var(--text-secondary)' }}>
            R2 활성화 시 Slack 알림에 공개 리포트 링크가 포함됩니다.
          </p>
        )}
      </div>

      {/* 설정 방법 안내 */}
      <div className="settings-section info">
        <h3>설정 방법</h3>
        <p className="description">
          Slack 알림은 서버의 <code>.env</code> 파일에서 설정합니다.
        </p>
        <pre className="env-example">
{`# .env 파일에 추가
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx/yyy/zzz

# 알림 옵션 (선택)
SLACK_NOTIFY_ON_SUCCESS=true
SLACK_NOTIFY_ON_FAILURE=true
SLACK_MENTION_ON_FAILURE=true

# R2 클라우드 스토리지 (리포트 공유용)
R2_ENABLED=true
R2_ACCOUNT_ID=your_cloudflare_account_id
R2_ACCESS_KEY_ID=your_r2_access_key
R2_SECRET_ACCESS_KEY=your_r2_secret_key
R2_BUCKET_NAME=qa-reports
R2_PUBLIC_URL=https://reports.your-domain.com`}
        </pre>
        <p className="description">
          <a href="https://api.slack.com/messaging/webhooks" target="_blank" rel="noopener noreferrer">
            Webhook URL 생성 방법 보기
          </a>
        </p>
      </div>

      {/* 알림 예시 */}
      {settings?.isConfigured && (
        <div className="settings-section info">
          <h3>알림 예시</h3>
          <div className="notification-preview">
            <div className="preview-header success">
              <span className="emoji">:white_check_mark:</span>
              <span>테스트 성공: 로그인 테스트</span>
            </div>
            <div className="preview-content">
              <div className="preview-field">
                <strong>시나리오</strong>
                <span>5/5 성공</span>
              </div>
              <div className="preview-field">
                <strong>디바이스</strong>
                <span>3/3 성공</span>
              </div>
              <div className="preview-field">
                <strong>소요 시간</strong>
                <span>2분 34초</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
