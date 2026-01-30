/**
 * VirtualScreenshotGrid
 * react-window 기반 가상화 스크린샷 그리드
 * - 뷰포트에 보이는 이미지만 렌더링하여 DOM 노드 수 대폭 감소
 * - 썸네일(WebP, 300px) 사용으로 초기 로드 용량 감소
 * - 원본은 라이트박스 클릭 시에만 로드
 */

import { useRef, useMemo, memo } from 'react';
import { FixedSizeGrid, GridChildComponentProps } from 'react-window';
import { useContainerWidth } from '../../../hooks/useContainerWidth';
import { getScreenshotThumbnailUrl } from '../../../utils/reportUrls';
import { ScreenshotInfo } from '../../../types';

// Step 정보를 위한 최소 인터페이스 (StepResult, StepSuiteResult 모두 호환)
interface StepInfo {
  nodeId: string;
  nodeName?: string;
}

// 그리드 설정 상수
const ITEM_WIDTH = 200;   // 아이템 너비 (px)
const ITEM_HEIGHT = 180;  // 아이템 높이 (px) - 이미지 120px + 정보 60px
const GAP = 12;           // 아이템 간격 (px)
const GRID_PADDING = 0;   // 그리드 패딩 (px)
const MAX_VISIBLE_ROWS = 5;  // 최대 표시 행 수 (넘으면 스크롤)

interface VirtualScreenshotGridProps {
  screenshots: ScreenshotInfo[];
  steps: StepInfo[];  // 액션 이름 매칭용 (최소 인터페이스)
  onScreenshotClick: (index: number) => void;
}

interface GridItemData {
  screenshots: ScreenshotInfo[];
  steps: StepInfo[];
  columnCount: number;
  onScreenshotClick: (index: number) => void;
}

// 개별 셀 렌더러
const Cell = memo(({ columnIndex, rowIndex, style, data }: GridChildComponentProps<GridItemData>) => {
  const { screenshots, steps, columnCount, onScreenshotClick } = data;
  const index = rowIndex * columnCount + columnIndex;

  // 범위 체크
  if (index >= screenshots.length) {
    return null;
  }

  const screenshot = screenshots[index];
  const matchingStep = steps.find(s => s.nodeId === screenshot.nodeId);
  const actionName = matchingStep?.nodeName || screenshot.nodeId;

  // 스타일 조정 (gap 적용)
  const adjustedStyle = {
    ...style,
    left: (style.left as number) + GAP / 2,
    top: (style.top as number) + GAP / 2,
    width: (style.width as number) - GAP,
    height: (style.height as number) - GAP,
  };

  return (
    <div
      style={adjustedStyle}
      className={`screenshot-item ${screenshot.type}`}
      onClick={() => onScreenshotClick(index)}
    >
      <img
        src={getScreenshotThumbnailUrl(screenshot.path)}
        alt={`${actionName} - ${screenshot.type}`}
        loading="lazy"
      />
      <div className="screenshot-info">
        <span className="screenshot-node">{actionName}</span>
        <span className={`screenshot-type ${screenshot.type}${screenshot.type === 'highlight' && screenshot.templateId?.startsWith('ocr:') ? ' ocr' : ''}`}>
          {screenshot.type === 'step' ? '단계' :
           screenshot.type === 'failed' ? '실패' :
           screenshot.type === 'highlight'
             ? (screenshot.templateId?.startsWith('ocr:') ? '텍스트인식' : '이미지인식')
             : '최종'}
        </span>
        {screenshot.type === 'highlight' && screenshot.confidence && (
          <span className="screenshot-confidence">
            {(screenshot.confidence * 100).toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
});

Cell.displayName = 'VirtualScreenshotCell';

export default function VirtualScreenshotGrid({
  screenshots,
  steps,
  onScreenshotClick,
}: VirtualScreenshotGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const containerWidth = useContainerWidth(containerRef);

  // 열 수 계산
  const columnCount = useMemo(() => {
    if (containerWidth === 0) return 1;
    return Math.max(1, Math.floor((containerWidth + GAP) / (ITEM_WIDTH + GAP)));
  }, [containerWidth]);

  // 행 수 계산
  const rowCount = useMemo(() => {
    return Math.ceil(screenshots.length / columnCount);
  }, [screenshots.length, columnCount]);

  // 그리드 높이 계산 (최대 5행까지만 표시, 나머지는 스크롤)
  const gridHeight = useMemo(() => {
    const visibleRows = Math.min(rowCount, MAX_VISIBLE_ROWS);
    return visibleRows * (ITEM_HEIGHT + GAP) - GAP + GRID_PADDING * 2;
  }, [rowCount]);

  // 그리드 너비 계산
  const gridWidth = useMemo(() => {
    return containerWidth || ITEM_WIDTH;
  }, [containerWidth]);

  // 아이템 데이터
  const itemData = useMemo<GridItemData>(() => ({
    screenshots,
    steps,
    columnCount,
    onScreenshotClick,
  }), [screenshots, steps, columnCount, onScreenshotClick]);

  // 스크린샷 10개 이하면 기존 방식 사용
  if (screenshots.length <= 10) {
    return (
      <div ref={containerRef} className="screenshots-grid">
        {screenshots.map((screenshot, idx) => {
          const matchingStep = steps.find(s => s.nodeId === screenshot.nodeId);
          const actionName = matchingStep?.nodeName || screenshot.nodeId;

          return (
            <div
              key={`${screenshot.nodeId}-${idx}`}
              className={`screenshot-item ${screenshot.type}`}
              onClick={() => onScreenshotClick(idx)}
            >
              <img
                src={getScreenshotThumbnailUrl(screenshot.path)}
                alt={`${actionName} - ${screenshot.type}`}
                loading="lazy"
              />
              <div className="screenshot-info">
                <span className="screenshot-node">{actionName}</span>
                <span className={`screenshot-type ${screenshot.type}${screenshot.type === 'highlight' && screenshot.templateId?.startsWith('ocr:') ? ' ocr' : ''}`}>
                  {screenshot.type === 'step' ? '단계' :
                   screenshot.type === 'failed' ? '실패' :
                   screenshot.type === 'highlight'
                     ? (screenshot.templateId?.startsWith('ocr:') ? '텍스트인식' : '이미지인식')
                     : '최종'}
                </span>
                {screenshot.type === 'highlight' && screenshot.confidence && (
                  <span className="screenshot-confidence">
                    {(screenshot.confidence * 100).toFixed(1)}%
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="virtual-screenshots-container">
      {containerWidth > 0 && (
        <FixedSizeGrid
          columnCount={columnCount}
          columnWidth={ITEM_WIDTH + GAP}
          height={gridHeight}
          rowCount={rowCount}
          rowHeight={ITEM_HEIGHT + GAP}
          width={gridWidth}
          itemData={itemData}
          className="virtual-screenshots-grid"
        >
          {Cell}
        </FixedSizeGrid>
      )}
    </div>
  );
}
