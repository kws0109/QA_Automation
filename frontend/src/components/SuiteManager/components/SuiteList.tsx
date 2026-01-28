// frontend/src/components/SuiteManager/components/SuiteList.tsx
// Suite 목록 컴포넌트

import { SuiteListProps } from './types';

export default function SuiteList({
  suites,
  selectedSuiteId,
  devices,
  onSelectSuite,
  onNewSuite,
}: SuiteListProps) {
  return (
    <div className="suite-list-panel">
      <div className="suite-list-header">
        <h2>시나리오 묶음</h2>
        <button className="btn-new-suite" onClick={onNewSuite}>
          + 새 묶음
        </button>
      </div>

      <div className="suite-list-content">
        {suites.length === 0 ? (
          <div className="suite-list-empty">
            <p>📦</p>
            <p>아직 생성된 시나리오 묶음이 없습니다.</p>
            <p>새 묶음을 만들어보세요!</p>
          </div>
        ) : (
          suites.map(suite => {
            const offlineCount = suite.deviceIds.filter(id => {
              const device = devices.find(d => d.id === id);
              return device && device.status !== 'connected';
            }).length;

            return (
              <div
                key={suite.id}
                className={`suite-item ${selectedSuiteId === suite.id ? 'selected' : ''}`}
                onClick={() => onSelectSuite(suite.id)}
              >
                <div className="suite-item-header">
                  <div className="suite-item-name">{suite.name}</div>
                </div>
                <div className="suite-item-meta">
                  <span>📋 {suite.scenarioIds.length}개</span>
                  <span>📱 {suite.deviceIds.length}개</span>
                  {offlineCount > 0 && (
                    <span className="suite-item-warning" title={`${offlineCount}개 디바이스 오프라인`}>
                      ⚠️ {offlineCount}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
