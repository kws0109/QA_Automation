// frontend/src/components/SuiteManager/SuiteManager.tsx
// Test Suite 관리 컴포넌트 (CRUD 전용)

import { useState, useEffect, useCallback } from 'react';
import {
  TestSuite,
  TestSuiteInput,
  ScenarioSummary,
  DeviceDetailedInfo,
} from '../../types';
import { Socket } from 'socket.io-client';
import { useScenarioTree, TreeNode } from '../../hooks/useScenarioTree';
import './SuiteManager.css';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:3001';
const API_PATH = `${API_BASE}/api`;

interface SuiteManagerProps {
  scenarios: ScenarioSummary[];
  devices: DeviceDetailedInfo[];
  socket: Socket | null;
}

export default function SuiteManager({ scenarios, devices }: SuiteManagerProps) {
  // Suite 목록
  const [suites, setSuites] = useState<TestSuite[]>([]);
  const [selectedSuiteId, setSelectedSuiteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // 편집 상태
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<TestSuiteInput>({
    name: '',
    description: '',
    scenarioIds: [],
    deviceIds: [],
  });

  // 모달 상태
  const [showScenarioModal, setShowScenarioModal] = useState(false);
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // 시나리오 트리 (모달용)
  const {
    treeData,
    expandedNodes,
    loading: treeLoading,
    searchQuery: treeSearchQuery,
    loadTreeData,
    toggleExpand,
    setSearchQuery: setTreeSearchQuery,
    clearSearch: clearTreeSearch,
    nodeOrChildrenMatch,
    highlightText,
  } = useScenarioTree();

  // Suite 목록 로드
  const loadSuites = useCallback(async () => {
    try {
      const res = await fetch(`${API_PATH}/suites`);
      const data = await res.json();
      setSuites(data);
    } catch (err) {
      console.error('Failed to load suites:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSuites();
  }, [loadSuites]);

  // 선택된 Suite
  const selectedSuite = suites.find(s => s.id === selectedSuiteId);

  // Suite 선택
  const handleSelectSuite = (suiteId: string) => {
    setSelectedSuiteId(suiteId);
    setIsEditing(false);

    const suite = suites.find(s => s.id === suiteId);
    if (suite) {
      setEditForm({
        name: suite.name,
        description: suite.description || '',
        scenarioIds: [...suite.scenarioIds],
        deviceIds: [...suite.deviceIds],
      });
    }
  };

  // 새 Suite 생성
  const handleNewSuite = () => {
    setSelectedSuiteId(null);
    setIsEditing(true);
    setEditForm({
      name: '',
      description: '',
      scenarioIds: [],
      deviceIds: [],
    });
  };

  // Suite 저장
  const handleSave = async () => {
    if (!editForm.name.trim()) {
      alert('Suite 이름을 입력해주세요.');
      return;
    }
    if (editForm.scenarioIds.length === 0) {
      alert('최소 하나의 시나리오를 선택해주세요.');
      return;
    }
    if (editForm.deviceIds.length === 0) {
      alert('최소 하나의 디바이스를 선택해주세요.');
      return;
    }

    try {
      const url = selectedSuiteId
        ? `${API_PATH}/suites/${selectedSuiteId}`
        : `${API_PATH}/suites`;
      const method = selectedSuiteId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });

      if (!res.ok) {
        throw new Error('Failed to save suite');
      }

      const savedSuite = await res.json();

      if (selectedSuiteId) {
        setSuites(prev => prev.map(s => s.id === savedSuite.id ? savedSuite : s));
      } else {
        setSuites(prev => [savedSuite, ...prev]);
        setSelectedSuiteId(savedSuite.id);
      }

      setIsEditing(false);
      alert('저장되었습니다.');
    } catch (err) {
      console.error('Failed to save suite:', err);
      alert('저장에 실패했습니다.');
    }
  };

  // Suite 삭제
  const handleDelete = async () => {
    if (!selectedSuiteId) return;

    if (!confirm('정말 이 Suite를 삭제하시겠습니까?')) return;

    try {
      await fetch(`${API_PATH}/suites/${selectedSuiteId}`, {
        method: 'DELETE',
      });

      setSuites(prev => prev.filter(s => s.id !== selectedSuiteId));
      setSelectedSuiteId(null);
      setIsEditing(false);
    } catch (err) {
      console.error('Failed to delete suite:', err);
      alert('삭제에 실패했습니다.');
    }
  };

  // 시나리오 추가/제거
  const handleToggleScenario = (scenarioId: string) => {
    setEditForm(prev => {
      const exists = prev.scenarioIds.includes(scenarioId);
      return {
        ...prev,
        scenarioIds: exists
          ? prev.scenarioIds.filter(id => id !== scenarioId)
          : [...prev.scenarioIds, scenarioId],
      };
    });
  };

  // 시나리오 제거
  const handleRemoveScenario = (scenarioId: string) => {
    setEditForm(prev => ({
      ...prev,
      scenarioIds: prev.scenarioIds.filter(id => id !== scenarioId),
    }));
  };

  // 시나리오 순서 변경
  const handleMoveScenario = (index: number, direction: 'up' | 'down') => {
    setEditForm(prev => {
      const newIds = [...prev.scenarioIds];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;

      if (targetIndex < 0 || targetIndex >= newIds.length) return prev;

      [newIds[index], newIds[targetIndex]] = [newIds[targetIndex], newIds[index]];

      return {
        ...prev,
        scenarioIds: newIds,
      };
    });
  };

  // 디바이스 추가/제거
  const handleToggleDevice = (deviceId: string) => {
    setEditForm(prev => {
      const exists = prev.deviceIds.includes(deviceId);
      return {
        ...prev,
        deviceIds: exists
          ? prev.deviceIds.filter(id => id !== deviceId)
          : [...prev.deviceIds, deviceId],
      };
    });
  };

  // 디바이스 제거
  const handleRemoveDevice = (deviceId: string) => {
    setEditForm(prev => ({
      ...prev,
      deviceIds: prev.deviceIds.filter(id => id !== deviceId),
    }));
  };

  // 시나리오 모달 열기 (트리 데이터 로드)
  const handleOpenScenarioModal = () => {
    loadTreeData();
    setShowScenarioModal(true);
  };

  // 트리 노드에서 모든 시나리오 ID 추출
  const getScenarioIdsFromNode = (node: TreeNode): string[] => {
    if (node.type === 'scenario' && node.scenarioData) {
      return [node.scenarioData.id];
    }
    if (node.children) {
      return node.children.flatMap(child => getScenarioIdsFromNode(child));
    }
    return [];
  };

  // 노드의 모든 시나리오가 선택되었는지 확인
  const isNodeAllSelected = (node: TreeNode): boolean => {
    const scenarioIds = getScenarioIdsFromNode(node);
    if (scenarioIds.length === 0) return false;
    return scenarioIds.every(id => editForm.scenarioIds.includes(id));
  };

  // 노드의 일부 시나리오가 선택되었는지 확인
  const isNodePartiallySelected = (node: TreeNode): boolean => {
    const scenarioIds = getScenarioIdsFromNode(node);
    if (scenarioIds.length === 0) return false;
    const selectedCount = scenarioIds.filter(id => editForm.scenarioIds.includes(id)).length;
    return selectedCount > 0 && selectedCount < scenarioIds.length;
  };

  // 패키지/카테고리 전체 선택/해제 토글
  const handleToggleNodeScenarios = (node: TreeNode) => {
    const scenarioIds = getScenarioIdsFromNode(node);
    if (scenarioIds.length === 0) return;

    const allSelected = isNodeAllSelected(node);

    setEditForm(prev => {
      if (allSelected) {
        // 전체 해제
        return {
          ...prev,
          scenarioIds: prev.scenarioIds.filter(id => !scenarioIds.includes(id)),
        };
      } else {
        // 전체 선택 (중복 제거)
        const newIds = [...prev.scenarioIds];
        scenarioIds.forEach(id => {
          if (!newIds.includes(id)) {
            newIds.push(id);
          }
        });
        return {
          ...prev,
          scenarioIds: newIds,
        };
      }
    });
  };

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
    }
  );

  // 선택된 시나리오 정보 가져오기
  const getScenarioInfo = (scenarioId: string) => {
    return scenarios.find(s => s.id === scenarioId);
  };

  // 선택된 디바이스 정보 가져오기
  const getDeviceInfo = (deviceId: string) => {
    return devices.find(d => d.id === deviceId);
  };

  if (loading) {
    return (
      <div className="suite-manager">
        <div className="loading-spinner">Suite 목록을 불러오는 중...</div>
      </div>
    );
  }

  return (
    <div className="suite-manager">
      {/* Suite 관리 (탭 없이 단일 뷰) */}
      <div className="suite-content suite-content-no-tabs">
        {/* 좌측: Suite 목록 */}
        <div className="suite-list-panel">
          <div className="suite-list-header">
            <h2>Test Suite</h2>
            <button className="btn-new-suite" onClick={handleNewSuite}>
              + 새 Suite
            </button>
          </div>

          <div className="suite-list-content">
            {suites.length === 0 ? (
              <div className="suite-list-empty">
                <p>📦</p>
                <p>아직 생성된 Suite가 없습니다.</p>
                <p>새 Suite를 만들어보세요!</p>
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
                    onClick={() => handleSelectSuite(suite.id)}
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

        {/* 우측: Suite 편집기 */}
        <div className="suite-editor-panel">
          {!selectedSuiteId && !isEditing ? (
            <div className="suite-editor-empty">
              <p>📦</p>
              <p>Suite를 선택하거나 새로 만드세요</p>
            </div>
          ) : (
            <>
              <div className="suite-editor-header">
                <h2>{isEditing ? (selectedSuiteId ? 'Suite 수정' : '새 Suite') : selectedSuite?.name}</h2>
                <div className="suite-editor-actions">
                  {!isEditing ? (
                    <>
                      <button className="btn-secondary" onClick={() => setIsEditing(true)}>
                        수정
                      </button>
                      <button className="btn-danger" onClick={handleDelete}>
                        삭제
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="btn-primary" onClick={handleSave}>
                        저장
                      </button>
                      <button
                        className="btn-secondary"
                        onClick={() => {
                          if (selectedSuiteId) {
                            handleSelectSuite(selectedSuiteId);
                          } else {
                            setIsEditing(false);
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
                    <label>Suite 이름</label>
                    <input
                      type="text"
                      value={editForm.name}
                      onChange={e => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Suite 이름을 입력하세요"
                      disabled={!isEditing}
                    />
                  </div>

                  <div className="form-group">
                    <label>설명</label>
                    <textarea
                      value={editForm.description}
                      onChange={e => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Suite에 대한 설명 (선택사항)"
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
                          <button className="btn-add-item" onClick={handleOpenScenarioModal}>
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
                                      onClick={() => handleMoveScenario(index, 'up')}
                                      disabled={index === 0}
                                      title="위로 이동"
                                    >
                                      ▲
                                    </button>
                                    <button
                                      className="btn-move-item"
                                      onClick={() => handleMoveScenario(index, 'down')}
                                      disabled={index === editForm.scenarioIds.length - 1}
                                      title="아래로 이동"
                                    >
                                      ▼
                                    </button>
                                    <button
                                      className="btn-remove-item"
                                      onClick={() => handleRemoveScenario(scenarioId)}
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
                          <button className="btn-add-item" onClick={() => setShowDeviceModal(true)}>
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
                                    onClick={() => handleRemoveDevice(deviceId)}
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
            </>
          )}
        </div>
      </div>

      {/* 시나리오 선택 모달 (트리 구조) */}
      {showScenarioModal && (
        <div className="selection-modal-overlay" onClick={() => setShowScenarioModal(false)}>
          <div className="selection-modal scenario-tree-modal" onClick={e => e.stopPropagation()}>
            <div className="selection-modal-header">
              <h3>시나리오 선택</h3>
              <span className="selection-count">
                {editForm.scenarioIds.length}개 선택됨
              </span>
              <button className="selection-modal-close" onClick={() => setShowScenarioModal(false)}>
                ×
              </button>
            </div>
            <div className="selection-modal-search">
              <span className="tree-search-icon">🔍</span>
              <input
                type="text"
                placeholder="시나리오, 카테고리, 패키지 검색..."
                value={treeSearchQuery}
                onChange={e => setTreeSearchQuery(e.target.value)}
              />
              {treeSearchQuery && (
                <button className="tree-search-clear" onClick={clearTreeSearch}>
                  ×
                </button>
              )}
            </div>
            <div className="selection-modal-content tree-content">
              {treeLoading ? (
                <div className="tree-loading">불러오는 중...</div>
              ) : treeData.length === 0 ? (
                <div className="tree-empty">
                  <p>등록된 패키지가 없습니다.</p>
                </div>
              ) : (
                treeData
                  .filter(node => nodeOrChildrenMatch(node, treeSearchQuery))
                  .map(packageNode => {
                    const pkgExpanded = expandedNodes.has(packageNode.id);
                    const pkgAllSelected = isNodeAllSelected(packageNode);
                    const pkgPartial = isNodePartiallySelected(packageNode);
                    const pkgScenarioCount = getScenarioIdsFromNode(packageNode).length;

                    return (
                      <div key={packageNode.id} className="tree-node-wrapper">
                        {/* 패키지 노드 */}
                        <div className="tree-node package">
                          <span
                            className="tree-expand-icon"
                            onClick={() => toggleExpand(packageNode.id)}
                          >
                            {pkgExpanded ? '▼' : '▶'}
                          </span>
                          <input
                            type="checkbox"
                            className="tree-checkbox"
                            checked={pkgAllSelected}
                            ref={el => {
                              if (el) el.indeterminate = pkgPartial;
                            }}
                            onChange={() => handleToggleNodeScenarios(packageNode)}
                          />
                          <span className="tree-node-icon">📦</span>
                          <span
                            className="tree-node-name"
                            onClick={() => toggleExpand(packageNode.id)}
                          >
                            {highlightText(packageNode.name, treeSearchQuery)}
                          </span>
                          <span className="tree-node-count">{pkgScenarioCount}</span>
                        </div>

                        {/* 카테고리들 */}
                        {pkgExpanded && packageNode.children && (
                          <div className="tree-children">
                            {packageNode.children
                              .filter(catNode => nodeOrChildrenMatch(catNode, treeSearchQuery))
                              .map(categoryNode => {
                                const catExpanded = expandedNodes.has(categoryNode.id);
                                const catAllSelected = isNodeAllSelected(categoryNode);
                                const catPartial = isNodePartiallySelected(categoryNode);
                                const catScenarioCount = getScenarioIdsFromNode(categoryNode).length;

                                return (
                                  <div key={categoryNode.id} className="tree-node-wrapper">
                                    {/* 카테고리 노드 */}
                                    <div className="tree-node category" style={{ paddingLeft: '24px' }}>
                                      <span
                                        className="tree-expand-icon"
                                        onClick={() => toggleExpand(categoryNode.id)}
                                      >
                                        {categoryNode.children && categoryNode.children.length > 0
                                          ? (catExpanded ? '▼' : '▶')
                                          : <span style={{ width: '12px', display: 'inline-block' }} />
                                        }
                                      </span>
                                      <input
                                        type="checkbox"
                                        className="tree-checkbox"
                                        checked={catAllSelected}
                                        ref={el => {
                                          if (el) el.indeterminate = catPartial;
                                        }}
                                        onChange={() => handleToggleNodeScenarios(categoryNode)}
                                      />
                                      <span className="tree-node-icon">
                                        {catExpanded ? '📂' : '📁'}
                                      </span>
                                      <span
                                        className="tree-node-name"
                                        onClick={() => toggleExpand(categoryNode.id)}
                                      >
                                        {highlightText(categoryNode.name, treeSearchQuery)}
                                      </span>
                                      <span className="tree-node-count">{catScenarioCount}</span>
                                    </div>

                                    {/* 시나리오들 */}
                                    {catExpanded && categoryNode.children && (
                                      <div className="tree-children">
                                        {categoryNode.children
                                          .filter(scenNode => nodeOrChildrenMatch(scenNode, treeSearchQuery))
                                          .map(scenarioNode => {
                                            const scenarioId = scenarioNode.scenarioData?.id || '';
                                            const isSelected = editForm.scenarioIds.includes(scenarioId);

                                            return (
                                              <div
                                                key={scenarioNode.id}
                                                className={`tree-node scenario ${isSelected ? 'selected' : ''}`}
                                                style={{ paddingLeft: '48px' }}
                                                onClick={() => handleToggleScenario(scenarioId)}
                                              >
                                                <span style={{ width: '12px', display: 'inline-block' }} />
                                                <input
                                                  type="checkbox"
                                                  className="tree-checkbox"
                                                  checked={isSelected}
                                                  onChange={() => {}}
                                                />
                                                <span className="tree-node-icon">📄</span>
                                                <span className="tree-node-name">
                                                  {highlightText(scenarioNode.name, treeSearchQuery)}
                                                </span>
                                                {scenarioNode.scenarioData && (
                                                  <span className="tree-node-meta">
                                                    {scenarioNode.scenarioData.nodeCount}개 노드
                                                  </span>
                                                )}
                                              </div>
                                            );
                                          })}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                          </div>
                        )}
                      </div>
                    );
                  })
              )}
              {treeSearchQuery && treeData.filter(node => nodeOrChildrenMatch(node, treeSearchQuery)).length === 0 && (
                <div className="tree-no-results">
                  <p>"{treeSearchQuery}" 검색 결과가 없습니다.</p>
                </div>
              )}
            </div>
            <div className="selection-modal-footer">
              <button className="btn-secondary" onClick={() => {
                setEditForm(prev => ({ ...prev, scenarioIds: [] }));
              }}>
                전체 해제
              </button>
              <button className="btn-primary" onClick={() => {
                setShowScenarioModal(false);
                clearTreeSearch();
              }}>
                확인 ({editForm.scenarioIds.length}개)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 디바이스 선택 모달 */}
      {showDeviceModal && (
        <div className="selection-modal-overlay" onClick={() => setShowDeviceModal(false)}>
          <div className="selection-modal device-modal" onClick={e => e.stopPropagation()}>
            <div className="selection-modal-header">
              <h3>디바이스 선택</h3>
              <span className="selection-count">
                {editForm.deviceIds.length}개 선택됨
              </span>
              <button className="selection-modal-close" onClick={() => setShowDeviceModal(false)}>
                ×
              </button>
            </div>
            <div className="selection-modal-search">
              <input
                type="text"
                placeholder="디바이스 검색..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
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
                    onClick={() => handleToggleDevice(device.id)}
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
              <button className="btn-secondary" onClick={() => {
                setEditForm(prev => ({ ...prev, deviceIds: [] }));
              }}>
                전체 해제
              </button>
              <button className="btn-primary" onClick={() => {
                setShowDeviceModal(false);
                setSearchQuery('');
              }}>
                확인 ({editForm.deviceIds.length}개)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
