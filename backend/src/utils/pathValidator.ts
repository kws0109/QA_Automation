// backend/src/utils/pathValidator.ts
// Path traversal 공격 방지 유틸리티

import path from 'path';

/**
 * 경로 구성요소 (파일명, 폴더명, ID 등)를 검증합니다.
 * Path traversal 공격에 사용될 수 있는 문자를 차단합니다.
 *
 * @param segment - 검증할 경로 구성요소 (예: scenarioId, packageId, deviceId)
 * @returns 안전한 경우 true, 위험한 경우 false
 */
export function isValidPathSegment(segment: string): boolean {
  if (!segment || typeof segment !== 'string') {
    return false;
  }

  // 빈 문자열 또는 공백만 있는 경우
  if (segment.trim().length === 0) {
    return false;
  }

  // Path traversal 패턴 차단
  const dangerousPatterns = [
    '..', // 상위 디렉토리 이동
    '/', // 절대 경로 또는 하위 디렉토리 지정
    '\\', // Windows 경로 구분자
    '\0', // Null byte
    '%2e', // URL 인코딩된 .
    '%2f', // URL 인코딩된 /
    '%5c', // URL 인코딩된 \
    '%00', // URL 인코딩된 null byte
  ];

  const lowerSegment = segment.toLowerCase();
  for (const pattern of dangerousPatterns) {
    if (lowerSegment.includes(pattern)) {
      return false;
    }
  }

  // 허용되는 문자만 포함하는지 확인
  // 알파벳, 숫자, 하이픈, 언더스코어, 점(확장자용)만 허용
  const safePattern = /^[a-zA-Z0-9_\-.]+$/;
  if (!safePattern.test(segment)) {
    return false;
  }

  return true;
}

/**
 * 주어진 경로가 기본 디렉토리 내에 있는지 확인합니다.
 * 경로가 기본 디렉토리를 벗어나는 경우 false를 반환합니다.
 *
 * @param baseDir - 허용된 기본 디렉토리 (절대 경로)
 * @param targetPath - 확인할 대상 경로 (절대 경로)
 * @returns 기본 디렉토리 내에 있으면 true
 */
export function isPathWithinBase(baseDir: string, targetPath: string): boolean {
  // 경로를 정규화하여 상대 참조 해소
  const normalizedBase = path.resolve(baseDir);
  const normalizedTarget = path.resolve(targetPath);

  // 대상 경로가 기본 디렉토리로 시작하는지 확인
  // + path.sep를 추가하여 유사한 디렉토리명 회피 (예: /base vs /base123)
  return (
    normalizedTarget === normalizedBase ||
    normalizedTarget.startsWith(normalizedBase + path.sep)
  );
}

/**
 * 안전한 경로를 생성합니다.
 * 경로 구성요소가 유효하지 않으면 예외를 발생시킵니다.
 *
 * @param baseDir - 기본 디렉토리
 * @param segments - 경로 구성요소들
 * @returns 안전한 절대 경로
 * @throws Error - 유효하지 않은 경로 구성요소가 있을 경우
 */
export function buildSafePath(baseDir: string, ...segments: string[]): string {
  // 각 세그먼트 검증
  for (const segment of segments) {
    if (!isValidPathSegment(segment)) {
      throw new Error(`유효하지 않은 경로: ${segment}`);
    }
  }

  // 경로 생성
  const targetPath = path.join(baseDir, ...segments);

  // 최종 경로가 기본 디렉토리 내에 있는지 확인
  if (!isPathWithinBase(baseDir, targetPath)) {
    throw new Error('경로가 허용된 범위를 벗어났습니다');
  }

  return targetPath;
}

/**
 * Express 요청 파라미터에서 안전한 ID를 추출합니다.
 *
 * @param paramValue - req.params에서 가져온 값
 * @param paramName - 파라미터 이름 (에러 메시지용)
 * @returns 검증된 ID
 * @throws Error - 유효하지 않은 ID인 경우
 */
export function validateParamId(paramValue: string | undefined, paramName: string): string {
  if (!paramValue || !isValidPathSegment(paramValue)) {
    throw new Error(`유효하지 않은 ${paramName}: ${paramValue}`);
  }
  return paramValue;
}
