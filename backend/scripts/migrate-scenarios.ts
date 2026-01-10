// backend/scripts/migrate-scenarios.ts
// 시나리오 폴더 구조 마이그레이션 스크립트
// 실행: npx ts-node scripts/migrate-scenarios.ts
//
// 목표 구조:
// scenarios/
// └── {packageId}/          (패키지 = 대분류)
//     └── {scenarioId}.json (TC = 소분류)

import * as fs from 'fs/promises';
import * as path from 'path';

const SCENARIOS_DIR = path.join(__dirname, '../scenarios');

interface Scenario {
  id: string;
  name: string;
  description: string;
  categoryId?: string;  // 레거시 (무시)
  packageId: string;
  nodes: unknown[];
  connections: unknown[];
  createdAt: string;
  updatedAt: string;
}

async function ensureDir(dir: string): Promise<void> {
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
    console.log(`📁 폴더 생성: ${dir}`);
  }
}

async function migrateScenarios(): Promise<void> {
  console.log('='.repeat(50));
  console.log('시나리오 폴더 구조 마이그레이션 (2단계 구조)');
  console.log('='.repeat(50));
  console.log('');
  console.log('목표 구조: scenarios/{packageId}/{scenarioId}.json');
  console.log('');

  // 1. 시나리오 폴더 확인
  console.log('[1/3] 기존 시나리오 스캔...');
  await ensureDir(SCENARIOS_DIR);

  let entries;
  try {
    entries = await fs.readdir(SCENARIOS_DIR, { withFileTypes: true });
  } catch (err) {
    console.error('시나리오 폴더 읽기 실패:', err);
    return;
  }

  // 루트에 있는 JSON 파일 찾기 (레거시 시나리오)
  const legacyFiles = entries.filter(e => e.isFile() && e.name.endsWith('.json'));

  // 기존 3단계 구조 (default/packageId/) 확인
  const defaultFolder = entries.find(e => e.isDirectory() && e.name === 'default');
  let legacyScenariosIn3Tier: { file: string; path: string; scenario: Scenario }[] = [];

  if (defaultFolder) {
    console.log('→ 3단계 구조 (default/packageId/) 감지됨. 2단계로 변환...');
    const defaultPath = path.join(SCENARIOS_DIR, 'default');
    const defaultEntries = await fs.readdir(defaultPath, { withFileTypes: true });

    for (const pkgEntry of defaultEntries) {
      if (pkgEntry.isDirectory()) {
        const pkgPath = path.join(defaultPath, pkgEntry.name);
        const files = await fs.readdir(pkgPath);
        const jsonFiles = files.filter(f => f.endsWith('.json'));

        for (const file of jsonFiles) {
          const filePath = path.join(pkgPath, file);
          try {
            const content = await fs.readFile(filePath, 'utf-8');
            const scenario = JSON.parse(content) as Scenario;
            legacyScenariosIn3Tier.push({ file, path: filePath, scenario });
          } catch (e) {
            console.error(`  파일 읽기 실패: ${filePath}`, e);
          }
        }
      }
    }
  }

  const totalLegacy = legacyFiles.length + legacyScenariosIn3Tier.length;

  if (totalLegacy === 0) {
    console.log('✓ 마이그레이션이 필요한 시나리오가 없습니다.');
    console.log('');
    console.log('='.repeat(50));
    console.log('마이그레이션 완료!');
    console.log('='.repeat(50));
    return;
  }

  console.log(`→ 마이그레이션 대상: ${totalLegacy}개의 시나리오`);
  console.log(`   - 루트 레거시 파일: ${legacyFiles.length}개`);
  console.log(`   - 3단계 구조 시나리오: ${legacyScenariosIn3Tier.length}개`);
  console.log('');

  // 2. 시나리오 마이그레이션
  console.log('[2/3] 시나리오 마이그레이션...');

  let successCount = 0;
  let errorCount = 0;

  // 2-1. 루트 레거시 파일 마이그레이션
  for (const file of legacyFiles) {
    const oldPath = path.join(SCENARIOS_DIR, file.name);

    try {
      const content = await fs.readFile(oldPath, 'utf-8');
      const scenario = JSON.parse(content) as Scenario;

      const packageId = scenario.packageId || 'unknown';

      // 새 경로 생성
      const newDir = path.join(SCENARIOS_DIR, packageId);
      await ensureDir(newDir);

      const newPath = path.join(newDir, file.name);

      // categoryId 제거
      delete scenario.categoryId;

      // 새 경로에 저장
      await fs.writeFile(newPath, JSON.stringify(scenario, null, 2), 'utf-8');

      // 기존 파일 삭제
      await fs.unlink(oldPath);

      console.log(`  ✓ ${scenario.name} (ID: ${scenario.id})`);
      console.log(`    ${file.name} → ${packageId}/${file.name}`);
      successCount++;
    } catch (err) {
      console.error(`  ✗ ${file.name} 마이그레이션 실패:`, err);
      errorCount++;
    }
  }

  // 2-2. 3단계 구조 시나리오 마이그레이션
  for (const { file, path: oldPath, scenario } of legacyScenariosIn3Tier) {
    try {
      const packageId = scenario.packageId || 'unknown';

      // 새 경로 생성
      const newDir = path.join(SCENARIOS_DIR, packageId);
      await ensureDir(newDir);

      const newPath = path.join(newDir, file);

      // categoryId 제거
      delete scenario.categoryId;

      // 새 경로에 저장
      await fs.writeFile(newPath, JSON.stringify(scenario, null, 2), 'utf-8');

      // 기존 파일 삭제
      await fs.unlink(oldPath);

      console.log(`  ✓ ${scenario.name} (ID: ${scenario.id})`);
      console.log(`    default/${packageId}/${file} → ${packageId}/${file}`);
      successCount++;
    } catch (err) {
      console.error(`  ✗ ${file} 마이그레이션 실패:`, err);
      errorCount++;
    }
  }

  // 3. 정리 작업
  console.log('');
  console.log('[3/3] 정리 작업...');

  // default 폴더 삭제 (비어있으면)
  if (defaultFolder) {
    try {
      const defaultPath = path.join(SCENARIOS_DIR, 'default');
      await cleanEmptyDirs(defaultPath);
      console.log('  ✓ 빈 폴더 정리 완료');
    } catch (err) {
      console.error('  폴더 정리 실패:', err);
    }
  }

  console.log('');
  console.log('='.repeat(50));
  console.log('마이그레이션 결과');
  console.log('='.repeat(50));
  console.log(`성공: ${successCount}개`);
  console.log(`실패: ${errorCount}개`);
  console.log('');

  if (errorCount === 0) {
    console.log('✓ 모든 시나리오가 성공적으로 마이그레이션되었습니다!');
  } else {
    console.log('⚠ 일부 시나리오 마이그레이션에 실패했습니다. 위의 에러를 확인하세요.');
  }
}

async function cleanEmptyDirs(dir: string): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const subDir = path.join(dir, entry.name);
      await cleanEmptyDirs(subDir);
    }
  }

  // 폴더가 비어있으면 삭제
  const remaining = await fs.readdir(dir);
  if (remaining.length === 0) {
    await fs.rmdir(dir);
    console.log(`  삭제: ${dir}`);
  }
}

// 스크립트 실행
migrateScenarios().catch(console.error);
