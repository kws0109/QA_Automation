/**
 * ScreenshotLightbox
 * 스크린샷 전체 화면 뷰어
 * - 원본 이미지(PNG) 로드
 * - 키보드 네비게이션 (좌/우 화살표, ESC)
 * - 이전/다음 버튼
 */

import { useEffect, useCallback } from 'react';
import { getScreenshotUrl } from '../../../utils/reportUrls';
import { ScreenshotInfo } from '../../../types';

// Step 정보를 위한 최소 인터페이스 (StepResult, StepSuiteResult 모두 호환)
interface StepInfo {
  nodeId: string;
  nodeName?: string;
}

interface ScreenshotLightboxProps {
  screenshots: ScreenshotInfo[];
  steps: StepInfo[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

export default function ScreenshotLightbox({
  screenshots,
  steps,
  currentIndex,
  onClose,
  onNavigate,
}: ScreenshotLightboxProps) {
  const screenshot = screenshots[currentIndex];
  const matchingStep = steps.find(s => s.nodeId === screenshot.nodeId);
  const actionName = matchingStep?.nodeName || screenshot.nodeId;

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < screenshots.length - 1;

  // 이전 스크린샷
  const handlePrev = useCallback(() => {
    if (hasPrev) {
      onNavigate(currentIndex - 1);
    }
  }, [hasPrev, currentIndex, onNavigate]);

  // 다음 스크린샷
  const handleNext = useCallback(() => {
    if (hasNext) {
      onNavigate(currentIndex + 1);
    }
  }, [hasNext, currentIndex, onNavigate]);

  // 키보드 이벤트 핸들러
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          onClose();
          break;
        case 'ArrowLeft':
          handlePrev();
          break;
        case 'ArrowRight':
          handleNext();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, handlePrev, handleNext]);

  // 배경 클릭 시 닫기
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="lightbox-overlay" onClick={handleBackdropClick}>
      <div className="lightbox-container">
        {/* 헤더 */}
        <div className="lightbox-header">
          <div className="lightbox-title">
            <span className="lightbox-action-name">{actionName}</span>
            <span className={`lightbox-type ${screenshot.type}${screenshot.type === 'highlight' && screenshot.templateId?.startsWith('ocr:') ? ' ocr' : ''}`}>
              {screenshot.type === 'step' ? '단계' :
               screenshot.type === 'failed' ? '실패' :
               screenshot.type === 'highlight'
                 ? (screenshot.templateId?.startsWith('ocr:') ? '텍스트인식' : '이미지인식')
                 : '최종'}
            </span>
            {screenshot.type === 'highlight' && screenshot.confidence && (
              <span className="lightbox-confidence">
                {(screenshot.confidence * 100).toFixed(2)}%
              </span>
            )}
          </div>
          <div className="lightbox-counter">
            {currentIndex + 1} / {screenshots.length}
          </div>
          <button className="lightbox-close" onClick={onClose} title="닫기 (ESC)">
            ✕
          </button>
        </div>

        {/* 이미지 */}
        <div className="lightbox-content">
          {hasPrev && (
            <button
              className="lightbox-nav lightbox-prev"
              onClick={handlePrev}
              title="이전 (←)"
            >
              ‹
            </button>
          )}

          <img
            src={getScreenshotUrl(screenshot.path)}
            alt={`${actionName} - ${screenshot.type}`}
            className="lightbox-image"
          />

          {hasNext && (
            <button
              className="lightbox-nav lightbox-next"
              onClick={handleNext}
              title="다음 (→)"
            >
              ›
            </button>
          )}
        </div>

        {/* 푸터: 새 탭에서 열기 */}
        <div className="lightbox-footer">
          <a
            href={getScreenshotUrl(screenshot.path)}
            target="_blank"
            rel="noopener noreferrer"
            className="lightbox-open-new"
          >
            새 탭에서 열기
          </a>
        </div>
      </div>
    </div>
  );
}
