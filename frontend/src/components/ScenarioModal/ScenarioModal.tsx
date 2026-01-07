// frontend/src/components/ScenarioModal/ScenarioModal.tsx

import { useState, useEffect } from 'react';
import axios from 'axios';
import type { FlowNode, Connection, Scenario, ScenarioSummary } from '../../types';
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
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saveMode, setSaveMode] = useState<boolean>(false);
  const [saveName, setSaveName] = useState<string>('');
  const [saveDesc, setSaveDesc] = useState<string>('');

  // 시나리오 목록 불러오기
  const fetchScenarios = async () => {
    setLoading(true);
    try {
      const res = await axios.get<{ data: ScenarioSummary[] }>(`${API_BASE}/api/scenarios`);
      setScenarios(res.data.data || []);
    } catch (err) {
      console.error('시나리오 목록 조회 실패:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchScenarios();
      setSelectedId(null);
      setSaveMode(false);
      setSaveName('');
      setSaveDesc('');
    }
  }, [isOpen]);

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

    try {
      await axios.post(`${API_BASE}/api/scenarios`, {
        name: saveName,
        description: saveDesc,
        nodes: currentNodes,
        connections: currentConnections,
      });
      alert('저장되었습니다!');
      fetchScenarios();
      setSaveMode(false);
      setSaveName('');
      setSaveDesc('');
    } catch (err) {
      const error = err as Error;
      alert('저장 실패: ' + error.message);
    }
  };

  // 시나리오 삭제
  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('이 시나리오를 삭제하시겠습니까?')) return;

    try {
      await axios.delete(`${API_BASE}/api/scenarios/${id}`);
      fetchScenarios();
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
      fetchScenarios();
    } catch (err) {
      const error = err as Error;
      alert('복제 실패: ' + error.message);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="scenario-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>📁 시나리오 관리</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-tabs">
          <button 
            className={`tab-btn ${!saveMode ? 'active' : ''}`}
            onClick={() => setSaveMode(false)}
          >
            📂 불러오기
          </button>
          <button 
            className={`tab-btn ${saveMode ? 'active' : ''}`}
            onClick={() => setSaveMode(true)}
          >
            💾 새로 저장
          </button>
        </div>

        <div className="modal-body">
          {saveMode ? (
            // 저장 모드
            <div className="save-form">
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
                  placeholder="시나리오에 대한 설명..."
                  rows={3}
                />
              </div>
              <div className="save-info">
                <p>📌 노드 {currentNodes.length}개, 연결 {currentConnections.length}개가 저장됩니다.</p>
              </div>
            </div>
          ) : (
            // 불러오기 모드
            <div className="scenario-list">
              {loading ? (
                <div className="list-loading">불러오는 중...</div>
              ) : scenarios.length === 0 ? (
                <div className="list-empty">
                  <p>저장된 시나리오가 없습니다.</p>
                  <p>새로 저장 탭에서 시나리오를 저장해보세요.</p>
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
                        📋
                      </button>
                      <button 
                        className="btn-icon btn-delete" 
                        title="삭제"
                        onClick={(e) => handleDelete(scenario.id, e)}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
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
              disabled={!saveName.trim()}
            >
              💾 저장
            </button>
          ) : (
            <button 
              className="btn-primary" 
              onClick={handleLoad}
              disabled={!selectedId}
            >
              📂 불러오기
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default ScenarioModal;