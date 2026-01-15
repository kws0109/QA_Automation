// frontend/src/components/Panel/components/ActionFields/OcrFields.tsx

import type { OcrFieldProps } from '../../types';
import RoiSettings from '../RoiSettings';
import RecognitionTest from '../RecognitionTest';

interface OcrFieldsComponentProps extends OcrFieldProps {
  actionType: string;
}

function OcrFields({
  selectedNode,
  onParamChange,
  onRoiToggle,
  onRoiFieldChange,
  onRequestRegionSelect,
  selectedDeviceId,
  isTesting,
  ocrTestResult,
  testError,
  onOcrTest,
  actionType,
}: OcrFieldsComponentProps) {
  const showTimeout = ['waitUntilTextOcr', 'waitUntilTextGoneOcr'].includes(actionType);

  return (
    <>
      <div className="panel-field">
        <label>검색할 텍스트</label>
        <input
          type="text"
          value={selectedNode.params?.text || ''}
          onChange={(e) => onParamChange('text', e.target.value)}
          placeholder="예: 시작하기"
        />
      </div>

      <div className="panel-field">
        <label>매칭 방식</label>
        <select
          value={selectedNode.params?.matchType || 'contains'}
          onChange={(e) => onParamChange('matchType', e.target.value)}
        >
          <option value="exact">정확히 일치</option>
          <option value="contains">포함</option>
          <option value="regex">정규표현식</option>
        </select>
      </div>

      <div className="panel-field">
        <div className="roi-checkbox-row">
          <input
            type="checkbox"
            id="ocr-case-sensitive"
            checked={selectedNode.params?.caseSensitive || false}
            onChange={(e) => onParamChange('caseSensitive', e.target.checked)}
          />
          <label htmlFor="ocr-case-sensitive">대소문자 구분</label>
        </div>
      </div>

      <div className="panel-field">
        <label>텍스트 인덱스</label>
        <input
          type="number"
          min="0"
          value={selectedNode.params?.index || 0}
          onChange={(e) => onParamChange('index', parseInt(e.target.value) || 0)}
        />
        <small>같은 텍스트가 여러 개일 때 n번째 선택 (0부터 시작)</small>
      </div>

      {showTimeout && (
        <div className="panel-field">
          <label>타임아웃 (ms)</label>
          <input
            type="number"
            value={selectedNode.params?.timeout || 30000}
            onChange={(e) => onParamChange('timeout', parseInt(e.target.value) || 30000)}
          />
        </div>
      )}

      {/* 대기 후 탭 옵션 (waitUntilTextOcr만 해당) */}
      {actionType === 'waitUntilTextOcr' && (
        <div className="panel-field checkbox-field">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={selectedNode.params?.tapAfterWait || false}
              onChange={(e) => onParamChange('tapAfterWait', e.target.checked)}
            />
            <span>대기 후 탭</span>
          </label>
          <div className="panel-hint-small">텍스트가 나타나면 자동으로 탭합니다</div>
        </div>
      )}

      {actionType === 'assertTextOcr' && (
        <div className="panel-field">
          <div className="roi-checkbox-row">
            <input
              type="checkbox"
              id="ocr-should-exist"
              checked={selectedNode.params?.shouldExist ?? true}
              onChange={(e) => onParamChange('shouldExist', e.target.checked)}
            />
            <label htmlFor="ocr-should-exist">텍스트가 존재해야 함</label>
          </div>
        </div>
      )}

      {/* OCR ROI 설정 */}
      <div className="panel-field">
        <div className="roi-checkbox-row">
          <input
            type="checkbox"
            id="ocr-roi-toggle"
            checked={!!selectedNode.params?.region}
            onChange={(e) => onRoiToggle(e.target.checked)}
          />
          <label htmlFor="ocr-roi-toggle">검색 영역 제한 (ROI)</label>
        </div>
        <small>특정 영역에서만 텍스트를 검색하여 속도와 정확도 향상</small>
      </div>

      <RoiSettings
        selectedNode={selectedNode}
        onRoiFieldChange={onRoiFieldChange}
        onRequestRegionSelect={onRequestRegionSelect}
        selectedDeviceId={selectedDeviceId}
      />

      <div className="panel-hint">
        💡 {actionType === 'tapTextOcr' && 'OCR로 화면에서 텍스트를 찾아 탭합니다'}
        {actionType === 'waitUntilTextOcr' && 'OCR로 텍스트가 나타날 때까지 대기합니다'}
        {actionType === 'waitUntilTextGoneOcr' && 'OCR로 텍스트가 사라질 때까지 대기합니다'}
        {actionType === 'assertTextOcr' && 'OCR로 텍스트 존재 여부를 검증합니다'}
      </div>

      {/* OCR 인식률 테스트 */}
      <RecognitionTest
        type="ocr"
        isTesting={isTesting}
        testResult={ocrTestResult}
        testError={testError}
        onTest={onOcrTest}
        selectedDeviceId={selectedDeviceId}
        searchText={selectedNode.params?.text as string}
      />
    </>
  );
}

export default OcrFields;
