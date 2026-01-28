// frontend/src/components/SuiteManager/components/types.ts
// SuiteManager 공통 타입 정의

import {
  TestSuite,
  TestSuiteInput,
  ScenarioSummary,
  DeviceDetailedInfo,
} from '../../../types';
import { TreeNode } from '../../../hooks/useScenarioTree';

// Props 타입
export interface SuiteListProps {
  suites: TestSuite[];
  selectedSuiteId: string | null;
  devices: DeviceDetailedInfo[];
  onSelectSuite: (suiteId: string) => void;
  onNewSuite: () => void;
}

export interface SuiteEditorProps {
  selectedSuiteId: string | null;
  selectedSuite: TestSuite | undefined;
  isEditing: boolean;
  editForm: TestSuiteInput;
  scenarios: ScenarioSummary[];
  devices: DeviceDetailedInfo[];
  onSetIsEditing: (value: boolean) => void;
  onEditFormChange: (form: TestSuiteInput) => void;
  onSave: () => void;
  onDelete: () => void;
  onSelectSuite: (suiteId: string) => void;
  onOpenScenarioModal: () => void;
  onOpenDeviceModal: () => void;
  onRemoveScenario: (scenarioId: string) => void;
  onMoveScenario: (index: number, direction: 'up' | 'down') => void;
  onRemoveDevice: (deviceId: string) => void;
}

export interface ScenarioSelectorProps {
  show: boolean;
  editForm: TestSuiteInput;
  treeData: TreeNode[];
  treeLoading: boolean;
  expandedNodes: Set<string>;
  treeSearchQuery: string;
  onClose: () => void;
  onToggleScenario: (scenarioId: string) => void;
  onToggleExpand: (nodeId: string) => void;
  onSetSearchQuery: (query: string) => void;
  onClearSearch: () => void;
  onClearAll: () => void;
  nodeOrChildrenMatch: (node: TreeNode, query: string) => boolean;
  highlightText: (text: string, query: string) => React.ReactNode;
}

export interface DeviceSelectorProps {
  show: boolean;
  devices: DeviceDetailedInfo[];
  editForm: TestSuiteInput;
  searchQuery: string;
  onClose: () => void;
  onToggleDevice: (deviceId: string) => void;
  onSetSearchQuery: (query: string) => void;
  onClearAll: () => void;
}

// 헬퍼 함수 타입
export interface TreeHelpers {
  getScenarioIdsFromNode: (node: TreeNode) => string[];
  isNodeAllSelected: (node: TreeNode, selectedIds: string[]) => boolean;
  isNodePartiallySelected: (node: TreeNode, selectedIds: string[]) => boolean;
}
