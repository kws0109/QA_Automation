/**
 * 분석 결과 미리보기 컴포넌트
 */

import React from 'react';
import type { AnalysisResult, DetectedTap, ScenarioOutput } from './types';

interface ResultPreviewProps {
  result: AnalysisResult;
  onApply: () => void;
  canApply: boolean;
}

// 시간 포맷
const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// 탭 타입 아이콘
const getTapIcon = (type: string): string => {
  const icons: Record<string, string> = {
    tap: String.fromCodePoint(0x1F446),
    longPress: String.fromCodePoint(0x1F447),
    swipe: String.fromCodePoint(0x2194, 0xFE0F),
  };
  return icons[type] || String.fromCodePoint(0x2753);
};

// 요약 통계 컴포넌트
function AnalysisSummary({ stats }: { stats: AnalysisResult['stats'] }) {
  return (
    <div className="vc-summary">
      <div className="vc-summary-item">
        <span className="vc-summary-label">분석 프레임</span>
        <span className="vc-summary-value">{stats.analyzedFrames}</span>
      </div>
      <div className="vc-summary-item">
        <span className="vc-summary-label">탭</span>
        <span className="vc-summary-value">{stats.tapCount}</span>
      </div>
      <div className="vc-summary-item">
        <span className="vc-summary-label">롱프레스</span>
        <span className="vc-summary-value">{stats.longPressCount}</span>
      </div>
      <div className="vc-summary-item">
        <span className="vc-summary-label">스와이프</span>
        <span className="vc-summary-value">{stats.swipeCount}</span>
      </div>
      <div className="vc-summary-item">
        <span className="vc-summary-label">처리 시간</span>
        <span className="vc-summary-value">{stats.processingTime}ms</span>
      </div>
    </div>
  );
}

// 감지된 탭 목록 컴포넌트
function TapsList({ taps }: { taps: DetectedTap[] }) {
  if (taps.length === 0) {
    return <p className="vc-empty">감지된 터치가 없습니다.</p>;
  }

  return (
    <div className="vc-taps-list">
      {taps.map((tap, index) => (
        <div key={index} className="vc-tap-item">
          <span className="vc-tap-icon">{getTapIcon(tap.type)}</span>
          <span className="vc-tap-index">{index + 1}</span>
          <span className="vc-tap-type">{tap.type}</span>
          <span className="vc-tap-coords">
            ({tap.x}, {tap.y})
            {tap.type === 'swipe' && tap.endX !== undefined && (
              <> &rarr; ({tap.endX}, {tap.endY})</>
            )}
          </span>
          <span className="vc-tap-time">
            {formatDuration(tap.timestamp / 1000)}
          </span>
          <span className="vc-tap-confidence">
            {Math.round(tap.confidence * 100)}%
          </span>
        </div>
      ))}
    </div>
  );
}

export default function ResultPreview({
  result,
  onApply,
  canApply,
}: ResultPreviewProps) {
  return (
    <div className="vc-result">
      {/* 요약 */}
      <AnalysisSummary stats={result.stats} />

      {/* 감지된 탭 목록 */}
      <div className="vc-taps">
        <h3>감지된 터치 동작</h3>
        <TapsList taps={result.detectedTaps} />
      </div>

      {/* 적용 버튼 */}
      <div className="vc-apply-section">
        <button
          className="vc-apply-btn"
          onClick={onApply}
          disabled={!canApply || result.detectedTaps.length === 0}
        >
          시나리오에 적용
        </button>
        <span className="vc-apply-hint">
          {result.detectedTaps.length}개의 터치 동작이 시나리오 노드로 변환됩니다.
        </span>
      </div>
    </div>
  );
}
