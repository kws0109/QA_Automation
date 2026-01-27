// frontend/src/components/MetricsDashboard/PerformanceMetrics.tsx
// 이미지 매칭 및 OCR 성능 메트릭 컴포넌트

import React from 'react';
import type { ImageMatchPerformance, OcrPerformance } from '../../types';

interface PerformanceMetricsProps {
  imageMatch: ImageMatchPerformance | null;
  ocr: OcrPerformance | null;
  loading: boolean;
}

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};

const formatConfidence = (confidence: number): string => {
  return `${(confidence * 100).toFixed(1)}%`;
};

const PerformanceMetrics: React.FC<PerformanceMetricsProps> = ({ imageMatch, ocr, loading }) => {
  if (loading) {
    return (
      <div className="performance-metrics-card">
        <h3 className="card-title">성능 메트릭</h3>
        <div className="card-loading">
          <div className="spinner" />
        </div>
      </div>
    );
  }

  const hasImageData = imageMatch && imageMatch.totalMatches > 0;
  const hasOcrData = ocr && ocr.totalMatches > 0;

  if (!hasImageData && !hasOcrData) {
    return (
      <div className="performance-metrics-card">
        <h3 className="card-title">성능 메트릭</h3>
        <div className="no-data-message">성능 데이터가 없습니다</div>
      </div>
    );
  }

  return (
    <div className="performance-metrics-card">
      <h3 className="card-title">성능 메트릭</h3>

      <div className="performance-sections">
        {/* 이미지 매칭 섹션 */}
        {hasImageData && (
          <div className="perf-section">
            <div className="perf-section-header">
              <span className="perf-icon">🖼️</span>
              <h4>이미지 매칭</h4>
            </div>

            <div className="perf-stats-grid">
              <div className="perf-stat">
                <span className="stat-value">{imageMatch.totalMatches.toLocaleString()}</span>
                <span className="stat-label">총 매칭 수</span>
              </div>
              <div className="perf-stat">
                <span className="stat-value">{formatDuration(imageMatch.avgMatchTime)}</span>
                <span className="stat-label">평균 시간</span>
              </div>
              <div className="perf-stat">
                <span className="stat-value">{formatConfidence(imageMatch.avgConfidence)}</span>
                <span className="stat-label">평균 신뢰도</span>
              </div>
              <div className="perf-stat">
                <span className={`stat-value ${imageMatch.successRate >= 90 ? 'success' : imageMatch.successRate >= 70 ? 'warning' : 'danger'}`}>
                  {imageMatch.successRate.toFixed(1)}%
                </span>
                <span className="stat-label">성공률</span>
              </div>
            </div>

            {imageMatch.byTemplate.length > 0 && (
              <div className="perf-breakdown">
                <h5>템플릿별 성능 (Top 5)</h5>
                <table className="breakdown-table">
                  <thead>
                    <tr>
                      <th>템플릿</th>
                      <th className="num">횟수</th>
                      <th className="num">평균 시간</th>
                      <th className="num">신뢰도</th>
                    </tr>
                  </thead>
                  <tbody>
                    {imageMatch.byTemplate.slice(0, 5).map((t) => (
                      <tr key={t.templateId}>
                        <td className="template-id" title={t.templateId}>
                          {t.templateId.length > 20 ? `${t.templateId.slice(0, 20)}...` : t.templateId}
                        </td>
                        <td className="num">{t.count}</td>
                        <td className="num">{formatDuration(t.avgMatchTime)}</td>
                        <td className="num">{formatConfidence(t.avgConfidence)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* OCR 섹션 */}
        {hasOcrData && (
          <div className="perf-section">
            <div className="perf-section-header">
              <span className="perf-icon">🔤</span>
              <h4>OCR 텍스트 인식</h4>
            </div>

            <div className="perf-stats-grid">
              <div className="perf-stat">
                <span className="stat-value">{ocr.totalMatches.toLocaleString()}</span>
                <span className="stat-label">총 인식 수</span>
              </div>
              <div className="perf-stat">
                <span className="stat-value">{formatDuration(ocr.avgOcrTime)}</span>
                <span className="stat-label">평균 시간</span>
              </div>
              <div className="perf-stat">
                <span className="stat-value">{formatConfidence(ocr.avgConfidence)}</span>
                <span className="stat-label">평균 신뢰도</span>
              </div>
              <div className="perf-stat">
                <span className={`stat-value ${ocr.successRate >= 90 ? 'success' : ocr.successRate >= 70 ? 'warning' : 'danger'}`}>
                  {ocr.successRate.toFixed(1)}%
                </span>
                <span className="stat-label">성공률</span>
              </div>
            </div>

            <div className="perf-breakdown-row">
              {/* 매치 타입별 */}
              {ocr.byMatchType.length > 0 && (
                <div className="perf-breakdown half">
                  <h5>매칭 타입별</h5>
                  <table className="breakdown-table">
                    <thead>
                      <tr>
                        <th>타입</th>
                        <th className="num">횟수</th>
                        <th className="num">시간</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ocr.byMatchType.map((t) => (
                        <tr key={t.matchType}>
                          <td>{t.matchType === 'exact' ? '정확히' : t.matchType === 'contains' ? '포함' : t.matchType}</td>
                          <td className="num">{t.count}</td>
                          <td className="num">{formatDuration(t.avgOcrTime)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* API 프로바이더별 */}
              {ocr.byApiProvider.length > 0 && (
                <div className="perf-breakdown half">
                  <h5>API 프로바이더별</h5>
                  <table className="breakdown-table">
                    <thead>
                      <tr>
                        <th>프로바이더</th>
                        <th className="num">횟수</th>
                        <th className="num">시간</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ocr.byApiProvider.map((p) => (
                        <tr key={p.apiProvider}>
                          <td>{p.apiProvider}</td>
                          <td className="num">{p.count}</td>
                          <td className="num">{formatDuration(p.avgOcrTime)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PerformanceMetrics;
