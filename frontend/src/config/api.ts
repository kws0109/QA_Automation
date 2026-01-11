// frontend/src/config/api.ts

// API 기본 URL 설정
// 개발 환경: Vite 프록시 사용 (/api)
// 프로덕션: 환경 변수 또는 기본값 사용

const isDev = import.meta.env.DEV;

// 개발 환경에서는 상대 경로 사용 (Vite 프록시가 처리)
// 프로덕션에서는 환경 변수 또는 기본값 사용
export const API_BASE_URL = isDev
  ? ''  // 개발: 프록시 사용
  : (import.meta.env.VITE_API_URL || 'http://127.0.0.1:3001');

// WebSocket URL (프록시 사용 불가, 직접 연결 필요)
export const WS_URL = import.meta.env.VITE_WS_URL || 'http://127.0.0.1:3001';

// MJPEG 스트림 URL (디바이스별 포트 사용)
export const getMjpegUrl = (port: number): string => {
  return `http://127.0.0.1:${port}`;
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

  // 리포트
  reports: `${API_BASE_URL}/api/session/parallel/reports`,
  report: (id: string) => `${API_BASE_URL}/api/session/parallel/reports/${id}`,

  // 테스트 실행
  testQueue: `${API_BASE_URL}/api/test/queue`,
  testStart: `${API_BASE_URL}/api/test/start`,
  testStop: `${API_BASE_URL}/api/test/stop`,
};

export default API;
