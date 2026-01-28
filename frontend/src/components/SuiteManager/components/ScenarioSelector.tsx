// frontend/src/components/SuiteManager/components/ScenarioSelector.tsx
// 시나리오 선택 모달 (트리 구조)

import { ScenarioSelectorProps } from './types';
import { TreeNode } from '../../../hooks/useScenarioTree';
import { TestSuiteInput } from '../../../types';

// 트리 노드에서 모든 시나리오 ID 추출
function getScenarioIdsFromNode(node: TreeNode): string[] {
  if (node.type === 'scenario' && node.scenarioData) {
    return [node.scenarioData.id];
  }
  if (node.children) {
    return node.children.flatMap(child => getScenarioIdsFromNode(child));
  }
  return [];
}

// 노드의 모든 시나리오가 선택되었는지 확인
function isNodeAllSelected(node: TreeNode, selectedIds: string[]): boolean {
  const scenarioIds = getScenarioIdsFromNode(node);
  if (scenarioIds.length === 0) return false;
  return scenarioIds.every(id => selectedIds.includes(id));
}

// 노드의 일부 시나리오가 선택되었는지 확인
function isNodePartiallySelected(node: TreeNode, selectedIds: string[]): boolean {
  const scenarioIds = getScenarioIdsFromNode(node);
  if (scenarioIds.length === 0) return false;
  const selectedCount = scenarioIds.filter(id => selectedIds.includes(id)).length;
  return selectedCount > 0 && selectedCount < scenarioIds.length;
}

// 패키지/카테고리 전체 선택/해제 토글
function handleToggleNodeScenarios(
  node: TreeNode,
  editForm: TestSuiteInput,
  onToggleScenario: (scenarioId: string) => void
) {
  const scenarioIds = getScenarioIdsFromNode(node);
  if (scenarioIds.length === 0) return;

  const allSelected = isNodeAllSelected(node, editForm.scenarioIds);

  if (allSelected) {
    // 전체 해제
    scenarioIds.forEach(id => {
      if (editForm.scenarioIds.includes(id)) {
        onToggleScenario(id);
      }
    });
  } else {
    // 전체 선택
    scenarioIds.forEach(id => {
      if (!editForm.scenarioIds.includes(id)) {
        onToggleScenario(id);
      }
    });
  }
}

export default function ScenarioSelector({
  show,
  editForm,
  treeData,
  treeLoading,
  expandedNodes,
  treeSearchQuery,
  onClose,
  onToggleScenario,
  onToggleExpand,
  onSetSearchQuery,
  onClearSearch,
  onClearAll,
  nodeOrChildrenMatch,
  highlightText,
}: ScenarioSelectorProps) {
  if (!show) return null;

  return (
    <div className="selection-modal-overlay" onClick={onClose}>
      <div className="selection-modal scenario-tree-modal" onClick={e => e.stopPropagation()}>
        <div className="selection-modal-header">
          <h3>시나리오 선택</h3>
          <span className="selection-count">
            {editForm.scenarioIds.length}개 선택됨
          </span>
          <button className="selection-modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="selection-modal-search">
          <span className="tree-search-icon">🔍</span>
          <input
            type="text"
            placeholder="시나리오, 카테고리, 패키지 검색..."
            value={treeSearchQuery}
            onChange={e => onSetSearchQuery(e.target.value)}
          />
          {treeSearchQuery && (
            <button className="tree-search-clear" onClick={onClearSearch}>
              ×
            </button>
          )}
        </div>
        <div className="selection-modal-content tree-content">
          {treeLoading ? (
            <div className="tree-loading">불러오는 중...</div>
          ) : treeData.length === 0 ? (
            <div className="tree-empty">
              <p>등록된 패키지가 없습니다.</p>
            </div>
          ) : (
            treeData
              .filter(node => nodeOrChildrenMatch(node, treeSearchQuery))
              .map(packageNode => {
                const pkgExpanded = expandedNodes.has(packageNode.id);
                const pkgAllSelected = isNodeAllSelected(packageNode, editForm.scenarioIds);
                const pkgPartial = isNodePartiallySelected(packageNode, editForm.scenarioIds);
                const pkgScenarioCount = getScenarioIdsFromNode(packageNode).length;

                return (
                  <div key={packageNode.id} className="tree-node-wrapper">
                    {/* 패키지 노드 */}
                    <div className="tree-node package">
                      <span
                        className="tree-expand-icon"
                        onClick={() => onToggleExpand(packageNode.id)}
                      >
                        {pkgExpanded ? '▼' : '▶'}
                      </span>
                      <input
                        type="checkbox"
                        className="tree-checkbox"
                        checked={pkgAllSelected}
                        ref={el => {
                          if (el) el.indeterminate = pkgPartial;
                        }}
                        onChange={() => handleToggleNodeScenarios(packageNode, editForm, onToggleScenario)}
                      />
                      <span className="tree-node-icon">📦</span>
                      <span
                        className="tree-node-name"
                        onClick={() => onToggleExpand(packageNode.id)}
                      >
                        {highlightText(packageNode.name, treeSearchQuery)}
                      </span>
                      <span className="tree-node-count">{pkgScenarioCount}</span>
                    </div>

                    {/* 카테고리들 */}
                    {pkgExpanded && packageNode.children && (
                      <div className="tree-children">
                        {packageNode.children
                          .filter(catNode => nodeOrChildrenMatch(catNode, treeSearchQuery))
                          .map(categoryNode => {
                            const catExpanded = expandedNodes.has(categoryNode.id);
                            const catAllSelected = isNodeAllSelected(categoryNode, editForm.scenarioIds);
                            const catPartial = isNodePartiallySelected(categoryNode, editForm.scenarioIds);
                            const catScenarioCount = getScenarioIdsFromNode(categoryNode).length;

                            return (
                              <div key={categoryNode.id} className="tree-node-wrapper">
                                {/* 카테고리 노드 */}
                                <div className="tree-node category" style={{ paddingLeft: '24px' }}>
                                  <span
                                    className="tree-expand-icon"
                                    onClick={() => onToggleExpand(categoryNode.id)}
                                  >
                                    {categoryNode.children && categoryNode.children.length > 0
                                      ? (catExpanded ? '▼' : '▶')
                                      : <span style={{ width: '12px', display: 'inline-block' }} />
                                    }
                                  </span>
                                  <input
                                    type="checkbox"
                                    className="tree-checkbox"
                                    checked={catAllSelected}
                                    ref={el => {
                                      if (el) el.indeterminate = catPartial;
                                    }}
                                    onChange={() => handleToggleNodeScenarios(categoryNode, editForm, onToggleScenario)}
                                  />
                                  <span className="tree-node-icon">
                                    {catExpanded ? '📂' : '📁'}
                                  </span>
                                  <span
                                    className="tree-node-name"
                                    onClick={() => onToggleExpand(categoryNode.id)}
                                  >
                                    {highlightText(categoryNode.name, treeSearchQuery)}
                                  </span>
                                  <span className="tree-node-count">{catScenarioCount}</span>
                                </div>

                                {/* 시나리오들 */}
                                {catExpanded && categoryNode.children && (
                                  <div className="tree-children">
                                    {categoryNode.children
                                      .filter(scenNode => nodeOrChildrenMatch(scenNode, treeSearchQuery))
                                      .map(scenarioNode => {
                                        const scenarioId = scenarioNode.scenarioData?.id || '';
                                        const isSelected = editForm.scenarioIds.includes(scenarioId);

                                        return (
                                          <div
                                            key={scenarioNode.id}
                                            className={`tree-node scenario ${isSelected ? 'selected' : ''}`}
                                            style={{ paddingLeft: '48px' }}
                                            onClick={() => onToggleScenario(scenarioId)}
                                          >
                                            <span style={{ width: '12px', display: 'inline-block' }} />
                                            <input
                                              type="checkbox"
                                              className="tree-checkbox"
                                              checked={isSelected}
                                              onChange={() => {}}
                                            />
                                            <span className="tree-node-icon">📄</span>
                                            <span className="tree-node-name">
                                              {highlightText(scenarioNode.name, treeSearchQuery)}
                                            </span>
                                            {scenarioNode.scenarioData && (
                                              <span className="tree-node-meta">
                                                {scenarioNode.scenarioData.nodeCount}개 노드
                                              </span>
                                            )}
                                          </div>
                                        );
                                      })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </div>
                );
              })
          )}
          {treeSearchQuery && treeData.filter(node => nodeOrChildrenMatch(node, treeSearchQuery)).length === 0 && (
            <div className="tree-no-results">
              <p>"{treeSearchQuery}" 검색 결과가 없습니다.</p>
            </div>
          )}
        </div>
        <div className="selection-modal-footer">
          <button className="btn-secondary" onClick={onClearAll}>
            전체 해제
          </button>
          <button className="btn-primary" onClick={() => {
            onClose();
            onClearSearch();
          }}>
            확인 ({editForm.scenarioIds.length}개)
          </button>
        </div>
      </div>
    </div>
  );
}
