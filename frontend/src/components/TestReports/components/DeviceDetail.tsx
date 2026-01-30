// frontend/src/components/TestReports/components/DeviceDetail.tsx
// 디바이스 상세 컴포넌트 (시나리오 리포트용)

import { useRef, useState, useCallback } from 'react';
import {
  DeviceScenarioResult,
  ScenarioReportResult,
  StepResult,
  StepGroup,
} from './types';
import VideoTimeline from '../VideoTimeline';
import VirtualScreenshotGrid from './VirtualScreenshotGrid';
import ScreenshotLightbox from './ScreenshotLightbox';
import { formatDuration, formatFileSize } from '../../../utils/formatters';
import { getVideoUrl } from '../../../utils/reportUrls';

interface DeviceDetailProps {
  device?: DeviceScenarioResult;
  scenario: ScenarioReportResult | null;
}

// 노드별로 단계 그룹화
function groupStepsByNode(steps: StepResult[]): StepGroup[] {
  const groups: StepGroup[] = [];
  let currentGroup: StepGroup | null = null;

  for (const step of steps) {
    if (currentGroup && currentGroup.nodeId === step.nodeId) {
      currentGroup.steps.push(step);
      currentGroup.status = step.status;
      currentGroup.endTime = step.endTime;
      if (step.error) currentGroup.error = step.error;
      if (step.status === 'waiting') currentGroup.hasWaiting = true;
    } else {
      if (currentGroup) groups.push(currentGroup);
      currentGroup = {
        nodeId: step.nodeId,
        nodeName: step.nodeName,
        nodeType: step.nodeType,
        steps: [step],
        status: step.status,
        startTime: step.startTime,
        endTime: step.endTime,
        error: step.error,
        hasWaiting: step.status === 'waiting',
      };
    }
  }
  if (currentGroup) groups.push(currentGroup);

  for (const group of groups) {
    if (group.startTime && group.endTime) {
      group.duration = new Date(group.endTime).getTime() - new Date(group.startTime).getTime();
    } else if (group.steps.length > 0) {
      group.duration = group.steps.reduce((sum, s) => sum + (s.duration || 0), 0);
    }
  }

  return groups;
}

export default function DeviceDetail({ device, scenario }: DeviceDetailProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);

  // 라이트박스 상태
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const handleScreenshotClick = useCallback((index: number) => {
    setLightboxIndex(index);
  }, []);

  const handleLightboxClose = useCallback(() => {
    setLightboxIndex(null);
  }, []);

  const handleLightboxNavigate = useCallback((index: number) => {
    setLightboxIndex(index);
  }, []);

  const seekToTime = (startTime: string | undefined, videoStartTime: string | undefined, offsetSeconds: number = 0) => {
    if (!videoRef.current || !startTime || !videoStartTime) return;
    const stepTime = new Date(startTime).getTime();
    const videoStart = new Date(videoStartTime).getTime();
    if (isNaN(stepTime) || isNaN(videoStart)) return;
    const offsetMs = stepTime - videoStart;
    const seekTime = Math.max(0, offsetMs / 1000 + offsetSeconds);
    videoRef.current.currentTime = seekTime;
  };

  const handleVideoTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  if (!device) return null;

  const stepGroups = groupStepsByNode(device.steps);

  return (
    <div className="device-detail">
      <div className="device-header">
        <h5>
          {device.deviceName || device.deviceId}
          <span className={`status ${
            device.status === 'skipped' ? 'status-skipped' :
            device.success ? 'status-success' : 'status-failed'
          }`}>
            {device.status === 'skipped' ? '건너뜀' : device.success ? '성공' : '실패'}
          </span>
        </h5>
        {device.status === 'skipped' && device.skippedReason && (
          <div className="device-skipped-reason">사유: {device.skippedReason}</div>
        )}
        {device.error && (
          <div className="device-error">{device.error}</div>
        )}
      </div>

      {/* QA 확장: 환경 정보 */}
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

      {/* QA 확장: 성능 요약 */}
      {device.performanceSummary && (
        <div className="qa-performance-section">
          <h6>성능 메트릭</h6>
          <div className="performance-grid">
            <div className="perf-item">
              <span className="perf-label">평균 단계 시간</span>
              <span className="perf-value">{formatDuration(device.performanceSummary.avgStepDuration)}</span>
            </div>
            <div className="perf-item">
              <span className="perf-label">최대 단계 시간</span>
              <span className="perf-value">{formatDuration(device.performanceSummary.maxStepDuration)}</span>
            </div>
            <div className="perf-item">
              <span className="perf-label">총 대기 시간</span>
              <span className="perf-value">{formatDuration(device.performanceSummary.totalWaitTime)}</span>
            </div>
            <div className="perf-item">
              <span className="perf-label">총 액션 시간</span>
              <span className="perf-value">{formatDuration(device.performanceSummary.totalActionTime)}</span>
            </div>
            {device.performanceSummary.imageMatchCount && device.performanceSummary.imageMatchCount > 0 && (
              <div className="perf-item perf-item-full">
                <span className="perf-label">이미지 매칭</span>
                <span className="perf-value">{device.performanceSummary.imageMatchCount}회 (평균 {formatDuration(device.performanceSummary.imageMatchAvgTime || 0)})</span>
              </div>
            )}
            {(device.performanceSummary.deviceMatchCount || device.performanceSummary.backendMatchCount) && (
              <>
                {device.performanceSummary.deviceMatchCount && device.performanceSummary.deviceMatchCount > 0 && (
                  <div className="perf-item">
                    <span className="perf-label">📱 디바이스 매칭</span>
                    <span className="perf-value perf-device">{device.performanceSummary.deviceMatchCount}회 (평균 {formatDuration(device.performanceSummary.deviceMatchAvgTime || 0)})</span>
                  </div>
                )}
                {device.performanceSummary.backendMatchCount && device.performanceSummary.backendMatchCount > 0 && (
                  <div className="perf-item">
                    <span className="perf-label">💻 백엔드 매칭</span>
                    <span className="perf-value perf-backend">{device.performanceSummary.backendMatchCount}회 (평균 {formatDuration(device.performanceSummary.backendMatchAvgTime || 0)})</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* 단계별 결과 */}
      <div className="steps-list">
        <h6>실행 단계</h6>
        {device.status === 'skipped' ? (
          <p className="no-steps">이 디바이스는 실행되지 않았습니다.</p>
        ) : device.steps.length === 0 ? (
          <p className="no-steps">실행된 단계가 없습니다.</p>
        ) : (
          <table className="steps-table">
            <thead>
              <tr>
                <th>노드</th>
                <th>액션</th>
                <th>상태</th>
                <th>소요시간</th>
                <th>에러</th>
              </tr>
            </thead>
            <tbody>
              {stepGroups.map((group, idx) => (
                group.hasWaiting && group.steps.length > 1 ? (
                  group.steps.map((step, stepIdx) => {
                    const isWaitingEnd = step.status !== 'waiting' && stepIdx > 0;
                    return (
                    <tr
                      key={`${group.nodeId}-${idx}-${stepIdx}`}
                      className={`step-row ${step.status} clickable ${step.status === 'waiting' ? 'waiting-start' : 'waiting-end'}`}
                      onClick={() => scenario && device.video && seekToTime(step.startTime, device.video.startedAt, isWaitingEnd ? -1 : 0)}
                      title="클릭하면 해당 시점으로 영상 이동"
                    >
                      <td className="step-node">
                        {stepIdx === 0 ? group.nodeId : ''}
                      </td>
                      <td className="step-action">
                        {step.nodeName || step.nodeType}
                        <span className="waiting-phase">
                          {step.status === 'waiting' ? ' (시작)' : ' (완료)'}
                        </span>
                      </td>
                      <td className={`step-status ${step.status}`}>
                        {step.status === 'passed' ? 'O' :
                         step.status === 'failed' ? 'X' :
                         step.status === 'error' ? '!' :
                         step.status === 'waiting' ? '...' : step.status}
                      </td>
                      <td className="step-duration">
                        {step.status === 'waiting' ? '-' : formatDuration(step.duration)}
                      </td>
                      <td className="step-error">{step.error || '-'}</td>
                    </tr>
                  );})
                ) : (
                  <tr
                    key={`${group.nodeId}-${idx}`}
                    className={`step-row ${group.status} clickable`}
                    onClick={() => scenario && device.video && seekToTime(group.startTime, device.video.startedAt)}
                    title="클릭하면 해당 시점으로 영상 이동"
                  >
                    <td className="step-node">
                      {group.nodeId}
                      {group.hasWaiting && <span className="waiting-indicator" title="대기 포함">⏳</span>}
                    </td>
                    <td className="step-action">{group.nodeName || group.nodeType}</td>
                    <td className={`step-status ${group.status}`}>
                      {group.status === 'passed' ? 'O' :
                       group.status === 'failed' ? 'X' :
                       group.status === 'error' ? '!' :
                       group.status === 'waiting' ? '...' : group.status}
                    </td>
                    <td className="step-duration">{formatDuration(group.duration)}</td>
                    <td className="step-error">{group.error || '-'}</td>
                  </tr>
                )
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 비디오 */}
      {device.video && (
        <div className="video-section">
          <h6>실행 영상</h6>
          <div className="video-container">
            <video
              ref={videoRef}
              key={`video-${device.deviceId}-${device.video.path}`}
              controls
              preload="metadata"
              className="video-player"
              onTimeUpdate={handleVideoTimeUpdate}
            >
              <source
                src={getVideoUrl(device.video.path)}
                type="video/mp4"
              />
              브라우저가 비디오를 지원하지 않습니다.
            </video>

            <VideoTimeline
              videoRef={videoRef as React.RefObject<HTMLVideoElement>}
              steps={device.steps.map(s => ({
                nodeId: s.nodeId,
                nodeName: s.nodeName || s.nodeType,
                status: s.status,
                startTime: s.startTime,
              }))}
              videoStartTime={device.video.startedAt}
              videoDuration={device.video.duration}
              currentTime={currentTime}
            />

            <div className="video-info">
              <span>재생시간: {formatDuration(device.video.duration)}</span>
              <span>파일크기: {formatFileSize(device.video.size)}</span>
            </div>
          </div>
        </div>
      )}

      {/* 스크린샷 */}
      {device.screenshots.length > 0 && (
        <div className="screenshots-section">
          <h6>스크린샷 ({device.screenshots.length})</h6>
          <VirtualScreenshotGrid
            screenshots={device.screenshots}
            steps={device.steps}
            onScreenshotClick={handleScreenshotClick}
          />
        </div>
      )}

      {/* 스크린샷 라이트박스 */}
      {lightboxIndex !== null && (
        <ScreenshotLightbox
          screenshots={device.screenshots}
          steps={device.steps}
          currentIndex={lightboxIndex}
          onClose={handleLightboxClose}
          onNavigate={handleLightboxNavigate}
        />
      )}
    </div>
  );
}
