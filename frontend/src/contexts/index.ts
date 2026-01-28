// frontend/src/contexts/index.ts

export { AuthProvider, useAuth } from './AuthContext';
export { DeviceProvider, useDevices } from './DeviceContext';
export { UIProvider, useUI } from './UIContext';
export type { AppTab } from './UIContext';

// 분리된 Context들 (새 코드에서 권장)
export { FlowEditorProvider, useFlowEditor } from './FlowEditorContext';
export { ScenarioEditorProvider, useScenarioEditor } from './ScenarioEditorContext';
export { EditorPreviewProvider, useEditorPreview } from './EditorPreviewContext';

// 하위 호환성을 위한 통합 Context (기존 코드와 호환)
export { AppStateProvider, useAppState } from './AppStateContext';
export type { AppStateContextType } from './AppStateContext';
