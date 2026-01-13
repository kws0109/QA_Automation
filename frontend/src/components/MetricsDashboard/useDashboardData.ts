// frontend/src/components/MetricsDashboard/useDashboardData.ts
// 대시보드 데이터 fetching 커스텀 훅

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import type {
  DashboardOverview,
  SuccessRateTrend,
  FailurePattern,
  ScenarioHistory,
  DevicePerformanceMetric,
  RecentExecution,
} from '../../types';

const API_BASE = 'http://127.0.0.1:3001';

export interface DashboardData {
  overview: DashboardOverview | null;
  successTrend: SuccessRateTrend[];
  failurePatterns: FailurePattern[];
  scenarioHistory: ScenarioHistory[];
  devicePerformance: DevicePerformanceMetric[];
  recentExecutions: RecentExecution[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useDashboardData(days: number = 30): DashboardData {
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [successTrend, setSuccessTrend] = useState<SuccessRateTrend[]>([]);
  const [failurePatterns, setFailurePatterns] = useState<FailurePattern[]>([]);
  const [scenarioHistory, setScenarioHistory] = useState<ScenarioHistory[]>([]);
  const [devicePerformance, setDevicePerformance] = useState<DevicePerformanceMetric[]>([]);
  const [recentExecutions, setRecentExecutions] = useState<RecentExecution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [ovRes, trendRes, failRes, scenRes, devRes, execRes] = await Promise.all([
        axios.get<DashboardOverview>(`${API_BASE}/api/dashboard/overview`),
        axios.get<SuccessRateTrend[]>(`${API_BASE}/api/dashboard/success-rate-trend?days=${days}`),
        axios.get<FailurePattern[]>(`${API_BASE}/api/dashboard/failure-patterns?days=${days}`),
        axios.get<ScenarioHistory[]>(`${API_BASE}/api/dashboard/scenario-history?limit=20`),
        axios.get<DevicePerformanceMetric[]>(`${API_BASE}/api/dashboard/device-performance?limit=10`),
        axios.get<RecentExecution[]>(`${API_BASE}/api/dashboard/recent-executions?limit=10`),
      ]);

      setOverview(ovRes.data);
      setSuccessTrend(trendRes.data);
      setFailurePatterns(failRes.data);
      setScenarioHistory(scenRes.data);
      setDevicePerformance(devRes.data);
      setRecentExecutions(execRes.data);
    } catch (err) {
      console.error('[Dashboard] 데이터 조회 실패:', err);
      setError('대시보드 데이터를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // 5분마다 자동 새로고침
  useEffect(() => {
    const interval = setInterval(fetchAll, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  return {
    overview,
    successTrend,
    failurePatterns,
    scenarioHistory,
    devicePerformance,
    recentExecutions,
    loading,
    error,
    refetch: fetchAll,
  };
}
