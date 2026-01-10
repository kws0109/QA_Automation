// frontend/src/components/TestExecutionPanel/ScenarioSelector.tsx
// WHAT 섹션: 테스트할 시나리오 선택 (패키지/카테고리 트리 구조)

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import type { Package, Category, ScenarioSummary } from '../../types';

const API_BASE = 'http://localhost:3001';

interface ScenarioSelectorProps {
  selectedScenarioIds: string[];
  onSelectionChange: (scenarioIds: string[]) => void;
  disabled?: boolean;
}

interface TreeData {
  packages: Package[];
  categories: Map<string, Category[]>;  // packageId -> categories
  scenarios: Map<string, ScenarioSummary[]>;  // categoryId -> scenarios
}

const ScenarioSelector: React.FC<ScenarioSelectorProps> = ({
  selectedScenarioIds,
  onSelectionChange,
  disabled = false,
}) => {
  const [treeData, setTreeData] = useState<TreeData>({
    packages: [],
    categories: new Map(),
    scenarios: new Map(),
  });
  const [expandedPackages, setExpandedPackages] = useState<Set<string>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // 트리 데이터 로드
  const loadTreeData = useCallback(async () => {
    setLoading(true);
    try {
      // 패키지 목록 로드
      const pkgRes = await axios.get<{ success: boolean; data: Package[] }>(
        `${API_BASE}/api/packages`
      );
      const packages = pkgRes.data.data || [];

      const categoriesMap = new Map<string, Category[]>();
      const scenariosMap = new Map<string, ScenarioSummary[]>();

      // 각 패키지별 카테고리 및 시나리오 로드
      for (const pkg of packages) {
        // 카테고리 로드
        const catRes = await axios.get<{ success: boolean; data: Category[] }>(
          `${API_BASE}/api/categories?packageId=${pkg.id}`
        );
        const categories = catRes.data.data || [];
        categoriesMap.set(pkg.id, categories);

        // 각 카테고리별 시나리오 로드
        for (const cat of categories) {
          const scenRes = await axios.get<{ success: boolean; data: ScenarioSummary[] }>(
            `${API_BASE}/api/scenarios?packageId=${pkg.id}&categoryId=${cat.id}`
          );
          const scenarios = scenRes.data.data || [];
          scenariosMap.set(cat.id, scenarios);
        }
      }

      setTreeData({
        packages,
        categories: categoriesMap,
        scenarios: scenariosMap,
      });

      // 첫 번째 패키지 자동 확장
      if (packages.length > 0) {
        setExpandedPackages(new Set([packages[0].id]));
      }
    } catch (err) {
      console.error('트리 데이터 로드 실패:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTreeData();
  }, [loadTreeData]);

  // 패키지 토글
  const togglePackage = (packageId: string) => {
    setExpandedPackages(prev => {
      const next = new Set(prev);
      if (next.has(packageId)) {
        next.delete(packageId);
      } else {
        next.add(packageId);
      }
      return next;
    });
  };

  // 카테고리 토글
  const toggleCategory = (categoryId: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

  // 시나리오 선택/해제
  const toggleScenario = (scenarioId: string) => {
    if (selectedScenarioIds.includes(scenarioId)) {
      onSelectionChange(selectedScenarioIds.filter(id => id !== scenarioId));
    } else {
      onSelectionChange([...selectedScenarioIds, scenarioId]);
    }
  };

  // 카테고리 전체 선택/해제
  const toggleCategoryAll = (categoryId: string) => {
    const scenarios = treeData.scenarios.get(categoryId) || [];
    const scenarioIds = scenarios.map(s => s.id);
    const allSelected = scenarioIds.every(id => selectedScenarioIds.includes(id));

    if (allSelected) {
      // 모두 해제
      onSelectionChange(selectedScenarioIds.filter(id => !scenarioIds.includes(id)));
    } else {
      // 모두 선택
      const newSelection = new Set([...selectedScenarioIds, ...scenarioIds]);
      onSelectionChange(Array.from(newSelection));
    }
  };

  // 패키지 전체 선택/해제
  const togglePackageAll = (packageId: string) => {
    const categories = treeData.categories.get(packageId) || [];
    const allScenarioIds: string[] = [];

    for (const cat of categories) {
      const scenarios = treeData.scenarios.get(cat.id) || [];
      allScenarioIds.push(...scenarios.map(s => s.id));
    }

    const allSelected = allScenarioIds.every(id => selectedScenarioIds.includes(id));

    if (allSelected) {
      onSelectionChange(selectedScenarioIds.filter(id => !allScenarioIds.includes(id)));
    } else {
      const newSelection = new Set([...selectedScenarioIds, ...allScenarioIds]);
      onSelectionChange(Array.from(newSelection));
    }
  };

  // 전체 선택
  const handleSelectAll = () => {
    const allIds: string[] = [];
    treeData.scenarios.forEach(scenarios => {
      allIds.push(...scenarios.map(s => s.id));
    });
    onSelectionChange(allIds);
  };

  // 전체 해제
  const handleDeselectAll = () => {
    onSelectionChange([]);
  };

  // 검색 필터링
  const filterScenarios = (scenarios: ScenarioSummary[]) => {
    if (!searchQuery) return scenarios;
    const query = searchQuery.toLowerCase();
    return scenarios.filter(s =>
      s.name.toLowerCase().includes(query) ||
      s.description?.toLowerCase().includes(query)
    );
  };

  // 카테고리가 검색 결과를 포함하는지 확인
  const categoryHasResults = (categoryId: string) => {
    const scenarios = treeData.scenarios.get(categoryId) || [];
    return filterScenarios(scenarios).length > 0;
  };

  // 패키지가 검색 결과를 포함하는지 확인
  const packageHasResults = (packageId: string) => {
    const categories = treeData.categories.get(packageId) || [];
    return categories.some(cat => categoryHasResults(cat.id));
  };

  if (loading) {
    return (
      <div className="scenario-selector execution-section">
        <div className="section-header">
          <h3>테스트 시나리오</h3>
        </div>
        <div className="section-content">
          <div className="tree-loading">시나리오 목록 로딩 중...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="scenario-selector execution-section">
      <div className="section-header">
        <h3>테스트 시나리오</h3>
        <div className="section-actions">
          <button
            type="button"
            onClick={handleSelectAll}
            disabled={disabled}
          >
            전체 선택
          </button>
          <button
            type="button"
            onClick={handleDeselectAll}
            disabled={disabled || selectedScenarioIds.length === 0}
          >
            전체 해제
          </button>
        </div>
      </div>

      <div className="section-content">
        <div className="search-box">
          <input
            type="text"
            placeholder="시나리오 검색..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            disabled={disabled}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="clear-btn"
            >
              X
            </button>
          )}
        </div>

        <div className="scenario-tree">
        {treeData.packages.length === 0 ? (
          <div className="empty-message">
            등록된 패키지가 없습니다. 패키지를 먼저 생성해주세요.
          </div>
        ) : (
          treeData.packages.map(pkg => {
            // 검색 중일 때 결과 없는 패키지 숨기기
            if (searchQuery && !packageHasResults(pkg.id)) {
              return null;
            }

            const categories = treeData.categories.get(pkg.id) || [];
            const isExpanded = expandedPackages.has(pkg.id);

            // 패키지 전체 선택 상태 계산
            const allPkgScenarioIds: string[] = [];
            categories.forEach(cat => {
              const scenarios = treeData.scenarios.get(cat.id) || [];
              allPkgScenarioIds.push(...scenarios.map(s => s.id));
            });
            const pkgAllSelected = allPkgScenarioIds.length > 0 &&
              allPkgScenarioIds.every(id => selectedScenarioIds.includes(id));
            const pkgPartialSelected = !pkgAllSelected &&
              allPkgScenarioIds.some(id => selectedScenarioIds.includes(id));

            return (
              <div key={pkg.id} className="tree-node package-node">
                <div className="node-header">
                  <button
                    type="button"
                    className="expand-btn"
                    onClick={() => togglePackage(pkg.id)}
                  >
                    {isExpanded ? '▼' : '▶'}
                  </button>
                  <span className="node-icon">📦</span>
                  <span className="node-name">{pkg.name}</span>
                  <span className="node-meta">({pkg.packageName})</span>
                  <button
                    type="button"
                    className={`select-all-btn ${pkgAllSelected ? 'selected' : ''} ${pkgPartialSelected ? 'partial' : ''}`}
                    onClick={() => togglePackageAll(pkg.id)}
                    disabled={disabled || allPkgScenarioIds.length === 0}
                  >
                    {pkgAllSelected ? '해제' : '전체'}
                  </button>
                </div>

                {isExpanded && (
                  <div className="node-children">
                    {categories.map(cat => {
                      // 검색 중일 때 결과 없는 카테고리 숨기기
                      if (searchQuery && !categoryHasResults(cat.id)) {
                        return null;
                      }

                      const scenarios = filterScenarios(treeData.scenarios.get(cat.id) || []);
                      const isCatExpanded = expandedCategories.has(cat.id);

                      // 카테고리 전체 선택 상태 계산
                      const catScenarioIds = scenarios.map(s => s.id);
                      const catAllSelected = catScenarioIds.length > 0 &&
                        catScenarioIds.every(id => selectedScenarioIds.includes(id));
                      const catPartialSelected = !catAllSelected &&
                        catScenarioIds.some(id => selectedScenarioIds.includes(id));

                      return (
                        <div key={cat.id} className="tree-node category-node">
                          <div className="node-header">
                            <button
                              type="button"
                              className="expand-btn"
                              onClick={() => toggleCategory(cat.id)}
                            >
                              {isCatExpanded ? '▼' : '▶'}
                            </button>
                            <span className="node-icon">📁</span>
                            <span className="node-name">{cat.name}</span>
                            <span className="node-count">({scenarios.length}개)</span>
                            <button
                              type="button"
                              className={`select-all-btn ${catAllSelected ? 'selected' : ''} ${catPartialSelected ? 'partial' : ''}`}
                              onClick={() => toggleCategoryAll(cat.id)}
                              disabled={disabled || scenarios.length === 0}
                            >
                              {catAllSelected ? '해제' : '전체'}
                            </button>
                          </div>

                          {isCatExpanded && (
                            <div className="node-children">
                              {scenarios.map(scenario => {
                                const isSelected = selectedScenarioIds.includes(scenario.id);

                                return (
                                  <label
                                    key={scenario.id}
                                    className={`tree-node scenario-node ${isSelected ? 'selected' : ''}`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => toggleScenario(scenario.id)}
                                      disabled={disabled}
                                    />
                                    <span className="node-icon">📄</span>
                                    <span className="node-name">{scenario.name}</span>
                                    <span className="node-count">({scenario.nodeCount}개 노드)</span>
                                  </label>
                                );
                              })}
                              {scenarios.length === 0 && (
                                <div className="empty-category">시나리오 없음</div>
                              )}
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
        </div>

        <div className="selection-summary">
          선택된 시나리오: <strong>{selectedScenarioIds.length}</strong>개
        </div>
      </div>
    </div>
  );
};

export default ScenarioSelector;
