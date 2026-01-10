// frontend/src/components/ScenarioSaveModal/ScenarioSaveModal.tsx

import { useState, useEffect } from 'react';
import axios from 'axios';
import type { FlowNode, Connection, Package } from '../../types';
import './ScenarioSaveModal.css';

const API_BASE = 'http://localhost:3001';

interface ScenarioSaveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveComplete: (scenarioId: string, scenarioName: string, packageId: string) => void;
  currentNodes: FlowNode[];
  currentConnections: Connection[];
  selectedPackageId?: string;
}

function ScenarioSaveModal({
  isOpen,
  onClose,
  onSaveComplete,
  currentNodes,
  currentConnections,
  selectedPackageId: externalPackageId,
}: ScenarioSaveModalProps) {
  const [packages, setPackages] = useState<Package[]>([]);
  const [saveName, setSaveName] = useState<string>('');
  const [saveDesc, setSaveDesc] = useState<string>('');
  const [savePackageId, setSavePackageId] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);

  // 패키지 목록 불러오기
  const fetchPackages = async () => {
    try {
      const res = await axios.get<{ data: Package[] }>(`${API_BASE}/api/packages`);
      setPackages(res.data.data || []);
    } catch (err) {
      console.error('패키지 목록 조회 실패:', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchPackages();
      setSavePackageId(externalPackageId || '');
      setSaveName('');
      setSaveDesc('');
    }
  }, [isOpen, externalPackageId]);

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

    setSaving(true);
    try {
      const res = await axios.post<{ data: { id: string } }>(`${API_BASE}/api/scenarios`, {
        name: saveName,
        description: saveDesc,
        packageId: savePackageId,
        nodes: currentNodes,
        connections: currentConnections,
      });

      alert('저장되었습니다!');
      onSaveComplete(res.data.data.id, saveName, savePackageId);
      onClose();
    } catch (err) {
      const error = err as { response?: { data?: { message?: string } } };
      alert('저장 실패: ' + (error.response?.data?.message || '알 수 없는 에러'));
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="scenario-save-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>시나리오 저장</h2>
          <button className="modal-close" onClick={onClose}>X</button>
        </div>

        <div className="modal-body">
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
                  등록된 패키지가 없습니다. 패키지 관리에서 먼저 생성하세요.
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
        </div>

        <div className="modal-footer">
          <button className="btn-cancel" onClick={onClose}>
            취소
          </button>
          <button
            className="btn-primary"
            onClick={handleSave}
            disabled={!saveName.trim() || !savePackageId || saving}
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ScenarioSaveModal;
