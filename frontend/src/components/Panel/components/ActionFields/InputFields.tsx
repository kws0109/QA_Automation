// frontend/src/components/Panel/components/ActionFields/InputFields.tsx

import type { BaseFieldProps } from '../../types';

interface InputFieldsProps extends BaseFieldProps {
  actionType: string;
}

function InputFields({ selectedNode, onParamChange, actionType }: InputFieldsProps) {
  return (
    <>
      {/* 텍스트 입력 */}
      {actionType === 'inputText' && (
        <>
          <div className="panel-field">
            <label>입력할 텍스트</label>
            <input
              type="text"
              value={selectedNode.params?.text || ''}
              onChange={(e) => onParamChange('text', e.target.value)}
              placeholder="입력할 텍스트를 입력하세요"
            />
          </div>
          <div className="panel-field checkbox-field">
            <label>
              <input
                type="checkbox"
                checked={selectedNode.params?.clearFirst || false}
                onChange={(e) => onParamChange('clearFirst', e.target.checked)}
              />
              기존 텍스트 삭제 후 입력
            </label>
            <small>EditText에 기존 텍스트가 있으면 먼저 삭제합니다</small>
          </div>
          <div className="panel-field checkbox-field">
            <label>
              <input
                type="checkbox"
                checked={selectedNode.params?.useAdb || false}
                onChange={(e) => onParamChange('useAdb', e.target.checked)}
              />
              ADB 직접 입력 (키보드 언어 무관)
            </label>
            <small>키보드 영/한 설정과 무관하게 텍스트 입력</small>
          </div>
        </>
      )}

      {/* 랜덤 텍스트 입력 */}
      {actionType === 'typeRandomText' && (
        <>
          <div className="panel-field">
            <label>접두사 (선택)</label>
            <input
              type="text"
              value={selectedNode.params?.prefix || ''}
              onChange={(e) => onParamChange('prefix', e.target.value)}
              placeholder="예: Player_"
            />
            <small>랜덤 문자열 앞에 붙는 텍스트</small>
          </div>

          <div className="panel-field">
            <label>접미사 (선택)</label>
            <input
              type="text"
              value={selectedNode.params?.suffix || ''}
              onChange={(e) => onParamChange('suffix', e.target.value)}
              placeholder="예: _KR"
            />
            <small>랜덤 문자열 뒤에 붙는 텍스트</small>
          </div>

          <div className="panel-field-row">
            <div className="panel-field half">
              <label>랜덤 길이</label>
              <input
                type="number"
                min={1}
                max={20}
                value={selectedNode.params?.randomLength || 6}
                onChange={(e) => onParamChange('randomLength', parseInt(e.target.value) || 6)}
              />
            </div>
            <div className="panel-field half">
              <label>문자셋</label>
              <select
                value={selectedNode.params?.charset || 'alphanumeric'}
                onChange={(e) => onParamChange('charset', e.target.value)}
              >
                <option value="alphanumeric">영문+숫자</option>
                <option value="alpha">영문만</option>
                <option value="numeric">숫자만</option>
              </select>
            </div>
          </div>

          <div className="panel-hint">
            💡 예시 결과: {selectedNode.params?.prefix || ''}<span style={{ color: '#60a5fa' }}>{'x'.repeat(selectedNode.params?.randomLength || 6)}</span>{selectedNode.params?.suffix || ''}
          </div>

          <div className="panel-field checkbox-field">
            <label>
              <input
                type="checkbox"
                checked={selectedNode.params?.clearFirst || false}
                onChange={(e) => onParamChange('clearFirst', e.target.checked)}
              />
              기존 텍스트 삭제 후 입력
            </label>
            <small>EditText에 기존 텍스트가 있으면 먼저 삭제합니다</small>
          </div>
          <div className="panel-field checkbox-field">
            <label>
              <input
                type="checkbox"
                checked={selectedNode.params?.useAdb || false}
                onChange={(e) => onParamChange('useAdb', e.target.checked)}
              />
              ADB 직접 입력 (키보드 언어 무관)
            </label>
            <small>키보드 영/한 설정과 무관하게 텍스트 입력</small>
          </div>
        </>
      )}
    </>
  );
}

export default InputFields;
