// frontend/src/components/ScenarioSaveModal/ScenarioSaveModal.tsx

import { useState, useEffect } from 'react';
import type { FlowNode, Connection } from '../../types';
import useScenarioTree, { TreeNode } from '../../hooks/useScenarioTree';
import ScenarioTreePanel from '../ScenarioTreePanel';
import { apiClient, API_BASE_URL } from '../../config/api';
import './ScenarioSaveModal.css';

interface ScenarioSaveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveComplete: (scenarioId: string, scenarioName: string, packageId: string, categoryId: string) => void;
  currentNodes: FlowNode[];
  currentConnections: Connection[];
  selectedPackageId?: string;
  selectedCategoryId?: string;
}

// 컨텍스트 메뉴 상태
interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  node: TreeNode | null;
}

function ScenarioSaveModal({
  isOpen,
  onClose,
  onSaveComplete,
  currentNodes,
  currentConnections,
  selectedPackageId: externalPackageId,
  selectedCategoryId: externalCategoryId,
}: ScenarioSaveModalProps) {
  // 트리 훅 사용
  const tree = useScenarioTree({
    initialPackageId: externalPackageId,
    initialCategoryId: externalCategoryId,
  });

  // 선택된 위치
  const [selectedPackageId, setSelectedPackageId] = useState<string>('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [selectedPackageName, setSelectedPackageName] = useState<string>('');
  const [selectedCategoryName, setSelectedCategoryName] = useState<string>('');

  // 저장 폼
  const [saveName, setSaveName] = useState<string>('');
  const [saveDesc, setSaveDesc] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);

  // 컨텍스트 메뉴 상태
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    node: null,
  });

  // 새 카테고리 입력 상태
  const [newCategoryInput, setNewCategoryInput] = useState<{
    visible: boolean;
    packageId: string;
    value: string;
  }>({ visible: false, packageId: '', value: '' });

  // 카테고리 이름 변경 상태
  const [renameInput, setRenameInput] = useState<{
    visible: boolean;
    categoryId: string;
    packageId: string;
    value: string;
  }>({ visible: false, categoryId: '', packageId: '', value: '' });

  // 모달 열릴 때 초기화
  useEffect(() => {
    if (isOpen) {
      tree.loadTreeData();
      tree.reset();
      setSaveName('');
      setSaveDesc('');

      if (externalPackageId) {
        setSelectedPackageId(externalPackageId);
      }
      if (externalCategoryId) {
        setSelectedCategoryId(externalCategoryId);
      }
    }
  }, [isOpen, externalPackageId, externalCategoryId]);

  // 선택된 패키지/카테고리 이름 업데이트
  useEffect(() => {
    if (selectedPackageId && tree.treeData.length > 0) {
      const pkg = tree.treeData.find((n) => n.packageId === selectedPackageId);
      setSelectedPackageName(pkg?.name || '');

      if (selectedCategoryId && pkg?.children) {
        const cat = pkg.children.find((n) => n.categoryId === selectedCategoryId);
        setSelectedCategoryName(cat?.name || '');
      } else {
        setSelectedCategoryName('');
      }
    } else {
      setSelectedPackageName('');
      setSelectedCategoryName('');
    }
  }, [selectedPackageId, selectedCategoryId, tree.treeData]);

  // 클릭 또는 ESC 키로 컨텍스트 메뉴 닫기
  useEffect(() => {
    if (!contextMenu.visible) return;

    const handleClose = () => {
      setContextMenu((prev) => ({ ...prev, visible: false }));
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    document.addEventListener('mousedown', handleClose);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClose);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenu.visible]);

  // 노드 클릭 핸들러
  const handleNodeClick = (node: TreeNode) => {
    if (node.type === 'package') {
      tree.toggleExpand(node.id);
    } else if (node.type === 'category') {
      tree.toggleExpand(node.id);
      setSelectedPackageId(node.packageId || '');
      setSelectedCategoryId(node.categoryId || '');
    } else if (node.type === 'scenario') {
      setSelectedPackageId(node.packageId || '');
      setSelectedCategoryId(node.categoryId || '');
    }
  };

  // 우클릭 핸들러 (컨텍스트 메뉴)
  const handleContextMenu = (e: React.MouseEvent, node: TreeNode) => {
    e.preventDefault();
    e.stopPropagation();

    if (node.type === 'scenario') return;

    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      node,
    });
  };

  // 새 카테고리 생성 시작
  const handleNewCategory = (packageId: string) => {
    tree.expandNode(`pkg-${packageId}`);
    setNewCategoryInput({
      visible: true,
      packageId,
      value: '',
    });
    setContextMenu({ visible: false, x: 0, y: 0, node: null });
  };

  // 새 카테고리 생성 확인
  const handleNewCategorySubmit = async () => {
    if (!newCategoryInput.value.trim() || !newCategoryInput.packageId) return;

    try {
      await apiClient.post(`${API_BASE_URL}/api/categories`, {
        packageId: newCategoryInput.packageId,
        name: newCategoryInput.value.trim(),
      });

      setNewCategoryInput({ visible: false, packageId: '', value: '' });
      await tree.loadTreeData();
    } catch (err) {
      const error = err as { response?: { data?: { message?: string } } };
      alert('카테고리 생성 실패: ' + (error.response?.data?.message || '알 수 없는 에러'));
    }
  };

  // 카테고리 이름 변경 시작
  const handleRenameCategory = () => {
    if (!contextMenu.node?.categoryId || !contextMenu.node?.packageId) return;

    setRenameInput({
      visible: true,
      categoryId: contextMenu.node.categoryId,
      packageId: contextMenu.node.packageId,
      value: contextMenu.node.name,
    });
    setContextMenu({ visible: false, x: 0, y: 0, node: null });
  };

  // 카테고리 이름 변경 확인
  const handleRenameSubmit = async () => {
    if (!renameInput.value.trim() || !renameInput.categoryId || !renameInput.packageId) return;

    try {
      await apiClient.put(
        `${API_BASE_URL}/api/categories/${renameInput.packageId}/${renameInput.categoryId}`,
        { name: renameInput.value.trim() },
      );

      setRenameInput({ visible: false, categoryId: '', packageId: '', value: '' });
      await tree.loadTreeData();
    } catch (err) {
      const error = err as { response?: { data?: { message?: string } } };
      alert('이름 변경 실패: ' + (error.response?.data?.message || '알 수 없는 에러'));
    }
  };

  // 카테고리 삭제
  const handleDeleteCategory = async () => {
    if (!contextMenu.node?.categoryId || !contextMenu.node?.packageId) return;

    const hasChildren = contextMenu.node.children && contextMenu.node.children.length > 0;
    if (hasChildren) {
      alert('시나리오가 있는 카테고리는 삭제할 수 없습니다.');
      setContextMenu({ visible: false, x: 0, y: 0, node: null });
      return;
    }

    if (!window.confirm(`카테고리 "${contextMenu.node.name}"을(를) 삭제하시겠습니까?`)) {
      setContextMenu({ visible: false, x: 0, y: 0, node: null });
      return;
    }

    try {
      await apiClient.delete(
        `${API_BASE_URL}/api/categories/${contextMenu.node.packageId}/${contextMenu.node.categoryId}`,
      );

      setContextMenu({ visible: false, x: 0, y: 0, node: null });
      await tree.loadTreeData();
    } catch (err) {
      const error = err as { response?: { data?: { message?: string } } };
      alert('삭제 실패: ' + (error.response?.data?.message || '알 수 없는 에러'));
    }
  };

  // 시나리오 저장
  const handleSave = async () => {
    if (!saveName.trim()) {
      alert('시나리오 이름을 입력해주세요.');
      return;
    }

    if (!selectedPackageId || !selectedCategoryId) {
      alert('저장할 위치(카테고리)를 선택해주세요.');
      return;
    }

    setSaving(true);
    try {
      const res = await apiClient.post<{ data: { id: string } }>(`${API_BASE_URL}/api/scenarios`, {
        name: saveName,
        description: saveDesc,
        packageId: selectedPackageId,
        categoryId: selectedCategoryId,
        nodes: currentNodes,
        connections: currentConnections,
      });

      alert('저장되었습니다!');
      onSaveComplete(res.data.data.id, saveName, selectedPackageId, selectedCategoryId);
      onClose();
    } catch (err) {
      const error = err as { response?: { data?: { message?: string } } };
      alert('저장 실패: ' + (error.response?.data?.message || '알 수 없는 에러'));
    } finally {
      setSaving(false);
    }
  };

  // 패키지 노드에 추가 버튼 렌더링
  const renderNodeExtra = (node: TreeNode) => {
    if (node.type === 'package') {
      return (
        <button
          className="tree-add-btn"
          onClick={(e) => {
            e.stopPropagation();
            handleNewCategory(node.packageId || '');
          }}
          title="새 카테고리 추가"
        >
          +
        </button>
      );
    }
    return null;
  };

  // 새 카테고리 입력 UI 렌더링
  const renderNewCategoryInput = (node: TreeNode, depth: number) => {
    const showNewCategoryInput = newCategoryInput.visible && node.packageId === newCategoryInput.packageId;
    if (!showNewCategoryInput) return null;

    return (
      <div className="tree-node new-category-input" style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}>
        <span className="tree-expand-icon" />
        <span className="tree-node-icon">📁</span>
        <input
          type="text"
          className="tree-inline-input"
          placeholder="새 카테고리 이름"
          value={newCategoryInput.value}
          onChange={(e) => setNewCategoryInput((prev) => ({ ...prev, value: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleNewCategorySubmit();
            if (e.key === 'Escape') setNewCategoryInput({ visible: false, packageId: '', value: '' });
          }}
          onBlur={() => setNewCategoryInput({ visible: false, packageId: '', value: '' })}
          autoFocus
        />
      </div>
    );
  };

  // 빈 패키지 상태 렌더링
  const renderEmptyPackage = (node: TreeNode, depth: number) => {
    const showNewCategoryInput = newCategoryInput.visible && node.packageId === newCategoryInput.packageId;

    return (
      <>
        {renderNewCategoryInput(node, depth)}
        {!showNewCategoryInput && (
          <div className="tree-empty-package" style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}>
            <span>카테고리가 없습니다.</span>
            <button
              className="tree-empty-add-btn"
              onClick={() => handleNewCategory(node.packageId || '')}
            >
              + 카테고리 추가
            </button>
          </div>
        )}
      </>
    );
  };

  // 패키지에 카테고리가 있을 때 푸터 (새 카테고리 입력)
  const renderPackageFooter = (node: TreeNode, depth: number) => {
    return renderNewCategoryInput(node, depth);
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="scenario-save-modal tree-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>시나리오 저장</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body tree-layout">
          {/* 왼쪽: 폴더 트리 */}
          <div className="tree-panel-wrapper">
            <ScenarioTreePanel
              treeData={tree.treeData}
              expandedNodes={tree.expandedNodes}
              loading={tree.loading}
              searchQuery={tree.searchQuery}
              dragState={tree.dragState}
              selectedNodeId={selectedCategoryId}
              selectedType="category"
              title="저장 위치 선택"
              hint="드래그: 이동 | 우클릭: 메뉴"
              dragHint="카테고리에 드롭하세요"
              onNodeClick={handleNodeClick}
              onContextMenu={handleContextMenu}
              onSearchChange={tree.setSearchQuery}
              onSearchClear={tree.clearSearch}
              onDragStart={tree.handleDragStart}
              onDragOver={tree.handleDragOver}
              onDragLeave={tree.handleDragLeave}
              onDrop={tree.handleDrop}
              onDragEnd={tree.handleDragEnd}
              nodeOrChildrenMatch={tree.nodeOrChildrenMatch}
              highlightText={tree.highlightText}
              renderNodeExtra={renderNodeExtra}
              renderEmptyPackage={renderEmptyPackage}
              renderPackageFooter={renderPackageFooter}
            />
          </div>

          {/* 오른쪽: 저장 폼 */}
          <div className="save-panel">
            <div className="save-form">
              {/* 선택된 위치 표시 */}
              <div className="selected-path">
                <label>저장 위치</label>
                <div className="path-display">
                  {selectedPackageName && selectedCategoryName ? (
                    <>
                      <span className="path-pkg">📦 {selectedPackageName}</span>
                      <span className="path-sep">/</span>
                      <span className="path-cat">📁 {selectedCategoryName}</span>
                    </>
                  ) : (
                    <span className="path-empty">왼쪽 트리에서 카테고리를 선택하세요</span>
                  )}
                </div>
              </div>

              <div className="form-field">
                <label>시나리오 이름 *</label>
                <input
                  type="text"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="예: TC001_로그인_테스트"
                  autoFocus
                />
              </div>

              <div className="form-field">
                <label>설명 (선택)</label>
                <textarea
                  value={saveDesc}
                  onChange={(e) => setSaveDesc(e.target.value)}
                  placeholder="시나리오에 대한 설명..."
                  rows={4}
                />
              </div>

              <div className="save-info">
                <p>💾 노드 {currentNodes.length}개, 연결 {currentConnections.length}개가 저장됩니다.</p>
              </div>
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
            disabled={!saveName.trim() || !selectedPackageId || !selectedCategoryId || saving}
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>

        {/* 컨텍스트 메뉴 */}
        {contextMenu.visible && contextMenu.node && (
          <div
            className="tree-context-menu"
            style={{ top: contextMenu.y, left: contextMenu.x }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {contextMenu.node.type === 'package' && (
              <div className="context-menu-item" onClick={() => handleNewCategory(contextMenu.node!.packageId || '')}>
                <span className="context-menu-icon">➕</span>
                <span>새 카테고리</span>
              </div>
            )}
            {contextMenu.node.type === 'category' && (
              <>
                <div className="context-menu-item" onClick={handleRenameCategory}>
                  <span className="context-menu-icon">✏️</span>
                  <span>이름 변경</span>
                </div>
                <div className="context-menu-item danger" onClick={handleDeleteCategory}>
                  <span className="context-menu-icon">🗑️</span>
                  <span>삭제</span>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default ScenarioSaveModal;
