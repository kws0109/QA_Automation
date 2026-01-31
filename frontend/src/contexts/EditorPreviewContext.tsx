// frontend/src/contexts/EditorPreviewContext.tsx
// 에디터 프리뷰 및 하이라이트 관련 상태 관리

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import type { ExecutionStatus, ImageTemplate, DeviceElement } from '../types';
import { useFlowEditor } from './FlowEditorContext';
import { useScenarioEditor } from './ScenarioEditorContext';
import { useUI } from './UIContext';

export interface SwipeCoordinates {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  // 비율 (0-100%)
  startXPercent: number;
  startYPercent: number;
  endXPercent: number;
  endYPercent: number;
}

interface EditorPreviewContextType {
  // Highlight state (for editor test)
  highlightedNodeId: string | null;
  highlightStatus: ExecutionStatus | undefined;
  handleHighlightNode: (nodeId: string | null, status?: ExecutionStatus) => void;

  // Preview operations
  handlePreviewCoordinate: (x: number, y: number, xPercent: number, yPercent: number) => void;
  handlePreviewElement: (element: DeviceElement) => void;
  handleSelectRegion: (region: { x: number; y: number; width: number; height: number }) => void;
  handlePreviewSwipe: (coords: SwipeCoordinates) => void;

  // Swipe mode
  swipeSelectMode: boolean;
  setSwipeSelectMode: (active: boolean) => void;

  // Template operations
  handleTemplateSelect: (template: ImageTemplate) => void;

  // Run from specific node
  startFromNodeId: string | null;
  setStartFromNodeId: (nodeId: string | null) => void;
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

  // Swipe select mode
  const [swipeSelectMode, setSwipeSelectMode] = useState(false);

  // Run from specific node
  const [startFromNodeId, setStartFromNodeId] = useState<string | null>(null);

  // Highlight handler
  const handleHighlightNode = useCallback((nodeId: string | null, status?: ExecutionStatus) => {
    setHighlightedNodeId(nodeId);
    setHighlightStatus(status);
  }, []);

  // Preview coordinate (퍼센트 좌표 지원)
  const handlePreviewCoordinate = useCallback((x: number, y: number, xPercent: number, yPercent: number) => {
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
      // 절대 좌표 (deprecated, 하위 호환성 및 디버깅용)
      x,
      y,
      // 퍼센트 좌표 (0-1 범위, 해상도 독립적) - 실제 실행 시 사용
      xPercent,
      yPercent,
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

  // Preview swipe (드래그로 스와이프 좌표 선택)
  const handlePreviewSwipe = useCallback((coords: SwipeCoordinates) => {
    if (!selectedNodeId) {
      alert('노드를 먼저 선택해주세요.');
      return;
    }

    const node = nodes.find(n => n.id === selectedNodeId);
    if (node?.type !== 'action') {
      alert('액션 노드를 선택해주세요.');
      return;
    }

    if (node.params?.actionType !== 'swipe') {
      alert('스와이프 액션 노드를 선택해주세요.');
      return;
    }

    const updatedParams = {
      ...node.params,
      startX: coords.startX,
      startY: coords.startY,
      endX: coords.endX,
      endY: coords.endY,
      // 비율도 함께 저장 (다른 해상도에서 재계산 가능)
      startXPercent: coords.startXPercent,
      startYPercent: coords.startYPercent,
      endXPercent: coords.endXPercent,
      endYPercent: coords.endYPercent,
    };
    handleNodeUpdate(selectedNodeId, { params: updatedParams });
    setSwipeSelectMode(false); // 선택 완료 후 모드 해제
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
            templatePackageId: template.packageId,
            templateFilename: template.filename,
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
    handlePreviewSwipe,
    swipeSelectMode,
    setSwipeSelectMode,
    handleTemplateSelect,
    startFromNodeId,
    setStartFromNodeId,
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
