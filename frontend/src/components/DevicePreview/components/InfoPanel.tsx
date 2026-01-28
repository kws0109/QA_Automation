// frontend/src/components/DevicePreview/components/InfoPanel.tsx

import React from 'react';
import type { InfoPanelProps } from '../types';

const InfoPanel: React.FC<InfoPanelProps> = ({
  clickPos,
  elementInfo,
  elementLoading,
  onApplyCoordinate,
  onApplyElement,
}) => {
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <>
      {/* 좌표 정보 */}
      {clickPos && (
        <div className="info-section">
          <div className="info-title">
            <span>📍 좌표</span>
            <button className="btn-apply" onClick={onApplyCoordinate}>
              적용
            </button>
          </div>
          <div className="coord-display">
            <span>X: {clickPos.x}</span>
            <span>Y: {clickPos.y}</span>
          </div>
        </div>
      )}

      {/* 요소 정보 */}
      {elementLoading ? (
        <div className="info-section">
          <p className="info-loading">요소 검색 중...</p>
        </div>
      ) : elementInfo ? (
        <div className="info-section">
          <div className="info-title">
            <span>🔍 요소</span>
            {(elementInfo.resourceId || elementInfo.text) && (
              <button className="btn-apply" onClick={onApplyElement}>
                적용
              </button>
            )}
          </div>

          {elementInfo.resourceId && (
            <div className="info-row">
              <label>ID</label>
              <code onClick={() => copyToClipboard(elementInfo.resourceId!)}>
                {elementInfo.resourceId}
              </code>
            </div>
          )}

          {elementInfo.text && (
            <div className="info-row">
              <label>Text</label>
              <code onClick={() => copyToClipboard(elementInfo.text!)}>
                {elementInfo.text}
              </code>
            </div>
          )}

          {elementInfo.contentDesc && (
            <div className="info-row">
              <label>Desc</label>
              <code onClick={() => copyToClipboard(elementInfo.contentDesc!)}>
                {elementInfo.contentDesc}
              </code>
            </div>
          )}

          <div className="info-row">
            <label>Class</label>
            <code>{elementInfo.className}</code>
          </div>

          <div className="info-badges">
            <span className={elementInfo.clickable ? 'badge-yes' : 'badge-no'}>
              {elementInfo.clickable ? '✓ Clickable' : '✗ Clickable'}
            </span>
            <span className={elementInfo.enabled ? 'badge-yes' : 'badge-no'}>
              {elementInfo.enabled ? '✓ Enabled' : '✗ Enabled'}
            </span>
          </div>
        </div>
      ) : clickPos ? (
        <div className="info-section">
          <p className="info-empty">해당 위치에 요소 없음</p>
        </div>
      ) : null}
    </>
  );
};

export default InfoPanel;
