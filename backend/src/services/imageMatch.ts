// backend/src/services/imageMatch.ts

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import cv from '@u4/opencv4nodejs';
import type { ImageTemplate, MatchResult, ImageMatchOptions, HighlightOptions, MultiScaleOptions, RegionOptions } from '../types';

// OpenCV 네이티브 버전 사용 (초기화 불필요)
console.log('[OpenCV] 네이티브 버전 로드됨:', cv.version);

const TEMPLATES_DIR = path.join(__dirname, '../../templates');

// 폴더 존재 확인
if (!fs.existsSync(TEMPLATES_DIR)) {
  fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
}

// 패키지별 템플릿 타입 확장
interface PackageTemplate extends ImageTemplate {
  packageId: string;
}

// 캡처 좌표 정보 타입 (ROI 자동 계산용)
export interface CaptureInfo {
  x: number;           // 원본 스크린샷에서의 X 좌표
  y: number;           // 원본 스크린샷에서의 Y 좌표
  sourceWidth: number; // 원본 스크린샷 너비
  sourceHeight: number;// 원본 스크린샷 높이
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

  // 템플릿 추가 (패키지 지정 필수, 캡처 좌표 선택)
  async addTemplate(
    name: string,
    imageBuffer: Buffer,
    packageId?: string,
    captureInfo?: CaptureInfo
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
      // 캡처 좌표 정보 (ROI 자동 계산용)
      ...(captureInfo && {
        captureX: captureInfo.x,
        captureY: captureInfo.y,
        sourceWidth: captureInfo.sourceWidth,
        sourceHeight: captureInfo.sourceHeight,
      }),
    };

    const templates = this.getTemplates(packageId);
    templates.push(template);
    this.saveTemplatesMeta(templates, packageId);

    console.log(`[ImageMatch] 템플릿 저장: ${name} (${metadata.width}x${metadata.height})${captureInfo ? ` @ (${captureInfo.x}, ${captureInfo.y}) from ${captureInfo.sourceWidth}x${captureInfo.sourceHeight}` : ''}`);

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

  // ROI 자동 계산 (템플릿 캡처 좌표 기반)
  calculateRecommendedROI(
    template: ImageTemplate,
    marginRatio: number = 0.2  // 템플릿 크기의 20% 여유
  ): RegionOptions | null {
    // 캡처 좌표 정보가 없으면 null 반환
    if (
      template.captureX === undefined ||
      template.captureY === undefined ||
      !template.sourceWidth ||
      !template.sourceHeight
    ) {
      console.log(`[ROI] 템플릿 ${template.id}에 캡처 좌표 정보 없음 - ROI 자동 계산 불가`);
      return null;
    }

    // 상대 좌표로 변환 + 여유 마진 적용
    const templateRelWidth = template.width / template.sourceWidth;
    const templateRelHeight = template.height / template.sourceHeight;
    const marginX = templateRelWidth * marginRatio;
    const marginY = templateRelHeight * marginRatio;

    const x = Math.max(0, (template.captureX / template.sourceWidth) - marginX);
    const y = Math.max(0, (template.captureY / template.sourceHeight) - marginY);
    const width = Math.min(1 - x, templateRelWidth + marginX * 2);
    const height = Math.min(1 - y, templateRelHeight + marginY * 2);

    const roi: RegionOptions = {
      x: Math.round(x * 10000) / 10000,  // 소수점 4자리로 반올림
      y: Math.round(y * 10000) / 10000,
      width: Math.round(width * 10000) / 10000,
      height: Math.round(height * 10000) / 10000,
      type: 'relative',
    };

    console.log(`[ROI] 템플릿 ${template.id} 추천 ROI: x=${roi.x}, y=${roi.y}, w=${roi.width}, h=${roi.height} (마진 ${marginRatio * 100}%)`);

    return roi;
  }

  // 템플릿 파일 경로 반환
  getTemplatePath(template: PackageTemplate): string {
    if (template.packageId) {
      return path.join(this.getPackageDir(template.packageId), template.filename);
    }
    return path.join(TEMPLATES_DIR, template.filename);
  }

  // 템플릿 ID로 이미지 파일 경로 반환 (모든 패키지에서 검색)
  getTemplateImagePath(templateId: string): string | null {
    const template = this.getTemplate(templateId);
    if (!template) return null;
    return this.getTemplatePath(template);
  }

  // 상대 좌표를 절대 좌표로 변환
  private convertRegionToAbsolute(
    region: RegionOptions,
    imageWidth: number,
    imageHeight: number
  ): { x: number; y: number; width: number; height: number } {
    if (region.type === 'relative') {
      // 상대 좌표 (0-1 비율)를 절대 좌표로 변환
      const x = Math.round(region.x * imageWidth);
      const y = Math.round(region.y * imageHeight);
      const width = Math.round(region.width * imageWidth);
      const height = Math.round(region.height * imageHeight);

      console.log(`[ROI] 상대→절대 변환: (${region.x}, ${region.y}, ${region.width}, ${region.height}) → (${x}, ${y}, ${width}, ${height})`);

      return { x, y, width, height };
    }

    // 이미 절대 좌표
    return {
      x: region.x,
      y: region.y,
      width: region.width,
      height: region.height,
    };
  }

  // 이미지 매칭 (슬라이딩 윈도우) - 멀티스케일 + ROI 지원
  async matchTemplate(
    screenshotBuffer: Buffer,
    templateId: string,
    options: ImageMatchOptions = {}
  ): Promise<MatchResult> {
    const startTime = Date.now();
    const { threshold = 0.9, region, multiScale, grayscale = false } = options;

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

    // 스크린샷 크기 조회 (성능 메트릭용)
    const screenshotMetadata = await sharp(screenshotBuffer).metadata();
    const screenshotSize = {
      width: screenshotMetadata.width || 0,
      height: screenshotMetadata.height || 0,
    };

    // ROI 영역 처리
    let absoluteRegion: { x: number; y: number; width: number; height: number } | undefined;

    const preprocessStart = Date.now();

    if (region) {
      const imgWidth = screenshotSize.width;
      const imgHeight = screenshotSize.height;

      // 상대 좌표를 절대 좌표로 변환
      absoluteRegion = this.convertRegionToAbsolute(region, imgWidth, imgHeight);

      // 영역 유효성 검사
      if (absoluteRegion.x < 0 || absoluteRegion.y < 0 ||
          absoluteRegion.x + absoluteRegion.width > imgWidth ||
          absoluteRegion.y + absoluteRegion.height > imgHeight) {
        console.warn(`[ROI] 영역이 이미지 범위를 벗어남. 조정 중...`);
        absoluteRegion.x = Math.max(0, Math.min(absoluteRegion.x, imgWidth - 1));
        absoluteRegion.y = Math.max(0, Math.min(absoluteRegion.y, imgHeight - 1));
        absoluteRegion.width = Math.min(absoluteRegion.width, imgWidth - absoluteRegion.x);
        absoluteRegion.height = Math.min(absoluteRegion.height, imgHeight - absoluteRegion.y);
      }

      console.log(`[ROI] 검색 영역: (${absoluteRegion.x}, ${absoluteRegion.y}) ${absoluteRegion.width}x${absoluteRegion.height}`);

      screenshotSharp = screenshotSharp.extract({
        left: absoluteRegion.x,
        top: absoluteRegion.y,
        width: absoluteRegion.width,
        height: absoluteRegion.height,
      });
    }

    // 그레이스케일 변환 (옵션) - OpenCV에서 자동 처리하므로 주석 처리
    // if (grayscale) {
    //   screenshotSharp = screenshotSharp.grayscale();
    // }

    const templateBuffer = fs.readFileSync(templatePath);
    const preprocessTime = Date.now() - preprocessStart;

    let result: MatchResult;

    // 멀티스케일 매칭
    if (multiScale?.enabled) {
      result = await this.findBestMatchMultiScale(
        await screenshotSharp.png().toBuffer(),
        templateBuffer,
        threshold,
        absoluteRegion,  // 절대 좌표로 변환된 ROI 전달
        multiScale
      );
    } else {
      // 단일 스케일 매칭 (OpenCV 사용)
      const processedScreenshot = await screenshotSharp.png().toBuffer();
      result = await this.matchTemplateOpenCV(
        processedScreenshot,
        templateBuffer,
        threshold,
        absoluteRegion
      );
    }

    // 성능 메트릭 추가
    const matchTime = Date.now() - startTime;
    result.metrics = {
      matchTime,
      preprocessTime,
      templateId,
      templateName: template.name,
      templateSize: { width: template.width, height: template.height },
      threshold,
      roiUsed: !!region,
      roiRegion: absoluteRegion,
      multiScaleUsed: !!multiScale?.enabled,
      screenshotSize,
    };

    console.log(`[ImageMatch] 매칭 완료: ${matchTime}ms (전처리: ${preprocessTime}ms), confidence: ${result.confidence.toFixed(4)}`);

    return result;
  }

  // 멀티스케일 매칭 (여러 스케일로 템플릿 리사이즈 후 매칭) - OpenCV 기반
  private async findBestMatchMultiScale(
    screenshotBuffer: Buffer,
    templateBuffer: Buffer,
    threshold: number,
    region: { x: number; y: number; width: number; height: number } | undefined,
    multiScaleOptions: MultiScaleOptions
  ): Promise<MatchResult> {
    const {
      minScale = 0.7,
      maxScale = 1.3,
      scaleSteps = 5,
    } = multiScaleOptions;

    // 스케일 목록 생성 (1.0을 먼저 시도하도록 정렬)
    const scales: number[] = [];
    const scaleStep = (maxScale - minScale) / (scaleSteps - 1);

    for (let i = 0; i < scaleSteps; i++) {
      scales.push(minScale + scaleStep * i);
    }

    // 1.0에 가까운 순서로 정렬 (원본 크기 우선)
    scales.sort((a, b) => Math.abs(a - 1.0) - Math.abs(b - 1.0));

    let bestResult: MatchResult = {
      found: false,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      confidence: 0,
      scale: 1.0,
    };

    // 스크린샷/템플릿 메타데이터
    const screenshotMeta = await sharp(screenshotBuffer).metadata();
    const screenshotWidth = screenshotMeta.width || 0;
    const screenshotHeight = screenshotMeta.height || 0;

    const originalMeta = await sharp(templateBuffer).metadata();
    const originalWidth = originalMeta.width || 0;
    const originalHeight = originalMeta.height || 0;

    console.log(`[MultiScale] 스케일 범위: ${minScale} ~ ${maxScale}, 단계: ${scaleSteps}`);

    for (const scale of scales) {
      // 스케일된 템플릿 크기 계산
      const scaledWidth = Math.round(originalWidth * scale);
      const scaledHeight = Math.round(originalHeight * scale);

      // 스케일된 크기가 스크린샷보다 크면 스킵
      if (scaledWidth > screenshotWidth || scaledHeight > screenshotHeight) {
        console.log(`[MultiScale] 스케일 ${scale.toFixed(2)} 스킵 (템플릿이 스크린샷보다 큼)`);
        continue;
      }

      // 템플릿 리사이즈
      const scaledTemplateBuffer = await sharp(templateBuffer)
        .resize(scaledWidth, scaledHeight, { fit: 'fill' })
        .png()
        .toBuffer();

      // OpenCV 매칭 시도
      const result = await this.matchTemplateOpenCV(
        screenshotBuffer,
        scaledTemplateBuffer,
        threshold,
        region
      );

      console.log(`[MultiScale] 스케일 ${scale.toFixed(2)}: 신뢰도 ${(result.confidence * 100).toFixed(1)}%`);

      // 더 좋은 결과면 업데이트
      if (result.confidence > bestResult.confidence) {
        bestResult = {
          ...result,
          scale,
        };

        // 임계값 이상이면 조기 종료
        if (result.found) {
          console.log(`[MultiScale] 매칭 성공! 스케일: ${scale.toFixed(2)}, 신뢰도: ${(result.confidence * 100).toFixed(1)}%`);
          return bestResult;
        }
      }
    }

    console.log(`[MultiScale] 최종 결과: found=${bestResult.found}, 스케일=${bestResult.scale?.toFixed(2)}, 신뢰도=${(bestResult.confidence * 100).toFixed(1)}%`);
    return bestResult;
  }

  // OpenCV 템플릿 매칭 (TM_CCOEFF_NORMED) - 네이티브 버전
  private async matchTemplateOpenCV(
    screenshotBuffer: Buffer,
    templateBuffer: Buffer,
    threshold: number,
    region?: { x: number; y: number; width: number; height: number }
  ): Promise<MatchResult> {
    // PNG 버퍼를 cv.Mat으로 변환
    const srcMat = cv.imdecode(screenshotBuffer);
    const tmplMat = cv.imdecode(templateBuffer);

    const sW = srcMat.cols;
    const sH = srcMat.rows;
    const tW = tmplMat.cols;
    const tH = tmplMat.rows;

    // 템플릿이 스크린샷보다 크면 실패
    if (tW > sW || tH > sH) {
      return {
        found: false,
        x: 0,
        y: 0,
        width: tW,
        height: tH,
        confidence: 0,
      };
    }

    // 그레이스케일 변환 (매칭 성능 향상)
    const srcGray = srcMat.cvtColor(cv.COLOR_BGR2GRAY);
    const tmplGray = tmplMat.cvtColor(cv.COLOR_BGR2GRAY);

    // 템플릿 매칭 (TM_CCOEFF_NORMED: -1 ~ 1, 높을수록 좋음)
    const resultMat = srcGray.matchTemplate(tmplGray, cv.TM_CCOEFF_NORMED);

    // 최대값/위치 찾기
    const minMax = resultMat.minMaxLoc();
    const maxVal = minMax.maxVal;
    const maxLoc = minMax.maxLoc;

    // 결과 생성
    const confidence = (maxVal + 1) / 2; // -1~1 → 0~1 정규화
    const found = confidence >= threshold;

    // ROI 오프셋 적용
    const resultX = region ? region.x + maxLoc.x : maxLoc.x;
    const resultY = region ? region.y + maxLoc.y : maxLoc.y;

    console.log(`[OpenCV] TM_CCOEFF_NORMED: 원본=${maxVal.toFixed(4)}, 정규화=${confidence.toFixed(4)}, 위치=(${resultX}, ${resultY})`);

    return {
      found,
      x: resultX,
      y: resultY,
      width: tW,
      height: tH,
      confidence,
    };
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