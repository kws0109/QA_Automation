// frontend/src/App.tsx

import { useEffect } from 'react';

import Header from './components/Header/Header';
import Sidebar from './components/Sidebar/Sidebar';
import Canvas from './components/Canvas/Canvas';
import Panel from './components/Panel/Panel';
import DevicePreview from './components/DevicePreview/DevicePreview';
import ScenarioLoadModal from './components/ScenarioLoadModal/ScenarioLoadModal';
import ScenarioSaveModal from './components/ScenarioSaveModal/ScenarioSaveModal';
import TemplateModal from './components/TemplateModal/TemplateModal';
import PackageModal from './components/PackageModal/PackageModal';
import ScenarioSummaryModal from './components/ScenarioSummaryModal';
import DeviceDashboard from './components/DeviceDashboard';
import ScheduleManager from './components/ScheduleManager/ScheduleManager';
import SuiteManager from './components/SuiteManager';
import ExecutionCenter from './components/ExecutionCenter';
import TestReports from './components/TestReports';
import MetricsDashboard from './components/MetricsDashboard';
import LoginPage from './components/LoginPage';
import { NLConverter } from './components/NLConverter';
import { VideoConverter } from './components/VideoConverter';
import EditorTestPanel from './components/EditorTestPanel/EditorTestPanel';
import SlackSettings from './components/SlackSettings/SlackSettings';
import { ErrorBoundary } from './components/ErrorBoundary';

import {
  AuthProvider,
  useAuth,
  DeviceProvider,
  useDevices,
  UIProvider,
  useUI,
  AppStateProvider,
  useAppState,
} from './contexts';

import './App.css';

// Inner component that uses all contexts
function AppContent() {
  const {
    userName,
    userAvatarUrl,
    slackUserId,
    isAuthenticated,
    authLoading,
    slackEnabled,
    socket,
    isSocketConnected,
    handleSlackLoginSuccess,
    handleLogout,
  } = useAuth();

  const {
    devices,
    sessions,
    devicesLoading,
    devicesRefreshing,
    previewDeviceId,
    deviceExecutionStatus,
    fetchSessions,
    handleRefreshDevices,
    setPreviewDeviceId,
  } = useDevices();

  const {
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
  } = useUI();

  const {
    nodes,
    setNodes,
    connections,
    setConnections,
    selectedNodeId,
    currentScenarioId,
    currentScenarioName,
    selectedPackageId,
    setSelectedPackageId,
    selectedCategoryId,
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
  } = useAppState();

  // Refresh scenarios when execution tab is active
  useEffect(() => {
    if (activeTab === 'execution') {
      fetchScenarios();
    }
  }, [activeTab, fetchScenarios]);

  // Note: Window event listeners for modals removed - now using UIContext callbacks directly
  // - openSaveModal: ScenarioEditorContext calls useUI().openSaveModal()
  // - openTemplateModal/closeTemplateModal: EditorPreviewContext uses useUI() directly

  // Region select request handler
  const handleRequestRegionSelect = () => {
    if (!previewDeviceId) {
      alert('Please connect a device in DevicePreview first.');
      return;
    }
    setRegionSelectMode(true);
  };

  // Loading state
  if (authLoading) {
    return (
      <div className="app app-loading">
        <div className="app-loading-content">
          <div className="spinner" />
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  // Slack not configured
  if (!slackEnabled && !isAuthenticated) {
    return (
      <div className="app app-loading">
        <div className="app-loading-content">
          <div className="error-icon">Warning</div>
          <h2>Slack OAuth Not Configured</h2>
          <p>Slack OAuth is not configured on the server.</p>
          <p>Please contact administrator.</p>
        </div>
      </div>
    );
  }

  // Login required
  if (!isAuthenticated) {
    return <LoginPage onLoginSuccess={handleSlackLoginSuccess} />;
  }

  return (
    <div className="app">
      <Header
        isSocketConnected={isSocketConnected}
        userName={userName}
        userAvatarUrl={userAvatarUrl}
        onLogout={handleLogout}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
      />

      {/* Tab Navigation */}
      <div className="app-tabs">
        <button
          className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          통합 대시보드
        </button>
        <button
          className={`tab-btn ${activeTab === 'scenario' ? 'active' : ''}`}
          onClick={() => setActiveTab('scenario')}
        >
          시나리오 편집
        </button>
        <button
          className={`tab-btn ${activeTab === 'suite' ? 'active' : ''}`}
          onClick={() => setActiveTab('suite')}
        >
          시나리오 묶음
        </button>
        <button
          className={`tab-btn ${activeTab === 'devices' ? 'active' : ''}`}
          onClick={() => setActiveTab('devices')}
        >
          디바이스 관리
        </button>
        <button
          className={`tab-btn ${activeTab === 'execution' ? 'active' : ''}`}
          onClick={() => setActiveTab('execution')}
        >
          실행 센터
        </button>
        <button
          className={`tab-btn ${activeTab === 'reports' ? 'active' : ''}`}
          onClick={() => setActiveTab('reports')}
        >
          테스트 리포트
        </button>
        <button
          className={`tab-btn ${activeTab === 'schedules' ? 'active' : ''}`}
          onClick={() => setActiveTab('schedules')}
        >
          스케줄 관리
        </button>
        <button
          className={`tab-btn ${activeTab === 'experimental' ? 'active' : ''}`}
          onClick={() => setActiveTab('experimental')}
        >
          AI 변환
          <span className="tab-badge">Beta</span>
        </button>
      </div>

      {/* Dashboard Tab */}
      <div className="app-body" style={{ display: activeTab === 'dashboard' ? 'flex' : 'none' }}>
        <ErrorBoundary name="Dashboard">
          <MetricsDashboard
            onNavigateToReports={(executionId) => {
              setPendingReportId(executionId);
              setActiveTab('reports');
            }}
          />
        </ErrorBoundary>
      </div>

      {/* Scenario Editor Tab */}
      {activeTab === 'scenario' && (
        <>
          <div className="scenario-toolbar">
            <div className="package-selector">
              <label>패키지:</label>
              <select
                value={selectedPackageId}
                onChange={(e) => setSelectedPackageId(e.target.value)}
              >
                <option value="">-- 패키지 선택 --</option>
                {packages.map((pkg) => (
                  <option key={pkg.id} value={pkg.id}>
                    {pkg.name}
                  </option>
                ))}
              </select>
              <button
                className="package-manage-btn"
                onClick={() => setIsPackageModalOpen(true)}
                title="패키지 관리"
              >
                패키지 관리
              </button>
              {!selectedPackageId && (
                <span className="package-hint">패키지를 선택하세요</span>
              )}
            </div>

            <div className="scenario-actions">
              <button className="toolbar-btn" onClick={handleNewScenario} title="새 시나리오" disabled={!selectedPackageId}>
                New
              </button>
              <button className="toolbar-btn" onClick={() => setIsLoadModalOpen(true)} title="시나리오 불러오기">
                Load
              </button>
              <button
                className="toolbar-btn"
                onClick={() => setIsSummaryModalOpen(true)}
                title="시나리오 흐름 요약"
                disabled={nodes.length === 0}
              >
                Summary
              </button>
              <button
                className={`toolbar-btn ${currentScenarioId ? 'primary' : ''}`}
                onClick={handleSaveScenario}
                title={currentScenarioId ? '덮어쓰기' : '새로 저장'}
                disabled={!selectedPackageId}
              >
                {currentScenarioId ? 'Overwrite' : 'Save'}
              </button>
              {currentScenarioId && (
                <button
                  className="toolbar-btn"
                  onClick={() => setIsSaveModalOpen(true)}
                  title="다른 이름으로 저장"
                  disabled={!selectedPackageId}
                >
                  Save As
                </button>
              )}
            </div>
          </div>

          <div className="app-body">
            <Sidebar />

            <div className="editor-main">
              <DevicePreview
                onSelectCoordinate={handlePreviewCoordinate}
                onSelectElement={handlePreviewElement}
                onTemplateCreated={fetchTemplates}
                packageId={selectedPackageId}
                onDeviceIdChange={setPreviewDeviceId}
                regionSelectMode={regionSelectMode}
                onRegionSelectModeChange={setRegionSelectMode}
                onSelectRegion={handleSelectRegion}
              />

              <Canvas />
            </div>

            <Panel />

            <EditorTestPanel
              devices={devices.filter(d => d.role === 'editing')}
              sessions={sessions}
              nodes={nodes}
              connections={connections}
              onHighlightNode={handleHighlightNode}
              onRefreshDevices={handleRefreshDevices}
              packageId={selectedPackageId}
              packages={packages}
            />
          </div>
        </>
      )}

      {/* Device Management Tab */}
      <div className="app-body" style={{ display: activeTab === 'devices' ? 'flex' : 'none' }}>
        <ErrorBoundary name="DeviceDashboard">
          <DeviceDashboard
            devices={devices}
            sessions={sessions}
            loading={devicesLoading}
            refreshing={devicesRefreshing}
            onRefresh={handleRefreshDevices}
            onSessionChange={fetchSessions}
            executionStatus={deviceExecutionStatus}
          />
        </ErrorBoundary>
      </div>

      {/* Suite Manager Tab */}
      <div className="app-body" style={{ display: activeTab === 'suite' ? 'flex' : 'none' }}>
        <ErrorBoundary name="SuiteManager">
          <SuiteManager
            scenarios={scenarios}
            devices={devices.filter(d => d.role !== 'editing')}
            socket={socket}
          />
        </ErrorBoundary>
      </div>

      {/* Execution Center Tab */}
      <div className="app-body" style={{ display: activeTab === 'execution' ? 'flex' : 'none' }}>
        <ErrorBoundary name="ExecutionCenter">
          <ExecutionCenter
            devices={devices.filter(d => d.role !== 'editing')}
            sessions={sessions}
            scenarios={scenarios}
            socket={socket}
            onSessionChange={fetchSessions}
            userName={userName}
            slackUserId={slackUserId}
            onNavigateToReport={(reportId) => {
              setPendingReportId(reportId);
              setActiveTab('reports');
            }}
          />
        </ErrorBoundary>
      </div>

      {/* Test Reports Tab */}
      <div className="app-body" style={{ display: activeTab === 'reports' ? 'flex' : 'none' }}>
        <ErrorBoundary name="TestReports">
          <TestReports
            socket={socket}
            initialReportId={pendingReportId}
            onReportIdConsumed={() => setPendingReportId(undefined)}
          />
        </ErrorBoundary>
      </div>

      {/* Schedule Manager Tab */}
      <div className="app-body" style={{ display: activeTab === 'schedules' ? 'flex' : 'none' }}>
        <ErrorBoundary name="ScheduleManager">
          <ScheduleManager
            scenarios={scenarios}
            onRefreshScenarios={fetchScenarios}
          />
        </ErrorBoundary>
      </div>

      {/* Experimental Tab */}
      <div className="app-body experimental-tab" style={{ display: activeTab === 'experimental' ? 'flex' : 'none' }}>
        <ErrorBoundary name="Experimental">
          <div className="experimental-panels">
            <NLConverter
              onApplyScenario={(scenario) => {
                setNodes(scenario.nodes.map((n, i) => ({
                  id: n.id,
                  type: n.type === 'start' ? 'start' : 'action',
                  x: 100 + (i % 3) * 200,
                  y: 100 + Math.floor(i / 3) * 150,
                  params: n.type === 'action' ? { actionType: n.action || '', ...n.data } : {},
                  label: n.label,
                })));
                setConnections(scenario.edges.map(e => ({
                  from: e.source,
                  to: e.target,
                })));
                setActiveTab('scenario');
                alert('Scenario applied. Review nodes and fill in required information.');
              }}
            />
            <VideoConverter
              devices={devices.map((d) => ({
                id: d.id,
                name: d.alias || d.model || d.id,
                model: d.model,
                status: d.status,
              }))}
              onApplyScenario={(scenario) => {
                setNodes(scenario.nodes.map((n, i) => ({
                  id: n.id,
                  type: n.type === 'start' ? 'start' : 'action',
                  x: 100 + (i % 3) * 200,
                  y: 100 + Math.floor(i / 3) * 150,
                  params: n.type === 'action' ? { actionType: n.action || '', ...n.data } : {},
                  label: n.label,
                })));
                setConnections(scenario.edges.map(e => ({
                  from: e.source,
                  to: e.target,
                })));
                setActiveTab('scenario');
                alert('Scenario extracted from video. Review nodes and fill in required information.');
              }}
            />
          </div>
        </ErrorBoundary>
      </div>

      {/* Load Modal */}
      <ScenarioLoadModal
        isOpen={isLoadModalOpen}
        onClose={() => {
          setIsLoadModalOpen(false);
          fetchScenarios();
        }}
        onLoad={handleScenarioLoad}
        selectedPackageId={selectedPackageId}
        selectedCategoryId={selectedCategoryId}
      />

      {/* Save Modal */}
      <ScenarioSaveModal
        isOpen={isSaveModalOpen}
        onClose={() => setIsSaveModalOpen(false)}
        onSaveComplete={handleSaveComplete}
        currentNodes={nodes}
        currentConnections={connections}
        selectedPackageId={selectedPackageId}
        selectedCategoryId={selectedCategoryId}
      />

      {/* Template Modal */}
      <TemplateModal
        isOpen={showTemplateModal}
        onClose={() => {
          setShowTemplateModal(false);
          fetchTemplates(selectedPackageId);
        }}
        onSelect={handleTemplateSelect}
        packageId={selectedPackageId}
        deviceId={previewDeviceId}
      />

      {/* Package Modal */}
      <PackageModal
        isOpen={isPackageModalOpen}
        onClose={() => setIsPackageModalOpen(false)}
        onPackagesChange={fetchPackages}
      />

      {/* Scenario Summary Modal */}
      <ScenarioSummaryModal
        isOpen={isSummaryModalOpen}
        onClose={() => setIsSummaryModalOpen(false)}
        scenarioName={currentScenarioName || 'New Scenario'}
        scenarioId={currentScenarioId || undefined}
        nodes={nodes}
        connections={connections}
        templates={templates}
      />

      {/* Settings Modal */}
      {isSettingsModalOpen && (
        <div className="modal-overlay" onClick={() => setIsSettingsModalOpen(false)}>
          <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
            <div className="settings-modal-header">
              <h2>Settings</h2>
              <button
                className="settings-modal-close"
                onClick={() => setIsSettingsModalOpen(false)}
              >
                X
              </button>
            </div>
            <div className="settings-modal-content">
              <SlackSettings />
            </div>
          </div>
        </div>
      )}

      {/* Type Change Confirmation Modal */}
      {typeChangeConfirm && (
        <div className="modal-overlay" onClick={() => setTypeChangeConfirm(null)}>
          <div className="modal-content confirm-modal" onClick={e => e.stopPropagation()}>
            <h3>Change Node Type</h3>
            <p>Changing node type will reset existing settings.</p>
            <p>Continue?</p>
            <div className="modal-actions">
              <button
                className="btn-cancel"
                onClick={() => setTypeChangeConfirm(null)}
              >
                Cancel
              </button>
              <button
                className="btn-confirm"
                onClick={() => handleNodeTypeChange(typeChangeConfirm.nodeId, typeChangeConfirm.newType)}
              >
                Change
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Main App component with all providers
function App() {
  return (
    <AuthProvider>
      <DeviceProvider>
        <UIProvider>
          <AppStateProvider>
            <AppContent />
          </AppStateProvider>
        </UIProvider>
      </DeviceProvider>
    </AuthProvider>
  );
}

export default App;
