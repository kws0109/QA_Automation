// backend/src/routes/device.ts

import express, { Request, Response } from 'express';
import { deviceManager } from '../services/deviceManager';
import { sessionManager } from '../services/sessionManager';
import { deviceStorageService } from '../services/deviceStorage';
import { asyncHandler, BadRequestError, NotFoundError } from '../utils/asyncHandler';

const router = express.Router();

// ==================== 보안: 입력 검증 헬퍼 ====================

/**
 * IPv4 주소 형식 검증
 */
function isValidIp(ip: string): boolean {
  if (!ip || typeof ip !== 'string') return false;
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  return ipv4Regex.test(ip);
}

/**
 * 포트 번호 검증 (1-65535)
 */
function isValidPort(port: unknown): boolean {
  const num = typeof port === 'string' ? parseInt(port, 10) : port;
  return typeof num === 'number' && Number.isInteger(num) && num >= 1 && num <= 65535;
}

/**
 * 디바이스 ID 검증 (Command Injection 방지)
 */
function isValidDeviceId(deviceId: string): boolean {
  if (!deviceId || typeof deviceId !== 'string') return false;
  const safePattern = /^[a-zA-Z0-9\-\.:_]+$/;
  return safePattern.test(deviceId) && deviceId.length <= 100;
}

/**
 * 세션 상태 확인 헬퍼 - 세션이 없으면 BadRequestError throw
 */
async function requireHealthySession(deviceId: string): Promise<void> {
  const isHealthy = await sessionManager.checkSessionHealth(deviceId);
  if (!isHealthy) {
    throw new BadRequestError('해당 디바이스의 세션이 없거나 종료되었습니다. 세션을 먼저 연결하세요.');
  }
}

// 좌표 요청 Body 인터페이스
interface CoordinateBody {
  x: number;
  y: number;
}

// 요소 정보 인터페이스
interface ElementInfo {
  resourceId: string;
  text: string;
  className: string;
  contentDesc: string;
  clickable: boolean;
  enabled: boolean;
  bounds: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  };
}

/**
 * XML에서 좌표에 해당하는 요소 찾기
 */
function findElementAtCoordinate(xmlSource: string, x: number, y: number): ElementInfo | null {
  let bestMatch: ElementInfo | null = null;
  let smallestArea = Infinity;

  const allElementsRegex = /<([^\s/>]+)([^>]*)(?:\/>|>)/g;
  let match;

  while ((match = allElementsRegex.exec(xmlSource)) !== null) {
    const attributes = match[2];

    // bounds 추출
    const boundsMatch = attributes.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    if (!boundsMatch) continue;

    const left = parseInt(boundsMatch[1]);
    const top = parseInt(boundsMatch[2]);
    const right = parseInt(boundsMatch[3]);
    const bottom = parseInt(boundsMatch[4]);

    // 좌표가 bounds 안에 있는지 확인
    if (x >= left && x <= right && y >= top && y <= bottom) {
      const area = (right - left) * (bottom - top);

      if (area < smallestArea) {
        smallestArea = area;

        // 속성 추출
        const resourceId = attributes.match(/resource-id="([^"]*)"/)?.[1] || '';
        const text = attributes.match(/text="([^"]*)"/)?.[1] || '';
        const className = attributes.match(/class="([^"]*)"/)?.[1] || match[1];
        const contentDesc = attributes.match(/content-desc="([^"]*)"/)?.[1] || '';
        const clickable = attributes.includes('clickable="true"');
        const enabled = attributes.includes('enabled="true"');

        bestMatch = {
          resourceId,
          text,
          className,
          contentDesc,
          clickable,
          enabled,
          bounds: { left, top, right, bottom },
        };
      }
    }
  }

  return bestMatch;
}

/**
 * GET /api/device/screenshot
 * 스크린샷 캡처 (deviceId 쿼리 파라미터 필수)
 */
router.get('/screenshot', asyncHandler(async (req: Request, res: Response) => {
  const { deviceId } = req.query;

  if (!deviceId || typeof deviceId !== 'string') {
    throw new BadRequestError('deviceId가 필요합니다');
  }

  await requireHealthySession(deviceId);

  const driver = sessionManager.getDriver(deviceId);
  const screenshot = await driver!.takeScreenshot();

  res.json({
    success: true,
    screenshot: screenshot.startsWith('data:') ? screenshot : `data:image/png;base64,${screenshot}`,
  });
}));

/**
 * GET /api/device/info
 * 디바이스 정보 조회 (deviceId 쿼리 파라미터 필수)
 */
router.get('/info', asyncHandler(async (req: Request, res: Response) => {
  const { deviceId } = req.query;

  if (!deviceId || typeof deviceId !== 'string') {
    throw new BadRequestError('deviceId가 필요합니다');
  }

  await requireHealthySession(deviceId);

  const driver = sessionManager.getDriver(deviceId);
  const windowSize = await driver!.getWindowSize();
  res.json({
    success: true,
    windowSize,
    deviceId,
  });
}));

/**
 * GET /api/device/source
 * 현재 화면의 UI 소스 가져오기 (deviceId 쿼리 파라미터 필수)
 */
router.get('/source', asyncHandler(async (req: Request, res: Response) => {
  const { deviceId } = req.query;

  if (!deviceId || typeof deviceId !== 'string') {
    throw new BadRequestError('deviceId가 필요합니다');
  }

  await requireHealthySession(deviceId);

  const driver = sessionManager.getDriver(deviceId);
  const source = await driver!.getPageSource();
  res.json({
    success: true,
    source,
  });
}));

/**
 * POST /api/device/find-element
 * 좌표에 있는 요소 찾기 (body에 deviceId 필수)
 */
router.post('/find-element', asyncHandler(async (req: Request<object, object, CoordinateBody & { deviceId?: string }>, res: Response) => {
  const { x, y, deviceId } = req.body;

  if (!deviceId) {
    throw new BadRequestError('deviceId가 필요합니다');
  }

  await requireHealthySession(deviceId);

  const driver = sessionManager.getDriver(deviceId);
  const source = await driver!.getPageSource();
  const elementInfo = findElementAtCoordinate(source, x, y);

  res.json({
    success: true,
    element: elementInfo,
  });
}));

// 연결된 디바이스 목록 조회
router.get('/list', asyncHandler(async (_req: Request, res: Response) => {
  const devices = await deviceManager.scanDevices();
  res.json({
    success: true,
    devices,
    count: devices.length
  });
}));

// 병합된 디바이스 목록 조회 (연결된 디바이스 + 저장된 오프라인 디바이스)
router.get('/list/detailed', asyncHandler(async (_req: Request, res: Response) => {
  const devices = await deviceManager.getMergedDeviceList();
  res.json({
    success: true,
    devices,
    count: devices.length
  });
}));

// ==================== WiFi ADB 관련 API ====================
// 주의: 이 라우트들은 /:deviceId 앞에 위치해야 함

/**
 * GET /api/device/wifi/configs
 * 저장된 WiFi 디바이스 설정 목록 조회
 */
router.get('/wifi/configs', asyncHandler(async (_req: Request, res: Response) => {
  const configs = await deviceManager.getSavedWifiConfigs();
  res.json({
    success: true,
    configs,
    count: configs.length,
  });
}));

/**
 * GET /api/device/wifi/connected
 * 연결된 WiFi 디바이스 목록 조회
 */
router.get('/wifi/connected', asyncHandler(async (_req: Request, res: Response) => {
  const devices = await deviceManager.getConnectedWifiDevices();
  res.json({
    success: true,
    devices,
    count: devices.length,
  });
}));

/**
 * POST /api/device/wifi/enable-tcpip
 * USB 디바이스를 tcpip 모드로 전환
 * body: { deviceId: string, port?: number }
 */
router.post('/wifi/enable-tcpip', asyncHandler(async (req: Request, res: Response) => {
  const { deviceId, port = 5555 } = req.body;

  if (!deviceId) {
    throw new BadRequestError('deviceId가 필요합니다');
  }

  if (!isValidDeviceId(deviceId)) {
    throw new BadRequestError('유효하지 않은 디바이스 ID입니다');
  }

  if (port !== undefined && !isValidPort(port)) {
    throw new BadRequestError('포트는 1-65535 범위의 정수여야 합니다');
  }

  const result = await deviceManager.enableTcpipMode(deviceId, port);
  res.json(result);
}));

/**
 * POST /api/device/wifi/connect
 * WiFi ADB로 디바이스 연결
 * body: { ip: string, port?: number }
 */
router.post('/wifi/connect', asyncHandler(async (req: Request, res: Response) => {
  const { ip, port = 5555 } = req.body;

  if (!ip) {
    throw new BadRequestError('IP 주소가 필요합니다');
  }

  if (!isValidIp(ip)) {
    throw new BadRequestError('유효하지 않은 IP 주소 형식입니다 (예: 192.168.1.100)');
  }

  if (port !== undefined && !isValidPort(port)) {
    throw new BadRequestError('포트는 1-65535 범위의 정수여야 합니다');
  }

  const result = await deviceManager.connectWifiDevice(ip, port);
  res.json(result);
}));

/**
 * POST /api/device/wifi/disconnect
 * WiFi ADB 연결 해제
 * body: { deviceId: string } (IP:포트 형식)
 */
router.post('/wifi/disconnect', asyncHandler(async (req: Request, res: Response) => {
  const { deviceId } = req.body;

  if (!deviceId) {
    throw new BadRequestError('deviceId가 필요합니다');
  }

  if (!isValidDeviceId(deviceId)) {
    throw new BadRequestError('유효하지 않은 디바이스 ID입니다');
  }

  const result = await deviceManager.disconnectWifiDevice(deviceId);
  res.json(result);
}));

/**
 * POST /api/device/wifi/switch
 * USB 디바이스를 WiFi ADB로 전환 (tcpip 활성화 + 연결)
 * body: { deviceId: string, port?: number }
 */
router.post('/wifi/switch', asyncHandler(async (req: Request, res: Response) => {
  const { deviceId, port = 5555 } = req.body;

  if (!deviceId) {
    throw new BadRequestError('deviceId가 필요합니다');
  }

  if (!isValidDeviceId(deviceId)) {
    throw new BadRequestError('유효하지 않은 디바이스 ID입니다');
  }

  if (port !== undefined && !isValidPort(port)) {
    throw new BadRequestError('포트는 1-65535 범위의 정수여야 합니다');
  }

  const result = await deviceManager.switchToWifi(deviceId, port);
  res.json(result);
}));

/**
 * POST /api/device/wifi/reconnect-all
 * 저장된 모든 WiFi 디바이스 재연결
 */
router.post('/wifi/reconnect-all', asyncHandler(async (_req: Request, res: Response) => {
  const result = await deviceManager.reconnectAllWifiDevices();
  res.json(result);
}));

/**
 * GET /api/device/wifi/ip/:deviceId
 * 디바이스의 WiFi IP 주소 조회
 */
router.get('/wifi/ip/:deviceId', asyncHandler(async (req: Request, res: Response) => {
  const { deviceId } = req.params;

  if (!isValidDeviceId(deviceId)) {
    throw new BadRequestError('유효하지 않은 디바이스 ID입니다');
  }

  const ip = await deviceManager.getDeviceWifiIp(deviceId);

  if (!ip) {
    throw new NotFoundError('WiFi IP 주소를 찾을 수 없습니다. 디바이스가 WiFi에 연결되어 있는지 확인하세요.');
  }

  res.json({
    success: true,
    ip,
    deviceId,
  });
}));

/**
 * DELETE /api/device/wifi/config
 * WiFi 디바이스 설정 삭제
 * body: { ip: string, port: number }
 */
router.delete('/wifi/config', asyncHandler(async (req: Request, res: Response) => {
  const { ip, port } = req.body;

  if (!ip || port === undefined) {
    throw new BadRequestError('IP와 포트가 필요합니다');
  }

  if (!isValidIp(ip)) {
    throw new BadRequestError('유효하지 않은 IP 주소 형식입니다');
  }

  if (!isValidPort(port)) {
    throw new BadRequestError('유효하지 않은 포트 번호입니다');
  }

  const deleted = await deviceManager.deleteWifiConfig(ip, port);
  res.json({
    success: deleted,
    message: deleted ? `WiFi 설정 삭제됨: ${ip}:${port}` : '설정을 찾을 수 없습니다',
  });
}));

/**
 * PUT /api/device/wifi/auto-reconnect
 * WiFi 디바이스 자동 재연결 설정 변경
 * body: { ip: string, port: number, autoReconnect: boolean }
 */
router.put('/wifi/auto-reconnect', asyncHandler(async (req: Request, res: Response) => {
  const { ip, port, autoReconnect } = req.body;

  if (!ip || port === undefined || autoReconnect === undefined) {
    throw new BadRequestError('IP, 포트, autoReconnect가 필요합니다');
  }

  if (!isValidIp(ip)) {
    throw new BadRequestError('유효하지 않은 IP 주소 형식입니다');
  }

  if (!isValidPort(port)) {
    throw new BadRequestError('유효하지 않은 포트 번호입니다');
  }

  if (typeof autoReconnect !== 'boolean') {
    throw new BadRequestError('autoReconnect는 boolean이어야 합니다');
  }

  const config = await deviceStorageService.updateWifiAutoReconnect(ip, port, autoReconnect);

  if (!config) {
    throw new NotFoundError('설정을 찾을 수 없습니다');
  }

  res.json({
    success: true,
    config,
  });
}));

// ==================== 파라미터 라우트 (마지막에 위치) ====================

// 디바이스 별칭 수정
router.put('/:deviceId/alias', asyncHandler(async (req: Request, res: Response) => {
  const { deviceId } = req.params;
  const { alias } = req.body;

  if (typeof alias !== 'string') {
    throw new BadRequestError('alias는 문자열이어야 합니다');
  }

  const device = await deviceStorageService.updateAlias(deviceId, alias);
  res.json({
    success: true,
    device,
    message: '별칭이 수정되었습니다'
  });
}));

// 디바이스 역할 수정
router.put('/:deviceId/role', asyncHandler(async (req: Request, res: Response) => {
  const { deviceId } = req.params;
  const { role } = req.body;

  if (role !== 'editing' && role !== 'testing') {
    throw new BadRequestError("role은 'editing' 또는 'testing'이어야 합니다");
  }

  const device = await deviceStorageService.updateRole(deviceId, role);
  res.json({
    success: true,
    device,
    message: `역할이 '${role === 'editing' ? '편집용' : '테스트용'}'으로 수정되었습니다`
  });
}));

// 저장된 디바이스 삭제
router.delete('/:deviceId', asyncHandler(async (req: Request, res: Response) => {
  const { deviceId } = req.params;
  const result = await deviceStorageService.delete(deviceId);
  res.json(result);
}));

// 단일 디바이스 정보 조회
router.get('/:deviceId', asyncHandler(async (req: Request, res: Response) => {
  const { deviceId } = req.params;
  const device = await deviceManager.getDeviceDetails(deviceId);

  if (!device) {
    throw new NotFoundError('Device not found');
  }

  res.json({ success: true, device });
}));

export default router;
