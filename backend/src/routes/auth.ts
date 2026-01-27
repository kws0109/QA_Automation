// backend/src/routes/auth.ts
// Slack OAuth 인증 라우트

import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

const router = Router();

// 환경 변수
const SLACK_CLIENT_ID = process.env.SLACK_CLIENT_ID || '';
const SLACK_CLIENT_SECRET = process.env.SLACK_CLIENT_SECRET || '';
const SLACK_REDIRECT_URI = process.env.SLACK_REDIRECT_URI || '';
const JWT_SECRET = process.env.JWT_SECRET || 'default_secret_change_me';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// 허용된 워크스페이스 ID (빈 배열이면 모든 워크스페이스 허용)
const ALLOWED_TEAM_IDS: string[] = [];

// Slack API 응답 타입
interface SlackTokenResponse {
  ok: boolean;
  error?: string;
  authed_user?: {
    id: string;
    access_token: string;
  };
}

interface SlackUserResponse {
  ok: boolean;
  error?: string;
  user?: {
    id: string;
    name: string;
    email?: string;
    image_48?: string;
    image_192?: string;
  };
  team?: {
    id: string;
    name: string;
  };
}

// Slack 사용자 정보 인터페이스
interface SlackUser {
  id: string;
  name: string;
  email?: string;
  image_48?: string;
  image_192?: string;
  team_id: string;
  team_name?: string;
}

// JWT 페이로드 인터페이스
interface JwtPayload {
  userId: string;
  userName: string;
  email?: string;
  avatarUrl?: string;
  teamId: string;
  teamName?: string;
}

/**
 * GET /auth/slack
 * Slack OAuth 인증 시작 - Slack 로그인 페이지로 리다이렉트
 */
router.get('/slack', (_req: Request, res: Response) => {
  if (!SLACK_CLIENT_ID) {
    res.status(500).json({
      success: false,
      error: 'Slack OAuth가 설정되지 않았습니다. SLACK_CLIENT_ID를 확인하세요.',
    });
    return;
  }

  // Slack OAuth URL 생성
  const scopes = ['identity.basic', 'identity.email', 'identity.avatar', 'identity.team'];
  const slackAuthUrl = new URL('https://slack.com/oauth/v2/authorize');
  slackAuthUrl.searchParams.set('client_id', SLACK_CLIENT_ID);
  slackAuthUrl.searchParams.set('user_scope', scopes.join(','));
  slackAuthUrl.searchParams.set('redirect_uri', SLACK_REDIRECT_URI);

  console.log('🔐 [Auth] Slack OAuth 시작:', slackAuthUrl.toString());
  res.redirect(slackAuthUrl.toString());
});

/**
 * GET /auth/slack/callback
 * Slack OAuth 콜백 - 토큰 교환 및 사용자 정보 조회
 */
router.get('/slack/callback', async (req: Request, res: Response) => {
  const { code, error } = req.query;

  // 사용자가 권한 부여를 거부한 경우
  if (error) {
    console.error('🔐 [Auth] Slack OAuth 거부:', error);
    res.redirect(`${FRONTEND_URL}/?error=slack_denied&message=${encodeURIComponent(String(error))}`);
    return;
  }

  if (!code) {
    res.redirect(`${FRONTEND_URL}/?error=no_code&message=인증 코드가 없습니다`);
    return;
  }

  try {
    // 1. Authorization Code를 Access Token으로 교환
    const tokenResponse = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: SLACK_CLIENT_ID,
        client_secret: SLACK_CLIENT_SECRET,
        code: String(code),
        redirect_uri: SLACK_REDIRECT_URI,
      }),
    });

    const tokenData = await tokenResponse.json() as SlackTokenResponse;

    if (!tokenData.ok) {
      console.error('🔐 [Auth] Slack 토큰 교환 실패:', tokenData.error);
      res.redirect(`${FRONTEND_URL}/?error=token_exchange&message=${encodeURIComponent(tokenData.error || 'unknown')}`);
      return;
    }

    // 2. 사용자 정보 추출
    const authedUser = tokenData.authed_user;
    const accessToken = authedUser?.access_token;

    if (!accessToken) {
      res.redirect(`${FRONTEND_URL}/?error=no_token&message=Access Token을 받지 못했습니다`);
      return;
    }

    // 3. 사용자 정보 조회 (identity.basic scope)
    const userResponse = await fetch('https://slack.com/api/users.identity', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const userData = await userResponse.json() as SlackUserResponse;

    if (!userData.ok || !userData.user || !userData.team) {
      console.error('🔐 [Auth] Slack 사용자 정보 조회 실패:', userData.error);
      res.redirect(`${FRONTEND_URL}/?error=user_info&message=${encodeURIComponent(userData.error || 'unknown')}`);
      return;
    }

    const slackUser: SlackUser = {
      id: userData.user.id,
      name: userData.user.name,
      email: userData.user.email,
      image_48: userData.user.image_48,
      image_192: userData.user.image_192,
      team_id: userData.team.id,
      team_name: userData.team.name,
    };

    console.log('🔐 [Auth] Slack 사용자 인증 성공:', {
      id: slackUser.id,
      name: slackUser.name,
      team: slackUser.team_name,
    });

    // 4. 워크스페이스 제한 확인
    if (ALLOWED_TEAM_IDS.length > 0 && !ALLOWED_TEAM_IDS.includes(slackUser.team_id)) {
      console.warn('🔐 [Auth] 허용되지 않은 워크스페이스:', slackUser.team_id);
      res.redirect(`${FRONTEND_URL}/?error=team_not_allowed&message=${encodeURIComponent('허용되지 않은 워크스페이스입니다')}`);
      return;
    }

    // 5. JWT 토큰 생성
    const jwtPayload: JwtPayload = {
      userId: slackUser.id,
      userName: slackUser.name,
      email: slackUser.email,
      avatarUrl: slackUser.image_192 || slackUser.image_48,
      teamId: slackUser.team_id,
      teamName: slackUser.team_name,
    };

    const token = jwt.sign(jwtPayload, JWT_SECRET, { expiresIn: '7d' });

    // 6. 토큰을 URL 파라미터로 전달 (cross-origin 쿠키 문제 회피)
    // Frontend에서 localStorage에 저장
    res.redirect(`${FRONTEND_URL}/?login=success&token=${token}`);

  } catch (error) {
    console.error('🔐 [Auth] Slack OAuth 오류:', error);
    res.redirect(`${FRONTEND_URL}/?error=server_error&message=${encodeURIComponent('서버 오류가 발생했습니다')}`);
  }
});

/**
 * GET /auth/me
 * 현재 로그인한 사용자 정보 조회
 * Authorization: Bearer <token> 헤더 사용
 */
router.get('/me', (req: Request, res: Response) => {
  // Authorization 헤더에서 토큰 추출
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    res.status(401).json({
      success: false,
      error: '로그인이 필요합니다',
      isAuthenticated: false,
    });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;

    res.json({
      success: true,
      isAuthenticated: true,
      user: {
        id: decoded.userId,
        name: decoded.userName,
        email: decoded.email,
        avatarUrl: decoded.avatarUrl,
        teamId: decoded.teamId,
        teamName: decoded.teamName,
      },
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      error: '세션이 만료되었습니다. 다시 로그인해주세요.',
      isAuthenticated: false,
    });
  }
});

/**
 * POST /auth/logout
 * 로그아웃 - 쿠키 삭제
 */
router.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie('auth_token');
  res.json({
    success: true,
    message: '로그아웃되었습니다',
  });
});

/**
 * GET /auth/status
 * 인증 설정 상태 확인 (디버깅용)
 */
router.get('/status', (_req: Request, res: Response) => {
  res.json({
    success: true,
    slack: {
      configured: !!SLACK_CLIENT_ID && !!SLACK_CLIENT_SECRET,
      redirectUri: SLACK_REDIRECT_URI,
      allowedTeams: ALLOWED_TEAM_IDS.length > 0 ? ALLOWED_TEAM_IDS.length : 'all',
    },
  });
});

export default router;
