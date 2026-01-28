// backend/src/utils/requestHelpers.ts
// Express 5 request parameter 타입 헬퍼

/**
 * req.params 또는 req.query 값을 안전하게 string으로 변환
 * Express 5에서 string | string[] | undefined 타입을 string | undefined로 변환
 */
export function getString(value: string | string[] | undefined): string | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

/**
 * req.params 또는 req.query 값을 string으로 변환 (required)
 * 값이 없으면 빈 문자열 반환
 */
export function getStringRequired(value: string | string[] | undefined): string {
  if (value === undefined) return '';
  return Array.isArray(value) ? value[0] : value;
}

/**
 * req.query 값을 number로 변환
 */
export function getNumber(value: string | string[] | undefined, defaultValue: number): number {
  const str = getString(value);
  if (!str) return defaultValue;
  const num = parseInt(str, 10);
  return isNaN(num) ? defaultValue : num;
}

/**
 * req.query 값을 boolean으로 변환
 */
export function getBoolean(value: string | string[] | undefined, defaultValue: boolean = false): boolean {
  const str = getString(value);
  if (!str) return defaultValue;
  return str === 'true' || str === '1';
}
