// frontend/src/components/Panel/Panel.tsx

import type { FlowNode, NodeParams } from '../../types';
import './Panel.css';

// ========== 상수 타입 정의 ==========
interface ActionTypeItem {
  value: string;
  label: string;
  group: 'touch' | 'wait' | 'system';
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
  // 시스템
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
  isConnected?: boolean;
}

function Panel({ selectedNode, onNodeUpdate, onNodeDelete }: PanelProps) {
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