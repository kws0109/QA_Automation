// frontend/src/components/ScenarioModal/ScenarioModal.tsx

import { useState, useEffect } from 'react';
import axios from 'axios';
import type { FlowNode, Connection, Scenario, ScenarioSummary, Package } from '../../types';
import PackageManager from '../PackageManager';
import './ScenarioModal.css';

const API_BASE = 'http://localhost:3001';

interface ScenarioModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoad: (scenario: Scenario) => void;
  currentNodes: FlowNode[];
  currentConnections: Connection[];
}

function ScenarioModal({ isOpen, onClose, onLoad, currentNodes, currentConnections }: ScenarioModalProps) {
  const [scenarios, setScenarios] = useState<ScenarioSummary[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saveMode, setSaveMode] = useState<boolean>(false);
  const [saveName, setSaveName] = useState<string>('');
  const [saveDesc, setSaveDesc] = useState<string>('');

  // 패키지 관련 상태
  const [selectedPackageId, setSelectedPackageId] = useState<string>('');
  const [savePackageId, setSavePackageId] = useState<string>('');
  const [showPackageManager, setShowPackageManager] = useState<boolean>(false);

  // 패키지 목록 불러오기
  const fetchPackages = async () => {
    try {
      const res = await axios.get<{ data: Package[] }>(`${API_BASE}/api/packages`);
      setPackages(res.data.data || []);
    } catch (err) {
      console.error('패키지 목록 조회 실패:', err);
    }
  };

  // 시나리오 목록 불러오기
  const fetchScenarios = async (packageId?: string) => {
    setLoading(true);
    try {
      const url = packageId
        ? `${API_BASE}/api/scenarios?packageId=${packageId}`
        : `${API_BASE}/api/scenarios`;
      const res = await axios.get<{ data: ScenarioSummary[] }>(url);
      setScenarios(res.data.data || []);
    } catch (err) {
      console.error('시나리오 목록 조회 실패:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchPackages();
      fetchScenarios(selectedPackageId || undefined);
      setSelectedId(null);
      setSaveMode(false);
      setSaveName('');
      setSaveDesc('');
    }
  }, [isOpen]);

  // 패키지 필터 변경 시 시나리오 목록 갱신
  useEffect(() => {
    if (isOpen) {
      fetchScenarios(selectedPackageId || undefined);
      setSelectedId(null);
    }
  }, [selectedPackageId, isOpen]);

  // 시나리오 불러오기
  const handleLoad = async () => {
    if (!selectedId) return;

    try {
      const res = await axios.get<{ data: Scenario }>(`${API_BASE}/api/scenarios/${selectedId}`);
      onLoad(res.data.data);
      onClose();
    } catch (err) {
      const error = err as Error;
      alert('불러오기 실패: ' + error.message);
    }
  };

  // 시나리오 저장
  const handleSave = async () => {
    if (!saveName.trim()) {
      alert('시나리오 이름을 입력해주세요.');
      return;
    }

    if (!savePackageId) {
      alert('패키지를 선택해주세요.');
      return;
    }

    try {
      await axios.post(`${API_BASE}/api/scenarios`, {
        name: saveName,
        description: saveDesc,
        packageId: savePackageId,
        nodes: currentNodes,
        connections: currentConnections,
      });
      alert('저장되었습니다!');
      fetchScenarios(selectedPackageId || undefined);
      setSaveMode(false);
      setSaveName('');
      setSaveDesc('');
      setSavePackageId('');
    } catch (err) {
      const error = err as { response?: { data?: { message?: string } } };
      alert('저장 실패: ' + (error.response?.data?.message || '알 수 없는 에러'));
    }
  };

  // 시나리오 삭제
  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('이 시나리오를 삭제하시겠습니까?')) return;

    try {
      await axios.delete(`${API_BASE}/api/scenarios/${id}`);
      fetchScenarios(selectedPackageId || undefined);
      if (selectedId === id) {
        setSelectedId(null);
      }
    } catch (err) {
      const error = err as Error;
      alert('삭제 실패: ' + error.message);
    }
  };

  // 시나리오 복제
  const handleDuplicate = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();

    try {
      await axios.post(`${API_BASE}/api/scenarios/${id}/duplicate`);
      fetchScenarios(selectedPackageId || undefined);
    } catch (err) {
      const error = err as Error;
      alert('복제 실패: ' + error.message);
    }
  };

  // 패키지 관리 창에서 변경 시
  const handlePackageChange = () => {
    fetchPackages();
    fetchScenarios(selectedPackageId || undefined);
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="scenario-modal" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h2>시나리오 관리</h2>
            <button className="modal-close" onClick={onClose}>X</button>
          </div>

          <div className="modal-tabs">
            <button
              className={`tab-btn ${!saveMode ? 'active' : ''}`}
              onClick={() => setSaveMode(false)}
            >
              불러오기
            </button>
            <button
              className={`tab-btn ${saveMode ? 'active' : ''}`}
              onClick={() => setSaveMode(true)}
            >
              새로 저장
            </button>
            <button
              className="tab-btn tab-btn-manage"
              onClick={() => setShowPackageManager(true)}
            >
              패키지 관리
            </button>
          </div>

          <div className="modal-body">
            {saveMode ? (
              // 저장 모드
              <div className="save-form">
                <div className="form-field">
                  <label>패키지 *</label>
                  <select
                    value={savePackageId}
                    onChange={(e) => setSavePackageId(e.target.value)}
                  >
                    <option value="">-- 패키지 선택 --</option>
                    {packages.map((pkg) => (
                      <option key={pkg.id} value={pkg.id}>
                        {pkg.name} ({pkg.packageName})
                      </option>
                    ))}
                  </select>
                  {packages.length === 0 && (
                    <p className="form-hint">
                      등록된 패키지가 없습니다. &apos;패키지 관리&apos;에서 먼저 생성하세요.
                    </p>
                  )}
                </div>
                <div className="form-field">
                  <label>시나리오 이름 *</label>
                  <input
                    type="text"
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    placeholder="예: 로그인 테스트"
                    autoFocus
                  />
                </div>
                <div className="form-field">
                  <label>설명 (선택)</label>
                  <textarea
                    value={saveDesc}
                    onChange={(e) => setSaveDesc(e.target.value)}
                    placeholder="시나리오 설명..."
                    rows={3}
                  />
                </div>
                <div className="save-info">
                  <p>노드 {currentNodes.length}개, 연결 {currentConnections.length}개가 저장됩니다.</p>
                </div>
              </div>
            ) : (
              // 불러오기 모드
              <>
                {/* 패키지 필터 */}
                <div className="package-filter">
                  <label>패키지 필터:</label>
                  <select
                    value={selectedPackageId}
                    onChange={(e) => setSelectedPackageId(e.target.value)}
                  >
                    <option value="">전체</option>
                    {packages.map((pkg) => (
                      <option key={pkg.id} value={pkg.id}>
                        {pkg.name} ({pkg.packageName})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="scenario-list">
                  {loading ? (
                    <div className="list-loading">불러오는 중...</div>
                  ) : scenarios.length === 0 ? (
                    <div className="list-empty">
                      <p>저장된 시나리오가 없습니다.</p>
                      <p>&apos;새로 저장&apos; 탭에서 시나리오를 저장해보세요.</p>
                    </div>
                  ) : (
                    scenarios.map((scenario) => (
                      <div
                        key={scenario.id}
                        className={`scenario-item ${selectedId === scenario.id ? 'selected' : ''}`}
                        onClick={() => setSelectedId(scenario.id)}
                      >
                        <div className="scenario-info">
                          <div className="scenario-name">{scenario.name}</div>
                          <div className="scenario-meta">
                            ID: {scenario.id} · 노드 {scenario.nodeCount}개 ·
                            {new Date(scenario.updatedAt).toLocaleDateString()}
                            {scenario.packageName && (
                              <span className="scenario-package"> · {scenario.packageName}</span>
                            )}
                          </div>
                          {scenario.description && (
                            <div className="scenario-desc">{scenario.description}</div>
                          )}
                        </div>
                        <div className="scenario-actions">
                          <button
                            className="btn-icon"
                            title="복제"
                            onClick={(e) => handleDuplicate(scenario.id, e)}
                          >
                            +
                          </button>
                          <button
                            className="btn-icon btn-delete"
                            title="삭제"
                            onClick={(e) => handleDelete(scenario.id, e)}
                          >
                            X
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>

          <div className="modal-footer">
            <button className="btn-cancel" onClick={onClose}>
              취소
            </button>
            {saveMode ? (
              <button
                className="btn-primary"
                onClick={handleSave}
                disabled={!saveName.trim() || !savePackageId}
              >
                저장
              </button>
            ) : (
              <button
                className="btn-primary"
                onClick={handleLoad}
                disabled={!selectedId}
              >
                불러오기
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 패키지 관리 모달 */}
      <PackageManager
        isOpen={showPackageManager}
        onClose={() => setShowPackageManager(false)}
        onPackageChange={handlePackageChange}
      />
    </>
  );
}

export default ScenarioModal;