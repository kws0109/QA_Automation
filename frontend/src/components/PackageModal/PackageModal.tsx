// frontend/src/components/PackageModal/PackageModal.tsx

import { useState, useEffect } from 'react';
import axios from 'axios';
import type { Package } from '../../types';
import './PackageModal.css';

const API_BASE = 'http://127.0.0.1:3001';

interface PackageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPackagesChange?: () => void;
}

function PackageModal({ isOpen, onClose, onPackagesChange }: PackageModalProps) {
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  // 패키지 관리 상태
  const [editingPackageId, setEditingPackageId] = useState<string | null>(null);
  const [isCreatingPackage, setIsCreatingPackage] = useState<boolean>(false);
  const [pkgFormName, setPkgFormName] = useState<string>('');
  const [pkgFormPackageName, setPkgFormPackageName] = useState<string>('');
  const [pkgFormDescription, setPkgFormDescription] = useState<string>('');

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
      resetPackageForm();
    }
  }, [isOpen]);

  // 패키지 폼 초기화
  const resetPackageForm = () => {
    setEditingPackageId(null);
    setIsCreatingPackage(false);
    setPkgFormName('');
    setPkgFormPackageName('');
    setPkgFormDescription('');
  };

  // 패키지 생성 모드
  const startCreatePackage = () => {
    resetPackageForm();
    setIsCreatingPackage(true);
  };

  // 패키지 수정 모드
  const startEditPackage = (pkg: Package) => {
    setEditingPackageId(pkg.id);
    setIsCreatingPackage(false);
    setPkgFormName(pkg.name);
    setPkgFormPackageName(pkg.packageName);
    setPkgFormDescription(pkg.description || '');
  };

  // 패키지 생성
  const handleCreatePackage = async () => {
    if (!pkgFormName.trim() || !pkgFormPackageName.trim()) {
      alert('이름과 패키지명은 필수입니다.');
      return;
    }

    try {
      await axios.post(`${API_BASE}/api/packages`, {
        name: pkgFormName,
        packageName: pkgFormPackageName,
        description: pkgFormDescription,
      });
      fetchPackages();
      resetPackageForm();
      onPackagesChange?.();
    } catch (err) {
      const error = err as { response?: { data?: { message?: string } } };
      alert('생성 실패: ' + (error.response?.data?.message || '알 수 없는 에러'));
    }
  };

  // 패키지 수정
  const handleUpdatePackage = async () => {
    if (!editingPackageId || !pkgFormName.trim() || !pkgFormPackageName.trim()) {
      alert('이름과 패키지명은 필수입니다.');
      return;
    }

    try {
      await axios.put(`${API_BASE}/api/packages/${editingPackageId}`, {
        name: pkgFormName,
        packageName: pkgFormPackageName,
        description: pkgFormDescription,
      });
      fetchPackages();
      resetPackageForm();
      onPackagesChange?.();
    } catch (err) {
      const error = err as { response?: { data?: { message?: string } } };
      alert('수정 실패: ' + (error.response?.data?.message || '알 수 없는 에러'));
    }
  };

  // 패키지 삭제
  const handleDeletePackage = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('이 패키지를 삭제하시겠습니까?\n(시나리오와 템플릿도 함께 삭제됩니다)')) return;

    try {
      await axios.delete(`${API_BASE}/api/packages/${id}`);
      fetchPackages();
      if (editingPackageId === id) {
        resetPackageForm();
      }
      onPackagesChange?.();
    } catch (err) {
      const error = err as { response?: { data?: { message?: string } } };
      alert('삭제 실패: ' + (error.response?.data?.message || '알 수 없는 에러'));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="package-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>패키지 관리</h2>
          <button className="modal-close" onClick={onClose}>X</button>
        </div>

        <div className="modal-body">
          <div className="package-manage">
            <div className="package-list-section">
              <div className="section-header">
                <span>패키지 목록</span>
                <button className="btn-add" onClick={startCreatePackage}>
                  + 추가
                </button>
              </div>

              {loading ? (
                <div className="list-loading">불러오는 중...</div>
              ) : packages.length === 0 ? (
                <div className="list-empty">
                  <p>등록된 패키지가 없습니다.</p>
                  <p>'+ 추가' 버튼을 클릭하여 패키지를 생성하세요.</p>
                </div>
              ) : (
                <div className="package-list">
                  {packages.map((pkg) => (
                    <div
                      key={pkg.id}
                      className={`package-item ${editingPackageId === pkg.id ? 'selected' : ''}`}
                    >
                      <div className="package-info">
                        <div className="package-info-text">
                          <div className="package-name">{pkg.name}</div>
                          <div className="package-id">{pkg.packageName}</div>
                        </div>
                        {pkg.scenarioCount !== undefined && pkg.scenarioCount > 0 && (
                          <div className="package-count">{pkg.scenarioCount}개</div>
                        )}
                      </div>
                      <div className="package-item-actions">
                        <button
                          className="btn-edit"
                          onClick={() => startEditPackage(pkg)}
                        >
                          수정
                        </button>
                        <button
                          className="btn-delete"
                          onClick={(e) => handleDeletePackage(pkg.id, e)}
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {(isCreatingPackage || editingPackageId) && (
              <div className="package-form-section">
                <h4>{isCreatingPackage ? '패키지 생성' : '패키지 수정'}</h4>
                <div className="form-field">
                  <label>표시 이름 *</label>
                  <input
                    type="text"
                    value={pkgFormName}
                    onChange={(e) => setPkgFormName(e.target.value)}
                    placeholder="예: 게임 A"
                  />
                </div>
                <div className="form-field">
                  <label>Android 패키지명 *</label>
                  <input
                    type="text"
                    value={pkgFormPackageName}
                    onChange={(e) => setPkgFormPackageName(e.target.value)}
                    placeholder="예: com.company.game"
                  />
                </div>
                <div className="form-field">
                  <label>설명</label>
                  <textarea
                    value={pkgFormDescription}
                    onChange={(e) => setPkgFormDescription(e.target.value)}
                    placeholder="패키지 설명..."
                    rows={2}
                  />
                </div>
                <div className="form-actions">
                  <button className="btn-cancel" onClick={resetPackageForm}>
                    취소
                  </button>
                  <button
                    className="btn-primary"
                    onClick={isCreatingPackage ? handleCreatePackage : handleUpdatePackage}
                    disabled={!pkgFormName.trim() || !pkgFormPackageName.trim()}
                  >
                    {isCreatingPackage ? '생성' : '저장'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-cancel" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

export default PackageModal;
