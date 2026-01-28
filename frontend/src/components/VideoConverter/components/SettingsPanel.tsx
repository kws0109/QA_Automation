/**
 * 분석 설정 패널 컴포넌트
 */

import React from 'react';
import type { AnalysisOptions, DetectionMethod } from './types';

interface SettingsPanelProps {
  options: AnalysisOptions;
  onOptionsChange: (options: Partial<AnalysisOptions>) => void;
  isAnalyzing: boolean;
  onAnalyze: () => void;
}

export default function SettingsPanel({
  options,
  onOptionsChange,
  isAnalyzing,
  onAnalyze,
}: SettingsPanelProps) {
  const handleDetectionMethodChange = (method: DetectionMethod) => {
    onOptionsChange({ detectionMethod: method });
  };

  return (
    <div className="vc-options">
      <h3>분석 옵션</h3>

      {/* 감지 방식 선택 */}
      <div className="vc-detection-method">
        <label className="vc-detection-label">감지 방식</label>
        <div className="vc-detection-options">
          <label className="vc-radio-label">
            <input
              type="radio"
              name="detectionMethod"
              value="pointerLocation"
              checked={options.detectionMethod === 'pointerLocation'}
              onChange={() => handleDetectionMethodChange('pointerLocation')}
            />
            <span>포인터 위치 (권장)</span>
            <span className="vc-radio-hint">십자선 + OCR 기반 감지</span>
          </label>
          <label className="vc-radio-label">
            <input
              type="radio"
              name="detectionMethod"
              value="showTaps"
              checked={options.detectionMethod === 'showTaps'}
              onChange={() => handleDetectionMethodChange('showTaps')}
            />
            <span>탭한 항목 표시</span>
            <span className="vc-radio-hint">흰색 원 기반 감지</span>
          </label>
        </div>
      </div>

      <div className="vc-options-grid">
        <div className="vc-option">
          <label>분석 FPS</label>
          <input
            type="number"
            value={options.fps}
            onChange={(e) => onOptionsChange({ fps: Number(e.target.value) })}
            min={1}
            max={30}
          />
          <span className="vc-option-hint">초당 분석할 프레임 수</span>
        </div>
        <div className="vc-option">
          <label>더블탭 임계값 (ms)</label>
          <input
            type="number"
            value={options.doubleTapThreshold}
            onChange={(e) => onOptionsChange({ doubleTapThreshold: Number(e.target.value) })}
            min={100}
            max={1000}
          />
          <span className="vc-option-hint">연속 탭 간격</span>
        </div>
        <div className="vc-option">
          <label>롱프레스 임계값 (ms)</label>
          <input
            type="number"
            value={options.longPressThreshold}
            onChange={(e) => onOptionsChange({ longPressThreshold: Number(e.target.value) })}
            min={200}
            max={2000}
          />
          <span className="vc-option-hint">길게 누르기 판정 시간</span>
        </div>
        <div className="vc-option">
          <label>스와이프 최소 거리 (px)</label>
          <input
            type="number"
            value={options.swipeMinDistance}
            onChange={(e) => onOptionsChange({ swipeMinDistance: Number(e.target.value) })}
            min={20}
            max={200}
          />
          <span className="vc-option-hint">스와이프로 판정할 최소 이동 거리</span>
        </div>
      </div>

      <button
        className="vc-analyze-btn"
        onClick={onAnalyze}
        disabled={isAnalyzing}
      >
        {isAnalyzing ? '분석 중...' : '분석 시작'}
      </button>
    </div>
  );
}
