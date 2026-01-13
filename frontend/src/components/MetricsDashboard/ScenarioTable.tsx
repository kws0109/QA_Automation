// frontend/src/components/MetricsDashboard/ScenarioTable.tsx
// 시나리오 히스토리 테이블

import React, { useState, useMemo } from 'react';
import type { ScenarioHistory } from '../../types';

type SortKey = 'scenarioName' | 'totalExecutions' | 'successRate' | 'avgDuration' | 'lastExecutedAt';
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

interface ScenarioTableProps {
  data: ScenarioHistory[];
  loading: boolean;
  onScenarioClick?: (scenarioId: string) => void;
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

const ScenarioTable: React.FC<ScenarioTableProps> = ({ data, loading, onScenarioClick }) => {
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
      (s) =>
        s.scenarioName.toLowerCase().includes(filter.toLowerCase()) ||
        (s.packageName?.toLowerCase() || '').includes(filter.toLowerCase()),
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
          <h3 className="table-title">시나리오별 히스토리</h3>
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
        <h3 className="table-title">시나리오별 히스토리</h3>
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
              <th onClick={() => handleSort('scenarioName')} className="sortable">
                시나리오명 <SortIcon column="scenarioName" sortKey={sortKey} sortOrder={sortOrder} />
              </th>
              <th>패키지</th>
              <th onClick={() => handleSort('totalExecutions')} className="sortable num">
                실행 수 <SortIcon column="totalExecutions" sortKey={sortKey} sortOrder={sortOrder} />
              </th>
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
                <td colSpan={7} className="no-data">
                  {filter ? '검색 결과가 없습니다' : '데이터가 없습니다'}
                </td>
              </tr>
            ) : (
              sortedData.map((scenario) => (
                <tr
                  key={scenario.scenarioId}
                  onClick={() => onScenarioClick?.(scenario.scenarioId)}
                  className="clickable"
                >
                  <td className="scenario-name">{scenario.scenarioName}</td>
                  <td className="package-name">{scenario.packageName || '-'}</td>
                  <td className="num">{scenario.totalExecutions}</td>
                  <td className="num">
                    <div className="success-rate-cell">
                      <div
                        className="rate-bar"
                        style={{
                          width: `${scenario.successRate}%`,
                          backgroundColor:
                            scenario.successRate >= 90
                              ? '#4ade80'
                              : scenario.successRate >= 70
                              ? '#fbbf24'
                              : '#f87171',
                        }}
                      />
                      <span className="rate-text">{scenario.successRate.toFixed(1)}%</span>
                    </div>
                  </td>
                  <td className="num">{formatDuration(scenario.avgDuration)}</td>
                  <td>{formatRelativeTime(scenario.lastExecutedAt)}</td>
                  <td>
                    <span
                      className={`status-badge ${
                        scenario.lastStatus === 'passed' ? 'passed' : 'failed'
                      }`}
                    >
                      {scenario.lastStatus === 'passed' ? '✓' : '✗'}
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

export default ScenarioTable;
