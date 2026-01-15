// frontend/src/components/Panel/Panel.tsx

import { useState } from 'react';
import axios from 'axios';
import type { NodeParams } from '../../types';
import type { PanelProps, RegionOptions, ImageTestResult, OcrTestResult } from './types';
import { API_BASE, ACTION_TYPES } from './constants';
import {
  TouchFields,
  WaitFields,
  ImageFields,
  OcrFields,
  ConditionFields,
  LoopFields,
} from './components';
import './Panel.css';

function Panel({
  selectedNode,
  onNodeUpdate,
  onNodeDelete,
  templates = [],
  onOpenTemplateModal,
  selectedDeviceId,
  onRequestRegionSelect,
}: PanelProps) {
  const [roiLoading, setRoiLoading] = useState(false);

  // 인식률 테스트 상태
  const [isTesting, setIsTesting] = useState(false);
  const [imageTestResult, setImageTestResult] = useState<ImageTestResult | null>(null);
  const [ocrTestResult, setOcrTestResult] = useState<OcrTestResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  if (!selectedNode) {
    return (
      <aside className="panel">
        <div className="panel-header">
          <h2>속성</h2>
        </div>
        <div className="panel-empty">
          <p>노드를 선택하세요</p>
        </div>
      </aside>
    );
  }

  // ========== 핸들러 ==========
  const handleParamChange = (key: keyof NodeParams, value: NodeParams[keyof NodeParams]) => {
    const updatedParams: NodeParams = {
      ...selectedNode.params,
      [key]: value,
    };
    onNodeUpdate?.(selectedNode.id, { params: updatedParams });
  };

  const handleLabelChange = (value: string) => {
    onNodeUpdate?.(selectedNode.id, { label: value });
  };

  const handleRoiToggle = (enabled: boolean) => {
    if (enabled) {
      handleParamChange('region' as keyof NodeParams, {
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        type: 'relative',
      } as unknown as NodeParams[keyof NodeParams]);
    } else {
      const updatedParams = { ...selectedNode.params };
      delete updatedParams.region;
      onNodeUpdate?.(selectedNode.id, { params: updatedParams });
    }
  };

  const handleRoiFieldChange = (field: keyof RegionOptions, value: number | string) => {
    const currentRegion = (selectedNode.params?.region as RegionOptions) || {
      x: 0, y: 0, width: 1, height: 1, type: 'relative' as const,
    };
    const updatedRegion = {
      ...currentRegion,
      [field]: field === 'type' ? value : parseFloat(value as string) || 0,
    };
    handleParamChange('region' as keyof NodeParams, updatedRegion as unknown as NodeParams[keyof NodeParams]);
  };

  const handleAutoROI = async () => {
    const templateId = selectedNode.params?.templateId;
    if (!templateId) {
      alert('먼저 템플릿을 선택해주세요.');
      return;
    }

    const template = templates.find(t => t.id === templateId);
    if (!template) {
      alert('템플릿을 찾을 수 없습니다.');
      return;
    }

    setRoiLoading(true);
    try {
      const response = await axios.get<{
        success: boolean;
        data?: RegionOptions;
        error?: string;
      }>(`${API_BASE}/api/image/templates/${templateId}/recommended-roi`, {
        params: { packageId: template.packageId },
      });

      if (response.data.success && response.data.data) {
        handleParamChange('region' as keyof NodeParams, response.data.data as unknown as NodeParams[keyof NodeParams]);
      } else {
        alert(response.data.error || 'ROI를 계산할 수 없습니다.');
      }
    } catch (err) {
      console.error('ROI 자동 설정 실패:', err);
      alert('ROI 자동 설정에 실패했습니다. 템플릿을 재캡처해주세요.');
    } finally {
      setRoiLoading(false);
    }
  };

  const handleImageTest = async () => {
    const templateId = selectedNode.params?.templateId;
    if (!templateId || !selectedDeviceId) return;

    setIsTesting(true);
    setImageTestResult(null);
    setTestError(null);

    try {
      const response = await axios.post<{ success: boolean; data: ImageTestResult; error?: string }>(
        `${API_BASE}/api/image/test-match`,
        {
          templateId,
          threshold: selectedNode.params?.threshold || 0.9,
          region: selectedNode.params?.region,
          deviceId: selectedDeviceId,
        },
      );

      if (response.data.success) {
        setImageTestResult(response.data.data);
      } else {
        setTestError(response.data.error || '테스트 실패');
      }
    } catch (err) {
      setTestError((err as Error).message || '테스트 오류');
    } finally {
      setIsTesting(false);
    }
  };

  const handleOcrTest = async () => {
    if (!selectedDeviceId) return;

    setIsTesting(true);
    setOcrTestResult(null);
    setTestError(null);

    try {
      const response = await axios.post<{ success: boolean; data: OcrTestResult; error?: string }>(
        `${API_BASE}/api/ocr/test`,
        {
          text: selectedNode.params?.text || undefined,
          matchType: selectedNode.params?.matchType || 'contains',
          caseSensitive: selectedNode.params?.caseSensitive || false,
          deviceId: selectedDeviceId,
        },
      );

      if (response.data.success) {
        setOcrTestResult(response.data.data);
      } else {
        setTestError(response.data.error || '테스트 실패');
      }
    } catch (err) {
      setTestError((err as Error).message || '테스트 오류');
    } finally {
      setIsTesting(false);
    }
  };

  const handleDelete = () => {
    if (window.confirm('이 노드를 삭제하시겠습니까?')) {
      onNodeDelete?.(selectedNode.id);
    }
  };

  // ========== 헬퍼 ==========
  const actionType = selectedNode.params?.actionType || '';
  const selectedTemplate = templates.find(t => t.id === selectedNode.params?.templateId);
  const hasCaptureInfo = selectedTemplate?.captureX !== undefined && selectedTemplate?.sourceWidth !== undefined;

  // ========== 액션 필드 렌더링 ==========
  const renderActionFields = () => {
    // 터치 액션
    if (['tap', 'longPress', 'swipe'].includes(actionType)) {
      return (
        <TouchFields
          selectedNode={selectedNode}
          onParamChange={handleParamChange}
          actionType={actionType}
        />
      );
    }

    // 대기 액션
    if (['wait', 'waitUntilGone', 'waitUntilExists', 'waitUntilTextGone', 'waitUntilTextExists'].includes(actionType)) {
      return (
        <WaitFields
          selectedNode={selectedNode}
          onParamChange={handleParamChange}
          actionType={actionType}
        />
      );
    }

    // 이미지 액션
    if (['tapImage', 'waitUntilImage', 'waitUntilImageGone'].includes(actionType)) {
      return (
        <ImageFields
          selectedNode={selectedNode}
          onParamChange={handleParamChange}
          onRoiToggle={handleRoiToggle}
          onRoiFieldChange={handleRoiFieldChange}
          onRequestRegionSelect={onRequestRegionSelect}
          selectedDeviceId={selectedDeviceId}
          templates={templates}
          onOpenTemplateModal={onOpenTemplateModal}
          onAutoROI={handleAutoROI}
          roiLoading={roiLoading}
          hasCaptureInfo={hasCaptureInfo}
          isTesting={isTesting}
          imageTestResult={imageTestResult}
          testError={testError}
          onImageTest={handleImageTest}
          actionType={actionType}
        />
      );
    }

    // OCR 액션
    if (['tapTextOcr', 'waitUntilTextOcr', 'waitUntilTextGoneOcr', 'assertTextOcr'].includes(actionType)) {
      return (
        <OcrFields
          selectedNode={selectedNode}
          onParamChange={handleParamChange}
          onRoiToggle={handleRoiToggle}
          onRoiFieldChange={handleRoiFieldChange}
          onRequestRegionSelect={onRequestRegionSelect}
          selectedDeviceId={selectedDeviceId}
          isTesting={isTesting}
          ocrTestResult={ocrTestResult}
          testError={testError}
          onOcrTest={handleOcrTest}
          actionType={actionType}
        />
      );
    }

    return null;
  };

  return (
    <aside className="panel">
      <div className="panel-header">
        <h2>속성</h2>
      </div>

      <div className="panel-content">
        {/* 노드 ID */}
        <div className="panel-field">
          <label>노드 ID</label>
          <input type="text" value={selectedNode.id} disabled />
        </div>

        {/* 노드 타입 */}
        <div className="panel-field">
          <label>타입</label>
          <input type="text" value={selectedNode.type} disabled />
        </div>

        {/* 노드 라벨 (설명) */}
        <div className="panel-field">
          <label>설명</label>
          <input
            type="text"
            value={selectedNode.label || ''}
            onChange={(e) => handleLabelChange(e.target.value)}
            placeholder="예: 로그인 버튼 클릭"
          />
          <small>시나리오 흐름을 설명하는 텍스트</small>
        </div>

        {/* ========== 액션 노드 ========== */}
        {selectedNode.type === 'action' && (
          <>
            <div className="panel-field">
              <label>액션 타입</label>
              <select
                value={actionType}
                onChange={(e) => handleParamChange('actionType', e.target.value)}
              >
                <option value="">선택...</option>
                <optgroup label="터치">
                  {ACTION_TYPES.filter(a => a.group === 'touch').map((action) => (
                    <option key={action.value} value={action.value}>
                      {action.label}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="대기">
                  {ACTION_TYPES.filter(a => a.group === 'wait').map((action) => (
                    <option key={action.value} value={action.value}>
                      {action.label}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="이미지">
                  {ACTION_TYPES.filter(a => a.group === 'image').map((action) => (
                    <option key={action.value} value={action.value}>
                      {action.label}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="텍스트 OCR">
                  {ACTION_TYPES.filter(a => a.group === 'text').map((action) => (
                    <option key={action.value} value={action.value}>
                      {action.label}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="시스템">
                  {ACTION_TYPES.filter(a => a.group === 'system').map((action) => (
                    <option key={action.value} value={action.value}>
                      {action.label}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>

            {renderActionFields()}

            {/* 고급 설정 */}
            <details className="panel-advanced">
              <summary>고급 설정</summary>

              <div className="panel-field">
                <label>
                  <input
                    type="checkbox"
                    checked={!!selectedNode.params?.continueOnError}
                    onChange={(e) => handleParamChange('continueOnError' as keyof NodeParams, e.target.checked)}
                  />
                    에러 시 계속 진행
                </label>
                <small>이 액션이 실패해도 다음 노드로 진행합니다.</small>
              </div>

              <div className="panel-field">
                <label>재시도 횟수</label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  value={selectedNode.params?.retryCount ?? 2}
                  onChange={(e) => handleParamChange('retryCount' as keyof NodeParams, parseInt(e.target.value) || 0)}
                />
              </div>

              <div className="panel-field">
                <label>재시도 간격 (ms)</label>
                <input
                  type="number"
                  min="100"
                  value={selectedNode.params?.retryDelay ?? 1000}
                  onChange={(e) => handleParamChange('retryDelay' as keyof NodeParams, parseInt(e.target.value) || 1000)}
                />
              </div>
            </details>
          </>
        )}

        {/* ========== 조건 노드 ========== */}
        {selectedNode.type === 'condition' && (
          <ConditionFields
            selectedNode={selectedNode}
            onParamChange={handleParamChange}
          />
        )}

        {/* ========== 루프 노드 ========== */}
        {selectedNode.type === 'loop' && (
          <LoopFields
            selectedNode={selectedNode}
            onParamChange={handleParamChange}
          />
        )}

        {/* 삭제 버튼 */}
        <div className="panel-actions">
          <button className="btn-delete" onClick={handleDelete}>
            🗑️ 노드 삭제
          </button>
        </div>
      </div>
    </aside>
  );
}

export default Panel;
