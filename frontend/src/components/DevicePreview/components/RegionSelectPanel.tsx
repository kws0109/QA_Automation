// frontend/src/components/DevicePreview/components/RegionSelectPanel.tsx

import React from 'react';
import type { RegionSelectPanelProps } from '../types';

const RegionSelectPanel: React.FC<RegionSelectPanelProps> = ({
  selectionPreview,
  deviceRegion,
  normalizedRegion,
  onApply,
  onCancel,
}) => {
  return (
    <div className="capture-panel region-select-panel">
      <h4>📐 검색 영역 선택</h4>
      <p className="capture-hint">드래그하여 ROI 영역 선택</p>

      {/* 선택 영역 미리보기 */}
      <div className="selection-preview">
        {selectionPreview ? (
          <img src={selectionPreview} alt="선택 영역" />
        ) : (
          <span className="preview-placeholder">영역을 선택하세요</span>
        )}
      </div>

      {deviceRegion && normalizedRegion && (
        <div className="region-info">
          <div>선택: {deviceRegion.width}x{deviceRegion.height}px</div>
          <div className="region-normalized">
            ({normalizedRegion.x.toFixed(2)}, {normalizedRegion.y.toFixed(2)}) ~
            ({(normalizedRegion.x + normalizedRegion.width).toFixed(2)}, {(normalizedRegion.y + normalizedRegion.height).toFixed(2)})
          </div>
        </div>
      )}

      <div className="capture-buttons">
        <button
          className="btn-apply-region"
          onClick={onApply}
          disabled={!deviceRegion}
        >
          ✓ 적용
        </button>
        <button
          className="btn-cancel-capture"
          onClick={onCancel}
        >
          취소
        </button>
      </div>
    </div>
  );
};

export default RegionSelectPanel;
