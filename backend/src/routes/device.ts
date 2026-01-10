// backend/src/routes/device.ts

import express, { Request, Response } from 'express';
import appiumDriver from '../appium/driver';
import { deviceManager } from '../services/deviceManager';
import { sessionManager } from '../services/sessionManager';
import { deviceStorageService } from '../services/deviceStorage';


const router = express.Router();

// 연결 요청 Body 인터페이스
interface ConnectBody {
  deviceName: string;
  appPackage: string;
  appActivity: string;
  platformVersion?: string;
  udid?: string;
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
 * POST /api/device/connect
 * 디바이스 연결
 */
router.post('/connect', async (req: Request<object, object, ConnectBody>, res: Response) => {
  try {
    const config = req.body;
    const result = await appiumDriver.connect(config);
    res.json(result);
  } catch (e) {
    const error = e as Error;
    console.error('디바이스 연결 에러:', error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * POST /api/device/disconnect
 * 디바이스 연결 해제
 */
router.post('/disconnect', async (_req: Request, res: Response) => {
  try {
    const result = await appiumDriver.disconnect();
    res.json(result);
  } catch (e) {
    const error = e as Error;
    console.error('디바이스 연결 해제 에러:', error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * GET /api/device/status
 * 연결 상태 확인
 */
router.get('/status', (_req: Request, res: Response) => {
  const status = appiumDriver.getStatus();
  res.json(status);
});

/**
 * GET /api/device/screenshot
 * 스크린샷 캡처 (deviceId 쿼리 파라미터 필수)
 */
router.get('/screenshot', async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.query;

    if (!deviceId || typeof deviceId !== 'string') {
      res.status(400).json({
        success: false,
        message: 'deviceId가 필요합니다',
      });
      return;
    }

    // 세션 건강 상태 확인 (죽은 세션 자동 정리)
    const isHealthy = await sessionManager.checkSessionHealth(deviceId);
    if (!isHealthy) {
      res.status(400).json({
        success: false,
        message: '해당 디바이스의 세션이 없거나 종료되었습니다. 세션을 먼저 연결하세요.',
      });
      return;
    }

    const driver = sessionManager.getDriver(deviceId);
    const screenshot = await driver!.takeScreenshot();

    res.json({
      success: true,
      screenshot: screenshot.startsWith('data:') ? screenshot : `data:image/png;base64,${screenshot}`,
    });
  } catch (e) {
    const error = e as Error;
    console.error('스크린샷 에러:', error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * GET /api/device/info
 * 디바이스 정보 조회 (deviceId 쿼리 파라미터 필수)
 */
router.get('/info', async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.query;

    if (!deviceId || typeof deviceId !== 'string') {
      res.status(400).json({
        success: false,
        message: 'deviceId가 필요합니다',
      });
      return;
    }

    // 세션 건강 상태 확인 (죽은 세션 자동 정리)
    const isHealthy = await sessionManager.checkSessionHealth(deviceId);
    if (!isHealthy) {
      res.status(400).json({
        success: false,
        message: '해당 디바이스의 세션이 없거나 종료되었습니다. 세션을 먼저 연결하세요.',
      });
      return;
    }

    const driver = sessionManager.getDriver(deviceId);
    const windowSize = await driver!.getWindowSize();
    res.json({
      success: true,
      windowSize,
      deviceId,
    });
  } catch (e) {
    const error = e as Error;
    console.error('디바이스 정보 조회 에러:', error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * GET /api/device/source
 * 현재 화면의 UI 소스 가져오기 (deviceId 쿼리 파라미터 필수)
 */
router.get('/source', async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.query;

    if (!deviceId || typeof deviceId !== 'string') {
      res.status(400).json({
        success: false,
        message: 'deviceId가 필요합니다',
      });
      return;
    }

    // 세션 건강 상태 확인 (죽은 세션 자동 정리)
    const isHealthy = await sessionManager.checkSessionHealth(deviceId);
    if (!isHealthy) {
      res.status(400).json({
        success: false,
        message: '해당 디바이스의 세션이 없거나 종료되었습니다. 세션을 먼저 연결하세요.',
      });
      return;
    }

    const driver = sessionManager.getDriver(deviceId);
    const source = await driver!.getPageSource();
    res.json({
      success: true,
      source,
    });
  } catch (e) {
    const error = e as Error;
    console.error('UI 소스 에러:', error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * POST /api/device/find-element
 * 좌표에 있는 요소 찾기 (body에 deviceId 필수)
 */
router.post('/find-element', async (req: Request<object, object, CoordinateBody & { deviceId?: string }>, res: Response) => {
  try {
    const { x, y, deviceId } = req.body;

    if (!deviceId) {
      res.status(400).json({
        success: false,
        message: 'deviceId가 필요합니다',
      });
      return;
    }

    // 세션 건강 상태 확인 (죽은 세션 자동 정리)
    const isHealthy = await sessionManager.checkSessionHealth(deviceId);
    if (!isHealthy) {
      res.status(400).json({
        success: false,
        message: '해당 디바이스의 세션이 없거나 종료되었습니다. 세션을 먼저 연결하세요.',
      });
      return;
    }

    const driver = sessionManager.getDriver(deviceId);
    const source = await driver!.getPageSource();
    const elementInfo = findElementAtCoordinate(source, x, y);

    res.json({
      success: true,
      element: elementInfo,
    });
  } catch (e) {
    const error = e as Error;
    console.error('요소 찾기 에러:', error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// 연결된 디바이스 목록 조회
router.get('/list', async (req: Request, res: Response) => {
  try {
    const devices = await deviceManager.scanDevices();
    res.json({
      success: true,
      devices,
      count: devices.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to scan devices'
    });
  }
});

// 병합된 디바이스 목록 조회 (연결된 디바이스 + 저장된 오프라인 디바이스)
router.get('/list/detailed', async (req: Request, res: Response) => {
  try {
    const devices = await deviceManager.getMergedDeviceList();
    res.json({
      success: true,
      devices,
      count: devices.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get detailed device info'
    });
  }
});

// 디바이스 별칭 수정
router.put('/:deviceId/alias', async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { alias } = req.body;

    if (typeof alias !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'alias는 문자열이어야 합니다'
      });
    }

    const device = await deviceStorageService.updateAlias(deviceId, alias);
    res.json({
      success: true,
      device,
      message: '별칭이 수정되었습니다'
    });
  } catch (error) {
    const err = error as Error;
    res.status(404).json({
      success: false,
      error: err.message
    });
  }
});

// 저장된 디바이스 삭제
router.delete('/:deviceId', async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;
    const result = await deviceStorageService.delete(deviceId);
    res.json(result);
  } catch (error) {
    const err = error as Error;
    res.status(404).json({
      success: false,
      error: err.message
    });
  }
});

// 단일 디바이스 정보 조회
router.get('/:deviceId', async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;
    const device = await deviceManager.getDeviceDetails(deviceId);

    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }

    res.json({ success: true, device });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get device info'
    });
  }
});

export default router;