/*
 * 시나리오 관리 서비스
 * - 시나리오 CRUD (생성, 조회, 수정, 삭제)
 * - JSON 파일로 저장
 */

const fs = require('fs').promises;
const path = require('path');

// 시나리오 저장 경로
const SCENARIOS_DIR = path.join(__dirname, '../../scenarios');

class ScenarioService {
  /**
   * 시나리오 저장 폴더 확인 및 생성
   */
  async _ensureDir() {
    try {
      await fs.access(SCENARIOS_DIR);
    } catch {
      await fs.mkdir(SCENARIOS_DIR, { recursive: true });
    }
  }

  /**
   * 시나리오 파일 경로 생성
   * @param {string} id - 시나리오 ID
   */
  _getFilePath(id) {
    return path.join(SCENARIOS_DIR, `${id}.json`);
  }

  /**
   * 다음 ID 생성 (1, 2, 3, 4, 5 순차)
   */
  async _generateId() {
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
   * @returns {Promise<Array>} - 시나리오 목록
   */
  async getAll() {
    await this._ensureDir();

    const files = await fs.readdir(SCENARIOS_DIR);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    const scenarios = await Promise.all(
      jsonFiles.map(async (file) => {
        const filePath = path.join(SCENARIOS_DIR, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const scenario = JSON.parse(content);

        // 목록에서는 요약 정보만 반환
        return {
          id: scenario.id,
          name: scenario.name,
          description: scenario.description || '',
          nodeCount: scenario.nodes?.length || 0,
          createdAt: scenario.createdAt,
          updatedAt: scenario.updatedAt,
        };
      }),
    );

    // ID 숫자순 정렬
    scenarios.sort((a, b) => parseInt(a.id) - parseInt(b.id));

    return scenarios;
  }

  /**
   * 특정 시나리오 조회
   * @param {string} id - 시나리오 ID
   * @returns {Promise<Object>} - 시나리오 데이터
   */
  async getById(id) {
    const filePath = this._getFilePath(id);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`시나리오를 찾을 수 없습니다: ${id}`);
      }
      throw error;
    }
  }

  /**
   * 새 시나리오 생성
   * @param {Object} data - 시나리오 데이터
   * @returns {Promise<Object>} - 생성된 시나리오
   */
  async create(data) {
    await this._ensureDir();

    const id = await this._generateId();
    const now = new Date().toISOString();

    const scenario = {
      id,
      name: data.name || '새 시나리오',
      description: data.description || '',
      nodes: data.nodes || [],
      connections: data.connections || [],
      createdAt: now,
      updatedAt: now,
    };

    const filePath = this._getFilePath(id);
    await fs.writeFile(filePath, JSON.stringify(scenario, null, 2), 'utf-8');

    console.log(`📝 시나리오 생성: ${scenario.name} (ID: ${id})`);

    return scenario;
  }

  /**
   * 시나리오 수정
   * @param {string} id - 시나리오 ID
   * @param {Object} data - 수정할 데이터
   * @returns {Promise<Object>} - 수정된 시나리오
   */
  async update(id, data) {
    const existing = await this.getById(id);

    const updated = {
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
   * @param {string} id - 시나리오 ID
   * @returns {Promise<Object>} - 삭제 결과
   */
  async delete(id) {
    const filePath = this._getFilePath(id);

    try {
      // 파일 존재 확인
      await fs.access(filePath);
      await fs.unlink(filePath);

      console.log(`🗑️ 시나리오 삭제: ID ${id}`);

      return { success: true, id, message: '시나리오가 삭제되었습니다.' };
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`시나리오를 찾을 수 없습니다: ${id}`);
      }
      throw error;
    }
  }

  /**
   * 시나리오 복제
   * @param {string} id - 원본 시나리오 ID
   * @returns {Promise<Object>} - 복제된 시나리오
   */
  async duplicate(id) {
    const original = await this.getById(id);

    const duplicated = await this.create({
      name: `${original.name} (복사본)`,
      description: original.description,
      nodes: original.nodes,
      connections: original.connections,
    });

    console.log(`📋 시나리오 복제: ${original.name} → ${duplicated.name}`);

    return duplicated;
  }
}

module.exports = new ScenarioService();
