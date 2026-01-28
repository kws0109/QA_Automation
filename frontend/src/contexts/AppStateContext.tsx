// frontend/src/contexts/AppStateContext.tsx

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { apiClient, API_BASE_URL } from '../config/api';
import type {
  FlowNode,
  Connection,
  Scenario,
  NodeType,
  ImageTemplate,
  ScenarioSummary,
  Package,
  ExecutionStatus,
  DeviceElement,
} from '../types';

interface TypeChangeConfirm {
  nodeId: string;
  newType: NodeType;
}

interface AppStateContextType {
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

  // Current scenario
  currentScenarioId: string | null;
  setCurrentScenarioId: (id: string | null) => void;
  currentScenarioName: string;
  setCurrentScenarioName: (name: string) => void;

  // Package & Category
  selectedPackageId: string;
  setSelectedPackageId: (id: string) => void;
  selectedCategoryId: string;
  setSelectedCategoryId: (id: string) => void;
  packages: Package[];

  // Templates & Scenarios
  templates: ImageTemplate[];
  scenarios: ScenarioSummary[];

  // Highlight state (for editor test)
  highlightedNodeId: string | null;
  highlightStatus: ExecutionStatus | undefined;
  handleHighlightNode: (nodeId: string | null, status?: ExecutionStatus) => void;

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

  // Scenario operations
  handleScenarioLoad: (scenario: Scenario) => void;
  handleNewScenario: () => void;
  handleSaveScenario: () => Promise<void>;
  handleSaveComplete: (scenarioId: string, scenarioName: string, packageId: string, categoryId: string) => void;

  // Preview operations
  handlePreviewCoordinate: (x: number, y: number) => void;
  handlePreviewElement: (element: DeviceElement) => void;
  handleSelectRegion: (region: { x: number; y: number; width: number; height: number }) => void;

  // Template operations
  handleTemplateSelect: (template: ImageTemplate) => void;

  // Fetch operations
  fetchPackages: () => Promise<void>;
  fetchTemplates: (packageId?: string) => Promise<void>;
  fetchScenarios: () => Promise<void>;

  // Selected node (derived)
  selectedNode: FlowNode | undefined;
}

const AppStateContext = createContext<AppStateContextType | null>(null);

// Layout constants
const NODE_GAP_X = 200;
const START_X = 50;
const START_Y = 200;

interface AppStateProviderProps {
  children: ReactNode;
}

export function AppStateProvider({ children }: AppStateProviderProps) {
  // Nodes & Connections
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);

  // Selection
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedConnectionIndex, setSelectedConnectionIndex] = useState<number | null>(null);

  // Current scenario
  const [currentScenarioId, setCurrentScenarioId] = useState<string | null>(null);
  const [currentScenarioName, setCurrentScenarioName] = useState<string>('');

  // Package & Category
  const [selectedPackageId, setSelectedPackageId] = useState<string>('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [packages, setPackages] = useState<Package[]>([]);

  // Templates & Scenarios
  const [templates, setTemplates] = useState<ImageTemplate[]>([]);
  const [scenarios, setScenarios] = useState<ScenarioSummary[]>([]);

  // Highlight state
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(null);
  const [highlightStatus, setHighlightStatus] = useState<ExecutionStatus | undefined>(undefined);

  // Type change confirmation
  const [typeChangeConfirm, setTypeChangeConfirm] = useState<TypeChangeConfirm | null>(null);

  // Highlight handler
  const handleHighlightNode = useCallback((nodeId: string | null, status?: ExecutionStatus) => {
    setHighlightedNodeId(nodeId);
    setHighlightStatus(status);
  }, []);

  // Fetch scenarios
  const fetchScenarios = useCallback(async () => {
    try {
      const res = await apiClient.get<{ success: boolean; data: ScenarioSummary[] }>(
        `${API_BASE_URL}/api/scenarios`,
      );
      if (res.data.success) {
        setScenarios(res.data.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch scenarios:', err);
    }
  }, []);

  // Fetch templates
  const fetchTemplates = useCallback(async (packageId?: string) => {
    try {
      const pkgId = packageId ?? selectedPackageId;
      const url = pkgId
        ? `${API_BASE_URL}/api/image/templates?packageId=${pkgId}`
        : `${API_BASE_URL}/api/image/templates`;
      const res = await apiClient.get<{ data: ImageTemplate[] }>(url);
      setTemplates(res.data.data || []);
    } catch (err) {
      console.error('Failed to fetch templates:', err);
    }
  }, [selectedPackageId]);

  // Fetch packages
  const fetchPackages = useCallback(async () => {
    try {
      const res = await apiClient.get<{ data: Package[] }>(`${API_BASE_URL}/api/packages`);
      setPackages(res.data.data || []);
    } catch (err) {
      console.error('Failed to fetch packages:', err);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchPackages();
    fetchTemplates();
    fetchScenarios();
  }, [fetchPackages, fetchTemplates, fetchScenarios]);

  // Refresh templates when package changes
  useEffect(() => {
    if (selectedPackageId) {
      fetchTemplates(selectedPackageId);
    }
  }, [selectedPackageId, fetchTemplates]);

  // Template modal event listener
  useEffect(() => {
    const handleOpenTemplateModal = () => {
      window.dispatchEvent(new CustomEvent('openTemplateModalRequest'));
    };

    window.addEventListener('openTemplateModal', handleOpenTemplateModal);
    return () => {
      window.removeEventListener('openTemplateModal', handleOpenTemplateModal);
    };
  }, []);

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

  // Scenario load
  const handleScenarioLoad = useCallback((scenario: Scenario) => {
    setNodes(scenario.nodes || []);
    setConnections(scenario.connections || []);
    setCurrentScenarioId(scenario.id || null);
    setCurrentScenarioName(scenario.name || '');
    if (scenario.packageId) {
      setSelectedPackageId(scenario.packageId);
    }
    if (scenario.categoryId) {
      setSelectedCategoryId(scenario.categoryId);
    }
  }, []);

  // New scenario
  const handleNewScenario = useCallback(() => {
    if (nodes.length > 0 && !window.confirm('Clear current work and create new scenario?')) {
      return;
    }
    setNodes([]);
    setConnections([]);
    setCurrentScenarioId(null);
    setCurrentScenarioName('');
    setSelectedNodeId(null);
    setSelectedConnectionIndex(null);
  }, [nodes.length]);

  // Save scenario (overwrite)
  const handleSaveScenario = useCallback(async () => {
    if (!currentScenarioId) {
      window.dispatchEvent(new CustomEvent('openSaveModal'));
      return;
    }

    if (!window.confirm(`Overwrite "${currentScenarioName}" scenario?`)) {
      return;
    }

    try {
      await apiClient.put(`${API_BASE_URL}/api/scenarios/${currentScenarioId}`, {
        name: currentScenarioName,
        nodes,
        connections,
      });
      alert('Saved!');
    } catch (err) {
      const error = err as { response?: { data?: { message?: string } } };
      alert('Save failed: ' + (error.response?.data?.message || 'Unknown error'));
    }
  }, [currentScenarioId, currentScenarioName, nodes, connections]);

  // Save complete callback
  const handleSaveComplete = useCallback((scenarioId: string, scenarioName: string, packageId: string, categoryId: string) => {
    setCurrentScenarioId(scenarioId);
    setCurrentScenarioName(scenarioName);
    setSelectedPackageId(packageId);
    setSelectedCategoryId(categoryId);
    fetchScenarios();
  }, [fetchScenarios]);

  // Preview coordinate
  const handlePreviewCoordinate = useCallback((x: number, y: number) => {
    if (!selectedNodeId) {
      alert('Please select a node first.');
      return;
    }

    const node = nodes.find(n => n.id === selectedNodeId);
    if (node?.type !== 'action') {
      alert('Please select an action node.');
      return;
    }

    const updatedParams = {
      ...node.params,
      x,
      y,
    };
    handleNodeUpdate(selectedNodeId, { params: updatedParams });
  }, [selectedNodeId, nodes, handleNodeUpdate]);

  // Preview element
  const handlePreviewElement = useCallback((element: DeviceElement) => {
    if (!selectedNodeId) {
      alert('Please select a node first.');
      return;
    }

    const node = nodes.find(n => n.id === selectedNodeId);
    if (node?.type !== 'action' && node?.type !== 'condition') {
      alert('Please select an action or condition node.');
      return;
    }

    const updatedParams = { ...node.params };

    if (element.resourceId) {
      updatedParams.selectorType = 'id';
      updatedParams.selector = element.resourceId;
    } else if (element.text) {
      updatedParams.selectorType = 'text';
      updatedParams.selector = element.text;
    } else if (element.contentDesc) {
      updatedParams.selectorType = 'accessibility id';
      updatedParams.selector = element.contentDesc;
    }

    handleNodeUpdate(selectedNodeId, { params: updatedParams });
  }, [selectedNodeId, nodes, handleNodeUpdate]);

  // Select region
  const handleSelectRegion = useCallback((region: { x: number; y: number; width: number; height: number }) => {
    if (!selectedNodeId) {
      alert('Please select a node first.');
      return;
    }

    const node = nodes.find(n => n.id === selectedNodeId);
    if (node?.type !== 'action') {
      alert('Please select an action node.');
      return;
    }

    const updatedParams = {
      ...node.params,
      region: {
        x: region.x,
        y: region.y,
        width: region.width,
        height: region.height,
        type: 'relative' as const,
      },
    };
    handleNodeUpdate(selectedNodeId, { params: updatedParams });
  }, [selectedNodeId, nodes, handleNodeUpdate]);

  // Template select
  const handleTemplateSelect = useCallback((template: ImageTemplate) => {
    if (selectedNodeId) {
      const node = nodes.find(n => n.id === selectedNodeId);
      if (node) {
        handleNodeUpdate(selectedNodeId, {
          params: {
            ...node.params,
            templateId: template.id,
            templateName: template.name,
          },
        });
      }
    }
    window.dispatchEvent(new CustomEvent('closeTemplateModal'));
    fetchTemplates();
  }, [selectedNodeId, nodes, handleNodeUpdate, fetchTemplates]);

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

  const value: AppStateContextType = {
    nodes,
    setNodes,
    connections,
    setConnections,
    selectedNodeId,
    setSelectedNodeId,
    selectedConnectionIndex,
    setSelectedConnectionIndex,
    currentScenarioId,
    setCurrentScenarioId,
    currentScenarioName,
    setCurrentScenarioName,
    selectedPackageId,
    setSelectedPackageId,
    selectedCategoryId,
    setSelectedCategoryId,
    packages,
    templates,
    scenarios,
    highlightedNodeId,
    highlightStatus,
    handleHighlightNode,
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
    handleScenarioLoad,
    handleNewScenario,
    handleSaveScenario,
    handleSaveComplete,
    handlePreviewCoordinate,
    handlePreviewElement,
    handleSelectRegion,
    handleTemplateSelect,
    fetchPackages,
    fetchTemplates,
    fetchScenarios,
    selectedNode,
  };

  return (
    <AppStateContext.Provider value={value}>
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState(): AppStateContextType {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error('useAppState must be used within an AppStateProvider');
  }
  return context;
}
