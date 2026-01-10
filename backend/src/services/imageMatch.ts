// backend/src/services/imageMatch.ts

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import type { ImageTemplate, MatchResult, ImageMatchOptions, HighlightOptions } from '../types';

const TEMPLATES_DIR = path.join(__dirname, '../../templates');

// 폴더 존재 확인
if (!fs.existsSync(TEMPLATES_DIR)) {
  fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
}

// 패키지별 템플릿 타입 확장
interface PackageTemplate extends ImageTemplate {
  packageId: string;
}

class ImageMatchService {
  // 패키지 폴더 경로 반환
  private getPackageDir(packageId: string): string {
    const dir = path.join(TEMPLATES_DIR, packageId);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  // 템플릿 메타파일 경로 (패키지별)
  private getMetaPath(packageId?: string): string {
    if (packageId) {
      return path.join(this.getPackageDir(packageId), 'templates.json');
    }
    return path.join(TEMPLATES_DIR, 'templates.json');
  }

  // 템플릿 목록 조회 (패키지 필터링 지원)
  getTemplates(packageId?: string): PackageTemplate[] {
    if (packageId) {
      // 특정 패키지의 템플릿만 조회
      const metaPath = this.getMetaPath(packageId);
      if (!fs.existsSync(metaPath)) {
        return [];
      }
      const data = fs.readFileSync(metaPath, 'utf-8');
      return JSON.parse(data);
    }

    // 전체 템플릿 조회 (모든 패키지 폴더 스캔)
    const allTemplates: PackageTemplate[] = [];

    // 루트의 레거시 템플릿 (패키지 없음)
    const rootMeta = path.join(TEMPLATES_DIR, 'templates.json');
    if (fs.existsSync(rootMeta)) {
      const data = fs.readFileSync(rootMeta, 'utf-8');
      const templates = JSON.parse(data) as ImageTemplate[];
      templates.forEach(t => allTemplates.push({ ...t, packageId: '' }));
    }

    // 패키지별 폴더 스캔
    const entries = fs.readdirSync(TEMPLATES_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const pkgMeta = path.join(TEMPLATES_DIR, entry.name, 'templates.json');
        if (fs.existsSync(pkgMeta)) {
          const data = fs.readFileSync(pkgMeta, 'utf-8');
          const templates = JSON.parse(data) as PackageTemplate[];
          templates.forEach(t => allTemplates.push({ ...t, packageId: entry.name }));
        }
      }
    }

    return allTemplates;
  }

  // 템플릿 저장 (패키지별)
  private saveTemplatesMeta(templates: PackageTemplate[], packageId?: string): void {
    const metaPath = this.getMetaPath(packageId);
    fs.writeFileSync(metaPath, JSON.stringify(templates, null, 2));
  }

  // 템플릿 추가 (패키지 지정 필수)
  async addTemplate(
    name: string,
    imageBuffer: Buffer,
    packageId?: string
  ): Promise<PackageTemplate> {
    const id = `tpl_${Date.now()}`;
    const filename = `${id}.png`;

    // 패키지 폴더에 저장
    const dir = packageId ? this.getPackageDir(packageId) : TEMPLATES_DIR;
    const filepath = path.join(dir, filename);

    // PNG로 변환 및 저장
    const image = sharp(imageBuffer);
    const metadata = await image.metadata();
    await image.png().toFile(filepath);

    const template: PackageTemplate = {
      id,
      name,
      filename,
      packageId: packageId || '',
      width: metadata.width || 0,
      height: metadata.height || 0,
      createdAt: new Date().toISOString(),
    };

    const templates = this.getTemplates(packageId);
    templates.push(template);
    this.saveTemplatesMeta(templates, packageId);

    return template;
  }

  // 템플릿 삭제
  deleteTemplate(id: string, packageId?: string): boolean {
    // 특정 패키지에서 삭제
    if (packageId) {
      const templates = this.getTemplates(packageId);
      const template = templates.find(t => t.id === id);

      if (!template) return false;

      // 파일 삭제
      const filepath = path.join(this.getPackageDir(packageId), template.filename);
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
      }

      // 메타데이터에서 제거
      const updated = templates.filter(t => t.id !== id);
      this.saveTemplatesMeta(updated, packageId);
      return true;
    }

    // 패키지 미지정 시 전체에서 검색
    const allTemplates = this.getTemplates();
    const template = allTemplates.find(t => t.id === id);

    if (!template) return false;

    // 해당 패키지에서 삭제
    return this.deleteTemplate(id, template.packageId || undefined);
  }

  // 템플릿 조회
  getTemplate(id: string, packageId?: string): PackageTemplate | null {
    const templates = this.getTemplates(packageId);
    return templates.find(t => t.id === id) || null;
  }

  // 템플릿 파일 경로 반환
  getTemplatePath(template: PackageTemplate): string {
    if (template.packageId) {
      return path.join(this.getPackageDir(template.packageId), template.filename);
    }
    return path.join(TEMPLATES_DIR, template.filename);
  }

  // 이미지 매칭 (슬라이딩 윈도우)
  async matchTemplate(
    screenshotBuffer: Buffer,
    templateId: string,
    options: ImageMatchOptions = {}
  ): Promise<MatchResult> {
    const { threshold = 0.9, region } = options;

    // 전체 템플릿에서 검색
    const template = this.getTemplate(templateId);
    if (!template) {
      throw new Error(`템플릿을 찾을 수 없습니다: ${templateId}`);
    }

    const templatePath = this.getTemplatePath(template);
    if (!fs.existsSync(templatePath)) {
      throw new Error(`템플릿 파일이 없습니다: ${template.filename}`);
    }

    // 이미지 로드
    let screenshotSharp = sharp(screenshotBuffer);
    
    // 영역 제한이 있으면 crop
    if (region) {
      screenshotSharp = screenshotSharp.extract({
        left: region.x,
        top: region.y,
        width: region.width,
        height: region.height,
      });
    }

    const [screenshotPng, templatePng] = await Promise.all([
      this.loadAsPng(await screenshotSharp.png().toBuffer()),
      this.loadAsPng(fs.readFileSync(templatePath)),
    ]);

    // 슬라이딩 윈도우로 최적 위치 찾기
    const result = this.findBestMatch(
      screenshotPng,
      templatePng,
      threshold,
      region
    );

    return result;
  }

  // Buffer를 PNG 객체로 변환
  private loadAsPng(buffer: Buffer): Promise<PNG> {
    return new Promise((resolve, reject) => {
      const png = new PNG();
      png.parse(buffer, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });
  }

  // 슬라이딩 윈도우 매칭
  private findBestMatch(
    screenshot: PNG,
    template: PNG,
    threshold: number,
    region?: { x: number; y: number; width: number; height: number }
  ): MatchResult {
    const sW = screenshot.width;
    const sH = screenshot.height;
    const tW = template.width;
    const tH = template.height;

    let bestMatch: MatchResult = {
      found: false,
      x: 0,
      y: 0,
      width: tW,
      height: tH,
      confidence: 0,
    };

    // 스텝 크기 (성능 최적화)
    const step = Math.max(1, Math.floor(Math.min(tW, tH) / 10));

    for (let y = 0; y <= sH - tH; y += step) {
      for (let x = 0; x <= sW - tW; x += step) {
        const confidence = this.calculateSimilarity(
          screenshot,
          template,
          x,
          y
        );

        if (confidence > bestMatch.confidence) {
          bestMatch = {
            found: confidence >= threshold,
            x: region ? region.x + x : x,
            y: region ? region.y + y : y,
            width: tW,
            height: tH,
            confidence,
          };

          // 임계값 이상이면 조기 종료
          if (confidence >= threshold) {
            // 정밀 검색 (1px 단위)
            bestMatch = this.refineMatch(
              screenshot,
              template,
              x,
              y,
              step,
              region
            );
            return bestMatch;
          }
        }
      }
    }

    return bestMatch;
  }

  // 정밀 매칭 (조기 종료 후 주변 탐색)
  private refineMatch(
    screenshot: PNG,
    template: PNG,
    roughX: number,
    roughY: number,
    step: number,
    region?: { x: number; y: number; width: number; height: number }
  ): MatchResult {
    const tW = template.width;
    const tH = template.height;
    const sW = screenshot.width;
    const sH = screenshot.height;

    let bestX = roughX;
    let bestY = roughY;
    let bestConfidence = 0;

    const startX = Math.max(0, roughX - step);
    const startY = Math.max(0, roughY - step);
    const endX = Math.min(sW - tW, roughX + step);
    const endY = Math.min(sH - tH, roughY + step);

    for (let y = startY; y <= endY; y++) {
      for (let x = startX; x <= endX; x++) {
        const confidence = this.calculateSimilarity(screenshot, template, x, y);
        if (confidence > bestConfidence) {
          bestConfidence = confidence;
          bestX = x;
          bestY = y;
        }
      }
    }

    return {
      found: true,
      x: region ? region.x + bestX : bestX,
      y: region ? region.y + bestY : bestY,
      width: tW,
      height: tH,
      confidence: bestConfidence,
    };
  }

  // 유사도 계산
  private calculateSimilarity(
    screenshot: PNG,
    template: PNG,
    offsetX: number,
    offsetY: number
  ): number {
    const tW = template.width;
    const tH = template.height;
    const totalPixels = tW * tH;

    let matchingPixels = 0;
    const tolerance = 30; // RGB 허용 오차

    for (let y = 0; y < tH; y++) {
      for (let x = 0; x < tW; x++) {
        const sIdx = ((offsetY + y) * screenshot.width + (offsetX + x)) * 4;
        const tIdx = (y * tW + x) * 4;

        const rDiff = Math.abs(screenshot.data[sIdx] - template.data[tIdx]);
        const gDiff = Math.abs(screenshot.data[sIdx + 1] - template.data[tIdx + 1]);
        const bDiff = Math.abs(screenshot.data[sIdx + 2] - template.data[tIdx + 2]);

        if (rDiff <= tolerance && gDiff <= tolerance && bDiff <= tolerance) {
          matchingPixels++;
        }
      }
    }

    return matchingPixels / totalPixels;
  }

  // 스크린샷에서 이미지 찾아서 중앙 좌표 반환
  async findImageCenter(
    screenshotBuffer: Buffer,
    templateId: string,
    options: ImageMatchOptions = {}
  ): Promise<{ found: boolean; x: number; y: number; confidence: number }> {
    const result = await this.matchTemplate(screenshotBuffer, templateId, options);

    return {
      found: result.found,
      x: result.x + Math.floor(result.width / 2),
      y: result.y + Math.floor(result.height / 2),
      confidence: result.confidence,
    };
  }

  /**
   * 스크린샷에 매칭된 영역 하이라이트 표시
   * @param screenshotBuffer 원본 스크린샷 버퍼
   * @param matchResult 매칭 결과 (위치, 크기 정보)
   * @param options 하이라이트 옵션
   * @returns 하이라이트가 그려진 PNG 버퍼
   */
  async createHighlightedScreenshot(
    screenshotBuffer: Buffer,
    matchResult: MatchResult,
    options: HighlightOptions = {}
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
    const x = Math.max(0, matchResult.x - padding);
    const y = Math.max(0, matchResult.y - padding);
    const width = Math.min(matchResult.width + padding * 2, imgWidth - x);
    const height = Math.min(matchResult.height + padding * 2, imgHeight - y);

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
   * 이미지 매칭 + 하이라이트 스크린샷 생성 (한번에 처리)
   * @param screenshotBuffer 원본 스크린샷 버퍼
   * @param templateId 템플릿 ID
   * @param matchOptions 매칭 옵션
   * @param highlightOptions 하이라이트 옵션
   * @returns 매칭 결과와 하이라이트 스크린샷
   */
  async matchAndHighlight(
    screenshotBuffer: Buffer,
    templateId: string,
    matchOptions: ImageMatchOptions = {},
    highlightOptions: HighlightOptions = {}
  ): Promise<{
    matchResult: MatchResult;
    highlightedBuffer: Buffer | null;
    centerX: number;
    centerY: number;
  }> {
    const matchResult = await this.matchTemplate(
      screenshotBuffer,
      templateId,
      matchOptions
    );

    let highlightedBuffer: Buffer | null = null;

    if (matchResult.found) {
      highlightedBuffer = await this.createHighlightedScreenshot(
        screenshotBuffer,
        matchResult,
        highlightOptions
      );
    }

    return {
      matchResult,
      highlightedBuffer,
      centerX: matchResult.x + Math.floor(matchResult.width / 2),
      centerY: matchResult.y + Math.floor(matchResult.height / 2),
    };
  }
}

export const imageMatchService = new ImageMatchService();