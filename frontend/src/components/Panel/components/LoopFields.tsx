// frontend/src/components/Panel/components/LoopFields.tsx

import type { BaseFieldProps } from '../types';
import { LOOP_TYPES, SELECTOR_STRATEGIES } from '../constants';

function LoopFields({ selectedNode, onParamChange }: BaseFieldProps) {
  const loopType = selectedNode.params?.loopType || 'count';

  return (
    <>
      <div className="panel-field">
        <label>루프 타입</label>
        <select
          value={loopType}
          onChange={(e) => onParamChange('loopType', e.target.value)}
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
            onChange={(e) => onParamChange('loopCount', parseInt(e.target.value) || 1)}
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
              placeholder="예: com.app:id/loading"
            />
          </div>

          <div className="panel-field">
            <label>타임아웃 (ms)</label>
            <input
              type="number"
              value={selectedNode.params?.timeout || 3000}
              onChange={(e) => onParamChange('timeout', parseInt(e.target.value) || 3000)}
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
  );
}

export default LoopFields;
