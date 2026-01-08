// backend/src/routes/device.ts

import express, { Request, Response } from 'express';
import appiumDriver from '../appium/driver';
import { deviceManager } from '../services/deviceManager';
import { sessionManager } from '../services/sessionManager';


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
 * 스크린샷 캡처 (deviceId 쿼리 파라미터로 특정 디바이스 지정 가능)
 */
router.get('/screenshot', async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.query;

    let screenshot: string;

    // deviceId가 있고 해당 세션이 있으면 sessionManager 사용
    if (deviceId && typeof deviceId === 'string') {
      const driver = sessionManager.getDriver(deviceId);
      if (driver) {
        screenshot = await driver.takeScreenshot();
      } else {
        // 세션이 없으면 기존 appiumDriver 사용
        screenshot = await appiumDriver.takeScreenshot();
      }
    } else {
      screenshot = await appiumDriver.takeScreenshot();
    }

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
 * 디바이스 정보 조회 (deviceId 쿼리 파라미터로 특정 디바이스 지정 가능)
 */
router.get('/info', async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.query;

    // deviceId가 있고 해당 세션이 있으면 sessionManager 사용
    if (deviceId && typeof deviceId === 'string') {
      const driver = sessionManager.getDriver(deviceId);
      if (driver) {
        const windowSize = await driver.getWindowSize();
        res.json({
          success: true,
          windowSize,
          deviceId,
        });
        return;
      }
    }

    // 기존 appiumDriver 사용
    const info = await appiumDriver.getDeviceInfo();
    res.json({
      success: true,
      ...info,
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
 * 현재 화면의 UI 소스 가져오기 (deviceId 쿼리 파라미터로 특정 디바이스 지정 가능)
 */
router.get('/source', async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.query;
    let source: string;

    // deviceId가 있고 해당 세션이 있으면 sessionManager 사용
    if (deviceId && typeof deviceId === 'string') {
      const driver = sessionManager.getDriver(deviceId);
      if (driver) {
        source = await driver.getPageSource();
      } else {
        const fallbackDriver = await appiumDriver.getValidDriver();
        source = await fallbackDriver.getPageSource();
      }
    } else {
      const driver = await appiumDriver.getValidDriver();
      source = await driver.getPageSource();
    }

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
 * 좌표에 있는 요소 찾기 (body에 deviceId 포함 가능)
 */
router.post('/find-element', async (req: Request<object, object, CoordinateBody & { deviceId?: string }>, res: Response) => {
  try {
    const { x, y, deviceId } = req.body;
    let source: string;

    // deviceId가 있고 해당 세션이 있으면 sessionManager 사용
    if (deviceId) {
      const driver = sessionManager.getDriver(deviceId);
      if (driver) {
        source = await driver.getPageSource();
      } else {
        const fallbackDriver = await appiumDriver.getValidDriver();
        source = await fallbackDriver.getPageSource();
      }
    } else {
      const driver = await appiumDriver.getValidDriver();
      source = await driver.getPageSource();
    }

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

// 연결된 디바이스 상세 정보 목록 조회 (대시보드용)
router.get('/list/detailed', async (req: Request, res: Response) => {
  try {
    const devices = await deviceManager.getAllDevicesDetailedInfo();
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