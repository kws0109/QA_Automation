/**
 * 화면 녹화 섹션 컴포넌트
 */

import React from 'react';
import type { DeviceInfo, RecordingStatus } from './types';
import { ADB_MAX_RECORDING_DURATION } from './types';

interface RecordingSectionProps {
  devices: DeviceInfo[];
  selectedDevice: string;
  onDeviceChange: (deviceId: string) => void;
  isRecording: boolean;
  recordingStatus: RecordingStatus | null;
  recordingElapsed: number;
  showTaps: boolean;
  onToggleShowTaps: () => void;
  useDeviceApp: boolean;
  onToggleDeviceApp: (enabled: boolean) => void;
  deviceAppAvailable: boolean | null;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onCancelRecording: () => void;
}

// 녹화 시간 포맷
const formatRecordingTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export default function RecordingSection({
  devices,
  selectedDevice,
  onDeviceChange,
  isRecording,
  recordingStatus,
  recordingElapsed,
  showTaps,
  onToggleShowTaps,
  useDeviceApp,
  onToggleDeviceApp,
  deviceAppAvailable,
  onStartRecording,
  onStopRecording,
  onCancelRecording,
}: RecordingSectionProps) {
  return (
    <div className="vc-record-section">
      <h3>화면 녹화</h3>
      <div className="vc-device-select">
        <select
          value={selectedDevice}
          onChange={(e) => onDeviceChange(e.target.value)}
          disabled={isRecording}
        >
          <option value="">디바이스 선택...</option>
          {devices.filter((d) => d.status === 'connected').map((device) => (
            <option key={device.id} value={device.id}>
              {device.name || device.model || device.id}
            </option>
          ))}
        </select>
      </div>

      {selectedDevice && (
        <>
          <div className="vc-show-taps">
            <label>
              <input
                type="checkbox"
                checked={showTaps}
                onChange={onToggleShowTaps}
                disabled={isRecording}
              />
              탭한 항목 표시
            </label>
            <span className="vc-option-hint">터치 위치에 원형 표시</span>
          </div>

          <div className="vc-show-taps">
            <label className={deviceAppAvailable === false ? 'disabled' : ''}>
              <input
                type="checkbox"
                checked={useDeviceApp}
                onChange={(e) => onToggleDeviceApp(e.target.checked)}
                disabled={isRecording || deviceAppAvailable === false}
              />
              확장 녹화 (Device App)
            </label>
            <span className="vc-option-hint">
              {deviceAppAvailable === null && '확인 중...'}
              {deviceAppAvailable === true && '시간 제한 없음, 가로/세로 자동 감지'}
              {deviceAppAvailable === false && 'QA Recorder 앱 서비스 시작 필요'}
            </span>
          </div>
        </>
      )}

      {isRecording ? (
        <div className="vc-recording-status">
          <div className="vc-recording-indicator">
            <span className="vc-recording-dot"></span>
            <span className="vc-recording-time">
              {formatRecordingTime(recordingElapsed)}
            </span>
            {!useDeviceApp && (
              <span className="vc-recording-limit">
                / {formatRecordingTime(ADB_MAX_RECORDING_DURATION)}
              </span>
            )}
            {useDeviceApp && <span className="vc-recording-method">Device App</span>}
          </div>
          <div className="vc-recording-actions">
            <button
              className="vc-stop-btn"
              onClick={onStopRecording}
              disabled={recordingStatus?.status === 'stopping'}
            >
              {recordingStatus?.status === 'stopping' ? '저장 중...' : '녹화 중지'}
            </button>
            <button
              className="vc-cancel-btn"
              onClick={onCancelRecording}
              disabled={recordingStatus?.status === 'stopping'}
            >
              취소
            </button>
          </div>
        </div>
      ) : (
        <button
          className="vc-record-btn"
          onClick={onStartRecording}
          disabled={!selectedDevice || devices.length === 0}
        >
          녹화 시작
        </button>
      )}

      {devices.length === 0 && (
        <p className="vc-no-devices">연결된 디바이스가 없습니다.</p>
      )}
    </div>
  );
}
