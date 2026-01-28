// frontend/src/contexts/EditorPreviewContext.tsx
// 에디터 프리뷰 및 하이라이트 관련 상태 관리

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import type { ExecutionStatus, ImageTemplate, DeviceElement } from '../types';
import { useFlowEditor } from './FlowEditorContext';
import { useScenarioEditor } from './ScenarioEditorContext';
import { useUI } from './UIContext';

interface EditorPreviewContextType {
  // Highlight state (for editor test)
  highlightedNodeId: string | null;
  highlightStatus: ExecutionStatus | undefined;
  handleHighlightNode: (nodeId: string | null, status?: ExecutionStatus) => void;

  // Preview operations
  handlePreviewCoordinate: (x: number, y: number) => void;
  handlePreviewElement: (element: DeviceElement) => void;
  handleSelectRegion: (region: { x: number; y: number; width: number; height: number }) => void;

  // Template operations
  handleTemplateSelect: (template: ImageTemplate) => void;
}

const EditorPreviewContext = createContext<EditorPreviewContextType | null>(null);

interface EditorPreviewProviderProps {
  children: ReactNode;
}

export function EditorPreviewProvider({ children }: EditorPreviewProviderProps) {
  const { nodes, selectedNodeId, handleNodeUpdate } = useFlowEditor();
  const { fetchTemplates } = useScenarioEditor();
  const { closeTemplateModal } = useUI();

  // Highlight state
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(null);
  const [highlightStatus, setHighlightStatus] = useState<ExecutionStatus | undefined>(undefined);

  // Highlight handler
  const handleHighlightNode = useCallback((nodeId: string | null, status?: ExecutionStatus) => {
    setHighlightedNodeId(nodeId);
    setHighlightStatus(status);
  }, []);

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
    closeTemplateModal();
    fetchTemplates();
  }, [selectedNodeId, nodes, handleNodeUpdate, fetchTemplates]);

  const value: EditorPreviewContextType = {
    highlightedNodeId,
    highlightStatus,
    handleHighlightNode,
    handlePreviewCoordinate,
    handlePreviewElement,
    handleSelectRegion,
    handleTemplateSelect,
  };

  return (
    <EditorPreviewContext.Provider value={value}>
      {children}
    </EditorPreviewContext.Provider>
  );
}

export function useEditorPreview(): EditorPreviewContextType {
  const context = useContext(EditorPreviewContext);
  if (!context) {
    throw new Error('useEditorPreview must be used within an EditorPreviewProvider');
  }
  return context;
}
