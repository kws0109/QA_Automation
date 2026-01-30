/**
 * useContainerWidth 훅
 * ResizeObserver로 컨테이너 너비를 추적
 */

import { useState, useEffect, RefObject } from 'react';

export function useContainerWidth(containerRef: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 초기 너비 설정
    setWidth(container.clientWidth);

    // ResizeObserver로 너비 변경 감지
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === container) {
          setWidth(entry.contentRect.width);
        }
      }
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [containerRef]);

  return width;
}

export default useContainerWidth;
