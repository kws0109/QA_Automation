/**
 * 텍스트 매칭 서비스
 *
 * OCR을 사용하여 화면에서 텍스트를 찾고 좌표를 반환합니다.
 * Google Cloud Vision과 PaddleOCR을 지원합니다.
 */

import path from 'path';
import { ImageAnnotatorClient } from '@google-cloud/vision';
import sharp from 'sharp';
import type {
  OcrConfig,
  OcrEngine,
  OcrResult,
  DetectedText,
  TextSearchOptions,
  TextSearchResult,
  TextMatchType,
  SearchRegion,
  ExtractTextResult,
  TextHighlightOptions,
  TextSearchWithHighlightResult,
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
   * Google Cloud Vision으로 텍스트 감지 (documentTextDetection 사용)
   * documentTextDetection은 개별 단어에 대한 confidence를 제공함
   */
  private async detectWithGoogleVision(imageBuffer: Buffer): Promise<OcrResult> {
    if (!this.visionClient) {
      throw new Error('Google Cloud Vision 클라이언트가 초기화되지 않았습니다');
    }

    const [result] = await this.visionClient.documentTextDetection({
      image: { content: imageBuffer },
    });

    const fullTextAnnotation = result.fullTextAnnotation;
    const texts: DetectedText[] = [];
    let fullText = '';

    if (fullTextAnnotation) {
      fullText = fullTextAnnotation.text || '';

      // pages -> blocks -> paragraphs -> words 순회
      for (const page of fullTextAnnotation.pages || []) {
        for (const block of page.blocks || []) {
          for (const paragraph of block.paragraphs || []) {
            for (const word of paragraph.words || []) {
              // 단어의 심볼들을 결합하여 텍스트 생성
              const wordText = (word.symbols || [])
                .map((s) => s.text || '')
                .join('');

              if (!wordText) continue;

              // 단어의 boundingBox 추출
              const vertices = (word.boundingBox?.vertices || []) as Vertex[];
              if (vertices.length < 4) continue;

              const x = Math.min(...vertices.map((v: Vertex) => v.x || 0));
              const y = Math.min(...vertices.map((v: Vertex) => v.y || 0));
              const maxX = Math.max(...vertices.map((v: Vertex) => v.x || 0));
              const maxY = Math.max(...vertices.map((v: Vertex) => v.y || 0));

              // 단어의 confidence (0-1 범위)
              const confidence = word.confidence || 0;

              texts.push({
                text: wordText,
                boundingBox: {
                  x,
                  y,
                  width: maxX - x,
                  height: maxY - y,
                },
                confidence,
                centerX: x + (maxX - x) / 2,
                centerY: y + (maxY - y) / 2,
              });
            }
          }
        }
      }
    }

    return {
      success: true,
      texts,
      fullText,
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
   * 1단계: 개별 토큰에서 검색
   * 2단계: 인접 토큰 결합하여 검색 (1단계 실패 시)
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
        console.log(`[OCR Debug] ❌ OCR 실패: ${ocrResult.error}`);
        return {
          found: false,
          allMatches: [],
          processingTime: Date.now() - startTime,
          error: ocrResult.error,
        };
      }

      // 디버그: OCR 감지 결과
      console.log(`[OCR Debug] 🔍 검색어: "${searchText}" (matchType: ${matchType})`);
      console.log(`[OCR Debug] 📝 전체 감지 토큰 (${ocrResult.texts.length}개):`);
      console.log(`[OCR Debug]    ${ocrResult.texts.map(t => `"${t.text}"`).join(', ')}`);

      // 영역 필터링
      let candidates = ocrResult.texts;
      if (region) {
        candidates = this.filterByRegion(candidates, region);
        console.log(`[OCR Debug] 📍 ROI 필터 후 (${candidates.length}개):`);
        console.log(`[OCR Debug]    ${candidates.map(t => `"${t.text}"`).join(', ')}`);
      }

      // 1단계: 개별 토큰에서 매칭
      let matches = this.matchTexts(candidates, searchText, matchType, caseSensitive);
      console.log(`[OCR Debug] 1️⃣ 개별 토큰 매칭: ${matches.length}개 발견`);
      if (matches.length > 0) {
        console.log(`[OCR Debug]    매칭된 텍스트: ${matches.map(m => `"${m.text}"`).join(', ')}`);
      }

      // 2단계: 개별 토큰에서 못 찾으면 인접 토큰 결합하여 검색
      if (matches.length === 0 && matchType !== 'exact') {
        matches = this.findInCombinedTokens(candidates, searchText, caseSensitive);
        console.log(`[OCR Debug] 2️⃣ 결합 토큰 매칭: ${matches.length}개 발견`);
        if (matches.length > 0) {
          console.log(`[OCR Debug]    매칭된 텍스트: ${matches.map(m => `"${m.text}"`).join(', ')}`);
        }
      }

      if (matches.length === 0) {
        console.log(`[OCR Debug] ❌ 매칭 실패 - "${searchText}" 찾지 못함`);
        return {
          found: false,
          allMatches: [],
          processingTime: Date.now() - startTime,
        };
      }

      // 인덱스로 선택
      const selectedMatch = matches[Math.min(index, matches.length - 1)];

      console.log(`[OCR Debug] ✅ 매칭 성공! "${selectedMatch.text}" at (${selectedMatch.centerX.toFixed(0)}, ${selectedMatch.centerY.toFixed(0)})`);

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
   * 인접 토큰들을 결합하여 텍스트 검색
   * Y좌표가 비슷한 토큰들을 같은 줄로 간주하고 결합
   */
  private findInCombinedTokens(
    texts: DetectedText[],
    searchText: string,
    caseSensitive: boolean
  ): DetectedText[] {
    const normalizedSearch = caseSensitive ? searchText : searchText.toLowerCase();
    const results: DetectedText[] = [];

    // Y좌표 기준으로 같은 줄의 토큰들을 그룹화 (Y 차이가 토큰 높이의 50% 이내면 같은 줄)
    const lines: DetectedText[][] = [];
    const sortedTexts = [...texts].sort((a, b) => a.boundingBox.y - b.boundingBox.y);

    for (const text of sortedTexts) {
      const avgHeight = text.boundingBox.height;
      const threshold = avgHeight * 0.5;

      // 기존 줄에 추가할 수 있는지 확인
      let addedToLine = false;
      for (const line of lines) {
        const lineY = line[0].boundingBox.y;
        if (Math.abs(text.boundingBox.y - lineY) <= threshold) {
          line.push(text);
          addedToLine = true;
          break;
        }
      }

      if (!addedToLine) {
        lines.push([text]);
      }
    }

    // 각 줄 내에서 X좌표로 정렬
    for (const line of lines) {
      line.sort((a, b) => a.boundingBox.x - b.boundingBox.x);
    }

    // 각 줄에서 연속 토큰들을 결합하여 검색
    for (const line of lines) {
      // 슬라이딩 윈도우: 2~5개 토큰 결합
      for (let windowSize = 2; windowSize <= Math.min(5, line.length); windowSize++) {
        for (let startIdx = 0; startIdx <= line.length - windowSize; startIdx++) {
          const windowTokens = line.slice(startIdx, startIdx + windowSize);
          const combinedText = windowTokens.map((t) => t.text).join('');
          const normalizedCombined = caseSensitive ? combinedText : combinedText.toLowerCase();

          if (normalizedCombined.includes(normalizedSearch)) {
            // 결합된 바운딩 박스 계산
            const minX = Math.min(...windowTokens.map((t) => t.boundingBox.x));
            const minY = Math.min(...windowTokens.map((t) => t.boundingBox.y));
            const maxX = Math.max(...windowTokens.map((t) => t.boundingBox.x + t.boundingBox.width));
            const maxY = Math.max(...windowTokens.map((t) => t.boundingBox.y + t.boundingBox.height));

            results.push({
              text: combinedText,
              boundingBox: {
                x: minX,
                y: minY,
                width: maxX - minX,
                height: maxY - minY,
              },
              confidence: Math.min(...windowTokens.map((t) => t.confidence)),
              centerX: minX + (maxX - minX) / 2,
              centerY: minY + (maxY - minY) / 2,
            });
          }
        }
      }
    }

    // 중복 제거 (같은 위치의 결과)
    const uniqueResults = results.filter((result, idx, arr) => {
      return !arr.slice(0, idx).some(
        (prev) =>
          Math.abs(prev.centerX - result.centerX) < 10 &&
          Math.abs(prev.centerY - result.centerY) < 10
      );
    });

    return uniqueResults;
  }

  /**
   * 특정 영역에서 텍스트 추출
   * ROI 내의 모든 텍스트를 감지하고 줄 단위로 결합하여 반환
   */
  async extractTextFromRegion(
    imageBuffer: Buffer,
    region: SearchRegion
  ): Promise<ExtractTextResult> {
    const startTime = Date.now();

    try {
      // OCR 실행
      const ocrResult = await this.detectText(imageBuffer);

      if (!ocrResult.success) {
        return {
          success: false,
          texts: [],
          combinedText: '',
          lines: [],
          processingTime: Date.now() - startTime,
          error: ocrResult.error,
        };
      }

      // 영역 내 텍스트만 필터링
      const regionTexts = this.filterByRegion(ocrResult.texts, region);

      if (regionTexts.length === 0) {
        return {
          success: true,
          texts: [],
          combinedText: '',
          lines: [],
          processingTime: Date.now() - startTime,
        };
      }

      // 줄 단위로 그룹화하여 텍스트 결합
      const { combinedText, lines } = this.combineTextsToLines(regionTexts);

      return {
        success: true,
        texts: regionTexts,
        combinedText,
        lines,
        processingTime: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        texts: [],
        combinedText: '',
        lines: [],
        processingTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * 텍스트들을 줄 단위로 그룹화하고 결합
   */
  private combineTextsToLines(texts: DetectedText[]): { combinedText: string; lines: string[] } {
    if (texts.length === 0) {
      return { combinedText: '', lines: [] };
    }

    // Y좌표 기준으로 같은 줄 그룹화
    const lineGroups: DetectedText[][] = [];
    const sortedTexts = [...texts].sort((a, b) => a.boundingBox.y - b.boundingBox.y);

    for (const text of sortedTexts) {
      const avgHeight = text.boundingBox.height;
      const threshold = avgHeight * 0.5;

      let addedToLine = false;
      for (const lineGroup of lineGroups) {
        const lineY = lineGroup[0].boundingBox.y;
        if (Math.abs(text.boundingBox.y - lineY) <= threshold) {
          lineGroup.push(text);
          addedToLine = true;
          break;
        }
      }

      if (!addedToLine) {
        lineGroups.push([text]);
      }
    }

    // 각 줄 내에서 X좌표로 정렬 후 결합
    const lines: string[] = [];
    for (const lineGroup of lineGroups) {
      lineGroup.sort((a, b) => a.boundingBox.x - b.boundingBox.x);
      const lineText = lineGroup.map((t) => t.text).join(' ');
      lines.push(lineText);
    }

    const combinedText = lines.join('\n');

    return { combinedText, lines };
  }

  /**
   * 영역으로 필터링
   * 텍스트의 중심점이 영역 안에 있으면 포함 (더 관대한 필터링)
   */
  private filterByRegion(texts: DetectedText[], region: SearchRegion): DetectedText[] {
    return texts.filter((t) => {
      // 텍스트의 중심점이 영역 안에 있는지 확인
      return (
        t.centerX >= region.x &&
        t.centerX <= region.x + region.width &&
        t.centerY >= region.y &&
        t.centerY <= region.y + region.height
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

  /**
   * 스크린샷에 텍스트 영역 하이라이트 표시
   * @param screenshotBuffer 원본 스크린샷 버퍼
   * @param detectedText 감지된 텍스트 (바운딩 박스 정보)
   * @param options 하이라이트 옵션
   * @returns 하이라이트가 그려진 PNG 버퍼
   */
  async createHighlightedScreenshot(
    screenshotBuffer: Buffer,
    detectedText: DetectedText,
    options: TextHighlightOptions = {}
  ): Promise<Buffer> {
    const {
      color = '#00FF00',
      strokeWidth = 4,
      padding = 2,
    } = options;

    // 색상 파싱 (hex to rgb)
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);

    // 스크린샷 메타데이터 조회
    const metadata = await sharp(screenshotBuffer).metadata();
    const imgWidth = metadata.width || 0;
    const imgHeight = metadata.height || 0;

    // 하이라이트 영역 계산 (패딩 적용)
    const box = detectedText.boundingBox;
    const x = Math.max(0, box.x - padding);
    const y = Math.max(0, box.y - padding);
    const width = Math.min(box.width + padding * 2, imgWidth - x);
    const height = Math.min(box.height + padding * 2, imgHeight - y);

    // SVG로 사각형 테두리 생성
    const svg = `
      <svg width="${imgWidth}" height="${imgHeight}">
        <rect
          x="${x}"
          y="${y}"
          width="${width}"
          height="${height}"
          fill="none"
          stroke="rgb(${r},${g},${b})"
          stroke-width="${strokeWidth}"
        />
        <rect
          x="${x}"
          y="${y}"
          width="${width}"
          height="${height}"
          fill="rgba(${r},${g},${b},0.15)"
        />
      </svg>
    `;

    // 원본 스크린샷에 SVG 오버레이
    const highlightedBuffer = await sharp(screenshotBuffer)
      .composite([
        {
          input: Buffer.from(svg),
          top: 0,
          left: 0,
        },
      ])
      .png()
      .toBuffer();

    return highlightedBuffer;
  }

  /**
   * 텍스트 검색 + 하이라이트 스크린샷 생성 (한번에 처리)
   * @param imageBuffer 원본 스크린샷 버퍼
   * @param searchText 검색할 텍스트
   * @param searchOptions 텍스트 검색 옵션
   * @param highlightOptions 하이라이트 옵션
   * @returns 검색 결과와 하이라이트 스크린샷
   */
  async findTextAndHighlight(
    imageBuffer: Buffer,
    searchText: string,
    searchOptions: TextSearchOptions = {},
    highlightOptions: TextHighlightOptions = {}
  ): Promise<TextSearchWithHighlightResult> {
    const result = await this.findText(imageBuffer, searchText, searchOptions);

    let highlightedBuffer: Buffer | undefined;

    if (result.found && result.match) {
      highlightedBuffer = await this.createHighlightedScreenshot(
        imageBuffer,
        result.match,
        highlightOptions
      );
    }

    return {
      ...result,
      highlightedBuffer,
    };
  }
}

// 싱글톤 인스턴스 (Google Cloud credentials 경로 설정)
// __dirname = backend/src/services/textMatcher/ → 프로젝트 루트는 4단계 상위
const googleCredentialsPath = path.join(__dirname, '../../../../google_key.json');
export const textMatcher = new TextMatcher({
  googleCredentialsPath,
});
