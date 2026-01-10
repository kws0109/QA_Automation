// backend/src/services/scenario.ts

import fs from 'fs/promises';
import path from 'path';
import packageService from './package';
import { categoryService } from './category';

// 시나리오 저장 경로
const SCENARIOS_DIR = path.join(__dirname, '../../scenarios');

// 시나리오 노드 인터페이스
interface ScenarioNode {
  id: string;
  type: string;
  label?: string;
  params?: Record<string, unknown>;
  [key: string]: unknown;
}

// 시나리오 연결 인터페이스
interface ScenarioConnection {
  from: string;
  to: string;
  branch?: string;
}

// 시나리오 인터페이스
interface Scenario {
  id: string;
  name: string;
  description: string;
  packageId: string;    // 대분류 (패키지)
  categoryId: string;   // 중분류 (카테고리)
  nodes: ScenarioNode[];
  connections: ScenarioConnection[];
  createdAt: string;
  updatedAt: string;
}

// 시나리오 목록 아이템 인터페이스
interface ScenarioListItem {
  id: string;
  name: string;
  description: string;
  packageId: string;
  packageName?: string;
  categoryId: string;
  categoryName?: string;
  nodeCount: number;
  createdAt: string;
  updatedAt: string;
}

// 시나리오 생성/수정 데이터 인터페이스
interface ScenarioData {
  name?: string;
  description?: string;
  packageId?: string;
  categoryId?: string;
  nodes?: ScenarioNode[];
  connections?: ScenarioConnection[];
}

// 삭제 결과 인터페이스
interface DeleteResult {
  success: boolean;
  id: string;
  message: string;
}

class ScenarioService {
  /**
   * 시나리오 저장 폴더 확인 및 생성
   * 경로: scenarios/{packageId}/{categoryId}/
   */
  private async _ensureDir(packageId?: string, categoryId?: string): Promise<void> {
    let targetDir = SCENARIOS_DIR;

    if (packageId) {
      targetDir = path.join(SCENARIOS_DIR, packageId);
      if (categoryId) {
        targetDir = path.join(targetDir, categoryId);
      }
    }

    try {
      await fs.access(targetDir);
    } catch {
      await fs.mkdir(targetDir, { recursive: true });
    }
  }

  /**
   * 시나리오 파일 경로 생성 (3단계 구조)
   * scenarios/{packageId}/{categoryId}/{id}.json
   */
  private _getFilePath(packageId: string, categoryId: string, id: string): string {
    return path.join(SCENARIOS_DIR, packageId, categoryId, `${id}.json`);
  }

  /**
   * 다음 ID 생성 (1, 2, 3, 4, 5 순차) - 전역적으로 유일한 ID
   */
  private async _generateId(): Promise<string> {
    await this._ensureDir();

    const allScenarios = await this._scanAllScenarios();

    if (allScenarios.length === 0) {
      return '1';
    }

    const ids = allScenarios.map(s => {
      const num = parseInt(s.id, 10);
      return isNaN(num) ? 0 : num;
    });

    const maxId = Math.max(...ids);
    return String(maxId + 1);
  }

  /**
   * 모든 시나리오 파일 스캔 (3단계 폴더 구조)
   * scenarios/{packageId}/{categoryId}/{scenarioId}.json
   */
  private async _scanAllScenarios(): Promise<Scenario[]> {
    await this._ensureDir();
    const scenarios: Scenario[] = [];

    try {
      const packageEntries = await fs.readdir(SCENARIOS_DIR, { withFileTypes: true });

      for (const pkgEntry of packageEntries) {
        if (!pkgEntry.isDirectory()) continue;

        const packagePath = path.join(SCENARIOS_DIR, pkgEntry.name);
        const categoryEntries = await fs.readdir(packagePath, { withFileTypes: true });

        for (const catEntry of categoryEntries) {
          if (catEntry.isDirectory()) {
            // 3단계 구조: packageId/categoryId/scenarioId.json
            const categoryPath = path.join(packagePath, catEntry.name);
            const files = await fs.readdir(categoryPath);
            const jsonFiles = files.filter(f => f.endsWith('.json'));

            for (const file of jsonFiles) {
              try {
                const filePath = path.join(categoryPath, file);
                const content = await fs.readFile(filePath, 'utf-8');
                const scenario = JSON.parse(content) as Scenario;
                // 카테고리 ID가 없는 레거시 데이터 처리
                if (!scenario.categoryId) {
                  scenario.categoryId = catEntry.name;
                }
                scenarios.push(scenario);
              } catch (e) {
                console.error(`시나리오 파일 읽기 실패: ${file}`, e);
              }
            }
          } else if (catEntry.isFile() && catEntry.name.endsWith('.json')) {
            // 2단계 레거시 구조: packageId/scenarioId.json
            try {
              const filePath = path.join(packagePath, catEntry.name);
              const content = await fs.readFile(filePath, 'utf-8');
              const scenario = JSON.parse(content) as Scenario;
              scenario.packageId = scenario.packageId || pkgEntry.name;
              scenario.categoryId = scenario.categoryId || '';
              scenarios.push(scenario);
            } catch (e) {
              console.error(`레거시 시나리오 파일 읽기 실패: ${catEntry.name}`, e);
            }
          }
        }
      }
    } catch (err) {
      console.error('시나리오 스캔 실패:', err);
    }

    return scenarios;
  }

  /**
   * 모든 시나리오 목록 조회
   * @param packageId 필터링할 패키지 ID (선택)
   * @param categoryId 필터링할 카테고리 ID (선택)
   */
  async getAll(packageId?: string, categoryId?: string): Promise<ScenarioListItem[]> {
    const allScenarios = await this._scanAllScenarios();

    // 패키지 목록 가져오기
    const packages = await packageService.getAll();
    const packageMap = new Map(packages.map(p => [p.id, p.name]));

    // 카테고리 목록 가져오기
    const categories = await categoryService.getAll();
    const categoryMap = new Map(categories.map(c => [c.id, c.name]));

    const scenarios: ScenarioListItem[] = allScenarios.map(scenario => ({
      id: scenario.id,
      name: scenario.name,
      description: scenario.description || '',
      packageId: scenario.packageId || '',
      packageName: packageMap.get(scenario.packageId) || '',
      categoryId: scenario.categoryId || '',
      categoryName: categoryMap.get(scenario.categoryId) || '',
      nodeCount: scenario.nodes?.length || 0,
      createdAt: scenario.createdAt,
      updatedAt: scenario.updatedAt,
    }));

    // 필터링 적용
    let filtered = scenarios;
    if (packageId) {
      filtered = filtered.filter(s => s.packageId === packageId);
    }
    if (categoryId) {
      filtered = filtered.filter(s => s.categoryId === categoryId);
    }

    // ID 숫자순 정렬
    filtered.sort((a, b) => parseInt(a.id) - parseInt(b.id));

    return filtered;
  }

  /**
   * 특정 패키지의 시나리오 목록 조회
   */
  async getByPackageId(packageId: string): Promise<ScenarioListItem[]> {
    return this.getAll(packageId);
  }

  /**
   * 특정 카테고리의 시나리오 목록 조회
   */
  async getByCategoryId(packageId: string, categoryId: string): Promise<ScenarioListItem[]> {
    return this.getAll(packageId, categoryId);
  }

  /**
   * 특정 시나리오 조회
   */
  async getById(id: string): Promise<Scenario> {
    const allScenarios = await this._scanAllScenarios();
    const scenario = allScenarios.find(s => s.id === id);

    if (scenario) {
      return scenario;
    }

    throw new Error(`시나리오를 찾을 수 없습니다: ${id}`);
  }

  /**
   * 시나리오 파일 경로 찾기 (ID 기반)
   */
  private async _findScenarioPath(id: string): Promise<string | null> {
    await this._ensureDir();

    try {
      const packageEntries = await fs.readdir(SCENARIOS_DIR, { withFileTypes: true });

      for (const pkgEntry of packageEntries) {
        if (!pkgEntry.isDirectory()) continue;

        const packagePath = path.join(SCENARIOS_DIR, pkgEntry.name);
        const categoryEntries = await fs.readdir(packagePath, { withFileTypes: true });

        for (const catEntry of categoryEntries) {
          if (catEntry.isDirectory()) {
            // 3단계 구조
            const filePath = path.join(packagePath, catEntry.name, `${id}.json`);
            try {
              await fs.access(filePath);
              return filePath;
            } catch {
              // 파일 없음, 계속 검색
            }
          } else if (catEntry.isFile() && catEntry.name === `${id}.json`) {
            // 2단계 레거시
            return path.join(packagePath, catEntry.name);
          }
        }
      }
    } catch (err) {
      console.error('시나리오 경로 검색 실패:', err);
    }

    return null;
  }

  /**
   * 새 시나리오 생성
   */
  async create(data: ScenarioData): Promise<Scenario> {
    // packageId 필수 체크
    if (!data.packageId) {
      throw new Error('packageId는 필수입니다.');
    }

    // categoryId 필수 체크
    if (!data.categoryId) {
      throw new Error('categoryId는 필수입니다.');
    }

    // 패키지 존재 확인
    try {
      await packageService.getById(data.packageId);
    } catch {
      throw new Error(`존재하지 않는 패키지입니다: ${data.packageId}`);
    }

    // 카테고리 존재 확인
    const category = await categoryService.getById(data.packageId, data.categoryId);
    if (!category) {
      throw new Error(`존재하지 않는 카테고리입니다: ${data.categoryId}`);
    }

    // 폴더 생성
    await this._ensureDir(data.packageId, data.categoryId);

    const id = await this._generateId();
    const now = new Date().toISOString();

    const scenario: Scenario = {
      id,
      name: data.name || '새 시나리오',
      description: data.description || '',
      packageId: data.packageId,
      categoryId: data.categoryId,
      nodes: data.nodes || [],
      connections: data.connections || [],
      createdAt: now,
      updatedAt: now,
    };

    const filePath = this._getFilePath(data.packageId, data.categoryId, id);
    await fs.writeFile(filePath, JSON.stringify(scenario, null, 2), 'utf-8');

    console.log(`📝 시나리오 생성: ${scenario.name} (ID: ${id}, 패키지: ${data.packageId}, 카테고리: ${data.categoryId})`);

    return scenario;
  }

  /**
   * 시나리오 수정
   */
  async update(id: string, data: ScenarioData): Promise<Scenario> {
    const existing = await this.getById(id);
    const oldPath = await this._findScenarioPath(id);

    if (!oldPath) {
      throw new Error(`시나리오 파일을 찾을 수 없습니다: ${id}`);
    }

    const newPackageId = data.packageId ?? existing.packageId;
    const newCategoryId = data.categoryId ?? existing.categoryId;

    const updated: Scenario = {
      ...existing,
      name: data.name ?? existing.name,
      description: data.description ?? existing.description,
      packageId: newPackageId,
      categoryId: newCategoryId,
      nodes: data.nodes ?? existing.nodes,
      connections: data.connections ?? existing.connections,
      updatedAt: new Date().toISOString(),
    };

    const newPath = this._getFilePath(newPackageId, newCategoryId, id);

    // 경로가 변경되었으면 새 폴더 생성 및 파일 이동
    if (oldPath !== newPath) {
      await this._ensureDir(newPackageId, newCategoryId);
      await fs.unlink(oldPath);
    }

    await fs.writeFile(newPath, JSON.stringify(updated, null, 2), 'utf-8');

    console.log(`✏️ 시나리오 수정: ${updated.name} (ID: ${id})`);

    return updated;
  }

  /**
   * 시나리오 삭제
   */
  async delete(id: string): Promise<DeleteResult> {
    const filePath = await this._findScenarioPath(id);

    if (!filePath) {
      throw new Error(`시나리오를 찾을 수 없습니다: ${id}`);
    }

    try {
      await fs.unlink(filePath);
      console.log(`🗑️ 시나리오 삭제: ID ${id}`);
      return { success: true, id, message: '시나리오가 삭제되었습니다.' };
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        throw new Error(`시나리오를 찾을 수 없습니다: ${id}`);
      }
      throw error;
    }
  }

  /**
   * 시나리오 복제
   */
  async duplicate(id: string): Promise<Scenario> {
    const original = await this.getById(id);

    const duplicated = await this.create({
      name: `${original.name} (복사본)`,
      description: original.description,
      packageId: original.packageId,
      categoryId: original.categoryId,
      nodes: original.nodes,
      connections: original.connections,
    });

    console.log(`📋 시나리오 복제: ${original.name} → ${duplicated.name}`);

    return duplicated;
  }
}

// 싱글톤 인스턴스 export
const scenarioService = new ScenarioService();
export default scenarioService;
