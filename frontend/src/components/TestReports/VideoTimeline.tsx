// frontend/src/components/TestReports/VideoTimeline.tsx
// 공통 비디오 타임라인 컴포넌트 (Scenario/Suite 리포트에서 공유)

import { useState, RefObject } from 'react';

// 타임라인에 표시할 스텝의 공통 인터페이스
export interface TimelineStep {
  nodeId: string;
  nodeName: string;
  status: string;  // 'passed' | 'failed' | 'waiting' | 'error' | 'skipped' 등
  startTime?: string;  // ISO timestamp
  timestamp?: string;  // ISO timestamp (Suite용 - startTime 대신 사용)
}

interface VideoTimelineProps {
  videoRef: RefObject<HTMLVideoElement>;
  steps: TimelineStep[];
  videoStartTime: string;  // 비디오 녹화 시작 시간 (ISO timestamp)
  videoDuration: number;   // 비디오 길이 (ms 또는 초 - 자동 정규화)
  currentTime: number;     // 현재 재생 시간 (초)
  onTimeUpdate?: (time: number) => void;
}

/**
 * duration 정규화: ms와 초 단위 모두 지원
 * 1000 미만이면 초 단위로 간주
 */
function normalizeDurationToMs(duration: number): number {
  return duration < 1000 ? duration * 1000 : duration;
}

/**
 * 스텝 위치 계산 (2-98% 범위로 제한하여 가장자리 마커가 잘리지 않도록 함)
 */
function getStepPosition(
  step: TimelineStep,
  videoStartTime: string,
  totalDuration: number
): number {
  const stepTime = step.startTime || step.timestamp;
  if (!stepTime || totalDuration === 0) return 2;

  const normalizedDuration = normalizeDurationToMs(totalDuration);
  const stepTimeMs = new Date(stepTime).getTime();
  const videoStartMs = new Date(videoStartTime).getTime();
  const offsetMs = stepTimeMs - videoStartMs;
  const position = (offsetMs / normalizedDuration) * 100;

  // 2-98% 범위로 제한
  return Math.max(2, Math.min(98, position));
}

export default function VideoTimeline({
  videoRef,
  steps,
  videoStartTime,
  videoDuration,
  currentTime,
}: VideoTimelineProps) {
  const [hoveredStep, setHoveredStep] = useState<TimelineStep | null>(null);

  // duration 정규화
  const videoDurationMs = normalizeDurationToMs(videoDuration);
  const videoDurationSec = videoDurationMs / 1000;

  // 타임라인 클릭으로 비디오 시크
  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = x / rect.width;
    videoRef.current.currentTime = videoDurationSec * percent;
  };

  // 마커 클릭 시 해당 시점으로 이동
  const handleMarkerClick = (step: TimelineStep, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!videoRef.current) return;

    const stepTime = step.startTime || step.timestamp;
    if (!stepTime) return;

    const stepTimeMs = new Date(stepTime).getTime();
    const videoStartMs = new Date(videoStartTime).getTime();
    const offsetMs = stepTimeMs - videoStartMs;
    const seekTime = Math.max(0, offsetMs / 1000);
    videoRef.current.currentTime = seekTime;
  };

  // 스텝 상태 텍스트
  const getStatusText = (status: string) => {
    switch (status) {
      case 'passed': return '성공';
      case 'failed': return '실패';
      case 'error': return '에러';
      case 'waiting': return '대기';
      case 'skipped': return '건너뜀';
      default: return status;
    }
  };

  if (videoDuration <= 0 || steps.length === 0) {
    return null;
  }

  return (
    <div className="video-timeline" onClick={handleTimelineClick}>
      {/* 진행 바 */}
      <div
        className="timeline-progress"
        style={{ width: `${Math.min(100, (currentTime / videoDurationSec) * 100)}%` }}
      />

      {/* 스텝 마커 */}
      {steps.map((step, idx) => {
        // 이전 스텝 확인 (대기 완료 마커 감지용)
        const prevStep = idx > 0 ? steps[idx - 1] : null;
        const isWaitCompletion =
          prevStep &&
          prevStep.nodeId === step.nodeId &&
          prevStep.status === 'waiting' &&
          (step.status === 'passed' || step.status === 'failed');

        let position = getStepPosition(step, videoStartTime, videoDuration);

        // 대기 완료 마커는 1초 앞당겨서 겹침 방지
        if (isWaitCompletion) {
          const offsetPercent = (1000 / videoDurationMs) * 100;
          position = Math.max(2, position - offsetPercent);
        }

        if (position < 0 || position > 100) return null;

        return (
          <div
            key={`marker-${step.nodeId}-${idx}`}
            className={`timeline-marker ${step.status}`}
            style={{ left: `${position}%` }}
            onClick={(e) => handleMarkerClick(step, e)}
            onMouseEnter={() => setHoveredStep(step)}
            onMouseLeave={() => setHoveredStep(null)}
          >
            {hoveredStep?.nodeId === step.nodeId &&
              hoveredStep?.status === step.status && (
                <div className="marker-tooltip">
                  <span className="tooltip-node">{step.nodeId}</span>
                  <span className="tooltip-action">{step.nodeName}</span>
                  <span className={`tooltip-status ${step.status}`}>
                    {getStatusText(step.status)}
                  </span>
                </div>
              )}
          </div>
        );
      })}
    </div>
  );
}
