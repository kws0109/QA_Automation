// frontend/src/components/ScheduleManager/ScheduleManager.tsx
// Suite 기반 스케줄 관리 컴포넌트

import { useState, useEffect, useCallback } from 'react';
import {
  ScheduleListItem,
  Schedule,
  ScheduleHistory,
  CreateScheduleRequest,
  TestSuite,
} from '../../types';
import { apiClient, API_BASE_URL } from '../../config/api';
import { useAuth } from '../../contexts/AuthContext';
import {
  ScheduleList,
  ScheduleForm,
  HistoryPanel,
  ScheduleDetail,
  ScheduleTime,
  parseCronToScheduleTime,
  scheduleTimeToCron,
  DEFAULT_SCHEDULE_TIME,
  DEFAULT_CRON_EXPRESSION,
} from './components';
import './ScheduleManager.css';

// 기본 폼 데이터
const DEFAULT_FORM_DATA: CreateScheduleRequest = {
  name: '',
  suiteId: '',
  cronExpression: DEFAULT_CRON_EXPRESSION,
  description: '',
  repeatCount: 1,
  scenarioInterval: 0,
};

export default function ScheduleManager() {
  const { isAuthenticated, authLoading } = useAuth();

  // 스케줄 목록
  const [schedules, setSchedules] = useState<ScheduleListItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Suite 목록
  const [suites, setSuites] = useState<TestSuite[]>([]);

  // 선택된 스케줄
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);

  // 편집 모드
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // 폼 상태
  const [formData, setFormData] = useState<CreateScheduleRequest>(DEFAULT_FORM_DATA);

  // 고급 옵션 표시 여부 (편집 시 사용)
  const [showAdvanced, setShowAdvanced] = useState(false);

  // 스케줄 시간 (드롭다운용)
  const [scheduleTime, setScheduleTime] = useState<ScheduleTime>(DEFAULT_SCHEDULE_TIME);

  // 실행 이력
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<ScheduleHistory[]>([]);

  // 스케줄 목록 조회
  const fetchSchedules = useCallback(async () => {
    try {
      const res = await apiClient.get<{ success: boolean; data: ScheduleListItem[] }>(
        `${API_BASE_URL}/api/schedules`,
      );
      if (res.data.success && Array.isArray(res.data.data)) {
        setSchedules(res.data.data);
      } else {
        setSchedules([]);
      }
    } catch (err) {
      console.error('스케줄 목록 조회 실패:', err);
      setSchedules([]);
    }
  }, []);

  // Suite 목록 조회
  const fetchSuites = useCallback(async () => {
    try {
      const res = await apiClient.get<TestSuite[]>(
        `${API_BASE_URL}/api/suites`,
      );
      setSuites(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('묶음 목록 조회 실패:', err);
      setSuites([]);
    }
  }, []);

  // 전체 실행 이력 조회
  const fetchHistory = useCallback(async () => {
    try {
      const res = await apiClient.get<{ success: boolean; data: ScheduleHistory[] }>(
        `${API_BASE_URL}/api/schedules/history`,
      );
      if (res.data.success && Array.isArray(res.data.data)) {
        setHistory(res.data.data);
      } else {
        setHistory([]);
      }
    } catch (err) {
      console.error('실행 이력 조회 실패:', err);
      setHistory([]);
    }
  }, []);

  // 스케줄 상세 조회
  const fetchScheduleDetail = useCallback(async (id: string) => {
    try {
      const res = await apiClient.get<{ success: boolean; data: Schedule }>(
        `${API_BASE_URL}/api/schedules/${id}`,
      );
      if (res.data.success) {
        setSelectedSchedule(res.data.data);
      }
    } catch (err) {
      console.error('스케줄 조회 실패:', err);
    }
  }, []);

  // 초기 로드 - 인증 완료 후에만
  useEffect(() => {
    if (authLoading || !isAuthenticated) {
      setLoading(false);
      return;
    }
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchSchedules(), fetchSuites()]);
      setLoading(false);
    };
    loadData();
  }, [fetchSchedules, fetchSuites, isAuthenticated, authLoading]);

  // 스케줄 선택 시 상세 조회
  useEffect(() => {
    if (selectedScheduleId && !isEditing && !isCreating) {
      fetchScheduleDetail(selectedScheduleId);
    }
  }, [selectedScheduleId, isEditing, isCreating, fetchScheduleDetail]);

  // 폼 리셋
  const resetForm = useCallback(() => {
    setIsEditing(false);
    setIsCreating(false);
    setFormData(DEFAULT_FORM_DATA);
    setScheduleTime(DEFAULT_SCHEDULE_TIME);
    setShowAdvanced(false);
  }, []);

  // scheduleTime 변경 핸들러
  const handleScheduleTimeChange = useCallback((updates: Partial<ScheduleTime>) => {
    setScheduleTime(prev => {
      const newTime = { ...prev, ...updates };
      setFormData(prevForm => ({
        ...prevForm,
        cronExpression: scheduleTimeToCron(newTime),
      }));
      return newTime;
    });
  }, []);

  // 스케줄 생성
  const handleCreate = async () => {
    if (!formData.name || !formData.suiteId) {
      alert('이름과 묶음을 선택해주세요.');
      return;
    }

    try {
      const res = await apiClient.post<{ success: boolean; data: Schedule }>(
        `${API_BASE_URL}/api/schedules`, formData
      );
      if (res.data.success) {
        await fetchSchedules();
        setSelectedScheduleId(res.data.data.id);
        resetForm();
      }
    } catch (err) {
      console.error('스케줄 생성 실패:', err);
      alert('스케줄 생성에 실패했습니다.');
    }
  };

  // 스케줄 수정
  const handleUpdate = async () => {
    if (!selectedScheduleId) return;

    try {
      await apiClient.put(`${API_BASE_URL}/api/schedules/${selectedScheduleId}`, formData);
      await fetchSchedules();
      await fetchScheduleDetail(selectedScheduleId);
      setIsEditing(false);
    } catch (err) {
      console.error('스케줄 수정 실패:', err);
      alert('스케줄 수정에 실패했습니다.');
    }
  };

  // 스케줄 삭제
  const handleDelete = async (id: string) => {
    if (!confirm('이 스케줄을 삭제하시겠습니까?')) return;

    try {
      await apiClient.delete(`${API_BASE_URL}/api/schedules/${id}`);
      await fetchSchedules();
      if (selectedScheduleId === id) {
        setSelectedScheduleId(null);
        setSelectedSchedule(null);
      }
    } catch (err) {
      console.error('스케줄 삭제 실패:', err);
      alert('스케줄 삭제에 실패했습니다.');
    }
  };

  // 스케줄 활성화/비활성화 토글
  const handleToggleEnabled = async (id: string, currentEnabled: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const endpoint = currentEnabled ? 'disable' : 'enable';
      await apiClient.post(`${API_BASE_URL}/api/schedules/${id}/${endpoint}`);
      await fetchSchedules();
      if (selectedScheduleId === id) {
        await fetchScheduleDetail(id);
      }
    } catch (err) {
      console.error('스케줄 상태 변경 실패:', err);
      alert('스케줄 상태 변경에 실패했습니다.');
    }
  };

  // 즉시 실행
  const handleRunNow = async (id: string) => {
    try {
      await apiClient.post(`${API_BASE_URL}/api/schedules/${id}/run`);
      alert('스케줄 실행이 시작되었습니다.');
    } catch (err) {
      console.error('스케줄 즉시 실행 실패:', err);
      alert('스케줄 실행에 실패했습니다.');
    }
  };

  // 수정 모드 진입
  const handleStartEdit = () => {
    if (!selectedSchedule) return;
    setFormData({
      name: selectedSchedule.name,
      suiteId: selectedSchedule.suiteId,
      cronExpression: selectedSchedule.cronExpression,
      description: selectedSchedule.description || '',
      repeatCount: selectedSchedule.repeatCount ?? 1,
      scenarioInterval: selectedSchedule.scenarioInterval ?? 0,
    });
    setScheduleTime(parseCronToScheduleTime(selectedSchedule.cronExpression));
    if ((selectedSchedule.repeatCount ?? 1) > 1 || (selectedSchedule.scenarioInterval ?? 0) > 0) {
      setShowAdvanced(true);
    }
    setIsEditing(true);
  };

  // 새 스케줄 생성 시작
  const handleStartCreate = () => {
    resetForm();
    setSelectedScheduleId(null);
    setSelectedSchedule(null);
    setIsCreating(true);
  };

  // 스케줄 선택
  const handleSelectSchedule = (id: string) => {
    setSelectedScheduleId(id);
    setShowHistory(false);
    resetForm();
  };

  // 이력 모드 토글
  const handleToggleHistory = () => {
    if (!showHistory) {
      fetchHistory();
    }
    setShowHistory(!showHistory);
    setSelectedScheduleId(null);
    setSelectedSchedule(null);
    resetForm();
  };

  // 로딩 상태
  if (loading) {
    return (
      <div className="schedule-manager">
        <div className="loading-state">
          <div className="loading-spinner">스케줄 로딩 중...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="schedule-manager">
      <div className="schedule-content">
        {/* 좌측: 스케줄 목록 */}
        <ScheduleList
          schedules={schedules}
          selectedScheduleId={selectedScheduleId}
          showHistory={showHistory}
          onSelectSchedule={handleSelectSchedule}
          onToggleEnabled={handleToggleEnabled}
          onToggleHistory={handleToggleHistory}
          onStartCreate={handleStartCreate}
        />

        {/* 우측: 상세/편집/이력 */}
        <div className="schedule-detail-panel">
          {showHistory ? (
            // 실행 이력 뷰
            <HistoryPanel history={history} />
          ) : isCreating ? (
            // 스케줄 생성 폼
            <div className="schedule-editor">
              <div className="schedule-editor-header">
                <h2>새 스케줄 생성</h2>
                <div className="schedule-editor-actions">
                  <button className="btn-secondary" onClick={resetForm}>취소</button>
                  <button
                    className="btn-primary"
                    onClick={handleCreate}
                    disabled={!formData.name || !formData.suiteId}
                  >
                    생성
                  </button>
                </div>
              </div>
              <div className="schedule-editor-content">
                <ScheduleForm
                  formData={formData}
                  scheduleTime={scheduleTime}
                  suites={suites}
                  onFormDataChange={setFormData}
                  onScheduleTimeChange={handleScheduleTimeChange}
                />
              </div>
            </div>
          ) : isEditing && selectedSchedule ? (
            // 스케줄 수정 폼
            <div className="schedule-editor">
              <div className="schedule-editor-header">
                <h2>스케줄 수정</h2>
                <div className="schedule-editor-actions">
                  <button className="btn-secondary" onClick={() => setIsEditing(false)}>취소</button>
                  <button
                    className="btn-primary"
                    onClick={handleUpdate}
                    disabled={!formData.name || !formData.suiteId}
                  >
                    저장
                  </button>
                </div>
              </div>
              <div className="schedule-editor-content">
                <ScheduleForm
                  formData={formData}
                  scheduleTime={scheduleTime}
                  suites={suites}
                  onFormDataChange={setFormData}
                  onScheduleTimeChange={handleScheduleTimeChange}
                  initialShowAdvanced={showAdvanced}
                />
              </div>
            </div>
          ) : selectedSchedule ? (
            // 스케줄 상세 뷰
            <ScheduleDetail
              schedule={selectedSchedule}
              suites={suites}
              onRunNow={handleRunNow}
              onStartEdit={handleStartEdit}
              onDelete={handleDelete}
            />
          ) : (
            // 빈 상태
            <div className="schedule-detail-empty">
              <p>스케줄을 선택하거나 새로 생성해주세요</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
