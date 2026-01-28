// frontend/src/components/SuiteManager/components/SuiteEditor.tsx
// Suite 편집 폼 컴포넌트

import { SuiteEditorProps } from './types';

export default function SuiteEditor({
  selectedSuiteId,
  selectedSuite,
  isEditing,
  editForm,
  scenarios,
  devices,
  onSetIsEditing,
  onEditFormChange,
  onSave,
  onDelete,
  onSelectSuite,
  onOpenScenarioModal,
  onOpenDeviceModal,
  onRemoveScenario,
  onMoveScenario,
  onRemoveDevice,
}: SuiteEditorProps) {
  // 선택된 시나리오 정보 가져오기
  const getScenarioInfo = (scenarioId: string) => {
    return scenarios.find(s => s.id === scenarioId);
  };

  // 선택된 디바이스 정보 가져오기
  const getDeviceInfo = (deviceId: string) => {
    return devices.find(d => d.id === deviceId);
  };

  // 빈 상태
  if (!selectedSuiteId && !isEditing) {
    return (
      <div className="suite-editor-panel">
        <div className="suite-editor-empty">
          <p>📦</p>
          <p>시나리오 묶음을 선택하거나 새로 만드세요</p>
        </div>
      </div>
    );
  }

  return (
    <div className="suite-editor-panel">
      <div className="suite-editor-header">
        <h2>{isEditing ? (selectedSuiteId ? '묶음 수정' : '새 묶음') : selectedSuite?.name}</h2>
        <div className="suite-editor-actions">
          {!isEditing ? (
            <>
              <button className="btn-secondary" onClick={() => onSetIsEditing(true)}>
                수정
              </button>
              <button className="btn-danger" onClick={onDelete}>
                삭제
              </button>
            </>
          ) : (
            <>
              <button className="btn-primary" onClick={onSave}>
                저장
              </button>
              <button
                className="btn-secondary"
                onClick={() => {
                  if (selectedSuiteId) {
                    onSelectSuite(selectedSuiteId);
                  } else {
                    onSetIsEditing(false);
                  }
                }}
              >
                취소
              </button>
            </>
          )}
        </div>
      </div>

      <div className="suite-editor-content">
        <div className="suite-form">
          {/* 기본 정보 */}
          <div className="form-group">
            <label>묶음 이름</label>
            <input
              type="text"
              value={editForm.name}
              onChange={e => onEditFormChange({ ...editForm, name: e.target.value })}
              placeholder="시나리오 묶음 이름을 입력하세요"
              disabled={!isEditing}
            />
          </div>

          <div className="form-group">
            <label>설명</label>
            <textarea
              value={editForm.description}
              onChange={e => onEditFormChange({ ...editForm, description: e.target.value })}
              placeholder="시나리오 묶음에 대한 설명 (선택사항)"
              disabled={!isEditing}
            />
          </div>

          {/* 시나리오/디바이스 2단 레이아웃 */}
          <div className="suite-selection-grid">
            {/* 시나리오 섹션 */}
            <div className="scenarios-section">
              <div className="section-header">
                <h3>
                  📋 시나리오
                  <span className="section-count">{editForm.scenarioIds.length}개</span>
                </h3>
                {isEditing && (
                  <button className="btn-add-item" onClick={onOpenScenarioModal}>
                    + 추가
                  </button>
                )}
              </div>

              <div className="scenario-list">
                {editForm.scenarioIds.length === 0 ? (
                  <div className="scenario-list-empty">
                    선택된 시나리오가 없습니다
                  </div>
                ) : (
                  editForm.scenarioIds.map((scenarioId, index) => {
                    const scenario = getScenarioInfo(scenarioId);
                    return (
                      <div key={scenarioId} className="scenario-item">
                        <span className="scenario-order">{index + 1}</span>
                        <div className="scenario-info">
                          <div className="scenario-name">
                            {scenario?.name || scenarioId}
                          </div>
                          {scenario && (
                            <div className="scenario-path">
                              {scenario.packageName} / {scenario.categoryName}
                            </div>
                          )}
                        </div>
                        {isEditing && (
                          <div className="scenario-actions">
                            <button
                              className="btn-move-item"
                              onClick={() => onMoveScenario(index, 'up')}
                              disabled={index === 0}
                              title="위로 이동"
                            >
                              ▲
                            </button>
                            <button
                              className="btn-move-item"
                              onClick={() => onMoveScenario(index, 'down')}
                              disabled={index === editForm.scenarioIds.length - 1}
                              title="아래로 이동"
                            >
                              ▼
                            </button>
                            <button
                              className="btn-remove-item"
                              onClick={() => onRemoveScenario(scenarioId)}
                              title="제거"
                            >
                              ×
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* 디바이스 섹션 */}
            <div className="devices-section">
              <div className="section-header">
                <h3>
                  📱 디바이스
                  <span className="section-count">{editForm.deviceIds.length}개</span>
                </h3>
                {isEditing && (
                  <button className="btn-add-item" onClick={onOpenDeviceModal}>
                    + 추가
                  </button>
                )}
              </div>

              <div className="device-list device-list-vertical">
                {editForm.deviceIds.length === 0 ? (
                  <div className="device-list-empty">
                    선택된 디바이스가 없습니다
                  </div>
                ) : (
                  editForm.deviceIds.map(deviceId => {
                    const device = getDeviceInfo(deviceId);
                    return (
                      <div key={deviceId} className="device-item">
                        <span className="device-icon">📱</span>
                        <span className="device-name">
                          {device?.alias || device?.model || deviceId}
                        </span>
                        <span className={`device-status ${device?.status === 'connected' ? 'online' : 'offline'}`}>
                          {device?.status === 'connected' ? '연결됨' : '오프라인'}
                        </span>
                        {isEditing && (
                          <button
                            className="btn-remove-item"
                            onClick={() => onRemoveDevice(deviceId)}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
