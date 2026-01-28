// frontend/src/components/DevicePreview/components/TextExtractPanel.tsx

import React from 'react';
import type { TextExtractPanelProps } from '../types';

const TextExtractPanel: React.FC<TextExtractPanelProps> = ({
  selectionPreview,
  deviceRegion,
  extracting,
  extractedText,
  onExtract,
  onCancel,
}) => {
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="capture-panel text-extract-panel">
      <h4>🔤 텍스트 추출</h4>
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

      <div className="capture-buttons">
        <button
          className="btn-extract-text"
          onClick={onExtract}
          disabled={extracting || !deviceRegion}
        >
          {extracting ? '추출 중...' : '📝 텍스트 추출'}
        </button>
        <button
          className="btn-cancel-capture"
          onClick={onCancel}
        >
          취소
        </button>
      </div>

      {/* 추출 결과 */}
      {extractedText && (
        <div className="extracted-text-result">
          <div className="result-header">
            <span>추출 결과</span>
            <small>{extractedText.processingTime}ms</small>
          </div>
          {extractedText.combinedText ? (
            <>
              <div
                className="result-text"
                onClick={() => copyToClipboard(extractedText.combinedText)}
                title="클릭하여 복사"
              >
                {extractedText.combinedText}
              </div>
              <small className="result-hint">클릭하여 복사</small>
            </>
          ) : (
            <div className="result-empty">텍스트 없음</div>
          )}
        </div>
      )}
    </div>
  );
};

export default TextExtractPanel;
