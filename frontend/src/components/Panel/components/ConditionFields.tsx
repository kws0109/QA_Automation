// frontend/src/components/Panel/components/ConditionFields.tsx

import type { BaseFieldProps } from '../types';
import { CONDITION_TYPES, SELECTOR_STRATEGIES } from '../constants';

// OCR 매칭 타입 옵션
const OCR_MATCH_TYPES = [
  { value: 'contains', label: '포함' },
  { value: 'exact', label: '정확히 일치' },
  { value: 'regex', label: '정규식' },
];

interface ConditionFieldsProps extends BaseFieldProps {
  onOpenTemplateModal?: () => void;
}

function ConditionFields({ selectedNode, onParamChange, onOpenTemplateModal }: ConditionFieldsProps) {
  const conditionType = selectedNode.params?.conditionType || '';

  return (
    <>
      <div className="panel-field">
        <label>조건 타입</label>
        <select
          value={conditionType}
          onChange={(e) => onParamChange('conditionType', e.target.value)}
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
              onChange={(e) => onParamChange('selectorType', e.target.value)}
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
              onChange={(e) => onParamChange('selector', e.target.value)}
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
            onChange={(e) => onParamChange('text', e.target.value)}
            placeholder="예: 로그인"
          />
        </div>
      )}

      {/* 이미지 기반 조건: 템플릿 선택 */}
      {['imageExists', 'imageNotExists'].includes(conditionType) && (
        <>
          <div className="panel-field">
            <label>이미지 템플릿</label>
            <div className="template-select-row">
              <input
                type="text"
                value={selectedNode.params?.templateName || selectedNode.params?.templateId || ''}
                readOnly
                placeholder="템플릿을 선택하세요"
              />
              <button
                type="button"
                className="btn-select-template"
                onClick={onOpenTemplateModal}
              >
                선택
              </button>
            </div>
            {!selectedNode.params?.templateId && (
              <span className="field-warning">⚠️ 템플릿을 선택해주세요</span>
            )}
          </div>

          <div className="panel-field">
            <label>매칭 임계값 (%)</label>
            <input
              type="number"
              min="0"
              max="100"
              value={Math.round((selectedNode.params?.threshold || 0.8) * 100)}
              onChange={(e) => onParamChange('threshold', (parseInt(e.target.value) || 80) / 100)}
            />
          </div>
        </>
      )}

      {/* OCR 텍스트 기반 조건: 텍스트 및 매칭 옵션 */}
      {['ocrTextExists', 'ocrTextNotExists'].includes(conditionType) && (
        <>
          <div className="panel-field">
            <label>검색할 텍스트</label>
            <input
              type="text"
              value={selectedNode.params?.text || ''}
              onChange={(e) => onParamChange('text', e.target.value)}
              placeholder="예: 로그인"
            />
            {!selectedNode.params?.text?.trim() && (
              <span className="field-warning">⚠️ 검색할 텍스트를 입력해주세요</span>
            )}
          </div>

          <div className="panel-field">
            <label>매칭 타입</label>
            <select
              value={selectedNode.params?.matchType || 'contains'}
              onChange={(e) => onParamChange('matchType', e.target.value)}
            >
              {OCR_MATCH_TYPES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <div className="panel-field checkbox-field">
            <label>
              <input
                type="checkbox"
                checked={selectedNode.params?.caseSensitive || false}
                onChange={(e) => onParamChange('caseSensitive', e.target.checked)}
              />
              대소문자 구분
            </label>
          </div>
        </>
      )}

      {/* 타임아웃 */}
      <div className="panel-field">
        <label>타임아웃 (ms)</label>
        <input
          type="number"
          value={selectedNode.params?.timeout || 3000}
          onChange={(e) => onParamChange('timeout', parseInt(e.target.value) || 3000)}
        />
      </div>

      {/* 분기 안내 */}
      <div className="panel-info">
        <p>💡 조건이 참이면 <strong>Y</strong> 연결로,</p>
        <p>거짓이면 <strong>N</strong> 연결로 진행</p>
      </div>
    </>
  );
}

export default ConditionFields;
