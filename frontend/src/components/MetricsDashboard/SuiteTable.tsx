// frontend/src/components/MetricsDashboard/SuiteTable.tsx
// Suite 히스토리 테이블

import React, { useState, useMemo } from 'react';
import type { SuiteHistory } from '../../types';

type SortKey = 'suiteName' | 'totalExecutions' | 'successRate' | 'avgDuration' | 'lastExecutedAt';
type SortOrder = 'asc' | 'desc';

interface SortIconProps {
  column: SortKey;
  sortKey: SortKey;
  sortOrder: SortOrder;
}

const SortIcon: React.FC<SortIconProps> = ({ column, sortKey, sortOrder }) => {
  if (sortKey !== column) return <span className="sort-icon">↕</span>;
  return <span className="sort-icon active">{sortOrder === 'asc' ? '↑' : '↓'}</span>;
};

interface SuiteTableProps {
  data: SuiteHistory[];
  loading: boolean;
  onSuiteClick?: (suiteId: string) => void;
}

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSec = Math.round(seconds % 60);
  return `${minutes}m ${remainingSec}s`;
};

const formatRelativeTime = (dateStr: string | undefined): string => {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}일 전`;
  if (hours > 0) return `${hours}시간 전`;
  if (minutes > 0) return `${minutes}분 전`;
  return '방금 전';
};

const SuiteTable: React.FC<SuiteTableProps> = ({ data, loading, onSuiteClick }) => {
  const [sortKey, setSortKey] = useState<SortKey>('totalExecutions');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [filter, setFilter] = useState('');

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortOrder('desc');
    }
  };

  const sortedData = useMemo(() => {
    const filtered = data.filter(
      (s) => s.suiteName.toLowerCase().includes(filter.toLowerCase()),
    );

    return [...filtered].sort((a, b) => {
      let aVal: string | number = a[sortKey] ?? '';
      let bVal: string | number = b[sortKey] ?? '';

      if (sortKey === 'lastExecutedAt') {
        aVal = a.lastExecutedAt ? new Date(a.lastExecutedAt).getTime() : 0;
        bVal = b.lastExecutedAt ? new Date(b.lastExecutedAt).getTime() : 0;
      }

      if (typeof aVal === 'string') {
        return sortOrder === 'asc' ? aVal.localeCompare(bVal as string) : (bVal as string).localeCompare(aVal);
      }
      return sortOrder === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
  }, [data, sortKey, sortOrder, filter]);

  if (loading) {
    return (
      <div className="scenario-table-card">
        <div className="table-header">
          <h3 className="table-title">Suite별 히스토리</h3>
        </div>
        <div className="table-loading">
          <div className="spinner" />
        </div>
      </div>
    );
  }

  return (
    <div className="scenario-table-card">
      <div className="table-header">
        <h3 className="table-title">Suite별 히스토리</h3>
        <input
          type="text"
          className="table-filter"
          placeholder="검색..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      <div className="table-wrapper">
        <table className="scenario-table">
          <thead>
            <tr>
              <th onClick={() => handleSort('suiteName')} className="sortable">
                Suite명 <SortIcon column="suiteName" sortKey={sortKey} sortOrder={sortOrder} />
              </th>
              <th onClick={() => handleSort('totalExecutions')} className="sortable num">
                실행 수 <SortIcon column="totalExecutions" sortKey={sortKey} sortOrder={sortOrder} />
              </th>
              <th className="num">시나리오</th>
              <th className="num">디바이스</th>
              <th onClick={() => handleSort('successRate')} className="sortable num">
                성공률 <SortIcon column="successRate" sortKey={sortKey} sortOrder={sortOrder} />
              </th>
              <th onClick={() => handleSort('avgDuration')} className="sortable num">
                평균 시간 <SortIcon column="avgDuration" sortKey={sortKey} sortOrder={sortOrder} />
              </th>
              <th onClick={() => handleSort('lastExecutedAt')} className="sortable">
                최근 실행 <SortIcon column="lastExecutedAt" sortKey={sortKey} sortOrder={sortOrder} />
              </th>
              <th>상태</th>
            </tr>
          </thead>
          <tbody>
            {sortedData.length === 0 ? (
              <tr>
                <td colSpan={8} className="no-data">
                  {filter ? '검색 결과가 없습니다' : 'Suite 실행 데이터가 없습니다'}
                </td>
              </tr>
            ) : (
              sortedData.map((suite) => (
                <tr
                  key={suite.suiteId}
                  onClick={() => onSuiteClick?.(suite.suiteId)}
                  className="clickable"
                >
                  <td className="scenario-name">{suite.suiteName}</td>
                  <td className="num">{suite.totalExecutions}</td>
                  <td className="num">{suite.avgScenarioCount.toFixed(0)}</td>
                  <td className="num">{suite.avgDeviceCount.toFixed(0)}</td>
                  <td className="num">
                    <div className="success-rate-cell">
                      <span
                        className={`rate-value ${
                          suite.successRate >= 90
                            ? 'rate-success'
                            : suite.successRate >= 70
                            ? 'rate-warning'
                            : 'rate-danger'
                        }`}
                      >
                        {suite.successRate.toFixed(1)}%
                      </span>
                      <div className="rate-bar-container">
                        <div
                          className={`rate-bar-fill ${
                            suite.successRate >= 90
                              ? 'fill-success'
                              : suite.successRate >= 70
                              ? 'fill-warning'
                              : 'fill-danger'
                          }`}
                          style={{ width: `${suite.successRate}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="num">{formatDuration(suite.avgDuration)}</td>
                  <td>{formatRelativeTime(suite.lastExecutedAt)}</td>
                  <td>
                    <span
                      className={`status-badge ${
                        suite.lastStatus === 'completed' ? 'passed' : 'failed'
                      }`}
                    >
                      {suite.lastStatus === 'completed' ? '✓' : '✗'}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default SuiteTable;
