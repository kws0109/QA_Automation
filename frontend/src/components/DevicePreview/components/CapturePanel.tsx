// frontend/src/components/DevicePreview/components/CapturePanel.tsx

import React from 'react';
import type { CapturePanelProps } from '../types';

const CapturePanel: React.FC<CapturePanelProps> = ({
  selectionPreview,
  deviceRegion,
  templateName,
  onTemplateNameChange,
  saving,
  onSave,
  onCancel,
}) => {
  return (
    <div className="capture-panel">
      <h4>📷 템플릿 캡처</h4>
      <p className="capture-hint">드래그하여 영역 선택</p>

      {/* 선택 영역 미리보기 */}
      <div className="selection-preview">
        {selectionPreview ? (
          <img src={selectionPreview} alt="선택 영역" />
        ) : (
          <span className="preview-placeholder">영역을 선택하세요</span>
        )}
      </div>

      {deviceRegion && (
        <div className="region-info">
          선택: {deviceRegion.width}x{deviceRegion.height}
        </div>
      )}

      <div className="template-name-input">
        <input
          type="text"
          value={templateName}
          onChange={(e) => onTemplateNameChange(e.target.value)}
          placeholder="템플릿 이름"
        />
      </div>

      <div className="capture-buttons">
        <button
          className="btn-save-template"
          onClick={onSave}
          disabled={saving || !templateName.trim() || !deviceRegion}
        >
          {saving ? '저장 중...' : '💾 저장'}
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

export default CapturePanel;
