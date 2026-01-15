/**
 * 텍스트 매칭 서비스
 *
 * OCR을 사용하여 화면에서 텍스트를 찾고 좌표를 반환합니다.
 * Google Cloud Vision과 PaddleOCR을 지원합니다.
 */

import { ImageAnnotatorClient } from '@google-cloud/vision';
import type {
  OcrConfig,
  OcrEngine,
  OcrResult,
  DetectedText,
  TextSearchOptions,
  TextSearchResult,
  TextMatchType,
  SearchRegion,
} from './types';

// Google Vision vertex 타입
interface Vertex {
  x?: number | null;
  y?: number | null;
}

// ========================================
// 기본 설정
// ========================================

const DEFAULT_CONFIG: OcrConfig = {
  engine: 'googleVision',
  languages: ['ko', 'en'],
  paddleOcrUrl: 'http://localhost:8868',
};

// OCR 결과 캐시 (동일 화면에서 여러 텍스트 검색 시 재사용)
interface CacheEntry {
  result: OcrResult;
  timestamp: number;
}

const ocrCache = new Map<string, CacheEntry>();
const CACHE_TTL = 5000; // 5초

// ========================================
// TextMatcher 클래스
// ========================================

export class TextMatcher {
  private config: OcrConfig;
  private visionClient: ImageAnnotatorClient | null = null;

  constructor(config: Partial<OcrConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initializeEngine();
  }

  /**
   * OCR 엔진 초기화
   */
  private initializeEngine(): void {
    if (this.config.engine === 'googleVision') {
      try {
        // 환경 변수 또는 설정 파일에서 credentials 로드
        const credentials = this.config.googleCredentialsPath
          ? { keyFilename: this.config.googleCredentialsPath }
          : undefined;

        this.visionClient = new ImageAnnotatorClient(credentials);
        console.log('[TextMatcher] Google Cloud Vision 클라이언트 초기화 완료');
      } catch (error) {
        console.error('[TextMatcher] Google Cloud Vision 초기화 실패:', error);
      }
    }
  }

  /**
   * OCR 엔진 변경
   */
  setEngine(engine: OcrEngine): void {
    this.config.engine = engine;
    this.initializeEngine();
  }

  /**
   * 이미지에서 텍스트 감지 (OCR)
   */
  async detectText(imageBuffer: Buffer): Promise<OcrResult> {
    const startTime = Date.now();

    // 캐시 확인
    const cacheKey = this.getBufferHash(imageBuffer);
    const cached = ocrCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return {
        ...cached.result,
        processingTime: 0, // 캐시 히트
      };
    }

    try {
      let result: OcrResult;

      if (this.config.engine === 'googleVision') {
        result = await this.detectWithGoogleVision(imageBuffer);
      } else {
        result = await this.detectWithPaddleOcr(imageBuffer);
      }

      result.processingTime = Date.now() - startTime;

      // 캐시 저장
      ocrCache.set(cacheKey, {
        result,
        timestamp: Date.now(),
      });

      return result;
    } catch (error) {
      return {
        success: false,
        texts: [],
        fullText: '',
        processingTime: Date.now() - startTime,
        engine: this.config.engine,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Google Cloud Vision으로 텍스트 감지
   */
  private async detectWithGoogleVision(imageBuffer: Buffer): Promise<OcrResult> {
    if (!this.visionClient) {
      throw new Error('Google Cloud Vision 클라이언트가 초기화되지 않았습니다');
    }

    const [result] = await this.visionClient.textDetection({
      image: { content: imageBuffer },
    });

    const annotations = result.textAnnotations || [];
    const texts: DetectedText[] = [];

    // 첫 번째 항목은 전체 텍스트, 나머지가 개별 단어/문장
    for (let i = 1; i < annotations.length; i++) {
      const annotation = annotations[i];
      const vertices = (annotation.boundingPoly?.vertices || []) as Vertex[];

      if (vertices.length >= 4) {
        const x = Math.min(...vertices.map((v: Vertex) => v.x || 0));
        const y = Math.min(...vertices.map((v: Vertex) => v.y || 0));
        const maxX = Math.max(...vertices.map((v: Vertex) => v.x || 0));
        const maxY = Math.max(...vertices.map((v: Vertex) => v.y || 0));

        texts.push({
          text: annotation.description || '',
          boundingBox: {
            x,
            y,
            width: maxX - x,
            height: maxY - y,
          },
          confidence: annotation.score || 0.9, // Google Vision은 개별 confidence를 제공하지 않음
          centerX: x + (maxX - x) / 2,
          centerY: y + (maxY - y) / 2,
        });
      }
    }

    return {
      success: true,
      texts,
      fullText: annotations[0]?.description || '',
      processingTime: 0,
      engine: 'googleVision',
    };
  }

  /**
   * PaddleOCR로 텍스트 감지
   */
  private async detectWithPaddleOcr(imageBuffer: Buffer): Promise<OcrResult> {
    const url = `${this.config.paddleOcrUrl}/ocr`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
      },
      body: imageBuffer,
    });

    if (!response.ok) {
      throw new Error(`PaddleOCR 요청 실패: ${response.status}`);
    }

    const data = (await response.json()) as {
      results: Array<{
        text: string;
        confidence: number;
        box: number[][];
      }>;
    };

    const texts: DetectedText[] = [];
    let fullText = '';

    for (const item of data.results || []) {
      const box = item.box || [];
      if (box.length >= 4) {
        const x = Math.min(...box.map((p) => p[0]));
        const y = Math.min(...box.map((p) => p[1]));
        const maxX = Math.max(...box.map((p) => p[0]));
        const maxY = Math.max(...box.map((p) => p[1]));

        texts.push({
          text: item.text,
          boundingBox: {
            x,
            y,
            width: maxX - x,
            height: maxY - y,
          },
          confidence: item.confidence,
          centerX: x + (maxX - x) / 2,
          centerY: y + (maxY - y) / 2,
        });

        fullText += item.text + ' ';
      }
    }

    return {
      success: true,
      texts,
      fullText: fullText.trim(),
      processingTime: 0,
      engine: 'paddleOcr',
    };
  }

  /**
   * 텍스트 검색
   */
  async findText(
    imageBuffer: Buffer,
    searchText: string,
    options: TextSearchOptions = {}
  ): Promise<TextSearchResult> {
    const startTime = Date.now();
    const {
      matchType = 'contains',
      caseSensitive = false,
      region,
      index = 0,
      offset = { x: 0, y: 0 },
    } = options;

    try {
      // OCR 실행
      const ocrResult = await this.detectText(imageBuffer);

      if (!ocrResult.success) {
        return {
          found: false,
          allMatches: [],
          processingTime: Date.now() - startTime,
          error: ocrResult.error,
        };
      }

      // 영역 필터링
      let candidates = ocrResult.texts;
      if (region) {
        candidates = this.filterByRegion(candidates, region);
      }

      // 텍스트 매칭
      const matches = this.matchTexts(candidates, searchText, matchType, caseSensitive);

      if (matches.length === 0) {
        return {
          found: false,
          allMatches: [],
          processingTime: Date.now() - startTime,
        };
      }

      // 인덱스로 선택
      const selectedMatch = matches[Math.min(index, matches.length - 1)];

      return {
        found: true,
        match: selectedMatch,
        allMatches: matches,
        tapX: selectedMatch.centerX + offset.x,
        tapY: selectedMatch.centerY + offset.y,
        processingTime: Date.now() - startTime,
      };
    } catch (error) {
      return {
        found: false,
        allMatches: [],
        processingTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * 영역으로 필터링
   */
  private filterByRegion(texts: DetectedText[], region: SearchRegion): DetectedText[] {
    return texts.filter((t) => {
      const box = t.boundingBox;
      return (
        box.x >= region.x &&
        box.y >= region.y &&
        box.x + box.width <= region.x + region.width &&
        box.y + box.height <= region.y + region.height
      );
    });
  }

  /**
   * 텍스트 매칭
   */
  private matchTexts(
    texts: DetectedText[],
    searchText: string,
    matchType: TextMatchType,
    caseSensitive: boolean
  ): DetectedText[] {
    const normalizedSearch = caseSensitive ? searchText : searchText.toLowerCase();

    return texts.filter((t) => {
      const text = caseSensitive ? t.text : t.text.toLowerCase();

      switch (matchType) {
        case 'exact':
          return text === normalizedSearch;
        case 'contains':
          return text.includes(normalizedSearch);
        case 'regex':
          try {
            const regex = new RegExp(searchText, caseSensitive ? '' : 'i');
            return regex.test(t.text);
          } catch {
            return false;
          }
        default:
          return false;
      }
    });
  }

  /**
   * 캐시 클리어
   */
  clearCache(): void {
    ocrCache.clear();
  }

  /**
   * 버퍼 해시 생성 (캐시 키용)
   */
  private getBufferHash(buffer: Buffer): string {
    // 간단한 해시: 버퍼의 일부 바이트를 사용
    const sample = buffer.slice(0, 1000);
    let hash = 0;
    for (let i = 0; i < sample.length; i++) {
      hash = (hash << 5) - hash + sample[i];
      hash |= 0;
    }
    return `${buffer.length}_${hash}`;
  }
}

// 싱글톤 인스턴스
export const textMatcher = new TextMatcher();
