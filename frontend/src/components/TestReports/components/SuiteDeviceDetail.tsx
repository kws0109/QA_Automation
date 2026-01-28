// frontend/src/components/TestReports/components/SuiteDeviceDetail.tsx
// Suite 디바이스 상세 컴포넌트

import { useRef, useState } from 'react';
import { ConvertedDeviceResult, StepSuiteResult } from './types';
import VideoTimeline from '../VideoTimeline';
import { formatDuration, formatFileSize } from '../../../utils/formatters';
import { getScreenshotUrl, getSuiteVideoUrl } from '../../../utils/reportUrls';

interface SuiteDeviceDetailProps {
  device: ConvertedDeviceResult;
}

// Suite 시나리오 비디오 컴포넌트
function SuiteScenarioVideo({
  videoUrl,
  videoStartTime,
  steps,
}: {
  videoUrl: string;
  videoStartTime: string;
  steps: StepSuiteResult[];
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);

  const handleVideoTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleVideoLoadedMetadata = () => {
    if (videoRef.current) {
      setVideoDuration(videoRef.current.duration * 1000);
    }
  };

  const timelineSteps = steps.map(s => ({
    nodeId: s.nodeId,
    nodeName: s.nodeName || s.actionType,
    status: s.status,
    timestamp: s.timestamp,
  }));

  return (
    <div className="suite-scenario-video">
      <h6>실행 영상</h6>
      <video
        ref={videoRef}
        controls
        preload="metadata"
        className="suite-video-player"
        onTimeUpdate={handleVideoTimeUpdate}
        onLoadedMetadata={handleVideoLoadedMetadata}
      >
        <source src={videoUrl} type="video/mp4" />
        브라우저가 비디오를 지원하지 않습니다.
      </video>

      {videoDuration > 0 && steps.length > 0 && (
        <VideoTimeline
          videoRef={videoRef as React.RefObject<HTMLVideoElement>}
          steps={timelineSteps}
          videoStartTime={videoStartTime}
          videoDuration={videoDuration}
          currentTime={currentTime}
        />
      )}
    </div>
  );
}

export default function SuiteDeviceDetail({ device }: SuiteDeviceDetailProps) {
  return (
    <div className="device-detail">
      <div className="device-header">
        <h5>
          {device.deviceName}
          <span className={`status ${
            device.status === 'skipped' ? 'status-skipped' :
            device.status === 'passed' ? 'status-success' : 'status-failed'
          }`}>
            {device.status === 'skipped' ? '건너뜀' : device.status === 'passed' ? '성공' : '실패'}
          </span>
        </h5>
        {device.error && (
          <div className="device-error">{device.error}</div>
        )}
      </div>

      {/* 환경 정보 */}
      {(device.environment || device.appInfo) && (
        <div className="qa-environment-section">
          <h6>환경 정보</h6>
          <div className="environment-grid">
            {device.environment && (
              <div className="env-group">
                <div className="env-group-title">디바이스</div>
                <div className="env-item"><span>모델:</span> {device.environment.brand} {device.environment.model}</div>
                <div className="env-item"><span>Android:</span> {device.environment.androidVersion} (SDK {device.environment.sdkVersion})</div>
                <div className="env-item"><span>해상도:</span> {device.environment.screenResolution}</div>
                <div className="env-item"><span>배터리:</span> {device.environment.batteryLevel}% ({device.environment.batteryStatus})</div>
                <div className="env-item"><span>메모리:</span> {device.environment.availableMemory}MB / {device.environment.totalMemory}MB</div>
                <div className="env-item"><span>네트워크:</span> {device.environment.networkType}</div>
              </div>
            )}
            {device.appInfo && (
              <div className="env-group">
                <div className="env-group-title">앱 정보</div>
                <div className="env-item"><span>패키지:</span> {device.appInfo.packageName}</div>
                {device.appInfo.appName && <div className="env-item"><span>앱 이름:</span> {device.appInfo.appName}</div>}
                {device.appInfo.versionName && <div className="env-item"><span>버전:</span> {device.appInfo.versionName} ({device.appInfo.versionCode})</div>}
                {device.appInfo.targetSdk && <div className="env-item"><span>Target SDK:</span> {device.appInfo.targetSdk}</div>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 성능 메트릭 요약 */}
      {device.stepResults && device.stepResults.length > 0 && (() => {
        // 성능 데이터 집계
        const stepsWithPerf = device.stepResults.filter(s => s.performance);
        const imageMatches = stepsWithPerf.filter(s => s.performance?.imageMatch);
        const ocrMatches = stepsWithPerf.filter(s => s.performance?.ocrMatch);

        const avgImageMatchTime = imageMatches.length > 0
          ? imageMatches.reduce((sum, s) => sum + (s.performance?.imageMatch?.matchTime || 0), 0) / imageMatches.length
          : 0;
        const avgOcrTime = ocrMatches.length > 0
          ? ocrMatches.reduce((sum, s) => sum + (s.performance?.ocrMatch?.ocrTime || 0), 0) / ocrMatches.length
          : 0;
        const avgImageConfidence = imageMatches.filter(s => s.performance?.imageMatch?.matched).length > 0
          ? imageMatches.filter(s => s.performance?.imageMatch?.matched)
              .reduce((sum, s) => sum + (s.performance?.imageMatch?.confidence || 0), 0)
            / imageMatches.filter(s => s.performance?.imageMatch?.matched).length
          : 0;
        const avgOcrConfidence = ocrMatches.filter(s => s.performance?.ocrMatch?.matched).length > 0
          ? ocrMatches.filter(s => s.performance?.ocrMatch?.matched)
              .reduce((sum, s) => sum + (s.performance?.ocrMatch?.confidence || 0), 0)
            / ocrMatches.filter(s => s.performance?.ocrMatch?.matched).length
          : 0;

        if (imageMatches.length === 0 && ocrMatches.length === 0) return null;

        return (
          <div className="qa-performance-section">
            <h6>성능 메트릭</h6>
            <div className="performance-grid">
              {imageMatches.length > 0 && (
                <>
                  <div className="perf-item">
                    <span className="perf-label">이미지 매칭</span>
                    <span className="perf-value">{imageMatches.length}회</span>
                  </div>
                  <div className="perf-item">
                    <span className="perf-label">평균 매칭 시간</span>
                    <span className="perf-value">{formatDuration(avgImageMatchTime)}</span>
                  </div>
                  <div className="perf-item">
                    <span className="perf-label">평균 신뢰도</span>
                    <span className="perf-value">{(avgImageConfidence * 100).toFixed(1)}%</span>
                  </div>
                </>
              )}
              {ocrMatches.length > 0 && (
                <>
                  <div className="perf-item">
                    <span className="perf-label">OCR 매칭</span>
                    <span className="perf-value">{ocrMatches.length}회</span>
                  </div>
                  <div className="perf-item">
                    <span className="perf-label">평균 OCR 시간</span>
                    <span className="perf-value">{formatDuration(avgOcrTime)}</span>
                  </div>
                  <div className="perf-item">
                    <span className="perf-label">평균 OCR 신뢰도</span>
                    <span className="perf-value">{(avgOcrConfidence * 100).toFixed(1)}%</span>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* 실행 단계 */}
      {device.stepResults && device.stepResults.length > 0 && (
        <div className="steps-list">
          <h6>실행 단계</h6>
          <table className="steps-table">
            <thead>
              <tr>
                <th>노드</th>
                <th>액션</th>
                <th>상태</th>
                <th>소요시간</th>
                <th>매칭 시간</th>
                <th>신뢰도</th>
                <th>에러</th>
              </tr>
            </thead>
            <tbody>
              {device.stepResults.map((step, idx) => {
                const perf = step.performance;
                const matchTime = perf?.imageMatch?.matchTime || perf?.ocrMatch?.ocrTime;
                const confidence = perf?.imageMatch?.confidence ?? perf?.ocrMatch?.confidence;
                const matchType = perf?.imageMatch ? 'image' : perf?.ocrMatch ? 'ocr' : null;

                return (
                  <tr key={`${step.nodeId}-${idx}`} className={`step-row ${step.status}`}>
                    <td className="step-node">{step.nodeId}</td>
                    <td className="step-action">{step.nodeName || step.actionType}</td>
                    <td className={`step-status ${step.status}`}>
                      {step.status === 'passed' ? 'O' :
                       step.status === 'failed' ? 'X' :
                       step.status === 'waiting' ? '...' : step.status}
                    </td>
                    <td className="step-duration">{formatDuration(step.duration)}</td>
                    <td className="step-match-time">
                      {matchTime !== undefined ? (
                        <span className={`match-type-${matchType}`}>
                          {matchType === 'ocr' ? '🔤 ' : '🖼️ '}
                          {formatDuration(matchTime)}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="step-confidence">
                      {confidence !== undefined ? (
                        <span className={confidence >= 0.8 ? 'confidence-high' : confidence >= 0.5 ? 'confidence-medium' : 'confidence-low'}>
                          {(confidence * 100).toFixed(1)}%
                        </span>
                      ) : '-'}
                    </td>
                    <td className="step-error">{step.error || '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 비디오 */}
      {device.videoPath && (
        <SuiteScenarioVideo
          videoUrl={getSuiteVideoUrl(device.videoPath)}
          videoStartTime={device.startedAt}
          steps={device.stepResults}
        />
      )}

      {/* 스크린샷 */}
      {device.screenshots && device.screenshots.length > 0 && (
        <div className="screenshots-section">
          <h6>스크린샷 ({device.screenshots.length})</h6>
          <div className="screenshots-grid">
            {device.screenshots.map((screenshot, idx) => (
              <div
                key={`${screenshot.nodeId}-${idx}`}
                className={`screenshot-item ${screenshot.type}`}
              >
                <img
                  src={getScreenshotUrl(screenshot.path)}
                  alt={`${screenshot.nodeId} - ${screenshot.type}`}
                  loading="lazy"
                  onClick={() => window.open(getScreenshotUrl(screenshot.path), '_blank')}
                />
                <div className="screenshot-info">
                  <span className="screenshot-node">{screenshot.nodeId}</span>
                  <span className={`screenshot-type ${screenshot.type}${screenshot.type === 'highlight' && screenshot.templateId?.startsWith('ocr:') ? ' ocr' : ''}`}>
                    {screenshot.type === 'step' ? '단계' :
                     screenshot.type === 'failed' ? '실패' :
                     screenshot.type === 'highlight'
                       ? (screenshot.templateId?.startsWith('ocr:') ? '텍스트인식' : '이미지인식')
                       : '최종'}
                  </span>
                  {screenshot.type === 'highlight' && screenshot.confidence && (
                    <span className="screenshot-confidence">
                      {(screenshot.confidence * 100).toFixed(2)}%
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
