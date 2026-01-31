// backend/src/services/execution/NodeNavigationService.ts
// 노드 탐색 및 플로우 제어 유틸리티

import type { ExecutionNode } from '../../types';
import { logger } from '../../utils/logger';

/**
 * 연결 정보 인터페이스
 */
export interface NodeConnection {
  from: string;
  to: string;
  label?: string;
  branch?: string;
}

/**
 * 조건 결과가 포함된 노드
 */
export interface NodeWithConditionResult extends ExecutionNode {
  _conditionResult?: boolean;
}

/**
 * 노드 탐색 서비스
 * 시나리오 플로우에서 다음 노드를 찾는 로직
 */
export class NodeNavigationService {
  /**
   * 다음 실행할 노드 ID 찾기
   * @param currentNode 현재 노드
   * @param connections 연결 목록
   * @returns 다음 노드 ID 또는 null
   */
  findNextNodeId(
    currentNode: NodeWithConditionResult,
    connections: NodeConnection[]
  ): string | null {
    if (currentNode.type === 'condition') {
      // 조건 노드: 평가 결과에 따라 분기 선택
      const conditionResult = currentNode._conditionResult;
      const branchLabel = conditionResult ? 'yes' : 'no';

      logger.info(
        `[NodeNavigation] 조건 노드 ${currentNode.id}: 결과=${conditionResult}, 분기=${branchLabel.toUpperCase()}`
      );

      // 현재 노드에서 나가는 모든 연결 로그
      const outgoingConnections = connections.filter(c => c.from === currentNode.id);
      logger.debug(
        `[NodeNavigation] 노드 ${currentNode.id}의 연결: ${JSON.stringify(outgoingConnections.map(c => ({ to: c.to, label: c.label, branch: c.branch })))}`
      );

      // label 또는 branch 속성 지원
      let nextConnection = connections.find(
        c => c.from === currentNode.id && (c.label === branchLabel || c.branch === branchLabel)
      );

      // 분기 연결이 없으면 기본 연결 시도
      if (!nextConnection) {
        logger.warn(
          `[NodeNavigation] 조건 노드 ${currentNode.id}: '${branchLabel}' 분기 연결 없음, 기본 연결 시도`
        );
        nextConnection = connections.find(c => c.from === currentNode.id);
      }

      if (nextConnection) {
        logger.info(
          `[NodeNavigation] 조건 노드 ${currentNode.id} → 다음 노드: ${nextConnection.to}`
        );
      } else {
        logger.warn(
          `[NodeNavigation] 조건 노드 ${currentNode.id}: 다음 노드 없음 (연결 없음)`
        );
      }

      return nextConnection?.to || null;
    }

    // 일반 노드: 첫 번째 연결
    const nextConnection = connections.find(c => c.from === currentNode.id);
    return nextConnection?.to || null;
  }

  /**
   * 시작 노드 찾기
   * @param nodes 노드 목록
   * @returns 시작 노드 또는 undefined
   */
  findStartNode(nodes: ExecutionNode[]): ExecutionNode | undefined {
    return nodes.find(n => n.type === 'start');
  }

  /**
   * 노드 ID로 노드 찾기
   * @param nodes 노드 목록
   * @param nodeId 찾을 노드 ID
   * @returns 노드 또는 undefined
   */
  findNodeById(nodes: ExecutionNode[], nodeId: string): ExecutionNode | undefined {
    return nodes.find(n => n.id === nodeId);
  }

  /**
   * 특정 노드에서 나가는 연결 찾기
   * @param connections 연결 목록
   * @param nodeId 노드 ID
   * @returns 해당 노드에서 나가는 연결 목록
   */
  getOutgoingConnections(connections: NodeConnection[], nodeId: string): NodeConnection[] {
    return connections.filter(c => c.from === nodeId);
  }

  /**
   * 특정 노드로 들어오는 연결 찾기
   * @param connections 연결 목록
   * @param nodeId 노드 ID
   * @returns 해당 노드로 들어오는 연결 목록
   */
  getIncomingConnections(connections: NodeConnection[], nodeId: string): NodeConnection[] {
    return connections.filter(c => c.to === nodeId);
  }
}

// 싱글톤 인스턴스
export const nodeNavigationService = new NodeNavigationService();
