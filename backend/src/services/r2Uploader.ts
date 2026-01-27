// backend/src/services/r2Uploader.ts
// Cloudflare R2 스토리지 업로드 서비스
// 테스트 리포트 HTML을 R2에 업로드하여 공개 URL 생성

import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

/**
 * R2 설정 (환경 변수에서 읽기)
 */
interface R2Config {
  enabled: boolean;
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicUrl: string;
}

class R2Uploader {
  private client: S3Client | null = null;

  /**
   * 환경 변수에서 설정 읽기
   */
  private getConfig(): R2Config {
    return {
      enabled: process.env.R2_ENABLED === 'true',
      accountId: process.env.R2_ACCOUNT_ID || '',
      accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
      bucketName: process.env.R2_BUCKET_NAME || '',
      publicUrl: process.env.R2_PUBLIC_URL || '',
    };
  }

  /**
   * R2 활성화 여부
   */
  isEnabled(): boolean {
    const config = this.getConfig();
    return config.enabled && !!config.accountId && !!config.accessKeyId && !!config.secretAccessKey;
  }

  /**
   * S3 클라이언트 초기화 (lazy)
   */
  private getClient(): S3Client | null {
    if (this.client) return this.client;

    const config = this.getConfig();
    if (!this.isEnabled()) return null;

    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });

    return this.client;
  }

  /**
   * HTML 리포트 업로드
   * @param reportId 리포트 ID (파일명에 사용)
   * @param htmlContent HTML 문자열
   * @param type 리포트 타입 (test 또는 suite)
   * @returns 공개 URL 또는 null (실패 시)
   */
  async uploadReport(
    reportId: string,
    htmlContent: string,
    type: 'test' | 'suite' = 'test'
  ): Promise<string | null> {
    const client = this.getClient();
    if (!client) {
      console.log('[R2Uploader] R2가 비활성화되어 있습니다.');
      return null;
    }

    const config = this.getConfig();
    const key = `reports/${type}/${reportId}.html`;

    try {
      await client.send(new PutObjectCommand({
        Bucket: config.bucketName,
        Key: key,
        Body: htmlContent,
        ContentType: 'text/html; charset=utf-8',
        // 공개 읽기 가능 (버킷 정책에서도 설정 필요)
        // R2는 ACL을 지원하지 않으므로 버킷 정책으로 공개 설정
      }));

      const publicUrl = `${config.publicUrl}/${key}`;
      console.log(`[R2Uploader] 리포트 업로드 완료: ${publicUrl}`);
      return publicUrl;
    } catch (error) {
      console.error('[R2Uploader] 업로드 실패:', error);
      return null;
    }
  }

  /**
   * 리포트 삭제
   */
  async deleteReport(reportId: string, type: 'test' | 'suite' = 'test'): Promise<boolean> {
    const client = this.getClient();
    if (!client) return false;

    const config = this.getConfig();
    const key = `reports/${type}/${reportId}.html`;

    try {
      await client.send(new DeleteObjectCommand({
        Bucket: config.bucketName,
        Key: key,
      }));

      console.log(`[R2Uploader] 리포트 삭제 완료: ${key}`);
      return true;
    } catch (error) {
      console.error('[R2Uploader] 삭제 실패:', error);
      return false;
    }
  }

  /**
   * 설정 상태 조회
   */
  getStatus(): {
    enabled: boolean;
    configured: boolean;
    publicUrl: string;
  } {
    const config = this.getConfig();
    return {
      enabled: config.enabled,
      configured: this.isEnabled(),
      publicUrl: config.publicUrl,
    };
  }
}

// 싱글톤 인스턴스
export const r2Uploader = new R2Uploader();
