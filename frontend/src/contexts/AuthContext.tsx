// frontend/src/contexts/AuthContext.tsx

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { API_BASE_URL, WS_URL } from '../config/api';
import { getAuthToken, clearAuthToken } from '../components/LoginPage';

interface AuthUser {
  id: string;
  name: string;
  avatarUrl?: string;
}

interface AuthContextType {
  // State
  userName: string;
  userAvatarUrl: string;
  slackUserId: string;
  isAuthenticated: boolean;
  authLoading: boolean;
  slackEnabled: boolean;
  devModeEnabled: boolean;

  // Socket
  socket: Socket | null;
  isSocketConnected: boolean;

  // Actions
  handleSlackLoginSuccess: (user: AuthUser) => void;
  handleLogout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const socketRef = useRef<Socket | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isSocketConnected, setIsSocketConnected] = useState<boolean>(false);

  // Auth state
  const [userName, setUserName] = useState<string>('');
  const [userAvatarUrl, setUserAvatarUrl] = useState<string>('');
  const [slackUserId, setSlackUserId] = useState<string>('');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [slackEnabled, setSlackEnabled] = useState<boolean>(false);
  const [devModeEnabled, setDevModeEnabled] = useState<boolean>(false);

  // WebSocket connection
  useEffect(() => {
    console.log('🔌 [AuthContext] Socket 연결 시도:', WS_URL);
    const newSocket = io(WS_URL, {
      // Cloudflare Tunnel 환경에서는 polling만 사용 (WebSocket 업그레이드 비활성화)
      // WebSocket 프레임 헤더 오류 방지
      transports: ['polling'],
      upgrade: false,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 10000,
    });
    socketRef.current = newSocket;
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('WebSocket connected');
      setIsSocketConnected(true);
    });

    newSocket.on('disconnect', () => {
      console.log('WebSocket disconnected');
      setIsSocketConnected(false);
    });

    return () => {
      newSocket.close();
    };
  }, []);

  // Auth initialization
  useEffect(() => {
    const initAuth = async () => {
      try {
        // 1. Check saved token for Slack auth
        const savedToken = getAuthToken();
        if (savedToken) {
          const authRes = await fetch(`${API_BASE_URL}/auth/me`, {
            headers: {
              'Authorization': `Bearer ${savedToken}`,
            },
          });
          const authData = await authRes.json();

          if (authData.success && authData.isAuthenticated) {
            setUserName(authData.user.name);
            setUserAvatarUrl(authData.user.avatarUrl || '');
            setSlackUserId(authData.user.id || '');
            setIsAuthenticated(true);
            setSlackEnabled(true);
            setAuthLoading(false);
            return;
          } else {
            clearAuthToken();
          }
        }

        // 2. Check auth configuration (devMode and Slack)
        const statusRes = await fetch(`${API_BASE_URL}/auth/status`);
        const statusData = await statusRes.json();

        // 2a. Check if dev mode is enabled - auto-login
        if (statusData.success && statusData.devMode?.enabled) {
          console.log('🔧 [Auth] 개발 모드 활성화 - 자동 로그인 시도');
          setDevModeEnabled(true);

          try {
            const devLoginRes = await fetch(`${API_BASE_URL}/auth/dev-login`, {
              method: 'POST',
            });
            const devLoginData = await devLoginRes.json();

            if (devLoginData.success && devLoginData.token) {
              // Save token and set auth state
              const { setAuthToken } = await import('../components/LoginPage');
              setAuthToken(devLoginData.token);

              setUserName(devLoginData.user.name);
              setUserAvatarUrl(devLoginData.user.avatarUrl || '');
              setSlackUserId(devLoginData.user.id || '');
              setIsAuthenticated(true);
              setAuthLoading(false);
              console.log('✅ [Auth] 개발 모드 자동 로그인 성공:', devLoginData.user.name);
              return;
            }
          } catch (devErr) {
            console.error('개발 모드 로그인 실패:', devErr);
          }
        }

        // 2b. Check Slack configuration
        if (statusData.success && statusData.slack?.configured) {
          setSlackEnabled(true);
        } else {
          console.error('Slack OAuth not configured');
          setSlackEnabled(false);
        }
        setAuthLoading(false);

      } catch (err) {
        console.error('Auth initialization failed:', err);
        setSlackEnabled(false);
        setAuthLoading(false);
      }
    };

    initAuth();
  }, []);

  // Send user:identify when userName changes and socket is connected
  useEffect(() => {
    if (userName && socketRef.current && isSocketConnected) {
      console.log('User identify sent:', userName);
      socketRef.current.emit('user:identify', { userName });
    }
  }, [userName, isSocketConnected]);

  // Slack login success handler
  const handleSlackLoginSuccess = useCallback((user: AuthUser) => {
    setUserName(user.name);
    setUserAvatarUrl(user.avatarUrl || '');
    setSlackUserId(user.id);
    setIsAuthenticated(true);

    if (socketRef.current && isSocketConnected) {
      socketRef.current.emit('user:identify', {
        userName: user.name,
        slackUserId: user.id,
        avatarUrl: user.avatarUrl,
      });
    }
  }, [isSocketConnected]);

  // Logout handler
  const handleLogout = useCallback(() => {
    clearAuthToken();
    setIsAuthenticated(false);
    setUserName('');
    setUserAvatarUrl('');
    setSlackUserId('');
  }, []);

  const value: AuthContextType = {
    userName,
    userAvatarUrl,
    slackUserId,
    isAuthenticated,
    authLoading,
    slackEnabled,
    devModeEnabled,
    socket,
    isSocketConnected,
    handleSlackLoginSuccess,
    handleLogout,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
