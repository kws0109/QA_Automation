/**
 * 자연어 시나리오 변환기 컴포넌트
 *
 * 자연어로 작성된 테스트 시나리오를 플로우차트 노드로 변환합니다.
 * 이 컴포넌트는 격리되어 있어 삭제 시 다른 부분에 영향을 주지 않습니다.
 *
 * 삭제 방법:
 * 1. frontend/src/components/NLConverter/ 폴더 삭제
 * 2. App.tsx에서 관련 import 및 탭 제거
 */

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import './NLConverter.css';

const API_BASE = 'http://127.0.0.1:3001';

// ========================================
// 타입 정의
// ========================================

interface AIConfig {
  configured: boolean;
  config: {
    provider: 'openai' | 'anthropic';
    model: string;
    apiKey: string;
  } | null;
}

interface ModelOption {
  id: string;
  name: string;
  description: string;
}

interface ModelsResponse {
  openai: ModelOption[];
  anthropic: ModelOption[];
}

interface ParsedNode {
  id: string;
  action: string;
  label?: string;
  confidence: number;
  originalText: string;
  needsUserInput: boolean;
  warnings?: string[];
  // 액션별 필드
  x?: number;
  y?: number;
  targetDescription?: string;
  direction?: string;
  text?: string;
  duration?: number;
  packageName?: string;
  appName?: string;
  templateDescription?: string;
  keyName?: string;
}

interface ConversionResult {
  success: boolean;
  nodes: ParsedNode[];
  summary: {
    totalSteps: number;
    parsedSteps: number;
    needsUserInput: number;
    warnings: string[];
  };
  metadata: {
    provider: string;
    model: string;
    tokensUsed?: {
      input: number;
      output: number;
    };
    processingTime: number;
  };
}

interface ScenarioOutput {
  nodes: Array<{
    id: string;
    type: string;
    action?: string;
    label?: string;
    data?: Record<string, unknown>;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
  }>;
}

interface NLConverterProps {
  onApplyScenario?: (scenario: ScenarioOutput) => void;
}

// ========================================
// 메인 컴포넌트
// ========================================

export default function NLConverter({ onApplyScenario }: NLConverterProps) {
  // AI 설정 상태
  const [aiConfig, setAiConfig] = useState<AIConfig>({ configured: false, config: null });
  const [models, setModels] = useState<ModelsResponse | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  // 설정 폼
  const [provider, setProvider] = useState<'openai' | 'anthropic'>('openai');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gpt-4o-mini');

  // 변환 상태
  const [inputText, setInputText] = useState('');
  const [isConverting, setIsConverting] = useState(false);
  const [result, setResult] = useState<ConversionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 초기 로드
  useEffect(() => {
    loadConfig();
    loadModels();
  }, []);

  // API 설정 로드
  const loadConfig = async () => {
    try {
      const res = await axios.get<AIConfig>(`${API_BASE}/api/ai/config`);
      setAiConfig(res.data);
      if (res.data.config) {
        setProvider(res.data.config.provider);
        setModel(res.data.config.model);
      }
    } catch {
      console.error('[NLConverter] Failed to load AI config');
    }
  };

  // 모델 목록 로드
  const loadModels = async () => {
    try {
      const res = await axios.get<ModelsResponse>(`${API_BASE}/api/ai/models`);
      setModels(res.data);
    } catch {
      console.error('[NLConverter] Failed to load models');
    }
  };

  // 설정 저장
  const saveConfig = async () => {
    try {
      await axios.post(`${API_BASE}/api/ai/config`, {
        provider,
        apiKey,
        model,
      });
      await loadConfig();
      setShowSettings(false);
      setError(null);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.error || 'Failed to save configuration');
      }
    }
  };

  // 연결 테스트
  const testConnection = async () => {
    try {
      setError(null);
      const res = await axios.post(`${API_BASE}/api/ai/test`);
      if (res.data.success) {
        alert(`연결 성공! (처리시간: ${res.data.processingTime}ms)`);
      }
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.error || 'Connection test failed');
      }
    }
  };

  // 자연어 변환
  const handleConvert = useCallback(async () => {
    if (!inputText.trim()) {
      setError('시나리오를 입력해주세요.');
      return;
    }

    if (!aiConfig.configured) {
      setShowSettings(true);
      setError('AI 설정이 필요합니다.');
      return;
    }

    setIsConverting(true);
    setError(null);
    setResult(null);

    try {
      const res = await axios.post<ConversionResult>(`${API_BASE}/api/ai/convert`, {
        text: inputText,
      });

      if (res.data.success) {
        setResult(res.data);
      } else {
        setError('변환에 실패했습니다.');
      }
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.error || 'Conversion failed');
      }
    } finally {
      setIsConverting(false);
    }
  }, [inputText, aiConfig.configured]);

  // 시나리오 적용
  const handleApply = async () => {
    if (!result?.nodes.length) return;

    try {
      const res = await axios.post<ScenarioOutput & { success: boolean }>(
        `${API_BASE}/api/ai/convert-to-scenario`,
        { text: inputText },
      );

      if (res.data.success && onApplyScenario) {
        onApplyScenario({
          nodes: res.data.nodes,
          edges: res.data.edges,
        });
      }
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.error || 'Failed to apply scenario');
      }
    }
  };

  // 액션 아이콘 매핑
  const getActionIcon = (action: string) => {
    const icons: Record<string, string> = {
      tap: '👆',
      doubleTap: '👆👆',
      longPress: '👇',
      swipe: '↔️',
      type: '⌨️',
      wait: '⏱️',
      launchApp: '🚀',
      terminateApp: '❌',
      tapImage: '🖼️',
      waitUntilImage: '👁️',
      waitUntilImageGone: '👁️‍🗨️',
      pressKey: '🔘',
    };
    return icons[action] || '❓';
  };

  // 신뢰도 색상
  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'var(--color-success)';
    if (confidence >= 0.5) return 'var(--color-warning)';
    return 'var(--color-danger)';
  };

  return (
    <div className="nl-converter">
      {/* 헤더 */}
      <div className="nl-header">
        <div className="nl-title">
          <h2>자연어 시나리오 변환</h2>
          <span className="nl-badge">Beta</span>
        </div>
        <div className="nl-actions">
          {aiConfig.configured && (
            <span className="nl-config-status">
              {aiConfig.config?.provider} / {aiConfig.config?.model}
            </span>
          )}
          <button
            className="nl-settings-btn"
            onClick={() => setShowSettings(!showSettings)}
          >
            설정
          </button>
        </div>
      </div>

      {/* 설정 패널 */}
      {showSettings && (
        <div className="nl-settings-panel">
          <h3>AI 설정</h3>
          <div className="nl-form-group">
            <label>Provider</label>
            <select
              value={provider}
              onChange={(e) => {
                setProvider(e.target.value as 'openai' | 'anthropic');
                // 기본 모델 설정
                setModel(e.target.value === 'openai' ? 'gpt-4o-mini' : 'claude-3-5-haiku-20241022');
              }}
            >
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
            </select>
          </div>

          <div className="nl-form-group">
            <label>Model</label>
            <select value={model} onChange={(e) => setModel(e.target.value)}>
              {models?.[provider]?.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} - {m.description}
                </option>
              ))}
            </select>
          </div>

          <div className="nl-form-group">
            <label>API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={provider === 'openai' ? 'sk-...' : 'sk-ant-...'}
            />
          </div>

          <div className="nl-settings-actions">
            <button onClick={saveConfig} disabled={!apiKey}>
              저장
            </button>
            <button onClick={testConnection} disabled={!aiConfig.configured}>
              연결 테스트
            </button>
            <button onClick={() => setShowSettings(false)}>
              닫기
            </button>
          </div>
        </div>
      )}

      {/* 에러 메시지 */}
      {error && (
        <div className="nl-error">
          {error}
        </div>
      )}

      {/* 입력 영역 */}
      <div className="nl-input-section">
        <label>테스트 시나리오 입력</label>
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={`예시:
1. 앱을 실행한다
2. 게스트 로그인 버튼을 누른다
3. 메인 화면이 나타날 때까지 기다린다
4. 설정 아이콘을 누른다
5. 로그아웃 버튼을 누른다`}
          rows={10}
          disabled={isConverting}
        />
        <div className="nl-input-actions">
          <button
            className="nl-convert-btn"
            onClick={handleConvert}
            disabled={isConverting || !inputText.trim()}
          >
            {isConverting ? '변환 중...' : '변환하기'}
          </button>
        </div>
      </div>

      {/* 결과 영역 */}
      {result && (
        <div className="nl-result-section">
          {/* 요약 */}
          <div className="nl-summary">
            <div className="nl-summary-item">
              <span className="nl-summary-label">입력 스텝</span>
              <span className="nl-summary-value">{result.summary.totalSteps}</span>
            </div>
            <div className="nl-summary-item">
              <span className="nl-summary-label">변환된 노드</span>
              <span className="nl-summary-value">{result.summary.parsedSteps}</span>
            </div>
            <div className="nl-summary-item">
              <span className="nl-summary-label">추가 입력 필요</span>
              <span className="nl-summary-value nl-warning">
                {result.summary.needsUserInput}
              </span>
            </div>
            <div className="nl-summary-item">
              <span className="nl-summary-label">처리 시간</span>
              <span className="nl-summary-value">
                {result.metadata.processingTime}ms
              </span>
            </div>
            {result.metadata.tokensUsed && (
              <div className="nl-summary-item">
                <span className="nl-summary-label">토큰 사용량</span>
                <span className="nl-summary-value">
                  {result.metadata.tokensUsed.input + result.metadata.tokensUsed.output}
                </span>
              </div>
            )}
          </div>

          {/* 경고 */}
          {result.summary.warnings.length > 0 && (
            <div className="nl-warnings">
              {result.summary.warnings.map((w, i) => (
                <div key={i} className="nl-warning-item">{w}</div>
              ))}
            </div>
          )}

          {/* 노드 목록 */}
          <div className="nl-nodes">
            <h3>변환된 노드</h3>
            <div className="nl-nodes-list">
              {result.nodes.map((node, index) => (
                <div
                  key={node.id}
                  className={`nl-node ${node.needsUserInput ? 'needs-input' : ''}`}
                >
                  <div className="nl-node-header">
                    <span className="nl-node-index">{index + 1}</span>
                    <span className="nl-node-icon">{getActionIcon(node.action)}</span>
                    <span className="nl-node-action">{node.action}</span>
                    <span
                      className="nl-node-confidence"
                      style={{ color: getConfidenceColor(node.confidence) }}
                    >
                      {Math.round(node.confidence * 100)}%
                    </span>
                  </div>
                  <div className="nl-node-body">
                    <div className="nl-node-label">{node.label}</div>
                    <div className="nl-node-original">"{node.originalText}"</div>

                    {/* 추가 정보 */}
                    {node.targetDescription && (
                      <div className="nl-node-detail">
                        대상: {node.targetDescription}
                      </div>
                    )}
                    {node.text && (
                      <div className="nl-node-detail">
                        입력 텍스트: {node.text}
                      </div>
                    )}
                    {node.duration && (
                      <div className="nl-node-detail">
                        대기 시간: {node.duration}ms
                      </div>
                    )}
                    {node.direction && (
                      <div className="nl-node-detail">
                        방향: {node.direction}
                      </div>
                    )}
                    {node.appName && (
                      <div className="nl-node-detail">
                        앱: {node.appName}
                      </div>
                    )}
                    {node.templateDescription && (
                      <div className="nl-node-detail">
                        이미지: {node.templateDescription}
                      </div>
                    )}
                  </div>

                  {/* 경고 */}
                  {node.warnings && node.warnings.length > 0 && (
                    <div className="nl-node-warnings">
                      {node.warnings.map((w, i) => (
                        <span key={i} className="nl-node-warning">{w}</span>
                      ))}
                    </div>
                  )}

                  {/* 입력 필요 표시 */}
                  {node.needsUserInput && (
                    <div className="nl-node-input-needed">
                      사용자 입력 필요 (좌표/템플릿 등)
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 적용 버튼 */}
          <div className="nl-apply-section">
            <button
              className="nl-apply-btn"
              onClick={handleApply}
              disabled={!onApplyScenario}
            >
              시나리오에 적용
            </button>
            <span className="nl-apply-hint">
              {result.summary.needsUserInput > 0 &&
                `${result.summary.needsUserInput}개 노드에 추가 입력이 필요합니다.`}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
