/**
 * 변환/분석 진행 상태 컴포넌트
 */

import React from 'react';
import type { AnalysisProgress } from './types';

interface ConversionProgressProps {
  progress: AnalysisProgress;
  isAnalyzing: boolean;
}

export default function ConversionProgress({
  progress,
  isAnalyzing,
}: ConversionProgressProps) {
  if (!isAnalyzing) return null;

  return (
    <div className="vc-progress">
      <div className="vc-progress-bar">
        <div
          className="vc-progress-fill"
          style={{ width: `${progress.progress}%` }}
        />
      </div>
      <span className="vc-progress-text">
        {progress.currentStep} ({progress.progress}%)
      </span>
    </div>
  );
}
