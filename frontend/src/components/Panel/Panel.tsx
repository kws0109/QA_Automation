// frontend/src/components/Panel/Panel.tsx

import { useState } from 'react';
import axios from 'axios';
import type { FlowNode, NodeParams, ImageTemplate } from '../../types';
import './Panel.css';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:3001';

// ROI 타입 정의
interface RegionOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'absolute' | 'relative';
}

// ========== 상수 타입 정의 ==========
interface ActionTypeItem {
  value: string;
  label: string;
  group: 'touch' | 'wait' | 'image' | 'system';
}

interface SelectOption {
  value: string;
  label: string;
}

const ACTION_TYPES: ActionTypeItem[] = [
  // 터치
  { value: 'tap', label: '탭', group: 'touch' },
  { value: 'longPress', label: '롱프레스', group: 'touch' },
  { value: 'swipe', label: '스와이프', group: 'touch' },
  // 대기
  { value: 'wait', label: '대기 (ms)', group: 'wait' },
  { value: 'waitUntilGone', label: '요소 사라짐 대기', group: 'wait' },
  { value: 'waitUntilExists', label: '요소 나타남 대기', group: 'wait' },
  { value: 'waitUntilTextGone', label: '텍스트 사라짐 대기', group: 'wait' },
  { value: 'waitUntilTextExists', label: '텍스트 나타남 대기', group: 'wait' },
  // 이미지
  { value: 'tapImage', label: '이미지 탭', group: 'image' },
  { value: 'waitUntilImage', label: '이미지 나타남 대기', group: 'image' },
  { value: 'waitUntilImageGone', label: '이미지 사라짐 대기', group: 'image' },
  // 시스템
  { value: 'launchApp', label: '앱 실행', group: 'system' },
  { value: 'terminateApp', label: '앱 종료', group: 'system' },
  { value: 'back', label: '뒤로가기', group: 'system' },
  { value: 'home', label: '홈', group: 'system' },
  { value: 'restart', label: '앱 재시작', group: 'system' },
  { value: 'clearData', label: '앱 데이터 삭제', group: 'system' },
  { value: 'clearCache', label: '앱 캐시 삭제', group: 'system' },
];

const CONDITION_TYPES: SelectOption[] = [
  { value: 'elementExists', label: '요소 존재함' },
  { value: 'elementNotExists', label: '요소 존재하지 않음' },
  { value: 'textContains', label: '요소 텍스트 포함' },
  { value: 'screenContainsText', label: '화면에 텍스트 존재' },
  { value: 'elementEnabled', label: '요소 활성화됨' },
  { value: 'elementDisplayed', label: '요소 표시됨' },
];

const LOOP_TYPES: SelectOption[] = [
  { value: 'count', label: '횟수 반복' },
  { value: 'whileExists', label: '요소 존재하는 동안' },
  { value: 'whileNotExists', label: '요소 없는 동안' },
];

const SELECTOR_STRATEGIES: SelectOption[] = [
  { value: 'id', label: 'Resource ID' },
  { value: 'text', label: '텍스트' },
  { value: 'xpath', label: 'XPath' },
  { value: 'accessibility id', label: 'Accessibility ID' },
  { value: 'className', label: 'Class Name' },
];

// ========== Props 정의 ==========
interface PanelProps {
  selectedNode: FlowNode | undefined;
  onNodeUpdate?: (nodeId: string, updates: Partial<FlowNode>) => void;
  onNodeDelete?: (nodeId: string) => void;
  templates?: ImageTemplate[];
  onOpenTemplateModal?: () => void;
}

function Panel({ selectedNode, onNodeUpdate, onNodeDelete, templates = [], onOpenTemplateModal }: PanelProps) {
  const [roiLoading, setRoiLoading] = useState(false);

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

  // ROI 활성화/비활성화
  const handleRoiToggle = (enabled: boolean) => {
    if (enabled) {
      // ROI 활성화 시 기본값 설정
      handleParamChange('region' as keyof NodeParams, {
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        type: 'relative',
      } as unknown as NodeParams[keyof NodeParams]);
    } else {
      // ROI 비활성화 시 제거
      const updatedParams = { ...selectedNode.params };
      delete updatedParams.region;
      onNodeUpdate?.(selectedNode.id, { params: updatedParams });
    }
  };

  // ROI 필드 변경
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

  // 자동 ROI 설정 (API 호출)
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
        hasCaptureInfo?: boolean;
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

  // 선택된 템플릿이 캡처 좌표 정보를 가지고 있는지 확인
  const selectedTemplate = templates.find(t => t.id === selectedNode.params?.templateId);
  const hasCaptureInfo = selectedTemplate?.captureX !== undefined && selectedTemplate?.sourceWidth !== undefined;

  const handleDelete = () => {
    if (window.confirm('이 노드를 삭제하시겠습니까?')) {
      onNodeDelete?.(selectedNode.id);
    }
  };

  const actionType = selectedNode.params?.actionType || '';
  const conditionType = selectedNode.params?.conditionType || '';
  const loopType = selectedNode.params?.loopType || 'count';

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
                <optgroup label="시스템">
                  {ACTION_TYPES.filter(a => a.group === 'system').map((action) => (
                    <option key={action.value} value={action.value}>
                      {action.label}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>

            {/* 탭/롱프레스: 좌표 입력 */}
            {['tap', 'longPress'].includes(actionType) && (
              <>
                <div className="panel-field-row">
                  <div className="panel-field half">
                    <label>X 좌표</label>
                    <input 
                      type="number" 
                      value={selectedNode.params?.x || ''}
                      onChange={(e) => handleParamChange('x', parseInt(e.target.value) || 0)}
                    />
                  </div>
                  <div className="panel-field half">
                    <label>Y 좌표</label>
                    <input 
                      type="number" 
                      value={selectedNode.params?.y || ''}
                      onChange={(e) => handleParamChange('y', parseInt(e.target.value) || 0)}
                    />
                  </div>
                </div>
                
                <div className="panel-hint">
                  💡 디바이스 화면에서 클릭 후 "적용" 버튼
                </div>
              </>
            )}

            {/* 롱프레스: 시간 추가 */}
            {actionType === 'longPress' && (
              <div className="panel-field">
                <label>누르는 시간 (ms)</label>
                <input 
                  type="number" 
                  value={selectedNode.params?.duration || 2000}
                  onChange={(e) => handleParamChange('duration', parseInt(e.target.value) || 2000)}
                />
              </div>
            )}

            {/* 스와이프: 시작/끝 좌표 */}
            {actionType === 'swipe' && (
              <>
                <div className="panel-field-row">
                  <div className="panel-field half">
                    <label>시작 X</label>
                    <input 
                      type="number" 
                      value={selectedNode.params?.startX || ''}
                      onChange={(e) => handleParamChange('startX', parseInt(e.target.value) || 0)}
                    />
                  </div>
                  <div className="panel-field half">
                    <label>시작 Y</label>
                    <input 
                      type="number" 
                      value={selectedNode.params?.startY || ''}
                      onChange={(e) => handleParamChange('startY', parseInt(e.target.value) || 0)}
                    />
                  </div>
                </div>
                <div className="panel-field-row">
                  <div className="panel-field half">
                    <label>끝 X</label>
                    <input 
                      type="number" 
                      value={selectedNode.params?.endX || ''}
                      onChange={(e) => handleParamChange('endX', parseInt(e.target.value) || 0)}
                    />
                  </div>
                  <div className="panel-field half">
                    <label>끝 Y</label>
                    <input 
                      type="number" 
                      value={selectedNode.params?.endY || ''}
                      onChange={(e) => handleParamChange('endY', parseInt(e.target.value) || 0)}
                    />
                  </div>
                </div>
                <div className="panel-field">
                  <label>스와이프 시간 (ms)</label>
                  <input 
                    type="number" 
                    value={selectedNode.params?.duration || 500}
                    onChange={(e) => handleParamChange('duration', parseInt(e.target.value) || 500)}
                  />
                </div>
              </>
            )}

            {/* 대기: 시간 입력 */}
            {actionType === 'wait' && (
              <div className="panel-field">
                <label>대기 시간 (ms)</label>
                <input 
                  type="number" 
                  value={selectedNode.params?.duration || 1000}
                  onChange={(e) => handleParamChange('duration', parseInt(e.target.value) || 1000)}
                />
              </div>
            )}

            {/* 요소 대기 (waitUntilGone, waitUntilExists) */}
            {['waitUntilGone', 'waitUntilExists'].includes(actionType) && (
              <>
                <div className="panel-field">
                  <label>선택자 전략</label>
                  <select
                    value={selectedNode.params?.selectorType || 'id'}
                    onChange={(e) => handleParamChange('selectorType', e.target.value)}
                  >
                    {SELECTOR_STRATEGIES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="panel-field">
                  <label>선택자</label>
                  <input 
                    type="text" 
                    value={selectedNode.params?.selector || ''}
                    onChange={(e) => handleParamChange('selector', e.target.value)}
                    placeholder="예: com.app:id/loading"
                  />
                </div>

                <div className="panel-field">
                  <label>타임아웃 (ms)</label>
                  <input 
                    type="number" 
                    value={selectedNode.params?.timeout || 30000}
                    onChange={(e) => handleParamChange('timeout', parseInt(e.target.value) || 30000)}
                  />
                </div>

                <div className="panel-hint">
                  💡 {actionType === 'waitUntilGone' 
                    ? '로딩 스피너가 사라질 때까지 대기' 
                    : '특정 요소가 나타날 때까지 대기'}
                </div>
              </>
            )}

            {/* 텍스트 대기 (waitUntilTextGone, waitUntilTextExists) */}
            {['waitUntilTextGone', 'waitUntilTextExists'].includes(actionType) && (
              <>
                <div className="panel-field">
                  <label>텍스트</label>
                  <input 
                    type="text" 
                    value={selectedNode.params?.text || ''}
                    onChange={(e) => handleParamChange('text', e.target.value)}
                    placeholder="예: 로딩중..."
                  />
                </div>

                <div className="panel-field">
                  <label>타임아웃 (ms)</label>
                  <input 
                    type="number" 
                    value={selectedNode.params?.timeout || 30000}
                    onChange={(e) => handleParamChange('timeout', parseInt(e.target.value) || 30000)}
                  />
                </div>

                <div className="panel-hint">
                  💡 {actionType === 'waitUntilTextGone' 
                    ? '"로딩중" 등의 텍스트가 사라질 때까지 대기' 
                    : '"완료" 등의 텍스트가 나타날 때까지 대기'}
                </div>
              </>
            )}

            {/* 이미지 액션 (tapImage, waitUntilImage, waitUntilImageGone) */}
            {['tapImage', 'waitUntilImage', 'waitUntilImageGone'].includes(actionType) && (
              <>
                <div className="panel-field">
                  <label>템플릿 이미지</label>
                  <div className="template-select-row">
                    <select
                      value={selectedNode.params?.templateId || ''}
                      onChange={(e) => handleParamChange('templateId', e.target.value)}
                    >
                      <option value="">선택...</option>
                      {templates.map((tpl) => (
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
                    onChange={(e) => handleParamChange('threshold', parseFloat(e.target.value) || 0.9)}
                  />
                  <small>0.5 ~ 1.0 (기본: 0.9)</small>
                </div>

                {['waitUntilImage', 'waitUntilImageGone'].includes(actionType) && (
                  <>
                    <div className="panel-field">
                      <label>타임아웃 (ms)</label>
                      <input
                        type="number"
                        value={selectedNode.params?.timeout || 30000}
                        onChange={(e) => handleParamChange('timeout', parseInt(e.target.value) || 30000)}
                      />
                    </div>

                    <div className="panel-field">
                      <label>체크 간격 (ms)</label>
                      <input
                        type="number"
                        value={selectedNode.params?.interval || 1000}
                        onChange={(e) => handleParamChange('interval', parseInt(e.target.value) || 1000)}
                      />
                    </div>
                  </>
                )}

                {/* ROI 설정 */}
                <div className="panel-field">
                  <div className="roi-checkbox-row">
                    <input
                      type="checkbox"
                      id="roi-toggle"
                      checked={!!selectedNode.params?.region}
                      onChange={(e) => handleRoiToggle(e.target.checked)}
                    />
                    <label htmlFor="roi-toggle">검색 영역 제한 (ROI)</label>
                  </div>
                  <small>특정 영역에서만 이미지를 검색하여 속도와 정확도 향상</small>
                </div>

                {selectedNode.params?.region && (
                  <div className="roi-settings">
                    <div className="roi-header">
                      <span>ROI 좌표 (0~1)</span>
                      <button
                        type="button"
                        className="btn-small btn-auto-roi"
                        onClick={handleAutoROI}
                        disabled={roiLoading || !selectedNode.params?.templateId}
                        title={!hasCaptureInfo ? '템플릿에 캡처 좌표 정보가 없습니다. 재캡처가 필요합니다.' : '템플릿 캡처 위치 기반으로 ROI 자동 설정'}
                      >
                        {roiLoading ? '...' : '자동'}
                      </button>
                    </div>
                    {!hasCaptureInfo && selectedNode.params?.templateId && (
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
                          value={(selectedNode.params.region as RegionOptions).x || 0}
                          onChange={(e) => handleRoiFieldChange('x', e.target.value)}
                        />
                      </div>
                      <div className="roi-field">
                        <label>Y</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="1"
                          value={(selectedNode.params.region as RegionOptions).y || 0}
                          onChange={(e) => handleRoiFieldChange('y', e.target.value)}
                        />
                      </div>
                      <div className="roi-field">
                        <label>W</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="1"
                          value={(selectedNode.params.region as RegionOptions).width || 1}
                          onChange={(e) => handleRoiFieldChange('width', e.target.value)}
                        />
                      </div>
                      <div className="roi-field">
                        <label>H</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="1"
                          value={(selectedNode.params.region as RegionOptions).height || 1}
                          onChange={(e) => handleRoiFieldChange('height', e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div className="panel-hint">
                  💡 {actionType === 'tapImage'
                    ? '화면에서 이미지를 찾아 탭합니다'
                    : actionType === 'waitUntilImage'
                    ? '이미지가 나타날 때까지 대기합니다'
                    : '이미지가 사라질 때까지 대기합니다'}
                </div>
              </>
            )}

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
          <>
            <div className="panel-field">
              <label>조건 타입</label>
              <select 
                value={conditionType}
                onChange={(e) => handleParamChange('conditionType', e.target.value)}
              >
                <option value="">선택...</option>
                {CONDITION_TYPES.map((cond) => (
                  <option key={cond.value} value={cond.value}>
                    {cond.label}
                  </option>
                ))}
              </select>
            </div>

            {/* 요소 기반 조건: selector 입력 */}
            {['elementExists', 'elementNotExists', 'textContains', 'elementEnabled', 'elementDisplayed'].includes(conditionType) && (
              <>
                <div className="panel-field">
                  <label>선택자 전략</label>
                  <select
                    value={selectedNode.params?.selectorType || 'id'}
                    onChange={(e) => handleParamChange('selectorType', e.target.value)}
                  >
                    {SELECTOR_STRATEGIES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="panel-field">
                  <label>선택자</label>
                  <input 
                    type="text" 
                    value={selectedNode.params?.selector || ''}
                    onChange={(e) => handleParamChange('selector', e.target.value)}
                    placeholder="예: com.app:id/button"
                  />
                </div>
              </>
            )}

            {/* 텍스트 포함 조건: 텍스트 입력 */}
            {['textContains', 'screenContainsText'].includes(conditionType) && (
              <div className="panel-field">
                <label>검색할 텍스트</label>
                <input 
                  type="text" 
                  value={selectedNode.params?.text || ''}
                  onChange={(e) => handleParamChange('text', e.target.value)}
                  placeholder="예: 로그인"
                />
              </div>
            )}

            {/* 타임아웃 */}
            <div className="panel-field">
              <label>타임아웃 (ms)</label>
              <input 
                type="number" 
                value={selectedNode.params?.timeout || 3000}
                onChange={(e) => handleParamChange('timeout', parseInt(e.target.value) || 3000)}
              />
            </div>

            {/* 분기 안내 */}
            <div className="panel-info">
              <p>💡 조건이 참이면 <strong>Y</strong> 연결로,</p>
              <p>거짓이면 <strong>N</strong> 연결로 진행</p>
            </div>
          </>
        )}

        {/* ========== 루프 노드 ========== */}
        {selectedNode.type === 'loop' && (
          <>
            <div className="panel-field">
              <label>루프 타입</label>
              <select 
                value={loopType}
                onChange={(e) => handleParamChange('loopType', e.target.value)}
              >
                {LOOP_TYPES.map((loop) => (
                  <option key={loop.value} value={loop.value}>
                    {loop.label}
                  </option>
                ))}
              </select>
            </div>

            {/* 횟수 반복 */}
            {loopType === 'count' && (
              <div className="panel-field">
                <label>반복 횟수</label>
                <input 
                  type="number" 
                  value={selectedNode.params?.loopCount || 3}
                  onChange={(e) => handleParamChange('loopCount', parseInt(e.target.value) || 1)}
                  min="1"
                />
              </div>
            )}

            {/* 조건 반복 */}
            {['whileExists', 'whileNotExists'].includes(loopType) && (
              <>
                <div className="panel-field">
                  <label>선택자 전략</label>
                  <select
                    value={selectedNode.params?.selectorType || 'id'}
                    onChange={(e) => handleParamChange('selectorType', e.target.value)}
                  >
                    {SELECTOR_STRATEGIES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="panel-field">
                  <label>선택자</label>
                  <input 
                    type="text" 
                    value={selectedNode.params?.selector || ''}
                    onChange={(e) => handleParamChange('selector', e.target.value)}
                    placeholder="예: com.app:id/loading"
                  />
                </div>

                <div className="panel-field">
                  <label>타임아웃 (ms)</label>
                  <input 
                    type="number" 
                    value={selectedNode.params?.timeout || 3000}
                    onChange={(e) => handleParamChange('timeout', parseInt(e.target.value) || 3000)}
                  />
                </div>
              </>
            )}

            {/* 분기 안내 */}
            <div className="panel-info">
              <p>💡 반복 조건이 참이면 <strong>↻</strong> 연결로,</p>
              <p>거짓이면 <strong>→</strong> 연결로 진행</p>
            </div>
          </>
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