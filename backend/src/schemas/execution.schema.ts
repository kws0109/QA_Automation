// backend/src/schemas/execution.schema.ts
// 테스트 실행 요청 검증 스키마

import { z } from 'zod';

/**
 * 테스트 실행 요청 스키마
 */
export const TestExecutionRequestSchema = z.object({
  // 필수 필드
  deviceIds: z.array(z.string().min(1, '디바이스 ID는 비어있을 수 없습니다'))
    .min(1, '최소 1개의 디바이스를 선택해야 합니다')
    .max(50, '최대 50개의 디바이스까지 선택할 수 있습니다'),

  scenarioIds: z.array(z.string().min(1, '시나리오 ID는 비어있을 수 없습니다'))
    .min(1, '최소 1개의 시나리오를 선택해야 합니다')
    .max(100, '최대 100개의 시나리오까지 선택할 수 있습니다'),

  // 선택적 필드
  repeatCount: z.number()
    .int('반복 횟수는 정수여야 합니다')
    .min(1, '반복 횟수는 최소 1회입니다')
    .max(10, '반복 횟수는 최대 10회입니다')
    .optional()
    .default(1),

  scenarioInterval: z.number()
    .int('시나리오 간격은 정수여야 합니다')
    .min(0, '시나리오 간격은 0 이상이어야 합니다')
    .max(60000, '시나리오 간격은 최대 60초입니다')
    .optional()
    .default(0),

  userName: z.string()
    .min(1, '사용자 이름은 비어있을 수 없습니다')
    .max(50, '사용자 이름은 최대 50자입니다')
    .optional(),

  requesterSlackId: z.string()
    .max(50, 'Slack ID는 최대 50자입니다')
    .optional(),

  priority: z.number()
    .int()
    .min(0)
    .max(2)
    .optional()
    .default(1),

  testName: z.string()
    .max(200, '테스트 이름은 최대 200자입니다')
    .optional(),
});

export type ValidatedTestExecutionRequest = z.infer<typeof TestExecutionRequestSchema>;

/**
 * Suite 실행 요청 스키마
 */
export const SuiteExecutionRequestSchema = z.object({
  userName: z.string()
    .min(1, '사용자 이름은 비어있을 수 없습니다')
    .max(50, '사용자 이름은 최대 50자입니다')
    .optional(),

  requesterSlackId: z.string()
    .max(50, 'Slack ID는 최대 50자입니다')
    .optional(),

  repeatCount: z.number()
    .int('반복 횟수는 정수여야 합니다')
    .min(1, '반복 횟수는 최소 1회입니다')
    .max(10, '반복 횟수는 최대 10회입니다')
    .optional()
    .default(1),

  scenarioInterval: z.number()
    .int('시나리오 간격은 정수여야 합니다')
    .min(0, '시나리오 간격은 0 이상이어야 합니다')
    .max(60000, '시나리오 간격은 최대 60초입니다')
    .optional()
    .default(0),
});

export type ValidatedSuiteExecutionRequest = z.infer<typeof SuiteExecutionRequestSchema>;
