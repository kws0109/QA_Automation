// frontend/src/components/ReportModal/ReportModal.jsx

import { useState, useEffect } from 'react';
import axios from 'axios';
import './ReportModal.css';

const API_BASE = 'http://localhost:3001';

function ReportModal({ isOpen, onClose }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // 리포트 목록 불러오기
  const fetchReports = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api/reports`);
      setReports(res.data.data || []);
    } catch (err) {
      console.error('리포트 목록 조회 실패:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchReports();
      setSelectedReport(null);
    }
  }, [isOpen]);

  // 리포트 상세 조회
  const handleViewDetail = async (id) => {
    setDetailLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api/reports/${id}`);
      setSelectedReport(res.data.data);
    } catch (err) {
      alert('리포트 조회 실패: ' + err.message);
    } finally {
      setDetailLoading(false);
    }
  };

  // 리포트 삭제
  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('이 리포트를 삭제하시겠습니까?')) return;

    try {
      await axios.delete(`${API_BASE}/api/reports/${id}`);
      fetchReports();
      if (selectedReport?.id === id) {
        setSelectedReport(null);
      }
    } catch (err) {
      alert('삭제 실패: ' + err.message);
    }
  };

  // 모든 리포트 삭제
  const handleDeleteAll = async () => {
    if (!window.confirm('모든 리포트를 삭제하시겠습니까?')) return;

    try {
      await axios.delete(`${API_BASE}/api/reports`);
      fetchReports();
      setSelectedReport(null);
    } catch (err) {
      alert('삭제 실패: ' + err.message);
    }
  };

  // 목록으로 돌아가기
  const handleBack = () => {
    setSelectedReport(null);
  };

  // 시간 포맷
  const formatDuration = (ms) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  // 날짜 포맷
  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="report-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>📊 실행 리포트</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {detailLoading ? (
            <div className="list-loading">리포트 불러오는 중...</div>
          ) : selectedReport ? (
            // 상세 보기
            <div className="report-detail">
              <button className="btn-back" onClick={handleBack}>
                ← 목록으로
              </button>
              
              <div className="detail-header">
                <h3>{selectedReport.scenarioName}</h3>
                <span className={`status-badge ${selectedReport.success ? 'success' : 'error'}`}>
                  {selectedReport.success ? '✅ 성공' : '❌ 실패'}
                </span>
              </div>

              <div className="detail-stats">
                <div className="stat-item">
                  <span className="stat-label">실행 시간</span>
                  <span className="stat-value">{formatDuration(selectedReport.stats.duration)}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">총 노드</span>
                  <span className="stat-value">{selectedReport.stats.totalNodes}</span>
                </div>
                <div className="stat-item success">
                  <span className="stat-label">성공</span>
                  <span className="stat-value">{selectedReport.stats.successCount}</span>
                </div>
                <div className="stat-item error">
                  <span className="stat-label">실패</span>
                  <span className="stat-value">{selectedReport.stats.errorCount}</span>
                </div>
              </div>

              {selectedReport.error && (
                <div className="detail-error">
                  <strong>에러:</strong> {selectedReport.error}
                </div>
              )}

              <div className="detail-logs">
                <h4>실행 로그</h4>
                <div className="log-list">
                  {selectedReport.logs.map((log, index) => (
                    <div key={index} className={`log-item ${log.status}`}>
                      <span className="log-time">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                      <span className="log-node">[{log.nodeId}]</span>
                      <span className="log-message">{log.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            // 목록 보기 (테이블 형식)
            <div className="report-list">
              {loading ? (
                <div className="list-loading">불러오는 중...</div>
              ) : reports.length === 0 ? (
                <div className="list-empty">
                  <p>실행 리포트가 없습니다.</p>
                  <p>시나리오를 실행하면 리포트가 자동 생성됩니다.</p>
                </div>
              ) : (
                <table className="report-table">
                  <thead>
                    <tr>
                      <th>상태</th>
                      <th>테스트 이름</th>
                      <th>ID</th>
                      <th>노드</th>
                      <th>진행 시간</th>
                      <th>리포트 시간</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {reports.map((report) => (
                      <tr
                        key={report.id}
                        onClick={() => handleViewDetail(report.id)}
                      >
                        <td>
                          <span className={`status-dot ${report.success ? 'success' : 'error'}`} />
                        </td>
                        <td className="col-name">{report.scenarioName}</td>
                        <td className="col-id">{report.id}</td>
                        <td className="col-nodes">{report.stats.totalNodes}</td>
                        <td className="col-duration">{formatDuration(report.stats.duration)}</td>
                        <td className="col-date">{formatDate(report.createdAt)}</td>
                        <td className="col-action">
                          <button 
                            className="btn-delete" 
                            onClick={(e) => handleDelete(report.id, e)}
                          >
                            🗑️
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

        <div className="modal-footer">
          {!selectedReport && reports.length > 0 && (
            <button className="btn-danger" onClick={handleDeleteAll}>
              🗑️ 전체 삭제
            </button>
          )}
          <button className="btn-cancel" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

export default ReportModal;