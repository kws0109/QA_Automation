// frontend/src/utils/reportUrls.ts
// 리포트 관련 URL 생성 유틸리티

import { API_BASE_URL } from '../config/api';

/**
 * 스크린샷 URL 생성
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
