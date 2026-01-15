// frontend/src/components/Panel/components/RoiSettings.tsx

import type { FlowNode } from '../../../types';
import type { RegionOptions } from '../types';

interface RoiSettingsProps {
  selectedNode: FlowNode;
  onRoiFieldChange: (field: keyof RegionOptions, value: number | string) => void;
  onRequestRegionSelect?: () => void;
  selectedDeviceId?: string;
  // 이미지 액션 전용 옵션
  showAutoROI?: boolean;
  onAutoROI?: () => Promise<void>;
  roiLoading?: boolean;
  hasCaptureInfo?: boolean;
}

function RoiSettings({
  selectedNode,
  onRoiFieldChange,
  onRequestRegionSelect,
  selectedDeviceId,
  showAutoROI = false,
  onAutoROI,
  roiLoading = false,
  hasCaptureInfo = true,
}: RoiSettingsProps) {
  const region = selectedNode.params?.region as RegionOptions | undefined;

  if (!region) return null;

  return (
    <div className="roi-settings">
      <div className="roi-header">
        <span>ROI 좌표 (0~1)</span>
        <div className="roi-header-buttons">
          <button
            type="button"
            className="btn-small btn-region-select"
            onClick={onRequestRegionSelect}
            disabled={!selectedDeviceId}
            title="화면에서 영역을 드래그하여 선택"
          >
            📐 선택
          </button>
          {showAutoROI && onAutoROI && (
            <button
              type="button"
              className="btn-small btn-auto-roi"
              onClick={onAutoROI}
              disabled={roiLoading || !selectedNode.params?.templateId}
              title={!hasCaptureInfo ? '템플릿에 캡처 좌표 정보가 없습니다. 재캡처가 필요합니다.' : '템플릿 캡처 위치 기반으로 ROI 자동 설정'}
            >
              {roiLoading ? '...' : '자동'}
            </button>
          )}
        </div>
      </div>
      {showAutoROI && !hasCaptureInfo && selectedNode.params?.templateId && (
        <div className="roi-warning">
          이 템플릿은 캡처 좌표 정보가 없어 자동 ROI를 사용할 수 없습니다.
        </div>
      )}
      <div className="roi-fields-grid">
        <div className="roi-field">
          <label>X</label>
          <input
            type="number"
            step="0.01"
            min="0"
            max="1"
            value={region.x || 0}
            onChange={(e) => onRoiFieldChange('x', e.target.value)}
          />
        </div>
        <div className="roi-field">
          <label>Y</label>
          <input
            type="number"
            step="0.01"
            min="0"
            max="1"
            value={region.y || 0}
            onChange={(e) => onRoiFieldChange('y', e.target.value)}
          />
        </div>
        <div className="roi-field">
          <label>W</label>
          <input
            type="number"
            step="0.01"
            min="0"
            max="1"
            value={region.width || 1}
            onChange={(e) => onRoiFieldChange('width', e.target.value)}
          />
        </div>
        <div className="roi-field">
          <label>H</label>
          <input
            type="number"
            step="0.01"
            min="0"
            max="1"
            value={region.height || 1}
            onChange={(e) => onRoiFieldChange('height', e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}

export default RoiSettings;
