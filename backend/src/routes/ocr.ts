// backend/src/routes/ocr.ts

import { Router, Request, Response } from 'express';
import { textMatcher } from '../services/textMatcher';
import { sessionManager } from '../services/sessionManager';

const router = Router();

// OCR 텍스트 인식 테스트
router.post('/test', async (req: Request, res: Response) => {
  try {
    const { text, matchType, caseSensitive, deviceId, region } = req.body;

    if (!deviceId) {
      res.status(400).json({ success: false, error: 'deviceId가 필요합니다' });
      return;
    }

    // 세션 건강 상태 확인
    const isHealthy = await sessionManager.checkSessionHealth(deviceId);
    if (!isHealthy) {
      res.status(400).json({
        success: false,
        error: '해당 디바이스의 세션이 없거나 종료되었습니다.'
      });
      return;
    }

    const driver = sessionManager.getDriver(deviceId);
    if (!driver) {
      res.status(400).json({ success: false, error: `디바이스 세션을 찾을 수 없습니다: ${deviceId}` });
      return;
    }

    // 스크린샷 캡처 시간 측정
    const captureStart = Date.now();
    const screenshot = await driver.takeScreenshot();
    const screenshotBuffer = Buffer.from(screenshot, 'base64');
    const captureTime = Date.now() - captureStart;

    // OCR 실행 (텍스트 검색이 있으면 검색, 없으면 전체 텍스트 감지)
    const ocrStart = Date.now();

    if (text) {
      // 특정 텍스트 검색
      const result = await textMatcher.findText(screenshotBuffer, text, {
        matchType: matchType || 'contains',
        caseSensitive: caseSensitive || false,
        region,
      });
      const ocrTime = Date.now() - ocrStart;

      res.json({
        success: true,
        data: {
          mode: 'search',
          searchText: text,
          found: result.found,
          match: result.match ? {
            text: result.match.text,
            confidence: result.match.confidence,
            boundingBox: result.match.boundingBox,
            centerX: result.match.centerX,
            centerY: result.match.centerY,
          } : null,
          allMatches: result.allMatches.map(m => ({
            text: m.text,
            confidence: m.confidence,
            boundingBox: m.boundingBox,
            centerX: m.centerX,
            centerY: m.centerY,
          })),
          matchCount: result.allMatches.length,
          timing: {
            captureTime,
            ocrTime,
            totalTime: captureTime + ocrTime,
          },
        }
      });
    } else {
      // 전체 텍스트 감지
      const result = await textMatcher.detectText(screenshotBuffer);
      const ocrTime = Date.now() - ocrStart;

      res.json({
        success: true,
        data: {
          mode: 'detect',
          detected: result.success,
          fullText: result.fullText,
          textCount: result.texts.length,
          texts: result.texts.slice(0, 50).map(t => ({  // 최대 50개만 반환
            text: t.text,
            confidence: t.confidence,
            boundingBox: t.boundingBox,
            centerX: t.centerX,
            centerY: t.centerY,
          })),
          timing: {
            captureTime,
            ocrTime,
            totalTime: captureTime + ocrTime,
          },
          engine: result.engine,
        }
      });
    }
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

// OCR 캐시 클리어
router.post('/clear-cache', (_req: Request, res: Response) => {
  try {
    textMatcher.clearCache();
    res.json({ success: true, message: 'OCR 캐시가 클리어되었습니다.' });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
