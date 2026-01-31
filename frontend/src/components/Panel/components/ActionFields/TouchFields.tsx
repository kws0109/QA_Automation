// frontend/src/components/Panel/components/ActionFields/TouchFields.tsx

import type { BaseFieldProps } from '../../types';

interface TouchFieldsProps extends BaseFieldProps {
  actionType: string;
  swipeSelectMode?: boolean;
  onSwipeSelectModeChange?: (active: boolean) => void;
}

function TouchFields({ selectedNode, onParamChange, actionType, swipeSelectMode, onSwipeSelectModeChange }: TouchFieldsProps) {
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

          {/* 퍼센트 좌표 표시 (디바이스에서 선택한 경우) */}
          {selectedNode.params?.xPercent != null && selectedNode.params?.yPercent != null && (
            <div className="panel-hint coord-percent-hint">
              📍 비율: ({(selectedNode.params.xPercent * 100).toFixed(1)}%, {(selectedNode.params.yPercent * 100).toFixed(1)}%)
            </div>
          )}

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

          {/* 비율 표시 (저장된 경우) */}
          {selectedNode.params?.startXPercent != null && (
            <div className="panel-hint swipe-percent-hint">
              비율: ({selectedNode.params.startXPercent?.toFixed(1)}%, {selectedNode.params.startYPercent?.toFixed(1)}%) →
              ({selectedNode.params.endXPercent?.toFixed(1)}%, {selectedNode.params.endYPercent?.toFixed(1)}%)
            </div>
          )}

          {/* 화면에서 선택 버튼 */}
          <div className="panel-field">
            <button
              type="button"
              className={`btn-swipe-select ${swipeSelectMode ? 'active' : ''}`}
              onClick={() => onSwipeSelectModeChange?.(!swipeSelectMode)}
            >
              {swipeSelectMode ? '🖱️ 선택 모드 해제' : '🖱️ 화면에서 드래그로 선택'}
            </button>
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
