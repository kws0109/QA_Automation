// backend/src/services/r2Storage.ts

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import dotenv from 'dotenv';

// 환경 변수 로드
dotenv.config();

interface R2Config {
  enabled: boolean;
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicUrl: string;
}

/**
 * Cloudflare R2 Storage 서비스
 * S3 호환 API를 사용하여 리포트 파일 업로드/삭제
 */
class R2StorageService {
  private client: S3Client | null = null;
  private config: R2Config;

  constructor() {
    this.config = {
      enabled: process.env.R2_ENABLED === 'true',
      accountId: process.env.R2_ACCOUNT_ID || '',
      accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
      bucketName: process.env.R2_BUCKET_NAME || '',
      publicUrl: process.env.R2_PUBLIC_URL || '',
    };

    if (this.config.enabled) {
      this._initClient();
    }
  }

  /**
   * S3 클라이언트 초기화
   */
  private _initClient(): void {
    if (!this.config.accountId || !this.config.accessKeyId || !this.config.secretAccessKey) {
      console.warn('⚠️ R2 환경 변수가 설정되지 않았습니다. R2 기능이 비활성화됩니다.');
      this.config.enabled = false;
      return;
    }

    try {
      this.client = new S3Client({
        region: 'auto',
        endpoint: `https://${this.config.accountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: this.config.accessKeyId,
          secretAccessKey: this.config.secretAccessKey,
        },
      });

      console.log('✅ R2 Storage 서비스 초기화 완료');
      console.log(`   버킷: ${this.config.bucketName}`);
      console.log(`   공개 URL: ${this.config.publicUrl}`);
    } catch (error) {
      console.error('❌ R2 클라이언트 초기화 실패:', error);
      this.config.enabled = false;
    }
  }

  /**
   * R2 활성화 여부 확인
   */
  isEnabled(): boolean {
    return this.config.enabled && this.client !== null;
  }

  /**
   * 공개 URL 생성
   */
  getPublicUrl(key: string): string {
    const baseUrl = this.config.publicUrl.replace(/\/$/, '');
    return `${baseUrl}/${key}`;
  }

  /**
   * HTML 파일 업로드
   */
  async uploadHTML(reportId: string, html: string): Promise<string> {
    if (!this.isEnabled()) {
      throw new Error('R2 Storage가 활성화되지 않았습니다.');
    }

    const key = `reports/${reportId}.html`;
    const buffer = Buffer.from(html, 'utf-8');

    await this._upload(key, buffer, 'text/html; charset=utf-8');

    const url = this.getPublicUrl(key);
    console.log(`📤 R2 업로드 완료: ${key}`);

    return url;
  }

  /**
   * PDF 파일 업로드
   */
  async uploadPDF(reportId: string, buffer: Buffer): Promise<string> {
    if (!this.isEnabled()) {
      throw new Error('R2 Storage가 활성화되지 않았습니다.');
    }

    const key = `reports/${reportId}.pdf`;

    await this._upload(key, buffer, 'application/pdf');

    const url = this.getPublicUrl(key);
    console.log(`📤 R2 업로드 완료: ${key}`);

    return url;
  }

  /**
   * 파일 업로드 (내부 메서드)
   */
  private async _upload(
    key: string,
    body: Buffer,
    contentType: string
  ): Promise<void> {
    if (!this.client) {
      throw new Error('R2 클라이언트가 초기화되지 않았습니다.');
    }

    const command = new PutObjectCommand({
      Bucket: this.config.bucketName,
      Key: key,
      Body: body,
      ContentType: contentType,
    });

    await this.client.send(command);
  }

  /**
   * 파일 삭제
   */
  async deleteFile(key: string): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }

    if (!this.client) {
      throw new Error('R2 클라이언트가 초기화되지 않았습니다.');
    }

    try {
      const command = new DeleteObjectCommand({
        Bucket: this.config.bucketName,
        Key: key,
      });

      await this.client.send(command);
      console.log(`🗑️ R2 파일 삭제: ${key}`);
    } catch (error) {
      console.error(`❌ R2 파일 삭제 실패: ${key}`, error);
    }
  }

  /**
   * 리포트 파일 삭제 (HTML + PDF)
   */
  async deleteReport(reportId: string): Promise<void> {
    await Promise.all([
      this.deleteFile(`reports/${reportId}.html`),
      this.deleteFile(`reports/${reportId}.pdf`),
    ]);
  }
}

export const r2Storage = new R2StorageService();
