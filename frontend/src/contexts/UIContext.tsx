// frontend/src/contexts/UIContext.tsx

import { createContext, useContext, useState, ReactNode } from 'react';

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
