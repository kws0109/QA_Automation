// frontend/src/contexts/UIContext.tsx

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

// Tab types
export type AppTab = 'scenario' | 'devices' | 'suite' | 'execution' | 'reports' | 'schedules' | 'dashboard' | 'experimental';

interface UIContextType {
  // Tab state
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;

  // Modal states
  isLoadModalOpen: boolean;
  setIsLoadModalOpen: (open: boolean) => void;
  isSaveModalOpen: boolean;
  setIsSaveModalOpen: (open: boolean) => void;
  showTemplateModal: boolean;
  setShowTemplateModal: (show: boolean) => void;
  isPackageModalOpen: boolean;
  setIsPackageModalOpen: (open: boolean) => void;
  isSummaryModalOpen: boolean;
  setIsSummaryModalOpen: (open: boolean) => void;
  isSettingsModalOpen: boolean;
  setIsSettingsModalOpen: (open: boolean) => void;

  // Region select mode
  regionSelectMode: boolean;
  setRegionSelectMode: (mode: boolean) => void;

  // Pending report ID (for navigation from dashboard to reports)
  pendingReportId: string | undefined;
  setPendingReportId: (id: string | undefined) => void;

  // Convenience functions (replacing window events)
  openSaveModal: () => void;
  closeSaveModal: () => void;
  openTemplateModal: () => void;
  closeTemplateModal: () => void;
  openLoadModal: () => void;
  closeLoadModal: () => void;
  requestRegionSelect: () => void;
  cancelRegionSelect: () => void;
}

const UIContext = createContext<UIContextType | null>(null);

interface UIProviderProps {
  children: ReactNode;
}

export function UIProvider({ children }: UIProviderProps) {
  // Tab state (default: dashboard)
  const [activeTab, setActiveTab] = useState<AppTab>('dashboard');

  // Modal states
  const [isLoadModalOpen, setIsLoadModalOpen] = useState<boolean>(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState<boolean>(false);
  const [showTemplateModal, setShowTemplateModal] = useState<boolean>(false);
  const [isPackageModalOpen, setIsPackageModalOpen] = useState<boolean>(false);
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState<boolean>(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(false);

  // Region select mode
  const [regionSelectMode, setRegionSelectMode] = useState<boolean>(false);

  // Pending report ID
  const [pendingReportId, setPendingReportId] = useState<string | undefined>();

  // Convenience functions (replacing window events)
  const openSaveModal = useCallback(() => setIsSaveModalOpen(true), []);
  const closeSaveModal = useCallback(() => setIsSaveModalOpen(false), []);
  const openTemplateModal = useCallback(() => setShowTemplateModal(true), []);
  const closeTemplateModal = useCallback(() => setShowTemplateModal(false), []);
  const openLoadModal = useCallback(() => setIsLoadModalOpen(true), []);
  const closeLoadModal = useCallback(() => setIsLoadModalOpen(false), []);
  const requestRegionSelect = useCallback(() => setRegionSelectMode(true), []);
  const cancelRegionSelect = useCallback(() => setRegionSelectMode(false), []);

  const value: UIContextType = {
    activeTab,
    setActiveTab,
    isLoadModalOpen,
    setIsLoadModalOpen,
    isSaveModalOpen,
    setIsSaveModalOpen,
    showTemplateModal,
    setShowTemplateModal,
    isPackageModalOpen,
    setIsPackageModalOpen,
    isSummaryModalOpen,
    setIsSummaryModalOpen,
    isSettingsModalOpen,
    setIsSettingsModalOpen,
    regionSelectMode,
    setRegionSelectMode,
    pendingReportId,
    setPendingReportId,
    openSaveModal,
    closeSaveModal,
    openTemplateModal,
    closeTemplateModal,
    openLoadModal,
    closeLoadModal,
    requestRegionSelect,
    cancelRegionSelect,
  };

  return (
    <UIContext.Provider value={value}>
      {children}
    </UIContext.Provider>
  );
}

export function useUI(): UIContextType {
  const context = useContext(UIContext);
  if (!context) {
    throw new Error('useUI must be used within a UIProvider');
  }
  return context;
}
