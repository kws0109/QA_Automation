// backend/src/services/imageMatch.ts

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import type { ImageTemplate, MatchResult, ImageMatchOptions } from '../types';

const TEMPLATES_DIR = path.join(__dirname, '../../templates');

// 폴더 존재 확인
if (!fs.existsSync(TEMPLATES_DIR)) {
  fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
}

class ImageMatchService {
  // 템플릿 목록 조회
  getTemplates(): ImageTemplate[] {
    const metaPath = path.join(TEMPLATES_DIR, 'templates.json');
    if (!fs.existsSync(metaPath)) {
      return [];
    }
    const data = fs.readFileSync(metaPath, 'utf-8');
    return JSON.parse(data);
  }

  // 템플릿 저장
  private saveTemplatesMeta(templates: ImageTemplate[]): void {
    const metaPath = path.join(TEMPLATES_DIR, 'templates.json');
    fs.writeFileSync(metaPath, JSON.stringify(templates, null, 2));
  }

  // 템플릿 추가
  async addTemplate(
    name: string,
    imageBuffer: Buffer
  ): Promise<ImageTemplate> {
    const id = `tpl_${Date.now()}`;
    const filename = `${id}.png`;
    const filepath = path.join(TEMPLATES_DIR, filename);

    // PNG로 변환 및 저장
    const image = sharp(imageBuffer);
    const metadata = await image.metadata();
    await image.png().toFile(filepath);

    const template: ImageTemplate = {
      id,
      name,
      filename,
      width: metadata.width || 0,
      height: metadata.height || 0,
      createdAt: new Date().toISOString(),
    };

    const templates = this.getTemplates();
    templates.push(template);
    this.saveTemplatesMeta(templates);

    return template;
  }

  // 템플릿 삭제
  deleteTemplate(id: string): boolean {
    const templates = this.getTemplates();
    const template = templates.find(t => t.id === id);
    
    if (!template) return false;

    // 파일 삭제
    const filepath = path.join(TEMPLATES_DIR, template.filename);
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }

    // 메타데이터에서 제거
    const updated = templates.filter(t => t.id !== id);
    this.saveTemplatesMeta(updated);

    return true;
  }

  // 템플릿 조회
  getTemplate(id: string): ImageTemplate | null {
    const templates = this.getTemplates();
    return templates.find(t => t.id === id) || null;
  }

  // 이미지 매칭 (슬라이딩 윈도우)
  async matchTemplate(
    screenshotBuffer: Buffer,
    templateId: string,
    options: ImageMatchOptions = {}
  ): Promise<MatchResult> {
    const { threshold = 0.9, region } = options;

    const template = this.getTemplate(templateId);
    if (!template) {
      throw new Error(`템플릿을 찾을 수 없습니다: ${templateId}`);
    }

    const templatePath = path.join(TEMPLATES_DIR, template.filename);
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
}

export const imageMatchService = new ImageMatchService();