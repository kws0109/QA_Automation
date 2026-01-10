/**
 * 시나리오 흐름 요약 모달
 * 노드 연결을 텍스트로 요약하여 표시
 */

import { useMemo, useState } from 'react';
import type { FlowNode, Connection, ImageTemplate } from '../../types';
import { generateSummary, toMarkdown } from '../../services/scenarioSummary';
import './ScenarioSummaryModal.css';

interface ScenarioSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  scenarioName: string;
  scenarioId?: string;
  nodes: FlowNode[];
  connections: Connection[];
  templates?: ImageTemplate[];
}

type TabType = 'text' | 'markdown';

export default function ScenarioSummaryModal({
  isOpen,
  onClose,
  scenarioName,
  scenarioId,
  nodes,
  connections,
  templates,
}: ScenarioSummaryModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('text');
  const [copySuccess, setCopySuccess] = useState(false);

  // 템플릿 ID -> 이름 매핑
  const templateNames = useMemo(() => {
    const map = new Map<string, string>();
    templates?.forEach((t) => map.set(t.id, t.name));
    return map;
  }, [templates]);

  // 요약 생성
  const summary = useMemo(() => {
    if (!isOpen || nodes.length === 0) return null;
    return generateSummary(scenarioName, nodes, connections, {
      scenarioId,
      templateNames,
    });
  }, [isOpen, scenarioName, scenarioId, nodes, connections, templateNames]);

  // 마크다운 변환
  const markdownContent = useMemo(() => {
    if (!summary) return '';
    return toMarkdown(summary);
  }, [summary]);

  // 클립보드 복사
  const handleCopy = async () => {
    const content = activeTab === 'text' ? summary?.textSummary : markdownContent;
    if (!content) return;

    try {
      await navigator.clipboard.writeText(content);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('복사 실패:', err);
    }
  };

  // 마크다운 다운로드
  const handleDownload = () => {
    if (!markdownContent) return;

    const blob = new Blob([markdownContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${scenarioName || 'scenario'}-summary.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="summary-modal" onClick={(e) => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="modal-header">
          <h2>시나리오 흐름 요약</h2>
          <button className="modal-close" onClick={onClose}>
            &times;
          </button>
        </div>

        {/* 탭 */}
        <div className="modal-tabs">
          <button
            className={`tab-btn ${activeTab === 'text' ? 'active' : ''}`}
            onClick={() => setActiveTab('text')}
          >
            텍스트
          </button>
          <button
            className={`tab-btn ${activeTab === 'markdown' ? 'active' : ''}`}
            onClick={() => setActiveTab('markdown')}
          >
            Markdown
          </button>
        </div>

        {/* 통계 */}
        {summary && (
          <div className="summary-stats">
            <span className="stat-item">
              <strong>{summary.totalNodes}</strong> 노드
            </span>
            <span className="stat-divider">|</span>
            <span className="stat-item">
              <strong>{summary.totalSteps}</strong> 단계
            </span>
            {summary.hasConditions && (
              <>
                <span className="stat-divider">|</span>
                <span className="stat-item stat-condition">조건 분기</span>
              </>
            )}
            {summary.hasLoops && (
              <>
                <span className="stat-divider">|</span>
                <span className="stat-item stat-loop">반복 루프</span>
              </>
            )}
            {summary.disconnectedNodes.length > 0 && (
              <>
                <span className="stat-divider">|</span>
                <span className="stat-item stat-warning">
                  미연결 {summary.disconnectedNodes.length}개
                </span>
              </>
            )}
          </div>
        )}

        {/* 컨텐츠 */}
        <div className="modal-body">
          {nodes.length === 0 ? (
            <div className="summary-empty">
              <p>노드가 없습니다.</p>
              <p>시나리오에 노드를 추가해주세요.</p>
            </div>
          ) : (
            <pre className="summary-content">
              {activeTab === 'text' ? summary?.textSummary : markdownContent}
            </pre>
          )}
        </div>

        {/* 푸터 */}
        <div className="modal-footer">
          <button
            className={`btn-copy ${copySuccess ? 'success' : ''}`}
            onClick={handleCopy}
            disabled={nodes.length === 0}
          >
            {copySuccess ? '복사됨!' : '클립보드 복사'}
          </button>
          <button
            className="btn-download"
            onClick={handleDownload}
            disabled={nodes.length === 0}
          >
            Markdown 다운로드
          </button>
          <button className="btn-close" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
