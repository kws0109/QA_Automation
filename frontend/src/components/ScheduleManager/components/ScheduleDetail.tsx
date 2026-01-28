// frontend/src/components/ScheduleManager/components/ScheduleDetail.tsx
// 스케줄 상세 뷰 컴포넌트

import { Schedule, TestSuite } from '../../../types';
import { getCronDescription, formatTime, SuiteInfo } from './types';

interface ScheduleDetailProps {
  schedule: Schedule;
  suites: TestSuite[];
  onRunNow: (id: string) => void;
  onStartEdit: () => void;
  onDelete: (id: string) => void;
}

export default function ScheduleDetail({
  schedule,
  suites,
  onRunNow,
  onStartEdit,
  onDelete,
}: ScheduleDetailProps) {
  // 선택된 Suite 정보 가져오기
  const getSelectedSuiteInfo = (suiteId: string): SuiteInfo | null => {
    const suite = suites.find(s => s.id === suiteId);
    if (!suite) return null;
    return {
      name: suite.name,
      scenarioCount: suite.scenarioIds.length,
      deviceCount: suite.deviceIds.length,
    };
  };

  return (
    <div className="schedule-detail">
      <div className="schedule-detail-header">
        <div className="schedule-detail-title">
          <h2>{schedule.name}</h2>
          <span className={`status-badge ${schedule.enabled ? 'enabled' : 'disabled'}`}>
            {schedule.enabled ? '활성' : '비활성'}
          </span>
        </div>
        <div className="schedule-editor-actions">
          <button
            className="btn-icon success"
            onClick={() => onRunNow(schedule.id)}
            title="즉시 실행"
          >
            [실행]
          </button>
          <button
            className="btn-icon"
            onClick={onStartEdit}
            title="수정"
          >
            [수정]
          </button>
          <button
            className="btn-icon danger"
            onClick={() => onDelete(schedule.id)}
            title="삭제"
          >
            [삭제]
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
                {getSelectedSuiteInfo(schedule.suiteId)?.name || '(삭제된 묶음)'}
              </span>
            </div>
            <div className="detail-item">
              <span className="detail-label">실행 주기</span>
              <span className="detail-value">{getCronDescription(schedule.cronExpression)}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Cron 표현식</span>
              <span className="detail-value cron">{schedule.cronExpression}</span>
            </div>
            {schedule.description && (
              <div className="detail-item">
                <span className="detail-label">설명</span>
                <span className="detail-value">{schedule.description}</span>
              </div>
            )}
          </div>
        </div>

        <div className="detail-section">
          <h3>실행 옵션</h3>
          <div className="detail-grid">
            <div className="detail-item">
              <span className="detail-label">반복 횟수</span>
              <span className="detail-value">{schedule.repeatCount ?? 1}회</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">시나리오 간격</span>
              <span className="detail-value">{schedule.scenarioInterval ?? 0}ms</span>
            </div>
          </div>
        </div>

        <div className="detail-section">
          <h3>실행 기록</h3>
          <div className="detail-grid">
            <div className="detail-item">
              <span className="detail-label">마지막 실행</span>
              <span className="detail-value">{formatTime(schedule.lastRunAt)}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">다음 실행</span>
              <span className="detail-value">
                {schedule.enabled ? formatTime(schedule.nextRunAt) : '-'}
              </span>
            </div>
            <div className="detail-item">
              <span className="detail-label">생성일</span>
              <span className="detail-value">{formatTime(schedule.createdAt)}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">수정일</span>
              <span className="detail-value">{formatTime(schedule.updatedAt)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
