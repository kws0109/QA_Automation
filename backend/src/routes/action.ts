// backend/src/routes/action.ts

import express, { Request, Response } from 'express';
import actions from '../appium/actions';

const router = express.Router();

// 요청 Body 인터페이스들
interface TapBody {
  x: number;
  y: number;
}

interface LongPressBody {
  x: number;
  y: number;
  duration?: number;
}

interface InputTextBody {
  selector: string;
  text: string;
  strategy?: string;
}

interface ClickBody {
  selector: string;
  strategy?: string;
}

interface WaitBody {
  duration: number;
}

interface AppPackageBody {
  appPackage?: string;
}

/**
 * POST /api/action/tap
 * 좌표 탭
 */
router.post('/tap', async (req: Request<object, object, TapBody>, res: Response) => {
  try {
    const { x, y } = req.body;

    if (x === undefined || y === undefined) {
      res.status(400).json({
        success: false,
        message: 'x, y 좌표가 필요합니다.',
      });
      return;
    }

    const result = await actions.tap(x, y);
    res.json(result);
  } catch (e) {
    const error = e as Error;
    console.error('탭 에러:', error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * POST /api/action/longPress
 * 롱프레스
 */
router.post('/longPress', async (req: Request<object, object, LongPressBody>, res: Response) => {
  try {
    const { x, y, duration = 1000 } = req.body;

    if (x === undefined || y === undefined) {
      res.status(400).json({
        success: false,
        message: 'x, y 좌표가 필요합니다.',
      });
      return;
    }

    const result = await actions.longPress(x, y, duration);
    res.json(result);
  } catch (e) {
    const error = e as Error;
    console.error('롱프레스 에러:', error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * POST /api/action/inputText
 * 텍스트 입력
 */
router.post('/inputText', async (req: Request<object, object, InputTextBody>, res: Response) => {
  try {
    const { selector, text, strategy = 'id' } = req.body;

    if (!selector || text === undefined) {
      res.status(400).json({
        success: false,
        message: 'selector와 text가 필요합니다.',
      });
      return;
    }

    const result = await actions.inputText(
      selector,
      text,
      strategy as 'id' | 'xpath' | 'accessibility id' | 'text'
    );
    res.json(result);
  } catch (e) {
    const error = e as Error;
    console.error('텍스트 입력 에러:', error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * POST /api/action/click
 * 요소 클릭
 */
router.post('/click', async (req: Request<object, object, ClickBody>, res: Response) => {
  try {
    const { selector, strategy = 'id' } = req.body;

    if (!selector) {
      res.status(400).json({
        success: false,
        message: 'selector가 필요합니다.',
      });
      return;
    }

    const result = await actions.clickElement(
      selector,
      strategy as 'id' | 'xpath' | 'accessibility id' | 'text'
    );
    res.json(result);
  } catch (e) {
    const error = e as Error;
    console.error('클릭 에러:', error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * POST /api/action/wait
 * 대기
 */
router.post('/wait', async (req: Request<object, object, WaitBody>, res: Response) => {
  try {
    const { duration } = req.body;

    if (!duration) {
      res.status(400).json({
        success: false,
        message: 'duration이 필요합니다.',
      });
      return;
    }

    const result = await actions.wait(duration);
    res.json(result);
  } catch (e) {
    const error = e as Error;
    console.error('대기 에러:', error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * POST /api/action/back
 * 뒤로 가기
 */
router.post('/back', async (_req: Request, res: Response) => {
  try {
    const result = await actions.pressBack();
    res.json(result);
  } catch (e) {
    const error = e as Error;
    console.error('뒤로 가기 에러:', error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * POST /api/action/home
 * 홈 버튼
 */
router.post('/home', async (_req: Request, res: Response) => {
  try {
    const result = await actions.pressHome();
    res.json(result);
  } catch (e) {
    const error = e as Error;
    console.error('홈 버튼 에러:', error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * POST /api/action/restart
 * 앱 재시작
 */
router.post('/restart', async (_req: Request, res: Response) => {
  try {
    const result = await actions.restartApp();
    res.json(result);
  } catch (e) {
    const error = e as Error;
    console.error('앱 재시작 에러:', error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * POST /api/action/clearData
 * 앱 데이터 삭제 (완전 초기화)
 */
router.post('/clearData', async (req: Request<object, object, AppPackageBody>, res: Response) => {
  try {
    const { appPackage } = req.body;

    const result = await actions.clearAppData(appPackage);
    res.json(result);
  } catch (e) {
    const error = e as Error;
    console.error('앱 데이터 삭제 에러:', error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * POST /api/action/clearCache
 * 앱 캐시만 삭제
 */
router.post('/clearCache', async (req: Request<object, object, AppPackageBody>, res: Response) => {
  try {
    const { appPackage } = req.body;

    const result = await actions.clearAppCache(appPackage);
    res.json(result);
  } catch (e) {
    const error = e as Error;
    console.error('앱 캐시 삭제 에러:', error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

export default router;