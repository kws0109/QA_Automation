// frontend/src/utils/reportUrls.ts
// 리포트 관련 URL 생성 유틸리티

import { API_BASE_URL } from '../config/api';

/**
 * 스크린샷 URL 생성 (원본 PNG)
 */
export const getScreenshotUrl = (screenshotPath: string): string => {
  const normalizedPath = screenshotPath.replace(/\\/g, '/');
  const parts = normalizedPath.split('/');

  if (parts.length >= 4 && parts[0] === 'screenshots') {
    const [, reportId, deviceId, filename] = parts;
    return `${API_BASE_URL}/api/test-reports/screenshots/${reportId}/${deviceId}/${filename}`;
  }

  const relativePath = normalizedPath.replace(/^screenshots\//, '');
  return `${API_BASE_URL}/api/test-reports/screenshots/${relativePath}`;
};

/**
 * 스크린샷 썸네일 URL 생성 (WebP, 300px)
 * 썸네일이 없으면 서버에서 원본으로 폴백
 */
export const getScreenshotThumbnailUrl = (screenshotPath: string): string => {
  const normalizedPath = screenshotPath.replace(/\\/g, '/');
  const parts = normalizedPath.split('/');

  if (parts.length >= 4 && parts[0] === 'screenshots') {
    const [, reportId, deviceId, filename] = parts;
    return `${API_BASE_URL}/api/test-reports/thumbnails/${reportId}/${deviceId}/${filename}`;
  }

  const relativePath = normalizedPath.replace(/^screenshots\//, '');
  return `${API_BASE_URL}/api/test-reports/thumbnails/${relativePath}`;
};

/**
 * 비디오 URL 생성
 */
export const getVideoUrl = (videoPath: string): string => {
  const normalizedPath = videoPath.replace(/\\/g, '/');
  const parts = normalizedPath.split('/');

  if (parts.length >= 3 && parts[0] === 'videos') {
    const [, reportId, filename] = parts;
    return `${API_BASE_URL}/api/test-reports/videos/${reportId}/${filename}`;
  }

  const relativePath = normalizedPath.replace(/^videos\//, '');
  return `${API_BASE_URL}/api/test-reports/videos/${relativePath}`;
};

/**
 * Suite 비디오 URL 생성
 */
export const getSuiteVideoUrl = (videoPath: string): string => {
  const normalizedPath = videoPath.replace(/\\/g, '/');
  return `${API_BASE_URL}/api/suites/reports/video/${normalizedPath}`;
};

/**
 * Suite 스크린샷 URL 생성
 */
export const getSuiteScreenshotUrl = (screenshotPath: string): string => {
  const normalizedPath = screenshotPath.replace(/\\/g, '/');
  return `${API_BASE_URL}/api/suites/reports/screenshot/${normalizedPath}`;
};
