// backend/src/services/suiteService.ts
// Test Suite CRUD 서비스

import fs from 'fs/promises';
import path from 'path';
import { TestSuite, TestSuiteInput } from '../types';

const SUITES_DIR = path.join(__dirname, '../../suites');

/**
 * Suite 저장 디렉토리 초기화
 */
async function ensureSuitesDir(): Promise<void> {
  try {
    await fs.access(SUITES_DIR);
  } catch {
    await fs.mkdir(SUITES_DIR, { recursive: true });
  }
}

/**
 * Suite ID 생성
 */
function generateSuiteId(): string {
  return `suite_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Suite 파일 경로
 */
function getSuiteFilePath(suiteId: string): string {
  return path.join(SUITES_DIR, `${suiteId}.json`);
}

/**
 * 모든 Suite 목록 조회
 */
export async function getAllSuites(): Promise<TestSuite[]> {
  await ensureSuitesDir();

  try {
    const files = await fs.readdir(SUITES_DIR);
    const suiteFiles = files.filter(f => f.endsWith('.json'));

    const suites: TestSuite[] = [];
    for (const file of suiteFiles) {
      try {
        const content = await fs.readFile(path.join(SUITES_DIR, file), 'utf-8');
        suites.push(JSON.parse(content));
      } catch (err) {
        console.error(`[SuiteService] Failed to read suite file: ${file}`, err);
      }
    }

    // updatedAt 기준 내림차순 정렬
    return suites.sort((a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  } catch (err) {
    console.error('[SuiteService] Failed to list suites:', err);
    return [];
  }
}

/**
 * Suite ID로 조회
 */
export async function getSuiteById(suiteId: string): Promise<TestSuite | null> {
  const filePath = getSuiteFilePath(suiteId);

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    console.error(`[SuiteService] Suite not found: ${suiteId}`);
    return null;
  }
}

/**
 * Suite 생성
 */
export async function createSuite(input: TestSuiteInput): Promise<TestSuite> {
  await ensureSuitesDir();

  const now = new Date().toISOString();
  const suite: TestSuite = {
    id: generateSuiteId(),
    name: input.name,
    description: input.description,
    scenarioIds: input.scenarioIds,
    deviceIds: input.deviceIds,
    createdAt: now,
    updatedAt: now,
  };

  const filePath = getSuiteFilePath(suite.id);
  await fs.writeFile(filePath, JSON.stringify(suite, null, 2), 'utf-8');

  console.log(`[SuiteService] Suite created: ${suite.id} - ${suite.name}`);
  return suite;
}

/**
 * Suite 수정
 */
export async function updateSuite(
  suiteId: string,
  input: Partial<TestSuiteInput>
): Promise<TestSuite | null> {
  const suite = await getSuiteById(suiteId);
  if (!suite) {
    return null;
  }

  const updated: TestSuite = {
    ...suite,
    name: input.name ?? suite.name,
    description: input.description ?? suite.description,
    scenarioIds: input.scenarioIds ?? suite.scenarioIds,
    deviceIds: input.deviceIds ?? suite.deviceIds,
    updatedAt: new Date().toISOString(),
  };

  const filePath = getSuiteFilePath(suiteId);
  await fs.writeFile(filePath, JSON.stringify(updated, null, 2), 'utf-8');

  console.log(`[SuiteService] Suite updated: ${suiteId}`);
  return updated;
}

/**
 * Suite 삭제
 */
export async function deleteSuite(suiteId: string): Promise<boolean> {
  const filePath = getSuiteFilePath(suiteId);

  try {
    await fs.unlink(filePath);
    console.log(`[SuiteService] Suite deleted: ${suiteId}`);
    return true;
  } catch (err) {
    console.error(`[SuiteService] Failed to delete suite: ${suiteId}`, err);
    return false;
  }
}

/**
 * Suite 존재 여부 확인
 */
export async function suiteExists(suiteId: string): Promise<boolean> {
  const filePath = getSuiteFilePath(suiteId);

  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * 시나리오 ID로 관련 Suite 조회
 */
export async function getSuitesByScenarioId(scenarioId: string): Promise<TestSuite[]> {
  const allSuites = await getAllSuites();
  return allSuites.filter(suite => suite.scenarioIds.includes(scenarioId));
}

/**
 * 디바이스 ID로 관련 Suite 조회
 */
export async function getSuitesByDeviceId(deviceId: string): Promise<TestSuite[]> {
  const allSuites = await getAllSuites();
  return allSuites.filter(suite => suite.deviceIds.includes(deviceId));
}

export default {
  getAllSuites,
  getSuiteById,
  createSuite,
  updateSuite,
  deleteSuite,
  suiteExists,
  getSuitesByScenarioId,
  getSuitesByDeviceId,
};
