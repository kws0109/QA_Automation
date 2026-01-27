// backend/src/utils/throttle.ts
// 함수 호출 쓰로틀링 유틸리티
// 고빈도 Socket.IO 브로드캐스트 최적화용

/**
 * 함수 호출을 지정된 간격으로 제한 (trailing edge)
 * 마지막 호출은 항상 실행됨
 *
 * @param fn 쓰로틀링할 함수
 * @param delay 최소 호출 간격 (ms)
 * @returns 쓰로틀된 함수
 */
export function throttle<T extends (...args: unknown[]) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let lastCall = 0;
  let pendingCall: ReturnType<typeof setTimeout> | null = null;
  let pendingArgs: Parameters<T> | null = null;

  return function throttled(this: unknown, ...args: Parameters<T>): void {
    const now = Date.now();
    const timeSinceLastCall = now - lastCall;

    // 이전 pending 호출이 있으면 최신 args로 업데이트
    if (pendingCall !== null) {
      pendingArgs = args;
      return;
    }

    // 충분한 시간이 지났으면 즉시 실행
    if (timeSinceLastCall >= delay) {
      lastCall = now;
      fn.apply(this, args);
    } else {
      // 다음 실행 예약
      pendingArgs = args;
      pendingCall = setTimeout(() => {
        lastCall = Date.now();
        fn.apply(this, pendingArgs!);
        pendingCall = null;
        pendingArgs = null;
      }, delay - timeSinceLastCall);
    }
  };
}

/**
 * 디바운싱: 연속 호출 후 마지막 호출만 실행
 *
 * @param fn 디바운싱할 함수
 * @param delay 대기 시간 (ms)
 * @returns 디바운스된 함수
 */
export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  return function debounced(this: unknown, ...args: Parameters<T>): void {
    if (timer !== null) {
      clearTimeout(timer);
    }

    timer = setTimeout(() => {
      fn.apply(this, args);
      timer = null;
    }, delay);
  };
}

/**
 * 배치 처리: 여러 호출을 모아서 한번에 처리
 *
 * @param fn 배치 처리할 함수 (배열을 받음)
 * @param delay 배치 수집 시간 (ms)
 * @returns 아이템을 추가하는 함수
 */
export function batch<T>(
  fn: (items: T[]) => void,
  delay: number
): (item: T) => void {
  let items: T[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  return function addToBatch(item: T): void {
    items.push(item);

    if (timer === null) {
      timer = setTimeout(() => {
        const batch = items;
        items = [];
        timer = null;
        fn(batch);
      }, delay);
    }
  };
}
