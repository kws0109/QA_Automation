// frontend/src/contexts/ScenarioEditorContext.tsx
// 시나리오, 패키지, 템플릿 관련 상태 관리

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { apiClient, API_BASE_URL } from '../config/api';
import type { Scenario, ImageTemplate, ScenarioSummary, Package } from '../types';
import { useFlowEditor } from './FlowEditorContext';
import { useUI } from './UIContext';
import { useAuth } from './AuthContext';

interface ScenarioEditorContextType {
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

  // Scenario operations
  handleScenarioLoad: (scenario: Scenario) => void;
  handleNewScenario: () => void;
  handleSaveScenario: () => Promise<void>;
  handleSaveComplete: (scenarioId: string, scenarioName: string, packageId: string, categoryId: string) => void;

  // Fetch operations
  fetchPackages: () => Promise<void>;
  fetchTemplates: (packageId?: string) => Promise<void>;
  fetchScenarios: () => Promise<void>;
}

const ScenarioEditorContext = createContext<ScenarioEditorContextType | null>(null);

interface ScenarioEditorProviderProps {
  children: ReactNode;
}

export function ScenarioEditorProvider({ children }: ScenarioEditorProviderProps) {
  const { isAuthenticated, authLoading } = useAuth();
  const { nodes, connections, clearFlow, loadFlow } = useFlowEditor();
  const { openSaveModal } = useUI();

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

  // Fetch scenarios
  const fetchScenarios = useCallback(async () => {
    try {
      const res = await apiClient.get<{ success: boolean; data: ScenarioSummary[] }>(
        `${API_BASE_URL}/api/scenarios`,
      );
      if (res.data.success && Array.isArray(res.data.data)) {
        setScenarios(res.data.data);
      } else {
        setScenarios([]);
      }
    } catch (err) {
      console.error('Failed to fetch scenarios:', err);
      setScenarios([]);
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
      setTemplates(Array.isArray(res.data.data) ? res.data.data : []);
    } catch (err) {
      console.error('Failed to fetch templates:', err);
      setTemplates([]);
    }
  }, [selectedPackageId]);

  // Fetch packages
  const fetchPackages = useCallback(async () => {
    try {
      const res = await apiClient.get<{ data: Package[] }>(`${API_BASE_URL}/api/packages`);
      setPackages(Array.isArray(res.data.data) ? res.data.data : []);
    } catch (err) {
      console.error('Failed to fetch packages:', err);
      setPackages([]);
    }
  }, []);

  // Initial load - only when authenticated
  useEffect(() => {
    if (authLoading || !isAuthenticated) {
      return;
    }
    fetchPackages();
    fetchTemplates();
    fetchScenarios();
  }, [fetchPackages, fetchTemplates, fetchScenarios, isAuthenticated, authLoading]);

  // Refresh templates when package changes
  useEffect(() => {
    if (selectedPackageId) {
      fetchTemplates(selectedPackageId);
    }
  }, [selectedPackageId, fetchTemplates]);

  // Scenario load
  const handleScenarioLoad = useCallback((scenario: Scenario) => {
    loadFlow(scenario.nodes || [], scenario.connections || []);
    setCurrentScenarioId(scenario.id || null);
    setCurrentScenarioName(scenario.name || '');
    if (scenario.packageId) {
      setSelectedPackageId(scenario.packageId);
    }
    if (scenario.categoryId) {
      setSelectedCategoryId(scenario.categoryId);
    }
  }, [loadFlow]);

  // New scenario
  const handleNewScenario = useCallback(() => {
    if (nodes.length > 0 && !window.confirm('Clear current work and create new scenario?')) {
      return;
    }
    clearFlow();
    setCurrentScenarioId(null);
    setCurrentScenarioName('');
  }, [nodes.length, clearFlow]);

  // Save scenario (overwrite)
  const handleSaveScenario = useCallback(async () => {
    if (!currentScenarioId) {
      openSaveModal();
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

  const value: ScenarioEditorContextType = {
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
    handleScenarioLoad,
    handleNewScenario,
    handleSaveScenario,
    handleSaveComplete,
    fetchPackages,
    fetchTemplates,
    fetchScenarios,
  };

  return (
    <ScenarioEditorContext.Provider value={value}>
      {children}
    </ScenarioEditorContext.Provider>
  );
}

export function useScenarioEditor(): ScenarioEditorContextType {
  const context = useContext(ScenarioEditorContext);
  if (!context) {
    throw new Error('useScenarioEditor must be used within a ScenarioEditorProvider');
  }
  return context;
}
