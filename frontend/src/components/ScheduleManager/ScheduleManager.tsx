// frontend/src/components/ScheduleManager/ScheduleManager.tsx
// Suite 기반 스케줄 관리 컴포넌트

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  ScheduleListItem,
  Schedule,
  ScheduleHistory,
  CreateScheduleRequest,
  TestSuite,
} from '../../types';
import './ScheduleManager.css';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:3001';

// 요일 옵션
type DayOption = 'everyday' | 'weekdays' | 'weekends' | 'custom';

interface ScheduleTime {
  dayOption: DayOption;
  customDays: number[];  // 0=일, 1=월, ..., 6=토
  hour: number;
  minute: number;
}

const DAY_LABELS: { value: DayOption; label: string }[] = [
  { value: 'everyday', label: '매일' },
  { value: 'weekdays', label: '평일 (월~금)' },
  { value: 'weekends', label: '주말 (토,일)' },
  { value: 'custom', label: '요일 선택' },
];

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

// Cron 표현식 → ScheduleTime 변환
const parseCronToScheduleTime = (cron: string): ScheduleTime => {
  const parts = cron.split(' ');
  const minute = parts[0].startsWith('*/') ? 0 : parseInt(parts[0], 10) || 0;
  const hour = parts[1] === '*' ? 0 : parseInt(parts[1], 10) || 0;
  const dayOfWeek = parts[4];

  let dayOption: DayOption = 'everyday';
  let customDays: number[] = [];

  if (dayOfWeek === '*') {
    dayOption = 'everyday';
  } else if (dayOfWeek === '1-5') {
    dayOption = 'weekdays';
  } else if (dayOfWeek === '0,6' || dayOfWeek === '6,0') {
    dayOption = 'weekends';
  } else {
    dayOption = 'custom';
    customDays = dayOfWeek.split(',').map(d => parseInt(d, 10));
  }

  return { dayOption, customDays, hour, minute };
};

// ScheduleTime → Cron 표현식 변환
const scheduleTimeToCron = (time: ScheduleTime): string => {
  let dayPart = '*';

  switch (time.dayOption) {
    case 'everyday':
      dayPart = '*';
      break;
    case 'weekdays':
      dayPart = '1-5';
      break;
    case 'weekends':
      dayPart = '0,6';
      break;
    case 'custom':
      dayPart = time.customDays.length > 0 ? time.customDays.sort().join(',') : '*';
      break;
  }

  return `${time.minute} ${time.hour} * * ${dayPart}`;
};

// 스케줄 시간 설명 생성
const getScheduleDescription = (time: ScheduleTime): string => {
  const hourStr = time.hour < 12 ? `오전 ${time.hour === 0 ? 12 : time.hour}시` : `오후 ${time.hour === 12 ? 12 : time.hour - 12}시`;
  const minuteStr = time.minute > 0 ? ` ${time.minute}분` : '';

  let dayStr = '';
  switch (time.dayOption) {
    case 'everyday':
      dayStr = '매일';
      break;
    case 'weekdays':
      dayStr = '평일(월~금)';
      break;
    case 'weekends':
      dayStr = '주말(토,일)';
      break;
    case 'custom':
      dayStr = time.customDays.map(d => WEEKDAY_LABELS[d]).join(', ') + '요일';
      break;
  }

  return `${dayStr} ${hourStr}${minuteStr}에 실행`;
};

export default function ScheduleManager() {
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
  const [formData, setFormData] = useState<CreateScheduleRequest>({
    name: '',
    suiteId: '',
    cronExpression: '0 10 * * *',
    description: '',
    repeatCount: 1,
    scenarioInterval: 0,
  });

  // 고급 옵션 표시 여부
  const [showAdvanced, setShowAdvanced] = useState(false);

  // 스케줄 시간 (드롭다운용)
  const [scheduleTime, setScheduleTime] = useState<ScheduleTime>({
    dayOption: 'everyday',
    customDays: [],
    hour: 10,
    minute: 0,
  });

  // 실행 이력
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<ScheduleHistory[]>([]);

  // 스케줄 목록 조회
  const fetchSchedules = useCallback(async () => {
    try {
      const res = await axios.get<{ success: boolean; data: ScheduleListItem[] }>(
        `${API_BASE}/api/schedules`,
      );
      if (res.data.success) {
        setSchedules(res.data.data);
      }
    } catch (err) {
      console.error('스케줄 목록 조회 실패:', err);
    }
  }, []);

  // Suite 목록 조회
  const fetchSuites = useCallback(async () => {
    try {
      const res = await axios.get<TestSuite[]>(
        `${API_BASE}/api/suites`,
      );
      setSuites(res.data);
    } catch (err) {
      console.error('묶음 목록 조회 실패:', err);
    }
  }, []);

  // 전체 실행 이력 조회
  const fetchHistory = useCallback(async () => {
    try {
      const res = await axios.get<{ success: boolean; data: ScheduleHistory[] }>(
        `${API_BASE}/api/schedules/history`,
      );
      if (res.data.success) {
        setHistory(res.data.data);
      }
    } catch (err) {
      console.error('실행 이력 조회 실패:', err);
    }
  }, []);

  // 스케줄 상세 조회
  const fetchScheduleDetail = useCallback(async (id: string) => {
    try {
      const res = await axios.get<{ success: boolean; data: Schedule }>(
        `${API_BASE}/api/schedules/${id}`,
      );
      if (res.data.success) {
        setSelectedSchedule(res.data.data);
      }
    } catch (err) {
      console.error('스케줄 조회 실패:', err);
    }
  }, []);

  // 초기 로드
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchSchedules(), fetchSuites()]);
      setLoading(false);
    };
    loadData();
  }, [fetchSchedules, fetchSuites]);

  // 스케줄 선택 시 상세 조회
  useEffect(() => {
    if (selectedScheduleId && !isEditing && !isCreating) {
      fetchScheduleDetail(selectedScheduleId);
    }
  }, [selectedScheduleId, isEditing, isCreating, fetchScheduleDetail]);

  // 스케줄 생성
  const handleCreate = async () => {
    if (!formData.name || !formData.suiteId) {
      alert('이름과 묶음을 선택해주세요.');
      return;
    }

    try {
      const res = await axios.post<{ success: boolean; data: Schedule }>(
        `${API_BASE}/api/schedules`, formData
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
      await axios.put(`${API_BASE}/api/schedules/${selectedScheduleId}`, formData);
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
      await axios.delete(`${API_BASE}/api/schedules/${id}`);
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
      await axios.post(`${API_BASE}/api/schedules/${id}/${endpoint}`);
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
      await axios.post(`${API_BASE}/api/schedules/${id}/run`);
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

  // 폼 리셋
  const resetForm = () => {
    setIsEditing(false);
    setIsCreating(false);
    setFormData({
      name: '',
      suiteId: '',
      cronExpression: '0 10 * * *',
      description: '',
      repeatCount: 1,
      scenarioInterval: 0,
    });
    setScheduleTime({
      dayOption: 'everyday',
      customDays: [],
      hour: 10,
      minute: 0,
    });
    setShowAdvanced(false);
  };

  // 시간 포맷팅
  const formatTime = (isoString?: string) => {
    if (!isoString) return '-';
    const date = new Date(isoString);
    return date.toLocaleString('ko-KR', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Cron 표현식 설명
  const getCronDescription = (expr: string): string => {
    const time = parseCronToScheduleTime(expr);
    return getScheduleDescription(time);
  };

  // scheduleTime 변경 핸들러
  const handleScheduleTimeChange = (updates: Partial<ScheduleTime>) => {
    const newTime = { ...scheduleTime, ...updates };
    setScheduleTime(newTime);
    setFormData(prev => ({
      ...prev,
      cronExpression: scheduleTimeToCron(newTime),
    }));
  };

  // 요일 토글 (custom 모드)
  const toggleCustomDay = (day: number) => {
    const newDays = scheduleTime.customDays.includes(day)
      ? scheduleTime.customDays.filter(d => d !== day)
      : [...scheduleTime.customDays, day];
    handleScheduleTimeChange({ customDays: newDays });
  };

  // 선택된 Suite 정보 가져오기
  const getSelectedSuiteInfo = (suiteId: string) => {
    const suite = suites.find(s => s.id === suiteId);
    if (!suite) return null;
    return {
      name: suite.name,
      scenarioCount: suite.scenarioIds.length,
      deviceCount: suite.deviceIds.length,
    };
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

  // 스케줄 폼 렌더링
  const renderScheduleForm = () => {
    const suiteInfo = formData.suiteId ? getSelectedSuiteInfo(formData.suiteId) : null;

    return (
      <div className="schedule-form">
        <div className="form-group">
          <label>스케줄 이름 *</label>
          <input
            type="text"
            value={formData.name}
            onChange={e => setFormData({ ...formData, name: e.target.value })}
            placeholder="예: 매일 아침 테스트"
          />
        </div>

        <div className="form-group">
          <label>실행할 묶음 *</label>
          <select
            value={formData.suiteId}
            onChange={e => setFormData({ ...formData, suiteId: e.target.value })}
          >
            <option value="">묶음 선택</option>
            {suites.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {suiteInfo && (
            <div className="suite-info">
              <span className="suite-info-item">📋 시나리오 {suiteInfo.scenarioCount}개</span>
              <span className="suite-info-item">📱 디바이스 {suiteInfo.deviceCount}대</span>
            </div>
          )}
          {suites.length === 0 && (
            <div className="no-suites-warning">
              등록된 묶음이 없습니다. 먼저 묶음 관리에서 묶음을 생성해주세요.
            </div>
          )}
        </div>

        <div className="form-group">
          <label>실행 주기 *</label>
          <div className="schedule-time-section">
            <div className="schedule-row">
              <label className="schedule-label">반복</label>
              <select
                value={scheduleTime.dayOption}
                onChange={e => handleScheduleTimeChange({ dayOption: e.target.value as DayOption, customDays: [] })}
                className="schedule-select"
              >
                {DAY_LABELS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {scheduleTime.dayOption === 'custom' && (
              <div className="weekday-selector">
                {WEEKDAY_LABELS.map((label, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className={`weekday-btn ${scheduleTime.customDays.includes(idx) ? 'active' : ''}`}
                    onClick={() => toggleCustomDay(idx)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            <div className="schedule-row">
              <label className="schedule-label">시간</label>
              <select
                value={scheduleTime.hour}
                onChange={e => handleScheduleTimeChange({ hour: parseInt(e.target.value, 10) })}
                className="schedule-select time-select"
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>
                    {i < 12 ? `오전 ${i === 0 ? 12 : i}시` : `오후 ${i === 12 ? 12 : i - 12}시`}
                  </option>
                ))}
              </select>
              <select
                value={scheduleTime.minute}
                onChange={e => handleScheduleTimeChange({ minute: parseInt(e.target.value, 10) })}
                className="schedule-select time-select"
              >
                {[0, 15, 30, 45].map(m => (
                  <option key={m} value={m}>{m.toString().padStart(2, '0')}분</option>
                ))}
              </select>
            </div>

            <div className="schedule-summary">{getScheduleDescription(scheduleTime)}</div>
          </div>
        </div>

        <div className="advanced-toggle">
          <button
            type="button"
            className="btn-advanced-toggle"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            고급 옵션 {showAdvanced ? '▲' : '▼'}
          </button>
        </div>

        {showAdvanced && (
          <div className="advanced-options">
            <div className="form-group-inline">
              <label>반복 횟수</label>
              <input
                type="number"
                min={1}
                max={100}
                value={formData.repeatCount ?? 1}
                onChange={e => setFormData({ ...formData, repeatCount: parseInt(e.target.value, 10) || 1 })}
              />
              <span className="unit">회</span>
            </div>
            <div className="form-group-inline">
              <label>시나리오 간격</label>
              <input
                type="number"
                min={0}
                max={60000}
                step={1000}
                value={formData.scenarioInterval ?? 0}
                onChange={e => setFormData({ ...formData, scenarioInterval: parseInt(e.target.value, 10) || 0 })}
              />
              <span className="unit">ms</span>
            </div>
          </div>
        )}

        <div className="form-group">
          <label>설명 (선택)</label>
          <textarea
            value={formData.description}
            onChange={e => setFormData({ ...formData, description: e.target.value })}
            placeholder="스케줄에 대한 설명"
            rows={2}
          />
        </div>
      </div>
    );
  };

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
        <div className="schedule-list-panel">
          <div className="schedule-list-header">
            <h2>스케줄</h2>
            <div className="header-actions">
              <button
                className={`btn-history ${showHistory ? 'active' : ''}`}
                onClick={handleToggleHistory}
              >
                {showHistory ? '📅 목록' : '📊 이력'}
              </button>
              <button className="btn-new-schedule" onClick={handleStartCreate}>
                + 새 스케줄
              </button>
            </div>
          </div>

          <div className="schedule-list-content">
            {schedules.length === 0 ? (
              <div className="schedule-list-empty">
                <p>📅</p>
                <p>등록된 스케줄이 없습니다</p>
              </div>
            ) : (
              schedules.map(s => (
                <div
                  key={s.id}
                  className={`schedule-item ${selectedScheduleId === s.id ? 'selected' : ''} ${!s.enabled ? 'disabled' : ''}`}
                  onClick={() => {
                    setSelectedScheduleId(s.id);
                    setShowHistory(false);
                    resetForm();
                  }}
                >
                  <div className="schedule-item-header">
                    <span className="schedule-item-name">{s.name}</span>
                    <div className="schedule-item-toggle">
                      <label className="toggle-switch" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={s.enabled}
                          onChange={() => {}}
                          onClick={(e) => handleToggleEnabled(s.id, s.enabled, e)}
                        />
                        <span className="slider"></span>
                      </label>
                    </div>
                  </div>
                  <div className="schedule-item-meta">
                    <span>📦 {s.suiteName}</span>
                    <span className="schedule-item-cron">{getCronDescription(s.cronExpression)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 우측: 상세/편집/이력 */}
        <div className="schedule-detail-panel">
          {showHistory ? (
            // 실행 이력 뷰
            <div className="history-panel">
              <div className="history-header">
                <h2>실행 이력</h2>
              </div>
              <div className="history-content">
                {history.length === 0 ? (
                  <div className="history-empty">
                    <p>📊</p>
                    <p>실행 이력이 없습니다</p>
                  </div>
                ) : (
                  <div className="history-list">
                    {history.map(h => (
                      <div key={h.id} className={`history-item ${h.success ? 'success' : 'failed'}`}>
                        <div className={`history-item-status ${h.success ? 'success' : 'failed'}`} />
                        <div className="history-item-info">
                          <div className="history-item-name">{h.scheduleName}</div>
                          <div className="history-item-suite">📦 {h.suiteName}</div>
                          {h.error && <div className="history-item-error">{h.error}</div>}
                        </div>
                        <div className="history-item-time">
                          <div>{formatTime(h.startedAt)}</div>
                          <div>~ {formatTime(h.completedAt)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
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
                {renderScheduleForm()}
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
                {renderScheduleForm()}
              </div>
            </div>
          ) : selectedSchedule ? (
            // 스케줄 상세 뷰
            <div className="schedule-detail">
              <div className="schedule-detail-header">
                <div className="schedule-detail-title">
                  <h2>{selectedSchedule.name}</h2>
                  <span className={`status-badge ${selectedSchedule.enabled ? 'enabled' : 'disabled'}`}>
                    {selectedSchedule.enabled ? '활성' : '비활성'}
                  </span>
                </div>
                <div className="schedule-editor-actions">
                  <button
                    className="btn-icon success"
                    onClick={() => handleRunNow(selectedSchedule.id)}
                    title="즉시 실행"
                  >
                    ▶
                  </button>
                  <button
                    className="btn-icon"
                    onClick={handleStartEdit}
                    title="수정"
                  >
                    ✎
                  </button>
                  <button
                    className="btn-icon danger"
                    onClick={() => handleDelete(selectedSchedule.id)}
                    title="삭제"
                  >
                    🗑
                  </button>
                </div>
              </div>
              <div className="schedule-detail-content">
                <div className="detail-section">
                  <h3>기본 정보</h3>
                  <div className="detail-grid">
                    <div className="detail-item">
                      <span className="detail-label">묶음</span>
                      <span className="detail-value">
                        {getSelectedSuiteInfo(selectedSchedule.suiteId)?.name || '(삭제된 묶음)'}
                      </span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">실행 주기</span>
                      <span className="detail-value">{getCronDescription(selectedSchedule.cronExpression)}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Cron 표현식</span>
                      <span className="detail-value cron">{selectedSchedule.cronExpression}</span>
                    </div>
                    {selectedSchedule.description && (
                      <div className="detail-item">
                        <span className="detail-label">설명</span>
                        <span className="detail-value">{selectedSchedule.description}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="detail-section">
                  <h3>실행 옵션</h3>
                  <div className="detail-grid">
                    <div className="detail-item">
                      <span className="detail-label">반복 횟수</span>
                      <span className="detail-value">{selectedSchedule.repeatCount ?? 1}회</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">시나리오 간격</span>
                      <span className="detail-value">{selectedSchedule.scenarioInterval ?? 0}ms</span>
                    </div>
                  </div>
                </div>

                <div className="detail-section">
                  <h3>실행 기록</h3>
                  <div className="detail-grid">
                    <div className="detail-item">
                      <span className="detail-label">마지막 실행</span>
                      <span className="detail-value">{formatTime(selectedSchedule.lastRunAt)}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">다음 실행</span>
                      <span className="detail-value">
                        {selectedSchedule.enabled ? formatTime(selectedSchedule.nextRunAt) : '-'}
                      </span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">생성일</span>
                      <span className="detail-value">{formatTime(selectedSchedule.createdAt)}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">수정일</span>
                      <span className="detail-value">{formatTime(selectedSchedule.updatedAt)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            // 빈 상태
            <div className="schedule-detail-empty">
              <p>📅</p>
              <p>스케줄을 선택하거나 새로 생성해주세요</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
