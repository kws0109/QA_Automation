// frontend/src/components/ScenarioLoadModal/ScenarioLoadModal.tsx

import { useState, useEffect } from 'react';
import axios from 'axios';
import type { Scenario, ScenarioSummary, Package } from '../../types';
import './ScenarioLoadModal.css';

const API_BASE = 'http://localhost:3001';

interface ScenarioLoadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoad: (scenario: Scenario) => void;
  selectedPackageId?: string;
}

function ScenarioLoadModal({
  isOpen,
  onClose,
  onLoad,
  selectedPackageId: externalPackageId,
}: ScenarioLoadModalProps) {
  const [scenarios, setScenarios] = useState<ScenarioSummary[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterPackageId, setFilterPackageId] = useState<string>('');

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
      const initialPkgId = externalPackageId || '';
      setFilterPackageId(initialPkgId);
      fetchScenarios(initialPkgId || undefined);
      setSelectedId(null);
    }
  }, [isOpen, externalPackageId]);

  // 패키지 필터 변경 시 시나리오 목록 갱신
  useEffect(() => {
    if (isOpen) {
      fetchScenarios(filterPackageId || undefined);
      setSelectedId(null);
    }
  }, [filterPackageId, isOpen]);

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

  // 시나리오 삭제
  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('이 시나리오를 삭제하시겠습니까?')) return;

    try {
      await axios.delete(`${API_BASE}/api/scenarios/${id}`);
      fetchScenarios(filterPackageId || undefined);
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
      fetchScenarios(filterPackageId || undefined);
    } catch (err) {
      const error = err as Error;
      alert('복제 실패: ' + error.message);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="scenario-load-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>시나리오 불러오기</h2>
          <button className="modal-close" onClick={onClose}>X</button>
        </div>

        <div className="modal-body">
          {/* 패키지 필터 */}
          <div className="package-filter">
            <label>패키지 필터:</label>
            <select
              value={filterPackageId}
              onChange={(e) => setFilterPackageId(e.target.value)}
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
                      노드 {scenario.nodeCount}개 · {new Date(scenario.updatedAt).toLocaleDateString()}
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
                      className="btn-action"
                      title="복제"
                      onClick={(e) => handleDuplicate(scenario.id, e)}
                    >
                      복제
                    </button>
                    <button
                      className="btn-action btn-delete"
                      title="삭제"
                      onClick={(e) => handleDelete(scenario.id, e)}
                    >
                      삭제
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-cancel" onClick={onClose}>
            취소
          </button>
          <button
            className="btn-primary"
            onClick={handleLoad}
            disabled={!selectedId}
          >
            불러오기
          </button>
        </div>
      </div>
    </div>
  );
}

export default ScenarioLoadModal;
