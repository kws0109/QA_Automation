// frontend/src/components/MetricsDashboard/useDashboardData.ts
// 대시보드 데이터 fetching 커스텀 훅

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import type {
  DashboardOverview,
  SuccessRateTrend,
  FailurePattern,
  ScenarioHistory,
  SuiteHistory,
  DevicePerformanceMetric,
  RecentExecution,
  PackageInfo,
  ImageMatchPerformance,
  OcrPerformance,
} from '../../types';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:3001';

export interface DashboardData {
  packages: PackageInfo[];
  overview: DashboardOverview | null;
  successTrend: SuccessRateTrend[];
  failurePatterns: FailurePattern[];
  scenarioHistory: ScenarioHistory[];
  suiteHistory: SuiteHistory[];
  devicePerformance: DevicePerformanceMetric[];
  recentExecutions: RecentExecution[];
  imageMatchPerformance: ImageMatchPerformance | null;
  ocrPerformance: OcrPerformance | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useDashboardData(days: number = 30, packageId?: string): DashboardData {
  const [packages, setPackages] = useState<PackageInfo[]>([]);
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [successTrend, setSuccessTrend] = useState<SuccessRateTrend[]>([]);
  const [failurePatterns, setFailurePatterns] = useState<FailurePattern[]>([]);
  const [scenarioHistory, setScenarioHistory] = useState<ScenarioHistory[]>([]);
  const [suiteHistory, setSuiteHistory] = useState<SuiteHistory[]>([]);
  const [devicePerformance, setDevicePerformance] = useState<DevicePerformanceMetric[]>([]);
  const [recentExecutions, setRecentExecutions] = useState<RecentExecution[]>([]);
  const [imageMatchPerformance, setImageMatchPerformance] = useState<ImageMatchPerformance | null>(null);
  const [ocrPerformance, setOcrPerformance] = useState<OcrPerformance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 패키지 필터 쿼리 파라미터
  const pkgQuery = packageId ? `&packageId=${encodeURIComponent(packageId)}` : '';

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [pkgRes, ovRes, trendRes, failRes, scenRes, suiteRes, devRes, execRes, imgRes, ocrRes] = await Promise.all([
        axios.get<PackageInfo[]>(`${API_BASE}/api/dashboard/packages`),
        axios.get<DashboardOverview>(`${API_BASE}/api/dashboard/overview?${pkgQuery.slice(1)}`),
        axios.get<SuccessRateTrend[]>(`${API_BASE}/api/dashboard/success-rate-trend?days=${days}${pkgQuery}`),
        axios.get<FailurePattern[]>(`${API_BASE}/api/dashboard/failure-patterns?days=${days}${pkgQuery}`),
        axios.get<ScenarioHistory[]>(`${API_BASE}/api/dashboard/scenario-history?limit=20${pkgQuery}`),
        axios.get<SuiteHistory[]>(`${API_BASE}/api/dashboard/suite-history?limit=20`),
        axios.get<DevicePerformanceMetric[]>(`${API_BASE}/api/dashboard/device-performance?limit=10`),
        axios.get<RecentExecution[]>(`${API_BASE}/api/dashboard/recent-executions?limit=10${pkgQuery}`),
        axios.get<ImageMatchPerformance>(`${API_BASE}/api/dashboard/image-match-performance`),
        axios.get<OcrPerformance>(`${API_BASE}/api/dashboard/ocr-performance`),
      ]);

      setPackages(pkgRes.data);
      setOverview(ovRes.data);
      setSuccessTrend(trendRes.data);
      setFailurePatterns(failRes.data);
      setScenarioHistory(scenRes.data);
      setSuiteHistory(suiteRes.data);
      setDevicePerformance(devRes.data);
      setRecentExecutions(execRes.data);
      setImageMatchPerformance(imgRes.data);
      setOcrPerformance(ocrRes.data);
    } catch (err) {
      console.error('[Dashboard] 데이터 조회 실패:', err);
      setError('대시보드 데이터를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, [days, pkgQuery]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // 5분마다 자동 새로고침
  useEffect(() => {
    const interval = setInterval(fetchAll, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  return {
    packages,
    overview,
    successTrend,
    failurePatterns,
    scenarioHistory,
    suiteHistory,
    devicePerformance,
    recentExecutions,
    imageMatchPerformance,
    ocrPerformance,
    loading,
    error,
    refetch: fetchAll,
  };
}
