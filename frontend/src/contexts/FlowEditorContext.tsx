// frontend/src/contexts/FlowEditorContext.tsx
// 노드 및 연결 편집 관련 상태 관리

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import type { FlowNode, Connection, NodeType, ClipboardData } from '../types';

// 로컬스토리지 키 (시나리오 간 복사용)
const CLIPBOARD_STORAGE_KEY = 'qa_automation_clipboard';

// Layout constants
const NODE_GAP_X = 200;
const NODE_GAP_Y = 300;  // 줄 간 간격 (연결선이 줄 사이로 지나갈 공간 확보)
const START_X = 50;
const START_Y = 100;
const DEFAULT_NODES_PER_ROW = 6;

interface TypeChangeConfirm {
  nodeId: string;
  newType: NodeType;
}

interface FlowEditorContextType {
  // Nodes & Connections
  nodes: FlowNode[];
  setNodes: React.Dispatch<React.SetStateAction<FlowNode[]>>;
  connections: Connection[];
  setConnections: React.Dispatch<React.SetStateAction<Connection[]>>;

  // Selection (단일 - 하위 호환)
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
  selectedConnectionIndex: number | null;
  setSelectedConnectionIndex: (index: number | null) => void;

  // Multi-selection (다중 선택)
  selectedNodeIds: Set<string>;
  handleNodeSelectToggle: (nodeId: string, addToSelection: boolean) => void;
  handleSelectAll: () => void;
  handleClearSelection: () => void;

  // Type change confirmation
  typeChangeConfirm: TypeChangeConfirm | null;
  setTypeChangeConfirm: (confirm: TypeChangeConfirm | null) => void;

  // Node operations
  handleNodeAdd: (type: NodeType, x: number, y: number) => void;
  handleNodeAddAuto: (type: NodeType) => void;
  handleNodeDelete: (nodeId: string) => void;
  handleNodesDelete: (nodeIds: string[]) => void;
  handleNodeInsertAfter: (afterNodeId: string, nodeType: NodeType) => void;
  handleNodeSelect: (nodeId: string | null) => void;
  handleNodeMove: (nodeId: string, x: number, y: number) => void;
  handleNodeUpdate: (nodeId: string, updates: Partial<FlowNode>) => void;
  handleNodeTypeChangeRequest: (nodeId: string, newType: NodeType) => void;
  handleNodeTypeChange: (nodeId: string, newType: NodeType) => void;

  // Connection operations
  handleConnectionAdd: (fromId: string, toId: string, branch?: string | null) => void;
  handleConnectionDelete: (index: number) => void;
  handleConnectionSelect: (index: number | null) => void;

  // Copy/Paste operations
  clipboard: ClipboardData | null;
  handleCopy: () => void;
  handlePaste: () => void;
  handleDuplicate: () => void;
  hasClipboard: boolean;

  // Clear all
  clearFlow: () => void;

  // Load flow data
  loadFlow: (flowNodes: FlowNode[], flowConnections: Connection[]) => void;

  // Grid rearrange
  handleRearrangeGrid: (nodesPerRow?: number) => void;

  // Derived
  selectedNode: FlowNode | undefined;
  selectedNodes: FlowNode[];
  hasSelection: boolean;
}

const FlowEditorContext = createContext<FlowEditorContextType | null>(null);

interface FlowEditorProviderProps {
  children: ReactNode;
}

export function FlowEditorProvider({ children }: FlowEditorProviderProps) {
  // Nodes & Connections
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);

  // Selection (단일 - 하위 호환)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedConnectionIndex, setSelectedConnectionIndex] = useState<number | null>(null);

  // Multi-selection (다중 선택)
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());

  // Type change confirmation
  const [typeChangeConfirm, setTypeChangeConfirm] = useState<TypeChangeConfirm | null>(null);

  // Clipboard (복사/붙여넣기)
  const [clipboard, setClipboard] = useState<ClipboardData | null>(null);

  // Get next node position
  const getNextNodePosition = useCallback((): { x: number; y: number } => {
    if (nodes.length === 0) return { x: START_X, y: START_Y };
    const rightmostNode = nodes.reduce((prev, curr) => curr.x > prev.x ? curr : prev, nodes[0]);
    return { x: rightmostNode.x + NODE_GAP_X, y: START_Y };
  }, [nodes]);

  // Node add (with coordinates)
  const handleNodeAdd = useCallback((type: NodeType, x: number, y: number) => {
    const newNode: FlowNode = {
      id: `node_${Date.now()}`,
      type,
      x,
      y,
      params: type === 'action' ? { actionType: '' } : {},
    };
    setNodes(prev => [...prev, newNode]);
  }, []);

  // Node add (auto position with auto connect)
  const handleNodeAddAuto = useCallback((type: NodeType) => {
    const { x, y } = getNextNodePosition();
    const newNodeId = `node_${Date.now()}`;
    const newNode: FlowNode = {
      id: newNodeId,
      type,
      x,
      y,
      params: type === 'action' ? { actionType: '' } : {},
    };

    const rightmostNode = nodes.length > 0
      ? nodes.reduce((prev, curr) => curr.x > prev.x ? curr : prev, nodes[0])
      : null;

    setNodes(prev => [...prev, newNode]);

    if (rightmostNode) {
      const hasOutgoing = connections.some(c => c.from === rightmostNode.id);
      if (!hasOutgoing) {
        setConnections(prev => [...prev, { from: rightmostNode.id, to: newNodeId }]);
      }
    }
  }, [nodes, connections, getNextNodePosition]);

  // Multi-select: 노드 선택 토글 (Shift/Ctrl+클릭)
  const handleNodeSelectToggle = useCallback((nodeId: string, addToSelection: boolean) => {
    if (addToSelection) {
      // Shift/Ctrl 키와 함께 클릭: 선택에 추가/제거
      setSelectedNodeIds(prev => {
        const next = new Set(prev);
        if (next.has(nodeId)) {
          next.delete(nodeId);
        } else {
          next.add(nodeId);
        }
        return next;
      });
      // 단일 선택도 함께 업데이트
      setSelectedNodeId(nodeId);
    } else {
      // 일반 클릭: 해당 노드만 선택
      setSelectedNodeIds(new Set([nodeId]));
      setSelectedNodeId(nodeId);
    }
    setSelectedConnectionIndex(null);
  }, []);

  // Multi-select: 전체 선택 (Ctrl+A)
  const handleSelectAll = useCallback(() => {
    const allIds = new Set(nodes.map(n => n.id));
    setSelectedNodeIds(allIds);
    if (nodes.length > 0) {
      setSelectedNodeId(nodes[0].id);
    }
    setSelectedConnectionIndex(null);
  }, [nodes]);

  // Multi-select: 선택 해제 (Escape)
  const handleClearSelection = useCallback(() => {
    setSelectedNodeIds(new Set());
    setSelectedNodeId(null);
    setSelectedConnectionIndex(null);
  }, []);

  // Node delete
  const handleNodeDelete = useCallback((nodeId: string) => {
    if (!nodeId) return;

    const remainingConnections = connections.filter(
      conn => conn.from !== nodeId && conn.to !== nodeId,
    );

    setNodes(prev => prev.filter(node => node.id !== nodeId));
    setConnections(remainingConnections);
    setSelectedNodeId(prev => prev === nodeId ? null : prev);

    // Rearrange nodes after deletion
    setTimeout(() => {
      setNodes(prev => {
        const startNode = prev.find(n => n.type === 'start');
        if (!startNode) return prev;

        const visited = new Set<string>();
        const orderedNodes: typeof prev = [];
        const queue = [startNode.id];

        while (queue.length > 0) {
          const nId = queue.shift()!;
          if (visited.has(nId)) continue;
          visited.add(nId);

          const node = prev.find(n => n.id === nId);
          if (node) orderedNodes.push(node);

          remainingConnections.filter(c => c.from === nId).forEach(c => {
            if (!visited.has(c.to)) queue.push(c.to);
          });
        }

        prev.forEach(n => {
          if (!visited.has(n.id)) orderedNodes.push(n);
        });

        return orderedNodes.map((node, index) => ({
          ...node,
          x: START_X + index * NODE_GAP_X,
          y: START_Y,
        }));
      });
    }, 50);
  }, [connections]);

  // 다중 노드 삭제
  const handleNodesDelete = useCallback((nodeIds: string[]) => {
    if (nodeIds.length === 0) return;

    const nodeIdSet = new Set(nodeIds);
    const remainingConnections = connections.filter(
      conn => !nodeIdSet.has(conn.from) && !nodeIdSet.has(conn.to),
    );

    setNodes(prev => prev.filter(node => !nodeIdSet.has(node.id)));
    setConnections(remainingConnections);
    setSelectedNodeId(null);
    setSelectedNodeIds(new Set());

    // Rearrange nodes after deletion
    setTimeout(() => {
      setNodes(prev => {
        const startNode = prev.find(n => n.type === 'start');
        if (!startNode) return prev;

        const visited = new Set<string>();
        const orderedNodes: typeof prev = [];
        const queue = [startNode.id];

        while (queue.length > 0) {
          const nId = queue.shift()!;
          if (visited.has(nId)) continue;
          visited.add(nId);

          const node = prev.find(n => n.id === nId);
          if (node) orderedNodes.push(node);

          remainingConnections.filter(c => c.from === nId).forEach(c => {
            if (!visited.has(c.to)) queue.push(c.to);
          });
        }

        prev.forEach(n => {
          if (!visited.has(n.id)) orderedNodes.push(n);
        });

        return orderedNodes.map((node, index) => ({
          ...node,
          x: START_X + index * NODE_GAP_X,
          y: START_Y,
        }));
      });
    }, 50);
  }, [connections]);

  // Node insert after
  const handleNodeInsertAfter = useCallback((afterNodeId: string, nodeType: NodeType) => {
    const afterNode = nodes.find(n => n.id === afterNodeId);
    if (!afterNode) return;

    const outgoingConnection = connections.find(c => c.from === afterNodeId);

    const newNodeId = `node_${Date.now()}`;
    const newNode: FlowNode = {
      id: newNodeId,
      type: nodeType,
      x: afterNode.x + NODE_GAP_X,
      y: afterNode.y,
      params: nodeType === 'action' ? { actionType: '' } : {},
    };

    let updatedConnections: Connection[];
    if (outgoingConnection) {
      updatedConnections = [
        ...connections.filter(c => c.from !== afterNodeId || c.to !== outgoingConnection.to),
        { from: afterNodeId, to: newNodeId, label: outgoingConnection.label },
        { from: newNodeId, to: outgoingConnection.to },
      ];
    } else {
      updatedConnections = [
        ...connections,
        { from: afterNodeId, to: newNodeId },
      ];
    }

    setConnections(updatedConnections);

    setNodes(prev => {
      const nodesWithNew = [...prev, newNode];

      const startNode = nodesWithNew.find(n => n.type === 'start');
      if (!startNode) return nodesWithNew;

      const visited = new Set<string>();
      const orderedNodes: FlowNode[] = [];
      const queue = [startNode.id];

      while (queue.length > 0) {
        const nodeId = queue.shift()!;
        if (visited.has(nodeId)) continue;
        visited.add(nodeId);

        const node = nodesWithNew.find(n => n.id === nodeId);
        if (node) orderedNodes.push(node);

        updatedConnections.filter(c => c.from === nodeId).forEach(c => {
          if (!visited.has(c.to)) {
            queue.push(c.to);
          }
        });
      }

      nodesWithNew.forEach(n => {
        if (!visited.has(n.id)) {
          orderedNodes.push(n);
        }
      });

      return orderedNodes.map((node, index) => ({
        ...node,
        x: START_X + index * NODE_GAP_X,
        y: START_Y,
      }));
    });
  }, [nodes, connections]);

  // Node select
  const handleNodeSelect = useCallback((nodeId: string | null) => {
    setSelectedNodeId(nodeId);
  }, []);

  // Node move
  const handleNodeMove = useCallback((nodeId: string, x: number, y: number) => {
    setNodes(prev => prev.map(node =>
      node.id === nodeId ? { ...node, x, y } : node,
    ));
  }, []);

  // Node update
  const handleNodeUpdate = useCallback((nodeId: string, updates: Partial<FlowNode>) => {
    setNodes(prev => prev.map(node =>
      node.id === nodeId ? { ...node, ...updates } : node,
    ));
  }, []);

  // Node type change request (with confirmation)
  const handleNodeTypeChangeRequest = useCallback((nodeId: string, newType: NodeType) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;

    if (node.type === newType) return;

    if (node.params && Object.keys(node.params).length > 0) {
      setTypeChangeConfirm({ nodeId, newType });
    } else {
      setNodes(prev => prev.map(n => {
        if (n.id !== nodeId) return n;
        return {
          ...n,
          type: newType,
          params: newType === 'action' ? { actionType: '' } : {},
        };
      }));
    }
  }, [nodes]);

  // Node type change (execute)
  const handleNodeTypeChange = useCallback((nodeId: string, newType: NodeType) => {
    setNodes(prev => prev.map(node => {
      if (node.id !== nodeId) return node;
      return {
        ...node,
        type: newType,
        params: newType === 'action' ? { actionType: '' } : {},
      };
    }));
    setTypeChangeConfirm(null);
  }, []);

  // Connection add
  const handleConnectionAdd = useCallback((fromId: string, toId: string, branch: string | null = null) => {
    setConnections(prev => [...prev, { from: fromId, to: toId, label: branch || undefined }]);
  }, []);

  // Connection delete
  const handleConnectionDelete = useCallback((index: number) => {
    setConnections(prev => prev.filter((_, i) => i !== index));
    setSelectedConnectionIndex(null);
  }, []);

  // Connection select
  const handleConnectionSelect = useCallback((index: number | null) => {
    setSelectedConnectionIndex(index);
  }, []);

  // ============ 공통 헬퍼 함수 ============

  // 노드 재정렬 함수 (start 노드 기준 BFS 순회)
  const rearrangeNodes = useCallback((
    nodesToArrange: FlowNode[],
    connectionsToUse: Connection[]
  ): FlowNode[] => {
    const startNode = nodesToArrange.find(n => n.type === 'start');
    if (!startNode) return nodesToArrange;

    const visited = new Set<string>();
    const orderedNodes: FlowNode[] = [];
    const queue = [startNode.id];

    while (queue.length > 0) {
      const nId = queue.shift()!;
      if (visited.has(nId)) continue;
      visited.add(nId);

      const node = nodesToArrange.find(n => n.id === nId);
      if (node) orderedNodes.push(node);

      connectionsToUse.filter(c => c.from === nId).forEach(c => {
        if (!visited.has(c.to)) queue.push(c.to);
      });
    }

    // 연결되지 않은 노드 추가
    nodesToArrange.forEach(n => {
      if (!visited.has(n.id)) orderedNodes.push(n);
    });

    return orderedNodes.map((node, index) => ({
      ...node,
      x: START_X + index * NODE_GAP_X,
      y: START_Y,
    }));
  }, []);

  // 노드 그리드 재정렬 함수 (N개마다 줄바꿈)
  const rearrangeNodesGrid = useCallback((
    nodesToArrange: FlowNode[],
    connectionsToUse: Connection[],
    nodesPerRow: number
  ): FlowNode[] => {
    const startNode = nodesToArrange.find(n => n.type === 'start');
    if (!startNode) return nodesToArrange;

    const visited = new Set<string>();
    const orderedNodes: FlowNode[] = [];
    const queue = [startNode.id];

    while (queue.length > 0) {
      const nId = queue.shift()!;
      if (visited.has(nId)) continue;
      visited.add(nId);

      const node = nodesToArrange.find(n => n.id === nId);
      if (node) orderedNodes.push(node);

      connectionsToUse.filter(c => c.from === nId).forEach(c => {
        if (!visited.has(c.to)) queue.push(c.to);
      });
    }

    // 연결되지 않은 노드 추가
    nodesToArrange.forEach(n => {
      if (!visited.has(n.id)) orderedNodes.push(n);
    });

    // 그리드 배치: 항상 좌→우, 줄바꿈 시 다음 줄 첫 번째로
    return orderedNodes.map((node, index) => {
      const row = Math.floor(index / nodesPerRow);
      const col = index % nodesPerRow;
      return {
        ...node,
        x: START_X + col * NODE_GAP_X,
        y: START_Y + row * NODE_GAP_Y,
      };
    });
  }, []);

  // 그리드 재배치 핸들러
  const handleRearrangeGrid = useCallback((nodesPerRow: number = DEFAULT_NODES_PER_ROW) => {
    if (nodes.length === 0) return;

    const rearrangedNodes = rearrangeNodesGrid(nodes, connections, nodesPerRow);
    setNodes(rearrangedNodes);
  }, [nodes, connections, rearrangeNodesGrid]);

  // ============ Copy/Paste Operations ============

  // ID 재생성 헬퍼 함수
  const regenerateIds = useCallback((
    nodesToCopy: FlowNode[],
    connectionsToCopy: Connection[]
  ): { nodes: FlowNode[]; connections: Connection[] } => {
    const idMap = new Map<string, string>();
    const timestamp = Date.now();

    // 각 노드에 새 ID 부여
    const newNodes = nodesToCopy.map((node, i) => {
      const newId = `node_${timestamp}_${i}`;
      idMap.set(node.id, newId);
      return { ...node, id: newId };
    });

    // 연결선 ID 매핑
    const newConnections = connectionsToCopy
      .filter(conn => idMap.has(conn.from) && idMap.has(conn.to))
      .map(conn => ({
        ...conn,
        from: idMap.get(conn.from)!,
        to: idMap.get(conn.to)!,
      }));

    return { nodes: newNodes, connections: newConnections };
  }, []);

  // 선택된 노드 간의 내부 연결만 필터링
  const getInternalConnections = useCallback((selectedIds: Set<string>): Connection[] => {
    return connections.filter(
      conn => selectedIds.has(conn.from) && selectedIds.has(conn.to)
    );
  }, [connections]);

  // 복사 (Ctrl+C)
  const handleCopy = useCallback(() => {
    if (selectedNodeIds.size === 0) return;

    const nodesToCopy = nodes.filter(n => selectedNodeIds.has(n.id));
    const connectionsToCopy = getInternalConnections(selectedNodeIds);

    const clipboardData: ClipboardData = {
      nodes: nodesToCopy,
      connections: connectionsToCopy,
      copiedAt: Date.now(),
    };

    setClipboard(clipboardData);

    // localStorage에도 저장 (시나리오 간 복사 지원)
    try {
      localStorage.setItem(CLIPBOARD_STORAGE_KEY, JSON.stringify(clipboardData));
    } catch {
      // localStorage 저장 실패 무시
    }
  }, [nodes, selectedNodeIds, getInternalConnections]);

  // 붙여넣기 (Ctrl+V) - 단일 노드 선택 시 해당 노드 뒤에 삽입, 아니면 맨 오른쪽에 배치
  const handlePaste = useCallback(() => {
    // 1. 메모리 클립보드 확인
    let clipboardToPaste = clipboard;

    // 2. 없으면 localStorage에서 로드
    if (!clipboardToPaste) {
      try {
        const stored = localStorage.getItem(CLIPBOARD_STORAGE_KEY);
        if (stored) {
          clipboardToPaste = JSON.parse(stored) as ClipboardData;
        }
      } catch {
        // 파싱 실패 무시
      }
    }

    if (!clipboardToPaste || clipboardToPaste.nodes.length === 0) return;

    // 3. ID 재생성
    const { nodes: newNodes, connections: newConnections } = regenerateIds(
      clipboardToPaste.nodes,
      clipboardToPaste.connections
    );

    // 4. 단일 노드 선택 시 해당 노드 뒤에 삽입 시도
    const selectedId = selectedNodeIds.size === 1 ? Array.from(selectedNodeIds)[0] : null;
    const selectedNode = selectedId ? nodes.find(n => n.id === selectedId) : null;

    // 선택된 노드에서 나가는 연결 (라벨 없는 일반 연결만)
    const outgoingConnections = selectedId
      ? connections.filter(c => c.from === selectedId && !c.label)
      : [];

    // 삽입 모드: 단일 노드 선택 + 나가는 연결이 0~1개 + start/end 노드가 아님
    const canInsertAfter = selectedNode
      && outgoingConnections.length <= 1
      && selectedNode.type !== 'start'
      && selectedNode.type !== 'end';

    let finalConnections = [...connections, ...newConnections];
    let positionedNodes: FlowNode[];

    if (canInsertAfter && selectedId) {
      // === 삽입 모드 ===
      // 붙여넣은 노드들 중 입구 노드 (들어오는 연결이 없는 노드)
      const newNodeIds = new Set(newNodes.map(n => n.id));
      const nodesWithIncoming = new Set(newConnections.map(c => c.to));
      const entryNodes = newNodes.filter(n => !nodesWithIncoming.has(n.id));
      const entryNodeId = entryNodes.length > 0 ? entryNodes[0].id : newNodes[0].id;

      // 붙여넣은 노드들 중 출구 노드 (나가는 연결이 없는 노드)
      const nodesWithOutgoing = new Set(newConnections.map(c => c.from));
      const exitNodes = newNodes.filter(n => !nodesWithOutgoing.has(n.id));
      const exitNodeId = exitNodes.length > 0 ? exitNodes[0].id : newNodes[newNodes.length - 1].id;

      // 기존 연결 처리
      if (outgoingConnections.length === 1) {
        const originalTarget = outgoingConnections[0].to;

        // 기존 연결 제거
        finalConnections = finalConnections.filter(
          c => !(c.from === selectedId && c.to === originalTarget && !c.label)
        );

        // 선택된 노드 → 입구 노드 연결
        finalConnections.push({ from: selectedId, to: entryNodeId });

        // 출구 노드 → 원래 타겟 연결
        finalConnections.push({ from: exitNodeId, to: originalTarget });
      } else {
        // 나가는 연결이 없는 경우: 선택된 노드 → 입구 노드 연결만 추가
        finalConnections.push({ from: selectedId, to: entryNodeId });
      }

      // 위치는 선택된 노드 기준으로 오른쪽에 배치 (재정렬에서 자동 조정됨)
      positionedNodes = newNodes.map((node, index) => ({
        ...node,
        x: (selectedNode?.x ?? START_X) + NODE_GAP_X + (index * NODE_GAP_X),
        y: selectedNode?.y ?? START_Y,
      }));
    } else {
      // === 기존 모드: 맨 오른쪽에 배치 ===
      const rightmostX = nodes.length > 0
        ? Math.max(...nodes.map(n => n.x))
        : START_X - NODE_GAP_X;

      positionedNodes = newNodes.map((node, index) => ({
        ...node,
        x: rightmostX + NODE_GAP_X + (index * NODE_GAP_X),
        y: START_Y,
      }));
    }

    // 5. 노드 및 연결 추가 후 전체 재정렬
    const allNodes = [...nodes, ...positionedNodes];
    const rearrangedNodes = rearrangeNodes(allNodes, finalConnections);

    setNodes(rearrangedNodes);
    setConnections(finalConnections);

    // 6. 새로 붙여넣은 노드들 선택
    const pastedNodeIds = new Set(newNodes.map(n => n.id));
    setSelectedNodeIds(pastedNodeIds);
    if (newNodes.length > 0) {
      setSelectedNodeId(newNodes[0].id);
    }
  }, [clipboard, nodes, connections, selectedNodeIds, regenerateIds, rearrangeNodes]);

  // 복제 (Ctrl+D) - 기존 노드 오른쪽에 복제 후 재정렬
  const handleDuplicate = useCallback(() => {
    if (selectedNodeIds.size === 0) return;

    const nodesToCopy = nodes.filter(n => selectedNodeIds.has(n.id));
    const connectionsToCopy = getInternalConnections(selectedNodeIds);

    // ID 재생성
    const { nodes: newNodes, connections: newConnections } = regenerateIds(
      nodesToCopy,
      connectionsToCopy
    );

    // 기존 노드들의 가장 오른쪽 위치 계산
    const rightmostX = nodes.length > 0
      ? Math.max(...nodes.map(n => n.x))
      : START_X - NODE_GAP_X;

    // 복제된 노드들을 기존 노드 오른쪽에 배치
    const positionedNodes = newNodes.map((node, index) => ({
      ...node,
      x: rightmostX + NODE_GAP_X + (index * NODE_GAP_X),
      y: START_Y,
    }));

    // 노드 및 연결 추가 후 전체 재정렬
    const allNodes = [...nodes, ...positionedNodes];
    const allConnections = [...connections, ...newConnections];
    const rearrangedNodes = rearrangeNodes(allNodes, allConnections);

    setNodes(rearrangedNodes);
    setConnections(allConnections);

    // 새로 복제된 노드들 선택
    const newNodeIds = new Set(newNodes.map(n => n.id));
    setSelectedNodeIds(newNodeIds);
    if (newNodes.length > 0) {
      setSelectedNodeId(newNodes[0].id);
    }
  }, [nodes, connections, selectedNodeIds, getInternalConnections, regenerateIds, rearrangeNodes]);

  // 클립보드 존재 여부 (붙여넣기 가능 여부)
  const hasClipboard = !!clipboard || (() => {
    try {
      return !!localStorage.getItem(CLIPBOARD_STORAGE_KEY);
    } catch {
      return false;
    }
  })();

  // Clear all
  const clearFlow = useCallback(() => {
    setNodes([]);
    setConnections([]);
    setSelectedNodeId(null);
    setSelectedNodeIds(new Set());
    setSelectedConnectionIndex(null);
  }, []);

  // Load flow data
  const loadFlow = useCallback((flowNodes: FlowNode[], flowConnections: Connection[]) => {
    setNodes(flowNodes);
    setConnections(flowConnections);
  }, []);

  // Keyboard events for delete, copy, paste, etc.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      const isCtrlOrCmd = e.ctrlKey || e.metaKey;

      // Ctrl+A: 전체 선택
      if (isCtrlOrCmd && e.key === 'a') {
        e.preventDefault();
        handleSelectAll();
        return;
      }

      // Ctrl+C: 복사
      if (isCtrlOrCmd && e.key === 'c') {
        if (selectedNodeIds.size > 0) {
          e.preventDefault();
          handleCopy();
        }
        return;
      }

      // Ctrl+V: 붙여넣기
      if (isCtrlOrCmd && e.key === 'v') {
        e.preventDefault();
        handlePaste();
        return;
      }

      // Ctrl+D: 복제
      if (isCtrlOrCmd && e.key === 'd') {
        if (selectedNodeIds.size > 0) {
          e.preventDefault();
          handleDuplicate();
        }
        return;
      }

      // Escape: 선택 해제
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClearSelection();
        return;
      }

      // Delete/Backspace: 삭제
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();

        // 다중 선택 삭제
        if (selectedNodeIds.size > 0) {
          handleNodesDelete(Array.from(selectedNodeIds));
        } else if (selectedConnectionIndex !== null) {
          handleConnectionDelete(selectedConnectionIndex);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    selectedNodeIds,
    selectedConnectionIndex,
    handleSelectAll,
    handleCopy,
    handlePaste,
    handleDuplicate,
    handleClearSelection,
    handleNodesDelete,
    handleConnectionDelete,
  ]);

  // Derived states
  const selectedNode = nodes.find(n => n.id === selectedNodeId);
  const selectedNodes = nodes.filter(n => selectedNodeIds.has(n.id));
  const hasSelection = selectedNodeIds.size > 0;

  const value: FlowEditorContextType = {
    nodes,
    setNodes,
    connections,
    setConnections,
    selectedNodeId,
    setSelectedNodeId,
    selectedConnectionIndex,
    setSelectedConnectionIndex,
    // Multi-selection
    selectedNodeIds,
    handleNodeSelectToggle,
    handleSelectAll,
    handleClearSelection,
    // Type change
    typeChangeConfirm,
    setTypeChangeConfirm,
    // Node operations
    handleNodeAdd,
    handleNodeAddAuto,
    handleNodeDelete,
    handleNodesDelete,
    handleNodeInsertAfter,
    handleNodeSelect,
    handleNodeMove,
    handleNodeUpdate,
    handleNodeTypeChangeRequest,
    handleNodeTypeChange,
    // Connection operations
    handleConnectionAdd,
    handleConnectionDelete,
    handleConnectionSelect,
    // Copy/Paste
    clipboard,
    handleCopy,
    handlePaste,
    handleDuplicate,
    hasClipboard,
    // Clear/Load
    clearFlow,
    loadFlow,
    // Grid rearrange
    handleRearrangeGrid,
    // Derived
    selectedNode,
    selectedNodes,
    hasSelection,
  };

  return (
    <FlowEditorContext.Provider value={value}>
      {children}
    </FlowEditorContext.Provider>
  );
}

export function useFlowEditor(): FlowEditorContextType {
  const context = useContext(FlowEditorContext);
  if (!context) {
    throw new Error('useFlowEditor must be used within a FlowEditorProvider');
  }
  return context;
}
