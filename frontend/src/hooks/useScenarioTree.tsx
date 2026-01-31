// frontend/src/hooks/useScenarioTree.ts

import { useState, useEffect, useCallback } from 'react';
import type { Package, Category, ScenarioSummary } from '../types';
import { apiClient, API_BASE_URL } from '../config/api';

// 트리 노드 타입
export interface TreeNode {
  id: string;
  name: string;
  type: 'package' | 'category' | 'scenario';
  packageId?: string;
  categoryId?: string;
  packageName?: string;
  scenarioData?: ScenarioSummary;
  children?: TreeNode[];
}

// 드래그 상태 타입
export interface DragState {
  isDragging: boolean;
  draggedNode: TreeNode | null;
  dropTargetId: string | null;
}

// 훅 옵션
interface UseScenarioTreeOptions {
  autoExpandEmpty?: boolean; // 카테고리 없는 패키지 자동 펼침
  initialPackageId?: string;
  initialCategoryId?: string;
}

export function useScenarioTree(options: UseScenarioTreeOptions = {}) {
  const { autoExpandEmpty = true, initialPackageId, initialCategoryId } = options;

  // 트리 데이터
  const [treeData, setTreeData] = useState<TreeNode[]>([]);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<boolean>(false);

  // 검색 상태
  const [searchQuery, setSearchQuery] = useState<string>('');

  // 드래그 앤 드롭 상태
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    draggedNode: null,
    dropTargetId: null,
  });

  // 트리 데이터 로드
  const loadTreeData = useCallback(async () => {
    setLoading(true);
    try {
      const pkgRes = await apiClient.get<{ success: boolean; data: Package[] }>(`${API_BASE_URL}/api/packages`);
      const packages = Array.isArray(pkgRes.data.data) ? pkgRes.data.data : [];

      if (packages.length === 0) {
        setTreeData([]);
        return;
      }

      const tree: TreeNode[] = await Promise.all(
        packages.map(async (pkg) => {
          const catRes = await apiClient.get<{ success: boolean; data: Category[] }>(
            `${API_BASE_URL}/api/categories?packageId=${pkg.id}`,
          );
          const categories = Array.isArray(catRes.data.data) ? catRes.data.data : [];

          const categoryNodes: TreeNode[] = await Promise.all(
            categories.map(async (cat) => {
              const scenRes = await apiClient.get<{ success: boolean; data: ScenarioSummary[] }>(
                `${API_BASE_URL}/api/scenarios?packageId=${pkg.id}&categoryId=${cat.id}`,
              );
              const scenarios = Array.isArray(scenRes.data.data) ? scenRes.data.data : [];

              return {
                id: `cat-${cat.id}`,
                name: cat.name,
                type: 'category' as const,
                packageId: pkg.id,
                categoryId: cat.id,
                children: scenarios.map((s) => ({
                  id: `scen-${s.id}`,
                  name: s.name,
                  type: 'scenario' as const,
                  packageId: pkg.id,
                  categoryId: cat.id,
                  scenarioData: s,
                })),
              };
            }),
          );

          return {
            id: `pkg-${pkg.id}`,
            name: pkg.name,
            type: 'package' as const,
            packageId: pkg.id,
            packageName: pkg.packageName,
            children: categoryNodes,
          };
        }),
      );

      setTreeData(tree);
    } catch (err) {
      console.error('트리 데이터 로드 실패:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // 초기 확장 설정
  useEffect(() => {
    if (initialPackageId) {
      setExpandedNodes((prev) => new Set([...prev, `pkg-${initialPackageId}`]));
    }
    if (initialCategoryId) {
      setExpandedNodes((prev) => new Set([...prev, `cat-${initialCategoryId}`]));
    }
  }, [initialPackageId, initialCategoryId]);

  // 카테고리가 없는 패키지 자동 펼침
  useEffect(() => {
    if (autoExpandEmpty && treeData.length > 0) {
      const packagesWithoutCategories = treeData
        .filter((node) => node.type === 'package' && (!node.children || node.children.length === 0))
        .map((node) => node.id);

      if (packagesWithoutCategories.length > 0) {
        setExpandedNodes((prev) => new Set([...prev, ...packagesWithoutCategories]));
      }
    }
  }, [autoExpandEmpty, treeData]);

  // 노드 확장/축소 토글
  const toggleExpand = useCallback((nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  // 노드 확장
  const expandNode = useCallback((nodeId: string) => {
    setExpandedNodes((prev) => new Set([...prev, nodeId]));
  }, []);

  // 검색어에 따른 노드 매칭 여부 확인
  const nodeMatchesSearch = useCallback((node: TreeNode, query: string): boolean => {
    if (!query) return true;
    const lowerQuery = query.toLowerCase();
    const nameMatches = node.name.toLowerCase().includes(lowerQuery);
    const packageNameMatches = node.packageName?.toLowerCase().includes(lowerQuery) || false;
    return nameMatches || packageNameMatches;
  }, []);

  // 노드 또는 자식 중 매칭되는 것이 있는지 확인
  const nodeOrChildrenMatch = useCallback((node: TreeNode, query: string): boolean => {
    if (!query) return true;
    if (nodeMatchesSearch(node, query)) return true;
    if (node.children) {
      return node.children.some((child) => nodeOrChildrenMatch(child, query));
    }
    return false;
  }, [nodeMatchesSearch]);

  // 검색어가 있을 때 매칭 노드의 부모들을 자동 확장
  useEffect(() => {
    if (!searchQuery) return;

    const newExpanded = new Set<string>();

    const findMatchingParents = (nodes: TreeNode[], parentIds: string[] = []) => {
      for (const node of nodes) {
        const currentPath = [...parentIds, node.id];

        if (nodeMatchesSearch(node, searchQuery)) {
          parentIds.forEach((id) => newExpanded.add(id));
        }

        if (node.children) {
          findMatchingParents(node.children, currentPath);
        }
      }
    };

    findMatchingParents(treeData);
    setExpandedNodes((prev) => new Set([...prev, ...newExpanded]));
  }, [searchQuery, treeData, nodeMatchesSearch]);

  // 검색 결과 하이라이트 텍스트 생성
  const highlightText = useCallback((text: string, query: string): React.ReactNode => {
    if (!query) return text;

    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const index = lowerText.indexOf(lowerQuery);

    if (index === -1) return text;

    return (
      <>
        {text.substring(0, index)}
        <mark className="search-highlight">{text.substring(index, index + query.length)}</mark>
        {text.substring(index + query.length)}
      </>
    );
  }, []);

  // 검색 초기화
  const clearSearch = useCallback(() => {
    setSearchQuery('');
  }, []);

  // 드래그 시작
  const handleDragStart = useCallback((e: React.DragEvent, node: TreeNode) => {
    if (node.type !== 'scenario') {
      e.preventDefault();
      return;
    }

    const scenarioId = node.id.replace('scen-', '');

    e.dataTransfer.setData('text/plain', JSON.stringify({
      scenarioId,
      scenarioName: node.name,
      fromPackageId: node.packageId,
      fromCategoryId: node.categoryId,
    }));
    e.dataTransfer.effectAllowed = 'move';

    setDragState({
      isDragging: true,
      draggedNode: node,
      dropTargetId: null,
    });
  }, []);

  // 드래그 오버
  const handleDragOver = useCallback((e: React.DragEvent, node: TreeNode) => {
    if (node.type !== 'category') return;

    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    setDragState((prev) => {
      if (prev.draggedNode &&
          prev.draggedNode.packageId === node.packageId &&
          prev.draggedNode.categoryId === node.categoryId) {
        return prev;
      }
      return { ...prev, dropTargetId: node.id };
    });
  }, []);

  // 드래그 리브
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragState((prev) => ({ ...prev, dropTargetId: null }));
  }, []);

  // 드롭 처리
  const handleDrop = useCallback(async (e: React.DragEvent, targetNode: TreeNode) => {
    e.preventDefault();

    if (targetNode.type !== 'category') return;

    try {
      const data = JSON.parse(e.dataTransfer.getData('text/plain'));
      const { scenarioId, scenarioName, fromCategoryId } = data;

      if (fromCategoryId === targetNode.categoryId) {
        setDragState({ isDragging: false, draggedNode: null, dropTargetId: null });
        return;
      }

      await apiClient.post(`${API_BASE_URL}/api/scenarios/${scenarioId}/move`, {
        packageId: targetNode.packageId,
        categoryId: targetNode.categoryId,
      });

      console.log(`📁 시나리오 이동: "${scenarioName}" → ${targetNode.name}`);

      setExpandedNodes((prev) => {
        const next = new Set(prev);
        next.add(`pkg-${targetNode.packageId}`);
        next.add(`cat-${targetNode.categoryId}`);
        return next;
      });

      await loadTreeData();
    } catch (err) {
      const error = err as { response?: { data?: { message?: string } } };
      alert('이동 실패: ' + (error.response?.data?.message || '알 수 없는 에러'));
    } finally {
      setDragState({ isDragging: false, draggedNode: null, dropTargetId: null });
    }
  }, [loadTreeData]);

  // 드래그 종료
  const handleDragEnd = useCallback(() => {
    setDragState({ isDragging: false, draggedNode: null, dropTargetId: null });
  }, []);

  // 리셋
  const reset = useCallback(() => {
    setSearchQuery('');
    setDragState({ isDragging: false, draggedNode: null, dropTargetId: null });
  }, []);

  return {
    // 상태
    treeData,
    expandedNodes,
    loading,
    searchQuery,
    dragState,

    // 액션
    loadTreeData,
    toggleExpand,
    expandNode,
    setSearchQuery,
    clearSearch,
    reset,

    // 드래그 핸들러
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleDragEnd,

    // 유틸리티
    nodeMatchesSearch,
    nodeOrChildrenMatch,
    highlightText,
  };
}

export default useScenarioTree;
