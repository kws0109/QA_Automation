// frontend/src/components/SuiteManager/SuiteManager.tsx
// Test Suite 관리 컴포넌트 (CRUD 전용)

import { useState, useEffect, useCallback } from 'react';
import {
  TestSuite,
  TestSuiteInput,
  ScenarioSummary,
  DeviceDetailedInfo,
} from '../../types';
import { Socket } from 'socket.io-client';
import { useScenarioTree } from '../../hooks/useScenarioTree';
import { authFetch, API_BASE_URL } from '../../config/api';
import {
  SuiteList,
  SuiteEditor,
  ScenarioSelector,
  DeviceSelector,
} from './components';
import './SuiteManager.css';

const API_PATH = `${API_BASE_URL}/api`;

interface SuiteManagerProps {
  scenarios: ScenarioSummary[];
  devices: DeviceDetailedInfo[];
  socket: Socket | null;
}

export default function SuiteManager({ scenarios, devices }: SuiteManagerProps) {
  // Suite 목록
  const [suites, setSuites] = useState<TestSuite[]>([]);
  const [selectedSuiteId, setSelectedSuiteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // 편집 상태
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<TestSuiteInput>({
    name: '',
    description: '',
    scenarioIds: [],
    deviceIds: [],
  });

  // 모달 상태
  const [showScenarioModal, setShowScenarioModal] = useState(false);
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // 시나리오 트리 (모달용)
  const {
    treeData,
    expandedNodes,
    loading: treeLoading,
    searchQuery: treeSearchQuery,
    loadTreeData,
    toggleExpand,
    setSearchQuery: setTreeSearchQuery,
    clearSearch: clearTreeSearch,
    nodeOrChildrenMatch,
    highlightText,
  } = useScenarioTree();

  // Suite 목록 로드
  const loadSuites = useCallback(async () => {
    try {
      const res = await authFetch(`${API_PATH}/suites`);
      const data = await res.json();
      setSuites(data);
    } catch (err) {
      console.error('Failed to load suites:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSuites();
  }, [loadSuites]);

  // 선택된 Suite
  const selectedSuite = suites.find(s => s.id === selectedSuiteId);

  // Suite 선택
  const handleSelectSuite = useCallback((suiteId: string) => {
    setSelectedSuiteId(suiteId);
    setIsEditing(false);

    const suite = suites.find(s => s.id === suiteId);
    if (suite) {
      setEditForm({
        name: suite.name,
        description: suite.description || '',
        scenarioIds: [...suite.scenarioIds],
        deviceIds: [...suite.deviceIds],
      });
    }
  }, [suites]);

  // 새 Suite 생성
  const handleNewSuite = useCallback(() => {
    setSelectedSuiteId(null);
    setIsEditing(true);
    setEditForm({
      name: '',
      description: '',
      scenarioIds: [],
      deviceIds: [],
    });
  }, []);

  // Suite 저장
  const handleSave = useCallback(async () => {
    if (!editForm.name.trim()) {
      alert('시나리오 묶음 이름을 입력해주세요.');
      return;
    }
    if (editForm.scenarioIds.length === 0) {
      alert('최소 하나의 시나리오를 선택해주세요.');
      return;
    }
    if (editForm.deviceIds.length === 0) {
      alert('최소 하나의 디바이스를 선택해주세요.');
      return;
    }

    try {
      const url = selectedSuiteId
        ? `${API_PATH}/suites/${selectedSuiteId}`
        : `${API_PATH}/suites`;
      const method = selectedSuiteId ? 'PUT' : 'POST';

      const res = await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });

      if (!res.ok) {
        throw new Error('Failed to save suite');
      }

      const savedSuite = await res.json();

      if (selectedSuiteId) {
        setSuites(prev => prev.map(s => s.id === savedSuite.id ? savedSuite : s));
      } else {
        setSuites(prev => [savedSuite, ...prev]);
        setSelectedSuiteId(savedSuite.id);
      }

      setIsEditing(false);
      alert('저장되었습니다.');
    } catch (err) {
      console.error('Failed to save suite:', err);
      alert('저장에 실패했습니다.');
    }
  }, [editForm, selectedSuiteId]);

  // Suite 삭제
  const handleDelete = useCallback(async () => {
    if (!selectedSuiteId) return;

    if (!confirm('정말 이 시나리오 묶음을 삭제하시겠습니까?')) return;

    try {
      await authFetch(`${API_PATH}/suites/${selectedSuiteId}`, {
        method: 'DELETE',
      });

      setSuites(prev => prev.filter(s => s.id !== selectedSuiteId));
      setSelectedSuiteId(null);
      setIsEditing(false);
    } catch (err) {
      console.error('Failed to delete suite:', err);
      alert('삭제에 실패했습니다.');
    }
  }, [selectedSuiteId]);

  // 시나리오 추가/제거 토글
  const handleToggleScenario = useCallback((scenarioId: string) => {
    setEditForm(prev => {
      const exists = prev.scenarioIds.includes(scenarioId);
      return {
        ...prev,
        scenarioIds: exists
          ? prev.scenarioIds.filter(id => id !== scenarioId)
          : [...prev.scenarioIds, scenarioId],
      };
    });
  }, []);

  // 시나리오 제거
  const handleRemoveScenario = useCallback((scenarioId: string) => {
    setEditForm(prev => ({
      ...prev,
      scenarioIds: prev.scenarioIds.filter(id => id !== scenarioId),
    }));
  }, []);

  // 시나리오 순서 변경
  const handleMoveScenario = useCallback((index: number, direction: 'up' | 'down') => {
    setEditForm(prev => {
      const newIds = [...prev.scenarioIds];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;

      if (targetIndex < 0 || targetIndex >= newIds.length) return prev;

      [newIds[index], newIds[targetIndex]] = [newIds[targetIndex], newIds[index]];

      return {
        ...prev,
        scenarioIds: newIds,
      };
    });
  }, []);

  // 디바이스 추가/제거 토글
  const handleToggleDevice = useCallback((deviceId: string) => {
    setEditForm(prev => {
      const exists = prev.deviceIds.includes(deviceId);
      return {
        ...prev,
        deviceIds: exists
          ? prev.deviceIds.filter(id => id !== deviceId)
          : [...prev.deviceIds, deviceId],
      };
    });
  }, []);

  // 디바이스 제거
  const handleRemoveDevice = useCallback((deviceId: string) => {
    setEditForm(prev => ({
      ...prev,
      deviceIds: prev.deviceIds.filter(id => id !== deviceId),
    }));
  }, []);

  // 시나리오 모달 열기 (트리 데이터 로드)
  const handleOpenScenarioModal = useCallback(() => {
    loadTreeData();
    setShowScenarioModal(true);
  }, [loadTreeData]);

  // 시나리오 전체 해제
  const handleClearAllScenarios = useCallback(() => {
    setEditForm(prev => ({ ...prev, scenarioIds: [] }));
  }, []);

  // 디바이스 전체 해제
  const handleClearAllDevices = useCallback(() => {
    setEditForm(prev => ({ ...prev, deviceIds: [] }));
  }, []);

  if (loading) {
    return (
      <div className="suite-manager">
        <div className="loading-spinner">시나리오 묶음 목록을 불러오는 중...</div>
      </div>
    );
  }

  return (
    <div className="suite-manager">
      {/* Suite 관리 (탭 없이 단일 뷰) */}
      <div className="suite-content suite-content-no-tabs">
        {/* 좌측: Suite 목록 */}
        <SuiteList
          suites={suites}
          selectedSuiteId={selectedSuiteId}
          devices={devices}
          onSelectSuite={handleSelectSuite}
          onNewSuite={handleNewSuite}
        />

        {/* 우측: Suite 편집기 */}
        <SuiteEditor
          selectedSuiteId={selectedSuiteId}
          selectedSuite={selectedSuite}
          isEditing={isEditing}
          editForm={editForm}
          scenarios={scenarios}
          devices={devices}
          onSetIsEditing={setIsEditing}
          onEditFormChange={setEditForm}
          onSave={handleSave}
          onDelete={handleDelete}
          onSelectSuite={handleSelectSuite}
          onOpenScenarioModal={handleOpenScenarioModal}
          onOpenDeviceModal={() => setShowDeviceModal(true)}
          onRemoveScenario={handleRemoveScenario}
          onMoveScenario={handleMoveScenario}
          onRemoveDevice={handleRemoveDevice}
        />
      </div>

      {/* 시나리오 선택 모달 (트리 구조) */}
      <ScenarioSelector
        show={showScenarioModal}
        editForm={editForm}
        treeData={treeData}
        treeLoading={treeLoading}
        expandedNodes={expandedNodes}
        treeSearchQuery={treeSearchQuery}
        onClose={() => setShowScenarioModal(false)}
        onToggleScenario={handleToggleScenario}
        onToggleExpand={toggleExpand}
        onSetSearchQuery={setTreeSearchQuery}
        onClearSearch={clearTreeSearch}
        onClearAll={handleClearAllScenarios}
        nodeOrChildrenMatch={nodeOrChildrenMatch}
        highlightText={highlightText}
      />

      {/* 디바이스 선택 모달 */}
      <DeviceSelector
        show={showDeviceModal}
        devices={devices}
        editForm={editForm}
        searchQuery={searchQuery}
        onClose={() => setShowDeviceModal(false)}
        onToggleDevice={handleToggleDevice}
        onSetSearchQuery={setSearchQuery}
        onClearAll={handleClearAllDevices}
      />
    </div>
  );
}
