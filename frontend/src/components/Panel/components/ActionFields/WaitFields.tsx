// frontend/src/components/Panel/components/ActionFields/WaitFields.tsx

import type { BaseFieldProps } from '../../types';
import { SELECTOR_STRATEGIES } from '../../constants';

interface WaitFieldsProps extends BaseFieldProps {
  actionType: string;
}

function WaitFields({ selectedNode, onParamChange, actionType }: WaitFieldsProps) {
  return (
    <>
      {/* 대기: 시간 입력 */}
      {actionType === 'wait' && (
        <div className="panel-field">
          <label>대기 시간 (ms)</label>
          <input
            type="number"
            value={selectedNode.params?.duration || 1000}
            onChange={(e) => onParamChange('duration', parseInt(e.target.value) || 1000)}
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
              value={selectedNode.params?.timeout || 30000}
              onChange={(e) => onParamChange('timeout', parseInt(e.target.value) || 30000)}
            />
          </div>

          {/* 대기 후 탭 옵션 (waitUntilExists만 해당) */}
          {actionType === 'waitUntilExists' && (
            <div className="panel-field checkbox-field">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={selectedNode.params?.tapAfterWait || false}
                  onChange={(e) => onParamChange('tapAfterWait', e.target.checked)}
                />
                <span>대기 후 탭</span>
              </label>
              <div className="panel-hint-small">요소가 나타나면 자동으로 탭합니다</div>
            </div>
          )}

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
              onChange={(e) => onParamChange('text', e.target.value)}
              placeholder="예: 로딩중..."
            />
          </div>

          <div className="panel-field">
            <label>타임아웃 (ms)</label>
            <input
              type="number"
              value={selectedNode.params?.timeout || 30000}
              onChange={(e) => onParamChange('timeout', parseInt(e.target.value) || 30000)}
            />
          </div>

          {/* 대기 후 탭 옵션 (waitUntilTextExists만 해당) */}
          {actionType === 'waitUntilTextExists' && (
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

          <div className="panel-hint">
            💡 {actionType === 'waitUntilTextGone'
              ? '"로딩중" 등의 텍스트가 사라질 때까지 대기'
              : '"완료" 등의 텍스트가 나타날 때까지 대기'}
          </div>
        </>
      )}
    </>
  );
}

export default WaitFields;
