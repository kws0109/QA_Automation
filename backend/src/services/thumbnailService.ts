/**
 * 썸네일 서비스
 * - Sharp를 이용한 WebP 썸네일 생성
 * - 스크린샷 로딩 최적화를 위한 경량 이미지 생성
 */

import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';

// 상수
const THUMBNAIL_MAX_WIDTH = 300;
const THUMBNAIL_QUALITY = 80;
const THUMBNAIL_SUFFIX = '_thumb.webp';

class ThumbnailService {
  /**
   * Buffer에서 썸네일 생성
   * @param buffer 원본 이미지 버퍼 (PNG)
   * @returns WebP 썸네일 버퍼
   */
  async generateFromBuffer(buffer: Buffer): Promise<Buffer> {
    return sharp(buffer)
      .resize(THUMBNAIL_MAX_WIDTH, null, {
        withoutEnlargement: true,  // 원본보다 크게 확대하지 않음
        fit: 'inside',
      })
      .webp({ quality: THUMBNAIL_QUALITY })
      .toBuffer();
  }

  /**
   * 원본 파일에서 썸네일 생성 및 저장
   * @param originalPath 원본 PNG 파일 경로
   * @returns 썸네일 파일 경로
   */
  async generateAndSave(originalPath: string): Promise<string> {
    const thumbnailPath = this.getThumbnailPath(originalPath);

    // 디렉토리 확인 및 생성
    const dir = path.dirname(thumbnailPath);
    await fs.mkdir(dir, { recursive: true });

    // 썸네일 생성 및 저장
    await sharp(originalPath)
      .resize(THUMBNAIL_MAX_WIDTH, null, {
        withoutEnlargement: true,
        fit: 'inside',
      })
      .webp({ quality: THUMBNAIL_QUALITY })
      .toFile(thumbnailPath);

    return thumbnailPath;
  }

  /**
   * Buffer로부터 썸네일 생성 및 저장
   * @param buffer 원본 이미지 버퍼 (PNG)
   * @param originalPath 원본 파일 경로 (썸네일 경로 계산용)
   * @returns 썸네일 파일 경로
   */
  async generateFromBufferAndSave(buffer: Buffer, originalPath: string): Promise<string> {
    const thumbnailPath = this.getThumbnailPath(originalPath);

    // 디렉토리 확인 및 생성
    const dir = path.dirname(thumbnailPath);
    await fs.mkdir(dir, { recursive: true });

    // 썸네일 생성 및 저장
    const thumbnailBuffer = await this.generateFromBuffer(buffer);
    await fs.writeFile(thumbnailPath, thumbnailBuffer);

    return thumbnailPath;
  }

  /**
   * 원본 경로에서 썸네일 경로 계산
   * @param originalPath 원본 파일 경로 (예: /path/to/screenshot.png)
   * @returns 썸네일 경로 (예: /path/to/screenshot_thumb.webp)
   */
  getThumbnailPath(originalPath: string): string {
    const ext = path.extname(originalPath);
    const basePath = originalPath.slice(0, -ext.length);
    return basePath + THUMBNAIL_SUFFIX;
  }

  /**
   * 상대 경로에서 썸네일 상대 경로 계산
   * @param relativePath 상대 경로 (예: screenshots/report123/device1/screenshot.png)
   * @returns 썸네일 상대 경로 (예: screenshots/report123/device1/screenshot_thumb.webp)
   */
  getRelativeThumbnailPath(relativePath: string): string {
    const ext = path.extname(relativePath);
    const basePath = relativePath.slice(0, -ext.length);
    return basePath + THUMBNAIL_SUFFIX;
  }

  /**
   * 썸네일 존재 여부 확인
   * @param originalPath 원본 파일 경로
   * @returns 썸네일 존재 여부
   */
  async thumbnailExists(originalPath: string): Promise<boolean> {
    const thumbnailPath = this.getThumbnailPath(originalPath);
    try {
      await fs.access(thumbnailPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 썸네일 삭제
   * @param originalPath 원본 파일 경로
   */
  async deleteThumbnail(originalPath: string): Promise<void> {
    const thumbnailPath = this.getThumbnailPath(originalPath);
    try {
      await fs.unlink(thumbnailPath);
    } catch {
      // 썸네일이 없으면 무시
    }
  }
}

// 싱글톤 export
export const thumbnailService = new ThumbnailService();
export default thumbnailService;
