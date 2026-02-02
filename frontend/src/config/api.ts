// frontend/src/config/api.ts

// API 기본 URL 설정
// 개발 환경: Vite 프록시 사용 (/api)
// 프로덕션: 환경 변수 또는 기본값 사용

const isDev = import.meta.env.DEV;

// 인증 토큰 저장소 키
const AUTH_TOKEN_KEY = 'qa_tool_auth_token';

/**
 * 인증된 API 요청을 보내는 fetch 래퍼
 * localStorage에서 JWT 토큰을 읽어 Authorization 헤더에 자동 추가
 */
export const authFetch = async (
  url: string,
  options: RequestInit = {}
): Promise<Response> => {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);

  const headers = new Headers(options.headers || {});

  // JWT 토큰이 있으면 Authorization 헤더 추가
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // Content-Type이 설정되지 않았고 body가 JSON이면 자동 설정
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    try {
      JSON.parse(options.body);
      headers.set('Content-Type', 'application/json');
    } catch {
      // JSON이 아닌 body는 무시
    }
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // 401 응답 시 토큰 만료/무효 처리
  if (response.status === 401) {
    // 로컬 스토리지에서 토큰 삭제
    localStorage.removeItem(AUTH_TOKEN_KEY);

    // 로그인 페이지로 리다이렉트 (현재 페이지가 아닌 경우)
    // 단, auth 관련 API는 제외
    if (!url.includes('/auth/')) {
      console.warn('🔐 세션 만료 또는 인증 실패. 로그인이 필요합니다.');
      // 이벤트 발생으로 App.tsx에서 처리하도록 함
      window.dispatchEvent(new CustomEvent('auth:logout', {
        detail: { reason: 'session_expired' }
      }));
    }
  }

  return response;
};

// 개발 환경에서는 상대 경로 사용 (Vite 프록시가 처리)
// 프로덕션에서는 환경 변수 또는 기본값 사용
export const API_BASE_URL = isDev
  ? ''  // 개발: 프록시 사용
  : (import.meta.env.VITE_API_URL || 'http://127.0.0.1:3001');

// 서버 호스트 (외부 접근 시 사용)
// 환경변수 또는 현재 접속 중인 호스트 사용
export const SERVER_HOST = import.meta.env.VITE_SERVER_HOST || window.location.hostname || '127.0.0.1';
export const BACKEND_PORT = import.meta.env.VITE_BACKEND_PORT || '3001';

// WebSocket URL - Cloudflare Tunnel 및 로컬 환경 자동 감지
export const WS_URL = (() => {
  // 환경변수가 설정되어 있으면 그것을 사용
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL;
  }

  // HTTPS 환경 (Cloudflare Tunnel 등) - 동일 origin 사용 (wss:// 자동 적용)
  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    return window.location.origin;
  }

  // 로컬 개발 환경 - 명시적 host:port 사용
  return `http://${SERVER_HOST}:${BACKEND_PORT}`;
})();

// WebSocket 스트림 URL (ws:// 프로토콜) - Cloudflare Tunnel 자동 감지
export const WS_STREAM_URL = (() => {
  if (import.meta.env.VITE_WS_STREAM_URL) {
    return import.meta.env.VITE_WS_STREAM_URL;
  }

  // HTTPS 환경 - wss:// 사용
  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    return window.location.origin.replace('https:', 'wss:');
  }

  // 로컬 환경 - ws:// 사용
  return `ws://${SERVER_HOST}:${BACKEND_PORT}`;
})();

// scrcpy WebSocket URL
// Cloudflare Tunnel이 WebSocket을 지원하므로 원격에서도 scrcpy 사용 가능
// ADB 연결은 Backend에서 수행하므로 Frontend 접속 위치와 무관
export const WS_SCRCPY_URL = WS_STREAM_URL;

// MJPEG 스트림 URL (디바이스별 포트 사용)
export const getMjpegUrl = (port: number): string => {
  return `http://${SERVER_HOST}:${port}`;
};

// API 엔드포인트 헬퍼
export const API = {
  // 패키지
  packages: `${API_BASE_URL}/api/packages`,

  // 카테고리
  categories: (packageId: string) => `${API_BASE_URL}/api/categories/${packageId}`,

  // 시나리오
  scenarios: `${API_BASE_URL}/api/scenarios`,
  scenario: (id: string) => `${API_BASE_URL}/api/scenarios/${id}`,

  // 디바이스
  devices: `${API_BASE_URL}/api/device/list`,
  devicesDetailed: `${API_BASE_URL}/api/device/list/detailed`,
  device: (id: string) => `${API_BASE_URL}/api/device/${id}`,

  // 세션
  sessions: `${API_BASE_URL}/api/session/list`,
  sessionCreate: `${API_BASE_URL}/api/session/create`,
  sessionDestroy: `${API_BASE_URL}/api/session/destroy`,

  // 이미지 템플릿
  templates: `${API_BASE_URL}/api/image/templates`,
  template: (id: string) => `${API_BASE_URL}/api/image/templates/${id}`,
  captureTemplate: `${API_BASE_URL}/api/image/capture-template`,

  // 스케줄
  schedules: `${API_BASE_URL}/api/schedules`,
  schedule: (id: string) => `${API_BASE_URL}/api/schedules/${id}`,

  // 테스트 실행
  testQueue: `${API_BASE_URL}/api/test/queue`,
  testStart: `${API_BASE_URL}/api/test/start`,
  testStop: `${API_BASE_URL}/api/test/stop`,
};

// axios 인스턴스 생성 (인증 헤더 자동 추가)
import axios from 'axios';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
});

// 요청 인터셉터: Authorization 헤더 자동 추가
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 응답 인터셉터: 401 에러 처리
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(AUTH_TOKEN_KEY);

      // auth 관련 API가 아닌 경우에만 로그아웃 이벤트 발생
      const url = error.config?.url || '';
      if (!url.includes('/auth/')) {
        console.warn('🔐 세션 만료 또는 인증 실패. 로그인이 필요합니다.');
        window.dispatchEvent(new CustomEvent('auth:logout', {
          detail: { reason: 'session_expired' }
        }));
      }
    }
    return Promise.reject(error);
  }
);

export default API;
