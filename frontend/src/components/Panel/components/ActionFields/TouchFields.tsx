// frontend/src/components/Panel/components/ActionFields/TouchFields.tsx

import type { BaseFieldProps } from '../../types';

interface TouchFieldsProps extends BaseFieldProps {
  actionType: string;
}

function TouchFields({ selectedNode, onParamChange, actionType }: TouchFieldsProps) {
  return (
    <>
      {/* 탭/롱프레스: 좌표 입력 */}
      {['tap', 'longPress'].includes(actionType) && (
        <>
          <div className="panel-field-row">
            <div className="panel-field half">
              <label>X 좌표</label>
              <input
                type="number"
                value={selectedNode.params?.x || ''}
                onChange={(e) => onParamChange('x', parseInt(e.target.value) || 0)}
              />
            </div>
            <div className="panel-field half">
              <label>Y 좌표</label>
              <input
                type="number"
                value={selectedNode.params?.y || ''}
                onChange={(e) => onParamChange('y', parseInt(e.target.value) || 0)}
              />
            </div>
          </div>

          <div className="panel-hint">
            💡 디바이스 화면에서 클릭 후 &quot;적용&quot; 버튼
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
            onChange={(e) => onParamChange('duration', parseInt(e.target.value) || 2000)}
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
                onChange={(e) => onParamChange('startX', parseInt(e.target.value) || 0)}
              />
            </div>
            <div className="panel-field half">
              <label>시작 Y</label>
              <input
                type="number"
                value={selectedNode.params?.startY || ''}
                onChange={(e) => onParamChange('startY', parseInt(e.target.value) || 0)}
              />
            </div>
          </div>
          <div className="panel-field-row">
            <div className="panel-field half">
              <label>끝 X</label>
              <input
                type="number"
                value={selectedNode.params?.endX || ''}
                onChange={(e) => onParamChange('endX', parseInt(e.target.value) || 0)}
              />
            </div>
            <div className="panel-field half">
              <label>끝 Y</label>
              <input
                type="number"
                value={selectedNode.params?.endY || ''}
                onChange={(e) => onParamChange('endY', parseInt(e.target.value) || 0)}
              />
            </div>
          </div>
          <div className="panel-field">
            <label>스와이프 시간 (ms)</label>
            <input
              type="number"
              value={selectedNode.params?.duration || 500}
              onChange={(e) => onParamChange('duration', parseInt(e.target.value) || 500)}
            />
          </div>
        </>
      )}
    </>
  );
}

export default TouchFields;
