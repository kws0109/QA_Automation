// frontend/src/components/PackageManager/PackageManager.tsx

import { useState, useEffect } from 'react';
import axios from 'axios';
import type { Package } from '../../types';
import './PackageManager.css';

const API_BASE = 'http://localhost:3001';

interface PackageManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onPackageChange?: () => void;
}

function PackageManager({ isOpen, onClose, onPackageChange }: PackageManagerProps) {
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState<boolean>(false);

  // 폼 상태
  const [formName, setFormName] = useState<string>('');
  const [formPackageName, setFormPackageName] = useState<string>('');
  const [formDescription, setFormDescription] = useState<string>('');

  // 패키지 목록 불러오기
  const fetchPackages = async () => {
    setLoading(true);
    try {
      const res = await axios.get<{ data: Package[] }>(`${API_BASE}/api/packages`);
      setPackages(res.data.data || []);
    } catch (err) {
      console.error('패키지 목록 조회 실패:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchPackages();
      resetForm();
    }
  }, [isOpen]);

  // 폼 초기화
  const resetForm = () => {
    setEditingId(null);
    setIsCreating(false);
    setFormName('');
    setFormPackageName('');
    setFormDescription('');
  };

  // 생성 모드 시작
  const startCreate = () => {
    resetForm();
    setIsCreating(true);
  };

  // 수정 모드 시작
  const startEdit = (pkg: Package) => {
    setEditingId(pkg.id);
    setIsCreating(false);
    setFormName(pkg.name);
    setFormPackageName(pkg.packageName);
    setFormDescription(pkg.description || '');
  };

  // 패키지 생성
  const handleCreate = async () => {
    if (!formName.trim() || !formPackageName.trim()) {
      alert('이름과 패키지명은 필수입니다.');
      return;
    }

    try {
      await axios.post(`${API_BASE}/api/packages`, {
        name: formName,
        packageName: formPackageName,
        description: formDescription,
      });
      fetchPackages();
      resetForm();
      onPackageChange?.();
    } catch (err) {
      const error = err as { response?: { data?: { message?: string } } };
      alert('생성 실패: ' + (error.response?.data?.message || '알 수 없는 에러'));
    }
  };

  // 패키지 수정
  const handleUpdate = async () => {
    if (!editingId || !formName.trim() || !formPackageName.trim()) {
      alert('이름과 패키지명은 필수입니다.');
      return;
    }

    try {
      await axios.put(`${API_BASE}/api/packages/${editingId}`, {
        name: formName,
        packageName: formPackageName,
        description: formDescription,
      });
      fetchPackages();
      resetForm();
      onPackageChange?.();
    } catch (err) {
      const error = err as { response?: { data?: { message?: string } } };
      alert('수정 실패: ' + (error.response?.data?.message || '알 수 없는 에러'));
    }
  };

  // 패키지 삭제
  const handleDelete = async (id: string) => {
    if (!window.confirm('이 패키지를 삭제하시겠습니까?')) return;

    try {
      await axios.delete(`${API_BASE}/api/packages/${id}`);
      fetchPackages();
      if (editingId === id) {
        resetForm();
      }
      onPackageChange?.();
    } catch (err) {
      const error = err as { response?: { data?: { message?: string } } };
      alert('삭제 실패: ' + (error.response?.data?.message || '알 수 없는 에러'));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="package-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>패키지 관리</h2>
          <button className="modal-close" onClick={onClose}>X</button>
        </div>

        <div className="modal-body package-body">
          {/* 패키지 목록 */}
          <div className="package-list-section">
            <div className="section-header">
              <h3>패키지 목록</h3>
              <button className="btn-add" onClick={startCreate}>
                + 추가
              </button>
            </div>

            {loading ? (
              <div className="list-loading">불러오는 중...</div>
            ) : packages.length === 0 ? (
              <div className="list-empty">
                <p>등록된 패키지가 없습니다.</p>
                <p>&apos;+ 추가&apos; 버튼을 클릭하여 패키지를 생성하세요.</p>
              </div>
            ) : (
              <div className="package-list">
                {packages.map((pkg) => (
                  <div
                    key={pkg.id}
                    className={`package-item ${editingId === pkg.id ? 'selected' : ''}`}
                    onClick={() => startEdit(pkg)}
                  >
                    <div className="package-info">
                      <div className="package-name">{pkg.name}</div>
                      <div className="package-id">{pkg.packageName}</div>
                      {pkg.scenarioCount !== undefined && (
                        <div className="package-count">
                          시나리오: {pkg.scenarioCount}개
                        </div>
                      )}
                    </div>
                    <div className="package-actions">
                      <button
                        className="btn-icon btn-delete"
                        title="삭제"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(pkg.id);
                        }}
                      >
                        X
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 패키지 폼 */}
          {(isCreating || editingId) && (
            <div className="package-form-section">
              <h3>{isCreating ? '패키지 생성' : '패키지 수정'}</h3>
              <div className="form-field">
                <label>표시 이름 *</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="예: 게임 A"
                />
              </div>
              <div className="form-field">
                <label>Android 패키지명 *</label>
                <input
                  type="text"
                  value={formPackageName}
                  onChange={(e) => setFormPackageName(e.target.value)}
                  placeholder="예: com.company.game"
                />
              </div>
              <div className="form-field">
                <label>설명</label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="패키지 설명..."
                  rows={3}
                />
              </div>
              <div className="form-actions">
                <button className="btn-cancel" onClick={resetForm}>
                  취소
                </button>
                <button
                  className="btn-primary"
                  onClick={isCreating ? handleCreate : handleUpdate}
                  disabled={!formName.trim() || !formPackageName.trim()}
                >
                  {isCreating ? '생성' : '저장'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default PackageManager;
