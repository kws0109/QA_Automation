// frontend/src/components/PackageModal/PackageModal.tsx

import { useState, useEffect } from 'react';
import type { Package } from '../../types';
import { apiClient, API_BASE_URL } from '../../config/api';
import './PackageModal.css';

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
      const res = await apiClient.get<{ data: Package[] }>(`${API_BASE_URL}/api/packages`);
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
      await apiClient.post(`${API_BASE_URL}/api/packages`, {
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
      await apiClient.put(`${API_BASE_URL}/api/packages/${editingPackageId}`, {
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
      await apiClient.delete(`${API_BASE_URL}/api/packages/${id}`);
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
          <div className="modal-header-title">
            <span className="modal-header-icon">📦</span>
            <h2>패키지 관리</h2>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <div className="package-manage">
            {/* 왼쪽: 패키지 목록 */}
            <div className="package-list-section">
              <div className="section-header">
                <span className="section-title">패키지 목록</span>
                <button className="btn-add" onClick={startCreatePackage}>
                  + 새 패키지
                </button>
              </div>

              {loading ? (
                <div className="list-loading">
                  <p>불러오는 중...</p>
                </div>
              ) : packages.length === 0 ? (
                <div className="list-empty">
                  <div className="empty-icon">📦</div>
                  <p>등록된 패키지가 없습니다</p>
                  <p className="hint">'+ 새 패키지' 버튼을 클릭하여 패키지를 생성하세요</p>
                </div>
              ) : (
                <div className="package-list">
                  {packages.map((pkg) => (
                    <div
                      key={pkg.id}
                      className={`package-item ${editingPackageId === pkg.id ? 'selected' : ''}`}
                    >
                      <div className="package-info">
                        <span className="package-icon">📦</span>
                        <div className="package-info-text">
                          <div className="package-name">{pkg.name}</div>
                          <div className="package-id">{pkg.packageName}</div>
                        </div>
                        {pkg.scenarioCount !== undefined && pkg.scenarioCount > 0 && (
                          <div className="package-count">시나리오 {pkg.scenarioCount}개</div>
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

            {/* 오른쪽: 패키지 폼 */}
            {(isCreatingPackage || editingPackageId) && (
              <div className="package-form-section">
                <h4>{isCreatingPackage ? '새 패키지 생성' : '패키지 수정'}</h4>
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
                  <label>설명 (선택)</label>
                  <textarea
                    value={pkgFormDescription}
                    onChange={(e) => setPkgFormDescription(e.target.value)}
                    placeholder="패키지에 대한 설명을 입력하세요"
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
