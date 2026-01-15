// frontend/src/components/Panel/components/ConditionFields.tsx

import type { BaseFieldProps } from '../types';
import { CONDITION_TYPES, SELECTOR_STRATEGIES } from '../constants';

function ConditionFields({ selectedNode, onParamChange }: BaseFieldProps) {
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
