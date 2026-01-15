// frontend/src/components/Panel/components/ActionFields/ImageFields.tsx

import type { ImageTemplate } from '../../../../types';
import type { ImageFieldProps } from '../../types';
import RoiSettings from '../RoiSettings';
import RecognitionTest from '../RecognitionTest';

interface ImageFieldsComponentProps extends ImageFieldProps {
  actionType: string;
}

function ImageFields({
  selectedNode,
  onParamChange,
  onRoiToggle,
  onRoiFieldChange,
  onRequestRegionSelect,
  selectedDeviceId,
  templates,
  onOpenTemplateModal,
  onAutoROI,
  roiLoading,
  hasCaptureInfo,
  isTesting,
  imageTestResult,
  testError,
  onImageTest,
  actionType,
}: ImageFieldsComponentProps) {
  const showWaitOptions = ['waitUntilImage', 'waitUntilImageGone'].includes(actionType);

  return (
    <>
      <div className="panel-field">
        <label>템플릿 이미지</label>
        <div className="template-select-row">
          <select
            value={selectedNode.params?.templateId || ''}
            onChange={(e) => onParamChange('templateId', e.target.value)}
          >
            <option value="">선택...</option>
            {templates.map((tpl: ImageTemplate) => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.name} ({tpl.width}x{tpl.height})
              </option>
            ))}
          </select>
          <button
            className="btn-small"
            onClick={() => onOpenTemplateModal?.()}
            type="button"
          >
            📁
          </button>
        </div>
      </div>

      <div className="panel-field">
        <label>매칭 임계값</label>
        <input
          type="number"
          min="0.5"
          max="1"
          step="0.05"
          value={selectedNode.params?.threshold || 0.9}
          onChange={(e) => onParamChange('threshold', parseFloat(e.target.value) || 0.9)}
        />
        <small>0.5 ~ 1.0 (기본: 0.9)</small>
      </div>

      {showWaitOptions && (
        <>
          <div className="panel-field">
            <label>타임아웃 (ms)</label>
            <input
              type="number"
              value={selectedNode.params?.timeout || 30000}
              onChange={(e) => onParamChange('timeout', parseInt(e.target.value) || 30000)}
            />
          </div>

          <div className="panel-field">
            <label>체크 간격 (ms)</label>
            <input
              type="number"
              value={selectedNode.params?.interval || 1000}
              onChange={(e) => onParamChange('interval', parseInt(e.target.value) || 1000)}
            />
          </div>

          {/* 대기 후 탭 옵션 (waitUntilImage만 해당) */}
          {actionType === 'waitUntilImage' && (
            <div className="panel-field checkbox-field">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={selectedNode.params?.tapAfterWait || false}
                  onChange={(e) => onParamChange('tapAfterWait', e.target.checked)}
                />
                <span>대기 후 탭</span>
              </label>
              <div className="panel-hint-small">이미지가 나타나면 자동으로 탭합니다</div>
            </div>
          )}
        </>
      )}

      {/* ROI 설정 */}
      <div className="panel-field">
        <div className="roi-checkbox-row">
          <input
            type="checkbox"
            id="roi-toggle"
            checked={!!selectedNode.params?.region}
            onChange={(e) => onRoiToggle(e.target.checked)}
          />
          <label htmlFor="roi-toggle">검색 영역 제한 (ROI)</label>
        </div>
        <small>특정 영역에서만 이미지를 검색하여 속도와 정확도 향상</small>
      </div>

      <RoiSettings
        selectedNode={selectedNode}
        onRoiFieldChange={onRoiFieldChange}
        onRequestRegionSelect={onRequestRegionSelect}
        selectedDeviceId={selectedDeviceId}
        showAutoROI={true}
        onAutoROI={onAutoROI}
        roiLoading={roiLoading}
        hasCaptureInfo={hasCaptureInfo}
      />

      <div className="panel-hint">
        💡 {actionType === 'tapImage'
          ? '화면에서 이미지를 찾아 탭합니다'
          : actionType === 'waitUntilImage'
          ? '이미지가 나타날 때까지 대기합니다'
          : '이미지가 사라질 때까지 대기합니다'}
      </div>

      {/* 이미지 인식률 테스트 */}
      {selectedNode.params?.templateId && (
        <RecognitionTest
          type="image"
          isTesting={isTesting}
          testResult={imageTestResult}
          testError={testError}
          onTest={onImageTest}
          selectedDeviceId={selectedDeviceId}
        />
      )}
    </>
  );
}

export default ImageFields;
