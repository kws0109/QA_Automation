// backend/src/schemas/scenario.schema.ts
// 시나리오 관련 검증 스키마

import { z } from 'zod';

/**
 * 노드 파라미터 스키마
 */
const NodeParamsSchema = z.object({
  actionType: z.string().optional(),
  conditionType: z.string().optional(),
  // 절대 좌표 (deprecated, 하위 호환성용)
  x: z.number().optional(),
  y: z.number().optional(),
  // 퍼센트 좌표 (일반적으로 0-1 범위, 해상도 독립적)
  // 참고: 마이그레이션된 좌표는 1을 초과할 수 있음
  xPercent: z.number().optional(),
  yPercent: z.number().optional(),
  // 스와이프용 퍼센트 좌표
  startXPercent: z.number().optional(),
  startYPercent: z.number().optional(),
  endXPercent: z.number().optional(),
  endYPercent: z.number().optional(),
  text: z.string().optional(),
  resourceId: z.string().optional(),
  className: z.string().optional(),
  description: z.string().optional(),
  duration: z.number().optional(),
  timeout: z.number().optional(),
  templateId: z.string().optional(),
  confidence: z.number().optional(),
  maxRetries: z.number().optional(),
  retryInterval: z.number().optional(),
  direction: z.string().optional(),
  distance: z.number().optional(),
  speed: z.number().optional(),
  appPackage: z.string().optional(),
  appActivity: z.string().optional(),
  // ROI 영역
  roiEnabled: z.boolean().optional(),
  roiX: z.number().optional(),
  roiY: z.number().optional(),
  roiWidth: z.number().optional(),
  roiHeight: z.number().optional(),
  // 반복 횟수
  loopCount: z.number().optional(),
}).passthrough(); // 추가 속성 허용

/**
 * 노드 스키마
 */
const FlowNodeSchema = z.object({
  id: z.string().min(1, '노드 ID는 비어있을 수 없습니다'),
  type: z.enum(['start', 'action', 'condition', 'loop', 'end']),
  x: z.number(),
  y: z.number(),
  label: z.string().optional(),
  params: NodeParamsSchema.optional(),
});

/**
 * 연결 스키마
 */
const ConnectionSchema = z.object({
  from: z.string().min(1, '연결 시작 노드 ID는 비어있을 수 없습니다'),
  to: z.string().min(1, '연결 종료 노드 ID는 비어있을 수 없습니다'),
  label: z.string().nullable().optional(),
});

/**
 * 시나리오 생성 요청 스키마
 */
export const ScenarioCreateSchema = z.object({
  name: z.string()
    .min(1, '시나리오 이름은 비어있을 수 없습니다')
    .max(100, '시나리오 이름은 최대 100자입니다'),

  packageId: z.string()
    .min(1, '패키지 ID는 비어있을 수 없습니다'),

  categoryId: z.string()
    .min(1, '카테고리 ID는 비어있을 수 없습니다'),

  nodes: z.array(FlowNodeSchema)
    .min(1, '최소 1개의 노드가 필요합니다')
    .max(500, '노드는 최대 500개까지 추가할 수 있습니다'),

  connections: z.array(ConnectionSchema)
    .max(1000, '연결은 최대 1000개까지 추가할 수 있습니다'),

  description: z.string()
    .max(500, '설명은 최대 500자입니다')
    .optional(),
});

export type ValidatedScenarioCreate = z.infer<typeof ScenarioCreateSchema>;

/**
 * 시나리오 업데이트 요청 스키마
 * - id는 URL 파라미터로 전달되므로 body에서는 선택적
 */
export const ScenarioUpdateSchema = ScenarioCreateSchema.partial();

export type ValidatedScenarioUpdate = z.infer<typeof ScenarioUpdateSchema>;
