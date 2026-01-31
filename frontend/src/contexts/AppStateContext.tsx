// frontend/src/contexts/AppStateContext.tsx
// 하위 호환성을 위한 통합 Context (내부적으로 분리된 Context들 사용)

import { ReactNode } from 'react';
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
import { FlowEditorProvider, useFlowEditor } from './FlowEditorContext';
import { ScenarioEditorProvider, useScenarioEditor } from './ScenarioEditorContext';
import { EditorPreviewProvider, useEditorPreview } from './EditorPreviewContext';

interface TypeChangeConfirm {
  nodeId: string;
  newType: NodeType;
}

// 기존 AppStateContextType과 동일한 인터페이스 유지
export interface AppStateContextType {
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
  handlePreviewCoordinate: (x: number, y: number, xPercent: number, yPercent: number) => void;
  handlePreviewElement: (element: DeviceElement) => void;
  handleSelectRegion: (region: { x: number; y: number; width: number; height: number }) => void;
  handlePreviewSwipe: (coords: { startX: number; startY: number; endX: number; endY: number; startXPercent: number; startYPercent: number; endXPercent: number; endYPercent: number }) => void;
  swipeSelectMode: boolean;
  setSwipeSelectMode: (active: boolean) => void;

  // Template operations
  handleTemplateSelect: (template: ImageTemplate) => void;

  // Fetch operations
  fetchPackages: () => Promise<void>;
  fetchTemplates: (packageId?: string) => Promise<void>;
  fetchScenarios: () => Promise<void>;

  // Selected node (derived)
  selectedNode: FlowNode | undefined;
}

interface AppStateProviderProps {
  children: ReactNode;
}

/**
 * AppStateProvider - 분리된 Context들을 조합하는 래퍼
 *
 * 내부 구조:
 * - FlowEditorProvider: 노드/연결 편집
 * - ScenarioEditorProvider: 시나리오/패키지/템플릿 관리
 * - EditorPreviewProvider: 프리뷰/하이라이트
 */
export function AppStateProvider({ children }: AppStateProviderProps) {
  return (
    <FlowEditorProvider>
      <ScenarioEditorProvider>
        <EditorPreviewProvider>
          {children}
        </EditorPreviewProvider>
      </ScenarioEditorProvider>
    </FlowEditorProvider>
  );
}

/**
 * useAppState - 하위 호환성을 위한 통합 훅
 *
 * 내부적으로 분리된 훅들을 조합하여 기존 인터페이스 유지
 *
 * @deprecated 새 코드에서는 useFlowEditor, useScenarioEditor, useEditorPreview를 직접 사용하세요
 */
export function useAppState(): AppStateContextType {
  const flowEditor = useFlowEditor();
  const scenarioEditor = useScenarioEditor();
  const editorPreview = useEditorPreview();

  return {
    // From FlowEditorContext
    nodes: flowEditor.nodes,
    setNodes: flowEditor.setNodes,
    connections: flowEditor.connections,
    setConnections: flowEditor.setConnections,
    selectedNodeId: flowEditor.selectedNodeId,
    setSelectedNodeId: flowEditor.setSelectedNodeId,
    selectedConnectionIndex: flowEditor.selectedConnectionIndex,
    setSelectedConnectionIndex: flowEditor.setSelectedConnectionIndex,
    typeChangeConfirm: flowEditor.typeChangeConfirm,
    setTypeChangeConfirm: flowEditor.setTypeChangeConfirm,
    handleNodeAdd: flowEditor.handleNodeAdd,
    handleNodeAddAuto: flowEditor.handleNodeAddAuto,
    handleNodeDelete: flowEditor.handleNodeDelete,
    handleNodeInsertAfter: flowEditor.handleNodeInsertAfter,
    handleNodeSelect: flowEditor.handleNodeSelect,
    handleNodeMove: flowEditor.handleNodeMove,
    handleNodeUpdate: flowEditor.handleNodeUpdate,
    handleNodeTypeChangeRequest: flowEditor.handleNodeTypeChangeRequest,
    handleNodeTypeChange: flowEditor.handleNodeTypeChange,
    handleConnectionAdd: flowEditor.handleConnectionAdd,
    handleConnectionDelete: flowEditor.handleConnectionDelete,
    handleConnectionSelect: flowEditor.handleConnectionSelect,
    selectedNode: flowEditor.selectedNode,

    // From ScenarioEditorContext
    currentScenarioId: scenarioEditor.currentScenarioId,
    setCurrentScenarioId: scenarioEditor.setCurrentScenarioId,
    currentScenarioName: scenarioEditor.currentScenarioName,
    setCurrentScenarioName: scenarioEditor.setCurrentScenarioName,
    selectedPackageId: scenarioEditor.selectedPackageId,
    setSelectedPackageId: scenarioEditor.setSelectedPackageId,
    selectedCategoryId: scenarioEditor.selectedCategoryId,
    setSelectedCategoryId: scenarioEditor.setSelectedCategoryId,
    packages: scenarioEditor.packages,
    templates: scenarioEditor.templates,
    scenarios: scenarioEditor.scenarios,
    handleScenarioLoad: scenarioEditor.handleScenarioLoad,
    handleNewScenario: scenarioEditor.handleNewScenario,
    handleSaveScenario: scenarioEditor.handleSaveScenario,
    handleSaveComplete: scenarioEditor.handleSaveComplete,
    fetchPackages: scenarioEditor.fetchPackages,
    fetchTemplates: scenarioEditor.fetchTemplates,
    fetchScenarios: scenarioEditor.fetchScenarios,

    // From EditorPreviewContext
    highlightedNodeId: editorPreview.highlightedNodeId,
    highlightStatus: editorPreview.highlightStatus,
    handleHighlightNode: editorPreview.handleHighlightNode,
    handlePreviewCoordinate: editorPreview.handlePreviewCoordinate,
    handlePreviewElement: editorPreview.handlePreviewElement,
    handleSelectRegion: editorPreview.handleSelectRegion,
    handlePreviewSwipe: editorPreview.handlePreviewSwipe,
    swipeSelectMode: editorPreview.swipeSelectMode,
    setSwipeSelectMode: editorPreview.setSwipeSelectMode,
    handleTemplateSelect: editorPreview.handleTemplateSelect,
  };
}
