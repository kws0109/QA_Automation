// frontend/src/components/LoginPage/LoginPage.tsx
// Slack OAuth 로그인 페이지

import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../../config/api';
import './LoginPage.css';

interface User {
  id: string;
  name: string;
  email?: string;
  avatarUrl?: string;
  teamId: string;
  teamName?: string;
}

interface LoginPageProps {
  onLoginSuccess: (user: User) => void;
}
const AUTH_TOKEN_KEY = 'qa_tool_auth_token';

// 토큰 저장/조회 함수
export function getAuthToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setAuthToken(token: string): void {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearAuthToken(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 페이지 로드 시 인증 상태 확인
  useEffect(() => {
    // URL 파라미터에서 토큰 또는 에러 확인
    const params = new URLSearchParams(window.location.search);
    const loginError = params.get('error');
    const loginMessage = params.get('message');
    const loginSuccess = params.get('login');
    const token = params.get('token');

    if (loginError) {
      setError(loginMessage || '로그인에 실패했습니다.');
      window.history.replaceState({}, '', window.location.pathname);
      setLoading(false);
      return;
    }

    if (loginSuccess === 'success' && token) {
      // 토큰을 localStorage에 저장
      setAuthToken(token);
      window.history.replaceState({}, '', window.location.pathname);
      // 토큰으로 사용자 정보 조회
      checkAuthWithToken(token);
      return;
    }

    // 저장된 토큰으로 인증 확인
    const savedToken = getAuthToken();
    if (savedToken) {
      checkAuthWithToken(savedToken);
    } else {
      setLoading(false);
    }
  }, []);

  const checkAuthWithToken = async (token: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (data.success && data.isAuthenticated) {
        onLoginSuccess(data.user);
      } else {
        clearAuthToken();
        setLoading(false);
      }
    } catch (err) {
      console.error('인증 확인 실패:', err);
      clearAuthToken();
      setLoading(false);
    }
  };

  const handleSlackLogin = () => {
    // Slack OAuth 시작
    window.location.href = `${API_BASE_URL}/auth/slack`;
  };

  if (loading) {
    return (
      <div className="login-page">
        <div className="login-container">
          <div className="login-loading">
            <div className="spinner" />
            <p>인증 확인 중...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <div className="login-logo">
            <svg viewBox="0 0 24 24" fill="currentColor" width="48" height="48">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
          </div>
          <h1>QA Automation Tool</h1>
          <p className="login-subtitle">
            모바일 게임 자동화 테스트 도구
          </p>
        </div>

        {error && (
          <div className="login-error">
            <span className="error-icon">⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <div className="login-body">
          <p className="login-description">
            Slack 계정으로 로그인하여 테스트를 시작하세요.
            <br />
            팀 워크스페이스 멤버만 접근할 수 있습니다.
          </p>

          <button className="slack-login-btn" onClick={handleSlackLogin}>
            <svg className="slack-icon" viewBox="0 0 24 24" width="20" height="20">
              <path fill="#E01E5A" d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z"/>
              <path fill="#36C5F0" d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z"/>
              <path fill="#2EB67D" d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312z"/>
              <path fill="#ECB22E" d="M15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
            </svg>
            <span>Slack으로 로그인</span>
          </button>
        </div>

        <div className="login-footer">
          <p>로그인 시 Slack 프로필 정보(이름, 이메일, 프로필 사진)가 사용됩니다.</p>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
