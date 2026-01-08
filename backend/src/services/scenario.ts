// backend/src/services/scenario.ts

import fs from 'fs/promises';
import path from 'path';
import packageService from './package';

// 시나리오 저장 경로
const SCENARIOS_DIR = path.join(__dirname, '../../scenarios');

// 시나리오 노드 인터페이스
interface ScenarioNode {
  id: string;
  type: string;
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
  packageId: string;
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
  nodeCount: number;
  createdAt: string;
  updatedAt: string;
}

// 시나리오 생성/수정 데이터 인터페이스
interface ScenarioData {
  name?: string;
  description?: string;
  packageId?: string;
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
   */
  private async _ensureDir(): Promise<void> {
    try {
      await fs.access(SCENARIOS_DIR);
    } catch {
      await fs.mkdir(SCENARIOS_DIR, { recursive: true });
    }
  }

  /**
   * 시나리오 파일 경로 생성
   */
  private _getFilePath(id: string): string {
    return path.join(SCENARIOS_DIR, `${id}.json`);
  }

  /**
   * 다음 ID 생성 (1, 2, 3, 4, 5 순차)
   */
  private async _generateId(): Promise<string> {
    await this._ensureDir();

    const files = await fs.readdir(SCENARIOS_DIR);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    if (jsonFiles.length === 0) {
      return '1';
    }

    // 기존 ID에서 숫자만 추출해서 최대값 찾기
    const ids = jsonFiles.map(f => {
      const id = f.replace('.json', '');
      const num = parseInt(id, 10);
      return isNaN(num) ? 0 : num;
    });

    const maxId = Math.max(...ids);
    return String(maxId + 1);
  }

  /**
   * 모든 시나리오 목록 조회
   * @param packageId 필터링할 패키지 ID (선택)
   */
  async getAll(packageId?: string): Promise<ScenarioListItem[]> {
    await this._ensureDir();

    const files = await fs.readdir(SCENARIOS_DIR);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    // 패키지 목록 가져오기 (패키지명 조회용)
    const packages = await packageService.getAll();
    const packageMap = new Map(packages.map(p => [p.id, p.name]));

    const scenarios = await Promise.all(
      jsonFiles.map(async (file) => {
        const filePath = path.join(SCENARIOS_DIR, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const scenario = JSON.parse(content) as Scenario;

        // 목록에서는 요약 정보만 반환
        return {
          id: scenario.id,
          name: scenario.name,
          description: scenario.description || '',
          packageId: scenario.packageId || '',
          packageName: packageMap.get(scenario.packageId) || '',
          nodeCount: scenario.nodes?.length || 0,
          createdAt: scenario.createdAt,
          updatedAt: scenario.updatedAt,
        };
      })
    );

    // 패키지 필터링 적용
    let filtered = scenarios;
    if (packageId) {
      filtered = scenarios.filter(s => s.packageId === packageId);
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
   * 특정 시나리오 조회
   */
  async getById(id: string): Promise<Scenario> {
    const filePath = this._getFilePath(id);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as Scenario;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        throw new Error(`시나리오를 찾을 수 없습니다: ${id}`);
      }
      throw error;
    }
  }

  /**
   * 새 시나리오 생성
   */
  async create(data: ScenarioData): Promise<Scenario> {
    await this._ensureDir();

    // packageId 필수 체크
    if (!data.packageId) {
      throw new Error('packageId는 필수입니다.');
    }

    // 패키지 존재 확인
    try {
      await packageService.getById(data.packageId);
    } catch {
      throw new Error(`존재하지 않는 패키지입니다: ${data.packageId}`);
    }

    const id = await this._generateId();
    const now = new Date().toISOString();

    const scenario: Scenario = {
      id,
      name: data.name || '새 시나리오',
      description: data.description || '',
      packageId: data.packageId,
      nodes: data.nodes || [],
      connections: data.connections || [],
      createdAt: now,
      updatedAt: now,
    };

    const filePath = this._getFilePath(id);
    await fs.writeFile(filePath, JSON.stringify(scenario, null, 2), 'utf-8');

    console.log(`📝 시나리오 생성: ${scenario.name} (ID: ${id}, 패키지: ${data.packageId})`);

    return scenario;
  }

  /**
   * 시나리오 수정
   */
  async update(id: string, data: ScenarioData): Promise<Scenario> {
    const existing = await this.getById(id);

    const updated: Scenario = {
      ...existing,
      name: data.name ?? existing.name,
      description: data.description ?? existing.description,
      nodes: data.nodes ?? existing.nodes,
      connections: data.connections ?? existing.connections,
      updatedAt: new Date().toISOString(),
    };

    const filePath = this._getFilePath(id);
    await fs.writeFile(filePath, JSON.stringify(updated, null, 2), 'utf-8');

    console.log(`✏️ 시나리오 수정: ${updated.name} (ID: ${id})`);

    return updated;
  }

  /**
   * 시나리오 삭제
   */
  async delete(id: string): Promise<DeleteResult> {
    const filePath = this._getFilePath(id);

    try {
      // 파일 존재 확인
      await fs.access(filePath);
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