// frontend/src/contexts/FlowEditorContext.tsx
// 노드 및 연결 편집 관련 상태 관리

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import type { FlowNode, Connection, NodeType } from '../types';

// Layout constants
const NODE_GAP_X = 200;
const START_X = 50;
const START_Y = 200;

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

  // Selection
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
  selectedConnectionIndex: number | null;
  setSelectedConnectionIndex: (index: number | null) => void;

  // Type change confirmation
  typeChangeConfirm: TypeChangeConfirm | null;
  setTypeChangeConfirm: (confirm: TypeChangeConfirm | null) => void;

  // Node operations
  handleNodeAdd: (type: NodeType, x: number, y: number) => void;
  handleNodeAddAuto: (type: NodeType) => void;
  handleNodeDelete: (nodeId: string) => void;
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

  // Clear all
  clearFlow: () => void;

  // Load flow data
  loadFlow: (flowNodes: FlowNode[], flowConnections: Connection[]) => void;

  // Derived
  selectedNode: FlowNode | undefined;
}

const FlowEditorContext = createContext<FlowEditorContextType | null>(null);

interface FlowEditorProviderProps {
  children: ReactNode;
}

export function FlowEditorProvider({ children }: FlowEditorProviderProps) {
  // Nodes & Connections
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);

  // Selection
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedConnectionIndex, setSelectedConnectionIndex] = useState<number | null>(null);

  // Type change confirmation
  const [typeChangeConfirm, setTypeChangeConfirm] = useState<TypeChangeConfirm | null>(null);

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

  // Clear all
  const clearFlow = useCallback(() => {
    setNodes([]);
    setConnections([]);
    setSelectedNodeId(null);
    setSelectedConnectionIndex(null);
  }, []);

  // Load flow data
  const loadFlow = useCallback((flowNodes: FlowNode[], flowConnections: Connection[]) => {
    setNodes(flowNodes);
    setConnections(flowConnections);
  }, []);

  // Keyboard events for delete
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();

        if (selectedNodeId) {
          handleNodeDelete(selectedNodeId);
        } else if (selectedConnectionIndex !== null) {
          handleConnectionDelete(selectedConnectionIndex);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNodeId, selectedConnectionIndex, handleNodeDelete, handleConnectionDelete]);

  // Selected node (derived)
  const selectedNode = nodes.find(n => n.id === selectedNodeId);

  const value: FlowEditorContextType = {
    nodes,
    setNodes,
    connections,
    setConnections,
    selectedNodeId,
    setSelectedNodeId,
    selectedConnectionIndex,
    setSelectedConnectionIndex,
    typeChangeConfirm,
    setTypeChangeConfirm,
    handleNodeAdd,
    handleNodeAddAuto,
    handleNodeDelete,
    handleNodeInsertAfter,
    handleNodeSelect,
    handleNodeMove,
    handleNodeUpdate,
    handleNodeTypeChangeRequest,
    handleNodeTypeChange,
    handleConnectionAdd,
    handleConnectionDelete,
    handleConnectionSelect,
    clearFlow,
    loadFlow,
    selectedNode,
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
