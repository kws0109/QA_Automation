// frontend/src/components/ScheduleManager/ScheduleManager.tsx

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  ScheduleListItem,
  Schedule,
  ScheduleHistory,
  CreateScheduleRequest,
  ScenarioSummary,
  DeviceInfo,
} from '../../types';
import './ScheduleManager.css';

const API_BASE = 'http://localhost:3001';

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

interface ScheduleManagerProps {
  scenarios: ScenarioSummary[];
  onRefreshScenarios?: () => void;
}

export default function ScheduleManager({
  scenarios,
  onRefreshScenarios,
}: ScheduleManagerProps) {
  // 스케줄 목록
  const [schedules, setSchedules] = useState<ScheduleListItem[]>([]);
  const [loading, setLoading] = useState(true);

  // 폼 상태
  const [showForm, setShowForm] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [formData, setFormData] = useState<CreateScheduleRequest>({
    name: '',
    scenarioId: '',
    deviceIds: [],
    cronExpression: '0 10 * * *',
    description: '',
  });

  // 디바이스 목록
  const [devices, setDevices] = useState<DeviceInfo[]>([]);

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
  const [selectedScheduleHistory, setSelectedScheduleHistory] = useState<string | null>(null);

  // 스케줄 목록 조회
  const fetchSchedules = useCallback(async () => {
    try {
      const res = await axios.get<{ success: boolean; data: ScheduleListItem[] }>(
        `${API_BASE}/api/schedules`
      );
      if (res.data.success) {
        setSchedules(res.data.data);
      }
    } catch (err) {
      console.error('스케줄 목록 조회 실패:', err);
    }
  }, []);

  // 디바이스 목록 조회
  const fetchDevices = useCallback(async () => {
    try {
      const res = await axios.get<{ success: boolean; devices: DeviceInfo[] }>(
        `${API_BASE}/api/device/list`
      );
      if (res.data.success) {
        setDevices(res.data.devices);
      }
    } catch (err) {
      console.error('디바이스 목록 조회 실패:', err);
    }
  }, []);

  // 전체 실행 이력 조회
  const fetchHistory = useCallback(async () => {
    try {
      const res = await axios.get<{ success: boolean; data: ScheduleHistory[] }>(
        `${API_BASE}/api/schedules/history`
      );
      if (res.data.success) {
        setHistory(res.data.data);
      }
    } catch (err) {
      console.error('실행 이력 조회 실패:', err);
    }
  }, []);

  // 초기 로드
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchSchedules(), fetchDevices()]);
      setLoading(false);
    };
    loadData();
  }, [fetchSchedules, fetchDevices]);

  // 스케줄 생성
  const handleCreate = async () => {
    if (!formData.name || !formData.scenarioId || formData.deviceIds.length === 0) {
      alert('이름, 시나리오, 디바이스를 선택해주세요.');
      return;
    }

    try {
      await axios.post(`${API_BASE}/api/schedules`, formData);
      await fetchSchedules();
      resetForm();
    } catch (err) {
      console.error('스케줄 생성 실패:', err);
      alert('스케줄 생성에 실패했습니다.');
    }
  };

  // 스케줄 수정
  const handleUpdate = async () => {
    if (!editingSchedule) return;

    try {
      await axios.put(`${API_BASE}/api/schedules/${editingSchedule.id}`, formData);
      await fetchSchedules();
      resetForm();
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
    } catch (err) {
      console.error('스케줄 삭제 실패:', err);
      alert('스케줄 삭제에 실패했습니다.');
    }
  };

  // 스케줄 활성화/비활성화 토글
  const handleToggleEnabled = async (id: string, currentEnabled: boolean) => {
    try {
      const endpoint = currentEnabled ? 'disable' : 'enable';
      await axios.post(`${API_BASE}/api/schedules/${id}/${endpoint}`);
      await fetchSchedules();
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
  const handleEdit = async (id: string) => {
    try {
      const res = await axios.get<{ success: boolean; data: Schedule }>(
        `${API_BASE}/api/schedules/${id}`
      );
      if (res.data.success) {
        const schedule = res.data.data;
        setEditingSchedule(schedule);
        setFormData({
          name: schedule.name,
          scenarioId: schedule.scenarioId,
          deviceIds: schedule.deviceIds,
          cronExpression: schedule.cronExpression,
          description: schedule.description || '',
        });
        // Cron 표현식을 파싱하여 scheduleTime 설정
        setScheduleTime(parseCronToScheduleTime(schedule.cronExpression));
        setShowForm(true);
      }
    } catch (err) {
      console.error('스케줄 조회 실패:', err);
    }
  };

  // 폼 리셋
  const resetForm = () => {
    setShowForm(false);
    setEditingSchedule(null);
    setFormData({
      name: '',
      scenarioId: '',
      deviceIds: [],
      cronExpression: '0 10 * * *',
      description: '',
    });
    setScheduleTime({
      dayOption: 'everyday',
      customDays: [],
      hour: 10,
      minute: 0,
    });
  };

  // 디바이스 선택 토글
  const toggleDevice = (deviceId: string) => {
    setFormData(prev => ({
      ...prev,
      deviceIds: prev.deviceIds.includes(deviceId)
        ? prev.deviceIds.filter(id => id !== deviceId)
        : [...prev.deviceIds, deviceId],
    }));
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

  if (loading) {
    return (
      <div className="schedule-manager">
        <div className="schedule-loading">스케줄 목록 로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="schedule-manager">
      {/* 헤더 */}
      <div className="schedule-header">
        <h2>스케줄 관리</h2>
        <div className="schedule-header-actions">
          <button
            className="btn-history"
            onClick={() => {
              setShowHistory(!showHistory);
              if (!showHistory) fetchHistory();
            }}
          >
            {showHistory ? '스케줄 목록' : '실행 이력'}
          </button>
          <button className="btn-add" onClick={() => setShowForm(true)}>
            + 새 스케줄
          </button>
        </div>
      </div>

      {/* 스케줄 폼 모달 */}
      {showForm && (
        <div className="schedule-form-overlay" onClick={resetForm}>
          <div className="schedule-form" onClick={e => e.stopPropagation()}>
            <h3>{editingSchedule ? '스케줄 수정' : '새 스케줄 생성'}</h3>

            <div className="form-group">
              <label>스케줄 이름 *</label>
              <input
                type="text"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                placeholder="예: 매일 오전 테스트"
              />
            </div>

            <div className="form-group">
              <label>시나리오 *</label>
              <select
                value={formData.scenarioId}
                onChange={e => setFormData({ ...formData, scenarioId: e.target.value })}
              >
                <option value="">시나리오 선택</option>
                {scenarios.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>실행 디바이스 * ({formData.deviceIds.length}개 선택)</label>
              <div className="device-checkboxes">
                {devices.map(d => (
                  <label key={d.id} className="device-checkbox">
                    <input
                      type="checkbox"
                      checked={formData.deviceIds.includes(d.id)}
                      onChange={() => toggleDevice(d.id)}
                    />
                    <span>{d.name || d.id}</span>
                    <span className={`status ${d.status}`}>
                      {d.status === 'connected' ? 'O' : 'X'}
                    </span>
                  </label>
                ))}
                {devices.length === 0 && (
                  <div className="no-devices">연결된 디바이스가 없습니다</div>
                )}
              </div>
            </div>

            <div className="form-group">
              <label>실행 주기 *</label>

              {/* 요일 선택 */}
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

              {/* 커스텀 요일 선택 */}
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

              {/* 시간 선택 */}
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

            <div className="form-group">
              <label>설명 (선택)</label>
              <textarea
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                placeholder="스케줄에 대한 설명"
                rows={2}
              />
            </div>

            <div className="form-actions">
              <button className="btn-cancel" onClick={resetForm}>
                취소
              </button>
              <button
                className="btn-submit"
                onClick={editingSchedule ? handleUpdate : handleCreate}
              >
                {editingSchedule ? '수정' : '생성'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 실행 이력 */}
      {showHistory ? (
        <div className="schedule-history">
          <h3>실행 이력</h3>
          {history.length === 0 ? (
            <div className="no-history">실행 이력이 없습니다</div>
          ) : (
            <table className="history-table">
              <thead>
                <tr>
                  <th>스케줄</th>
                  <th>시나리오</th>
                  <th>시작</th>
                  <th>종료</th>
                  <th>결과</th>
                </tr>
              </thead>
              <tbody>
                {history.map(h => (
                  <tr key={h.id} className={h.success ? 'success' : 'failed'}>
                    <td>{h.scheduleName}</td>
                    <td>{h.scenarioName}</td>
                    <td>{formatTime(h.startedAt)}</td>
                    <td>{formatTime(h.completedAt)}</td>
                    <td>
                      <span className={`result-badge ${h.success ? 'success' : 'failed'}`}>
                        {h.success ? '성공' : '실패'}
                      </span>
                      {h.error && <div className="error-text">{h.error}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        /* 스케줄 목록 */
        <div className="schedule-list">
          {schedules.length === 0 ? (
            <div className="no-schedules">
              <p>등록된 스케줄이 없습니다</p>
              <button onClick={() => setShowForm(true)}>첫 스케줄 만들기</button>
            </div>
          ) : (
            <table className="schedule-table">
              <thead>
                <tr>
                  <th>활성</th>
                  <th>이름</th>
                  <th>시나리오</th>
                  <th>실행 주기</th>
                  <th>디바이스</th>
                  <th>마지막 실행</th>
                  <th>다음 실행</th>
                  <th>액션</th>
                </tr>
              </thead>
              <tbody>
                {schedules.map(s => (
                  <tr key={s.id} className={s.enabled ? 'enabled' : 'disabled'}>
                    <td>
                      <label className="toggle-switch">
                        <input
                          type="checkbox"
                          checked={s.enabled}
                          onChange={() => handleToggleEnabled(s.id, s.enabled)}
                        />
                        <span className="slider"></span>
                      </label>
                    </td>
                    <td className="name-cell">{s.name}</td>
                    <td>{s.scenarioName}</td>
                    <td className="cron-cell" title={s.cronExpression}>
                      {getCronDescription(s.cronExpression)}
                    </td>
                    <td>{s.deviceIds.length}개</td>
                    <td>{formatTime(s.lastRunAt)}</td>
                    <td>{s.enabled ? formatTime(s.nextRunAt) : '-'}</td>
                    <td className="action-cell">
                      <button className="btn-run" onClick={() => handleRunNow(s.id)} title="즉시 실행">
                        ▶
                      </button>
                      <button className="btn-edit" onClick={() => handleEdit(s.id)} title="수정">
                        ✎
                      </button>
                      <button className="btn-delete" onClick={() => handleDelete(s.id)} title="삭제">
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
