// frontend/src/components/ScenarioLoadModal/ScenarioLoadModal.tsx

import { useState, useEffect } from 'react';
import axios from 'axios';
import type { Scenario, ScenarioSummary } from '../../types';
import useScenarioTree, { TreeNode } from '../../hooks/useScenarioTree';
import ScenarioTreePanel from '../ScenarioTreePanel';
import './ScenarioLoadModal.css';

const API_BASE = 'http://localhost:3001';

interface ScenarioLoadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoad: (scenario: Scenario) => void;
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

function ScenarioLoadModal({
  isOpen,
  onClose,
  onLoad,
  selectedPackageId: externalPackageId,
  selectedCategoryId: externalCategoryId,
}: ScenarioLoadModalProps) {
  // 트리 훅 사용
  const tree = useScenarioTree({
    initialPackageId: externalPackageId,
    initialCategoryId: externalCategoryId,
  });

  // 선택된 시나리오
  const [selectedScenario, setSelectedScenario] = useState<ScenarioSummary | null>(null);

  // 컨텍스트 메뉴 상태
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    node: null,
  });

  // 모달 열릴 때 초기화
  useEffect(() => {
    if (isOpen) {
      tree.loadTreeData();
      tree.reset();
      setSelectedScenario(null);
    }
  }, [isOpen]);

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
    if (node.type === 'package' || node.type === 'category') {
      tree.toggleExpand(node.id);
    } else if (node.type === 'scenario' && node.scenarioData) {
      setSelectedScenario(node.scenarioData);
    }
  };

  // 시나리오 더블클릭 - 바로 불러오기
  const handleNodeDoubleClick = async (node: TreeNode) => {
    if (node.type === 'scenario' && node.scenarioData) {
      await handleLoad(node.scenarioData.id);
    }
  };

  // 우클릭 핸들러 (컨텍스트 메뉴)
  const handleContextMenu = (e: React.MouseEvent, node: TreeNode) => {
    e.preventDefault();
    e.stopPropagation();

    if (node.type !== 'scenario') return;

    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      node,
    });
  };

  // 시나리오 불러오기
  const handleLoad = async (scenarioId?: string) => {
    const id = scenarioId || selectedScenario?.id;
    if (!id) return;

    try {
      const res = await axios.get<{ data: Scenario }>(`${API_BASE}/api/scenarios/${id}`);
      onLoad(res.data.data);
      onClose();
    } catch (err) {
      const error = err as Error;
      alert('불러오기 실패: ' + error.message);
    }
  };

  // 시나리오 삭제
  const handleDelete = async () => {
    if (!selectedScenario) return;
    if (!window.confirm(`"${selectedScenario.name}" 시나리오를 삭제하시겠습니까?`)) return;

    try {
      await axios.delete(`${API_BASE}/api/scenarios/${selectedScenario.id}`);
      setSelectedScenario(null);
      await tree.loadTreeData();
    } catch (err) {
      const error = err as Error;
      alert('삭제 실패: ' + error.message);
    }
  };

  // 시나리오 복제
  const handleDuplicate = async () => {
    if (!selectedScenario) return;

    try {
      await axios.post(`${API_BASE}/api/scenarios/${selectedScenario.id}/duplicate`);
      await tree.loadTreeData();
    } catch (err) {
      const error = err as Error;
      alert('복제 실패: ' + error.message);
    }
  };

  // 컨텍스트 메뉴 액션들
  const handleContextLoad = async () => {
    if (!contextMenu.node?.scenarioData) return;
    setContextMenu({ visible: false, x: 0, y: 0, node: null });
    await handleLoad(contextMenu.node.scenarioData.id);
  };

  const handleContextDuplicate = async () => {
    if (!contextMenu.node?.scenarioData) return;
    const scenario = contextMenu.node.scenarioData;
    setContextMenu({ visible: false, x: 0, y: 0, node: null });

    try {
      await axios.post(`${API_BASE}/api/scenarios/${scenario.id}/duplicate`);
      await tree.loadTreeData();
    } catch (err) {
      const error = err as Error;
      alert('복제 실패: ' + error.message);
    }
  };

  const handleContextDelete = async () => {
    if (!contextMenu.node?.scenarioData) return;
    const scenario = contextMenu.node.scenarioData;
    setContextMenu({ visible: false, x: 0, y: 0, node: null });

    if (!window.confirm(`"${scenario.name}" 시나리오를 삭제하시겠습니까?`)) return;

    try {
      await axios.delete(`${API_BASE}/api/scenarios/${scenario.id}`);
      if (selectedScenario?.id === scenario.id) {
        setSelectedScenario(null);
      }
      await tree.loadTreeData();
    } catch (err) {
      const error = err as Error;
      alert('삭제 실패: ' + error.message);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="scenario-load-modal tree-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>시나리오 불러오기</h2>
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
              selectedNodeId={selectedScenario?.id}
              selectedType="scenario"
              title="시나리오 선택"
              hint="더블클릭: 열기 | 드래그: 이동 | 우클릭: 메뉴"
              dragHint="카테고리에 드롭하세요"
              onNodeClick={handleNodeClick}
              onNodeDoubleClick={handleNodeDoubleClick}
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
            />
          </div>

          {/* 오른쪽: 시나리오 상세 */}
          <div className="detail-panel">
            {selectedScenario ? (
              <div className="scenario-detail">
                <div className="detail-header">
                  <h3>{selectedScenario.name}</h3>
                  <div className="detail-path">
                    <span className="path-pkg">📦 {selectedScenario.packageName}</span>
                    <span className="path-sep">/</span>
                    <span className="path-cat">📁 {selectedScenario.categoryName}</span>
                  </div>
                </div>

                <div className="detail-info">
                  <div className="info-row">
                    <span className="info-label">노드 수</span>
                    <span className="info-value">{selectedScenario.nodeCount}개</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">생성일</span>
                    <span className="info-value">
                      {new Date(selectedScenario.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">수정일</span>
                    <span className="info-value">
                      {new Date(selectedScenario.updatedAt).toLocaleString()}
                    </span>
                  </div>
                  {selectedScenario.description && (
                    <div className="info-row description">
                      <span className="info-label">설명</span>
                      <span className="info-value">{selectedScenario.description}</span>
                    </div>
                  )}
                </div>

                <div className="detail-actions" style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                  <button
                    onClick={handleDuplicate}
                    style={{
                      padding: '10px 16px',
                      backgroundColor: '#45475a',
                      border: '1px solid #585b70',
                      borderRadius: '6px',
                      color: '#cdd6f4',
                      fontSize: '13px',
                      cursor: 'pointer',
                    }}
                  >
                    📋 복제
                  </button>
                  <button
                    onClick={handleDelete}
                    style={{
                      padding: '10px 16px',
                      backgroundColor: '#f38ba833',
                      border: '1px solid #f38ba8',
                      borderRadius: '6px',
                      color: '#f38ba8',
                      fontSize: '13px',
                      cursor: 'pointer',
                    }}
                  >
                    🗑️ 삭제
                  </button>
                </div>
              </div>
            ) : (
              <div className="detail-empty">
                <p>📄</p>
                <p>왼쪽 트리에서 시나리오를 선택하세요</p>
                <p className="hint">더블클릭하면 바로 불러옵니다</p>
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-cancel" onClick={onClose}>
            취소
          </button>
          <button
            className="btn-primary"
            onClick={() => handleLoad()}
            disabled={!selectedScenario}
          >
            불러오기
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
            <div className="context-menu-item" onClick={handleContextLoad}>
              <span className="context-menu-icon">📂</span>
              <span>불러오기</span>
            </div>
            <div className="context-menu-item" onClick={handleContextDuplicate}>
              <span className="context-menu-icon">📋</span>
              <span>복제</span>
            </div>
            <div className="context-menu-item danger" onClick={handleContextDelete}>
              <span className="context-menu-icon">🗑️</span>
              <span>삭제</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ScenarioLoadModal;
