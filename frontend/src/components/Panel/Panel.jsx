// frontend/src/components/Panel/Panel.jsx

import { useState } from 'react';
import ScreenCapture from '../ScreenCapture/ScreenCapture';
import './Panel.css';

const ACTION_TYPES = [
  { value: 'tap', label: '탭' },
  { value: 'longPress', label: '롱프레스' },
  { value: 'wait', label: '대기' },
  { value: 'back', label: '뒤로 가기' },
  { value: 'home', label: '홈' },
  { value: 'restart', label: '앱 재시작' },
  { value: 'clearData', label: '데이터 삭제' },
  { value: 'clearCache', label: '캐시 삭제' },
];

function Panel({ selectedNode, onNodeUpdate, onNodeDelete, isConnected }) {
  const [isScreenCaptureOpen, setIsScreenCaptureOpen] = useState(false);

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

  const handleParamChange = (key, value) => {
    const updatedParams = {
      ...selectedNode.params,
      [key]: value,
    };
    onNodeUpdate && onNodeUpdate(selectedNode.id, { params: updatedParams });
  };

  const handleDelete = () => {
    if (window.confirm('이 노드를 삭제하시겠습니까?')) {
      onNodeDelete && onNodeDelete(selectedNode.id);
    }
  };

  // 좌표 선택 완료 - 한 번에 업데이트
  const handleCoordinateSelect = (x, y) => {
    const updatedParams = {
      ...selectedNode.params,
      x,
      y,
    };
    onNodeUpdate && onNodeUpdate(selectedNode.id, { params: updatedParams });
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

        {/* 액션 노드인 경우 추가 설정 */}
        {selectedNode.type === 'action' && (
          <>
            <div className="panel-field">
              <label>액션 타입</label>
              <select 
                value={selectedNode.params?.actionType || ''}
                onChange={(e) => handleParamChange('actionType', e.target.value)}
              >
                <option value="">선택...</option>
                {ACTION_TYPES.map((action) => (
                  <option key={action.value} value={action.value}>
                    {action.label}
                  </option>
                ))}
              </select>
            </div>

            {/* 탭/롱프레스: 좌표 입력 */}
            {['tap', 'longPress'].includes(selectedNode.params?.actionType) && (
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
                
                {/* 좌표 선택 버튼 */}
                <button 
                  className="btn-pick-coordinate"
                  onClick={() => setIsScreenCaptureOpen(true)}
                  disabled={!isConnected}
                >
                  📱 화면에서 좌표 선택
                </button>
              </>
            )}

            {/* 롱프레스/대기: 시간 입력 */}
            {['longPress', 'wait'].includes(selectedNode.params?.actionType) && (
              <div className="panel-field">
                <label>시간 (ms)</label>
                <input 
                  type="number" 
                  value={selectedNode.params?.duration || 1000}
                  onChange={(e) => handleParamChange('duration', parseInt(e.target.value) || 1000)}
                />
              </div>
            )}
          </>
        )}

        {/* 삭제 버튼 */}
        <div className="panel-actions">
          <button className="btn-delete" onClick={handleDelete}>
            🗑️ 노드 삭제
          </button>
        </div>
      </div>

      {/* 스크린 캡처 모달 */}
      <ScreenCapture
        isOpen={isScreenCaptureOpen}
        onClose={() => setIsScreenCaptureOpen(false)}
        onSelectCoordinate={handleCoordinateSelect}
      />
    </aside>
  );
}

export default Panel;