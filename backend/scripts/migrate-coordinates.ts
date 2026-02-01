// backend/scripts/migrate-coordinates.ts
// 기존 시나리오의 절대 좌표를 퍼센트 좌표로 마이그레이션하는 스크립트

import * as fs from 'fs';
import * as path from 'path';

const SOURCE_WIDTH = 1080;
const SOURCE_HEIGHT = 2246;

const SCENARIOS_DIR = path.join(__dirname, '..', 'scenarios');

interface NodeParams {
  x?: number;
  y?: number;
  xPercent?: number;
  yPercent?: number;
  startX?: number;
  startY?: number;
  endX?: number;
  endY?: number;
  startXPercent?: number;
  startYPercent?: number;
  endXPercent?: number;
  endYPercent?: number;
  [key: string]: unknown;
}

interface FlowNode {
  id: string;
  type: string;
  params?: NodeParams;
  [key: string]: unknown;
}

interface Scenario {
  id: string;
  name: string;
  nodes: FlowNode[];
  [key: string]: unknown;
}

function migrateScenario(scenario: Scenario): { migratedCount: number; scenario: Scenario } {
  let migratedCount = 0;

  const migratedNodes = scenario.nodes.map(node => {
    if (!node.params) return node;

    const params = { ...node.params };
    let changed = false;

    // 탭/롱프레스 좌표 마이그레이션
    if (params.x !== undefined && params.y !== undefined &&
        params.xPercent === undefined && params.yPercent === undefined) {
      params.xPercent = params.x / SOURCE_WIDTH;
      params.yPercent = params.y / SOURCE_HEIGHT;
      changed = true;
      console.log(`  - 노드 ${node.id}: (${params.x}, ${params.y}) → (${(params.xPercent * 100).toFixed(2)}%, ${(params.yPercent * 100).toFixed(2)}%)`);
    }

    // 스와이프 좌표 마이그레이션
    if (params.startX !== undefined && params.startY !== undefined &&
        params.endX !== undefined && params.endY !== undefined &&
        params.startXPercent === undefined) {
      params.startXPercent = params.startX / SOURCE_WIDTH;
      params.startYPercent = params.startY / SOURCE_HEIGHT;
      params.endXPercent = params.endX / SOURCE_WIDTH;
      params.endYPercent = params.endY / SOURCE_HEIGHT;
      changed = true;
      console.log(`  - 노드 ${node.id} (스와이프): (${params.startX},${params.startY})→(${params.endX},${params.endY})`);
    }

    if (changed) {
      migratedCount++;
      return { ...node, params };
    }
    return node;
  });

  return {
    migratedCount,
    scenario: { ...scenario, nodes: migratedNodes }
  };
}

function findScenarioFiles(dir: string): string[] {
  const results: string[] = [];

  if (!fs.existsSync(dir)) {
    return results;
  }

  const items = fs.readdirSync(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      // 패키지 폴더 내부 탐색
      results.push(...findScenarioFiles(fullPath));
    } else if (item.endsWith('.json') && item !== 'package.json' && !item.startsWith('.')) {
      results.push(fullPath);
    }
  }

  return results;
}

async function main() {
  console.log('='.repeat(60));
  console.log('좌표 마이그레이션 스크립트');
  console.log(`소스 해상도: ${SOURCE_WIDTH} x ${SOURCE_HEIGHT}`);
  console.log('='.repeat(60));

  if (!fs.existsSync(SCENARIOS_DIR)) {
    console.log('시나리오 폴더가 없습니다:', SCENARIOS_DIR);
    return;
  }

  const files = findScenarioFiles(SCENARIOS_DIR);
  console.log(`발견된 시나리오 파일: ${files.length}개\n`);

  let totalMigrated = 0;
  const migratedScenarios: string[] = [];

  for (const filePath of files) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const scenario: Scenario = JSON.parse(content);

      // 시나리오 파일인지 확인 (nodes 배열이 있어야 함)
      if (!scenario.nodes || !Array.isArray(scenario.nodes)) {
        continue;
      }

      console.log(`[${scenario.name}] (${path.basename(filePath)})`);

      const { migratedCount, scenario: migratedScenario } = migrateScenario(scenario);

      if (migratedCount > 0) {
        fs.writeFileSync(filePath, JSON.stringify(migratedScenario, null, 2), 'utf-8');
        totalMigrated += migratedCount;
        migratedScenarios.push(scenario.name);
        console.log(`  ✓ ${migratedCount}개 노드 마이그레이션 완료\n`);
      } else {
        console.log(`  - 마이그레이션 필요 없음\n`);
      }
    } catch (err) {
      console.log(`  ⚠ 파일 처리 실패: ${filePath}`, err);
    }
  }

  console.log('='.repeat(60));
  console.log('마이그레이션 완료!');
  console.log(`- 총 ${migratedScenarios.length}개 시나리오`);
  console.log(`- 총 ${totalMigrated}개 노드`);
  if (migratedScenarios.length > 0) {
    console.log(`- 마이그레이션된 시나리오: ${migratedScenarios.join(', ')}`);
  }
  console.log('='.repeat(60));
}

main().catch(console.error);
