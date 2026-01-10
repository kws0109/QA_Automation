// frontend/src/components/ScenarioTreePanel/ScenarioTreePanel.tsx

import React from 'react';
import type { TreeNode, DragState } from '../../hooks/useScenarioTree';
import './ScenarioTreePanel.css';

interface ScenarioTreePanelProps {
  // 상태
  treeData: TreeNode[];
  expandedNodes: Set<string>;
  loading: boolean;
  searchQuery: string;
  dragState: DragState;

  // 선택 상태
  selectedNodeId?: string;
  selectedType?: 'package' | 'category' | 'scenario';

  // 헤더
  title: string;
  hint?: string;
  dragHint?: string;

  // 이벤트 핸들러
  onNodeClick: (node: TreeNode) => void;
  onNodeDoubleClick?: (node: TreeNode) => void;
  onContextMenu?: (e: React.MouseEvent, node: TreeNode) => void;
  onSearchChange: (query: string) => void;
  onSearchClear: () => void;

  // 드래그 핸들러
  onDragStart: (e: React.DragEvent, node: TreeNode) => void;
  onDragOver: (e: React.DragEvent, node: TreeNode) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, node: TreeNode) => void;
  onDragEnd: () => void;

  // 유틸리티
  nodeOrChildrenMatch: (node: TreeNode, query: string) => boolean;
  highlightText: (text: string, query: string) => React.ReactNode;

  // 추가 렌더링
  renderNodeExtra?: (node: TreeNode, depth: number) => React.ReactNode;
  renderEmptyPackage?: (node: TreeNode, depth: number) => React.ReactNode;
  renderEmptyCategory?: (node: TreeNode, depth: number) => React.ReactNode;
  renderPackageFooter?: (node: TreeNode, depth: number) => React.ReactNode;
}

function ScenarioTreePanel({
  treeData,
  expandedNodes,
  loading,
  searchQuery,
  dragState,
  selectedNodeId,
  selectedType,
  title,
  hint,
  dragHint,
  onNodeClick,
  onNodeDoubleClick,
  onContextMenu,
  onSearchChange,
  onSearchClear,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  nodeOrChildrenMatch,
  highlightText,
  renderNodeExtra,
  renderEmptyPackage,
  renderEmptyCategory,
  renderPackageFooter,
}: ScenarioTreePanelProps) {
  // 노드가 선택되었는지 확인
  const isNodeSelected = (node: TreeNode): boolean => {
    if (!selectedNodeId || !selectedType) return false;
    if (selectedType === 'scenario' && node.type === 'scenario') {
      return node.scenarioData?.id === selectedNodeId;
    }
    if (selectedType === 'category' && node.type === 'category') {
      return node.categoryId === selectedNodeId;
    }
    return false;
  };

  // 트리 노드 렌더링
  const renderTreeNode = (node: TreeNode, depth: number = 0): React.ReactNode => {
    const isExpanded = expandedNodes.has(node.id);
    const hasChildren = node.children && node.children.length > 0;
    const isSelected = isNodeSelected(node);

    // 드래그 관련 상태
    const isDragging = dragState.isDragging && dragState.draggedNode?.id === node.id;
    const isDropTarget = dragState.dropTargetId === node.id;
    const canDrag = node.type === 'scenario';
    const canDrop = node.type === 'category' && dragState.isDragging;

    return (
      <div key={node.id} className="tree-node-wrapper">
        <div
          className={`tree-node ${node.type} ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''} ${isDropTarget ? 'drop-target' : ''}`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => onNodeClick(node)}
          onDoubleClick={onNodeDoubleClick ? () => onNodeDoubleClick(node) : undefined}
          onContextMenu={onContextMenu ? (e) => onContextMenu(e, node) : undefined}
          draggable={canDrag}
          onDragStart={canDrag ? (e) => onDragStart(e, node) : undefined}
          onDragOver={canDrop ? (e) => onDragOver(e, node) : undefined}
          onDragLeave={canDrop ? onDragLeave : undefined}
          onDrop={canDrop ? (e) => onDrop(e, node) : undefined}
          onDragEnd={canDrag ? onDragEnd : undefined}
        >
          {/* 확장/축소 아이콘 */}
          <span className="tree-expand-icon">
            {node.type !== 'scenario' ? (
              hasChildren || node.type === 'package' ? (
                isExpanded ? '▼' : '▶'
              ) : (
                <span style={{ width: '12px', display: 'inline-block' }} />
              )
            ) : (
              <span style={{ width: '12px', display: 'inline-block' }} />
            )}
          </span>

          {/* 노드 아이콘 */}
          <span className="tree-node-icon">
            {node.type === 'package' && '📦'}
            {node.type === 'category' && (isExpanded ? '📂' : '📁')}
            {node.type === 'scenario' && '📄'}
          </span>

          {/* 노드 이름 */}
          <span className="tree-node-name">
            {highlightText(node.name, searchQuery)}
            {node.type === 'package' && node.packageName && (
              <span className="tree-node-sub">({highlightText(node.packageName, searchQuery)})</span>
            )}
          </span>

          {/* 자식 개수 표시 */}
          {node.type !== 'scenario' && (
            <span className="tree-node-count">
              {node.children?.length || 0}
            </span>
          )}

          {/* 시나리오 노드 개수 표시 */}
          {node.type === 'scenario' && node.scenarioData && (
            <span className="tree-node-meta">
              {node.scenarioData.nodeCount}개 노드
            </span>
          )}

          {/* 추가 렌더링 (버튼 등) */}
          {renderNodeExtra && renderNodeExtra(node, depth)}
        </div>

        {/* 자식 노드 */}
        {isExpanded && (
          <div className="tree-children">
            {/* 패키지에 카테고리가 없을 때 */}
            {node.type === 'package' && !hasChildren && renderEmptyPackage && renderEmptyPackage(node, depth)}

            {/* 카테고리에 시나리오가 없을 때 */}
            {node.type === 'category' && !hasChildren && renderEmptyCategory && renderEmptyCategory(node, depth)}

            {/* 기본 빈 상태 메시지 */}
            {node.type === 'package' && !hasChildren && !renderEmptyPackage && (
              <div className="tree-empty-package" style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}>
                <span>카테고리가 없습니다.</span>
              </div>
            )}
            {node.type === 'category' && !hasChildren && !renderEmptyCategory && (
              <div className="tree-empty-category" style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}>
                <span>시나리오가 없습니다.</span>
              </div>
            )}

            {hasChildren && node.children!
              .filter((child) => nodeOrChildrenMatch(child, searchQuery))
              .map((child) => renderTreeNode(child, depth + 1))}

            {/* 패키지에 자식이 있어도 푸터(새 카테고리 입력 등) 렌더링 */}
            {node.type === 'package' && hasChildren && renderPackageFooter && renderPackageFooter(node, depth)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="scenario-tree-panel">
      <div className="tree-panel-header">
        <span>{title}</span>
        <span className="tree-panel-hint">
          {dragState.isDragging ? (dragHint || '카테고리에 드롭하세요') : hint}
        </span>
      </div>

      {/* 검색 입력 */}
      <div className="tree-search">
        <span className="tree-search-icon">🔍</span>
        <input
          type="text"
          className="tree-search-input"
          placeholder="시나리오, 카테고리, 패키지 검색..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        {searchQuery && (
          <button className="tree-search-clear" onClick={onSearchClear}>
            ×
          </button>
        )}
      </div>

      <div className="tree-container">
        {loading ? (
          <div className="tree-loading">불러오는 중...</div>
        ) : treeData.length === 0 ? (
          <div className="tree-empty">
            <p>등록된 패키지가 없습니다.</p>
            <p>패키지 관리에서 먼저 생성하세요.</p>
          </div>
        ) : (
          treeData
            .filter((node) => nodeOrChildrenMatch(node, searchQuery))
            .map((node) => renderTreeNode(node))
        )}
        {searchQuery && treeData.filter((node) => nodeOrChildrenMatch(node, searchQuery)).length === 0 && (
          <div className="tree-no-results">
            <p>"{searchQuery}" 검색 결과가 없습니다.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default ScenarioTreePanel;
