// frontend/src/components/SuiteManager/components/DeviceSelector.tsx
// 디바이스 선택 모달

import { DeviceSelectorProps } from './types';

export default function DeviceSelector({
  show,
  devices,
  editForm,
  searchQuery,
  onClose,
  onToggleDevice,
  onSetSearchQuery,
  onClearAll,
}: DeviceSelectorProps) {
  if (!show) return null;

  // 필터링된 디바이스 (전체 기기, 연결된 기기 우선 정렬)
  const filteredDevices = devices
    .filter(d =>
      d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.model.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.alias?.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      // 연결된 디바이스 우선
      if (a.status === 'connected' && b.status !== 'connected') return -1;
      if (a.status !== 'connected' && b.status === 'connected') return 1;
      return 0;
    });

  return (
    <div className="selection-modal-overlay" onClick={onClose}>
      <div className="selection-modal device-modal" onClick={e => e.stopPropagation()}>
        <div className="selection-modal-header">
          <h3>디바이스 선택</h3>
          <span className="selection-count">
            {editForm.deviceIds.length}개 선택됨
          </span>
          <button className="selection-modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="selection-modal-search">
          <input
            type="text"
            placeholder="디바이스 검색..."
            value={searchQuery}
            onChange={e => onSetSearchQuery(e.target.value)}
          />
        </div>
        <div className="selection-modal-content">
          {filteredDevices.length === 0 ? (
            <div className="scenario-list-empty">
              등록된 디바이스가 없습니다
            </div>
          ) : (
            filteredDevices.map(device => (
              <div
                key={device.id}
                className={`selectable-item ${editForm.deviceIds.includes(device.id) ? 'selected' : ''} ${device.status !== 'connected' ? 'offline' : ''}`}
                onClick={() => onToggleDevice(device.id)}
              >
                <input
                  type="checkbox"
                  checked={editForm.deviceIds.includes(device.id)}
                  onChange={() => {}}
                />
                <div className="selectable-item-info">
                  <div className="selectable-item-name">
                    {device.alias || device.model}
                    <span className={`device-status-badge ${device.status === 'connected' ? 'online' : 'offline'}`}>
                      {device.status === 'connected' ? '연결됨' : '오프라인'}
                    </span>
                  </div>
                  <div className="selectable-item-meta">
                    {device.brand} • Android {device.osVersion || device.androidVersion}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="selection-modal-footer">
          <button className="btn-secondary" onClick={onClearAll}>
            전체 해제
          </button>
          <button className="btn-primary" onClick={() => {
            onClose();
            onSetSearchQuery('');
          }}>
            확인 ({editForm.deviceIds.length}개)
          </button>
        </div>
      </div>
    </div>
  );
}
