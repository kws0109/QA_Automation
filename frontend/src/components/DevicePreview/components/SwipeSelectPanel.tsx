// frontend/src/components/DevicePreview/components/SwipeSelectPanel.tsx

import React from 'react';
import type { SwipeSelectPanelProps } from '../types';

const SwipeSelectPanel: React.FC<SwipeSelectPanelProps> = ({
  swipeStart,
  swipeEnd,
  deviceSwipe,
  onApply,
  onCancel,
}) => {
  const hasValidSwipe = swipeStart && swipeEnd && deviceSwipe;
  const distance = hasValidSwipe ? Math.sqrt(
    Math.pow(deviceSwipe.endX - deviceSwipe.startX, 2) +
    Math.pow(deviceSwipe.endY - deviceSwipe.startY, 2)
  ) : 0;

  // 스와이프 방향 계산
  const getSwipeDirection = () => {
    if (!deviceSwipe) return '';
    const dx = deviceSwipe.endX - deviceSwipe.startX;
    const dy = deviceSwipe.endY - deviceSwipe.startY;
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;

    if (angle >= -45 && angle < 45) return '→ 오른쪽';
    if (angle >= 45 && angle < 135) return '↓ 아래';
    if (angle >= -135 && angle < -45) return '↑ 위';
    return '← 왼쪽';
  };

  return (
    <div className="capture-panel swipe-select-panel">
      <h4>🖱️ 스와이프 좌표 선택</h4>
      <p className="hint">드래그하여 스와이프 시작점과 끝점을 지정하세요</p>

      {hasValidSwipe ? (
        <div className="swipe-info">
          <div className="swipe-coords">
            <div className="coord-group">
              <label>시작점</label>
              <span className="coord-value">
                ({deviceSwipe.startX}, {deviceSwipe.startY})
              </span>
              <span className="coord-percent">
                ({(deviceSwipe.startXPercent * 100).toFixed(1)}%, {(deviceSwipe.startYPercent * 100).toFixed(1)}%)
              </span>
            </div>
            <div className="swipe-arrow">→</div>
            <div className="coord-group">
              <label>끝점</label>
              <span className="coord-value">
                ({deviceSwipe.endX}, {deviceSwipe.endY})
              </span>
              <span className="coord-percent">
                ({(deviceSwipe.endXPercent * 100).toFixed(1)}%, {(deviceSwipe.endYPercent * 100).toFixed(1)}%)
              </span>
            </div>
          </div>
          <div className="swipe-stats">
            <span className="stat">
              <label>방향</label>
              <span>{getSwipeDirection()}</span>
            </span>
            <span className="stat">
              <label>거리</label>
              <span>{Math.round(distance)}px</span>
            </span>
          </div>
        </div>
      ) : (
        <div className="swipe-placeholder">
          <p>화면을 드래그하세요</p>
        </div>
      )}

      <div className="panel-actions">
        <button
          className="btn-apply"
          onClick={onApply}
          disabled={!hasValidSwipe || distance < 20}
        >
          적용
        </button>
        <button className="btn-cancel" onClick={onCancel}>
          취소
        </button>
      </div>
    </div>
  );
};

export default SwipeSelectPanel;
