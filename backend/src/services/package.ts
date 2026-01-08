// backend/src/services/package.ts

import fs from 'fs/promises';
import path from 'path';
import { Package, PackageListItem, CreatePackageRequest, UpdatePackageRequest } from '../types';

// 패키지 저장 경로
const PACKAGES_DIR = path.join(__dirname, '../../packages');

// 삭제 결과 인터페이스
interface DeleteResult {
  success: boolean;
  id: string;
  message: string;
}

class PackageService {
  /**
   * 패키지 저장 폴더 확인 및 생성
   */
  private async _ensureDir(): Promise<void> {
    try {
      await fs.access(PACKAGES_DIR);
    } catch {
      await fs.mkdir(PACKAGES_DIR, { recursive: true });
    }
  }

  /**
   * 패키지 파일 경로 생성
   */
  private _getFilePath(id: string): string {
    return path.join(PACKAGES_DIR, `${id}.json`);
  }

  /**
   * 다음 ID 생성 (UUID)
   */
  private _generateId(): string {
    return `pkg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * 모든 패키지 목록 조회
   */
  async getAll(): Promise<PackageListItem[]> {
    await this._ensureDir();

    const files = await fs.readdir(PACKAGES_DIR);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    const packages = await Promise.all(
      jsonFiles.map(async (file) => {
        const filePath = path.join(PACKAGES_DIR, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const pkg = JSON.parse(content) as Package;

        // 해당 패키지의 시나리오 수 계산
        const scenarioCount = await this._getScenarioCount(pkg.id);

        return {
          id: pkg.id,
          name: pkg.name,
          packageName: pkg.packageName,
          description: pkg.description,
          scenarioCount,
          createdAt: pkg.createdAt,
          updatedAt: pkg.updatedAt,
        };
      })
    );

    // 생성일 기준 정렬
    packages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    return packages;
  }

  /**
   * 패키지의 시나리오 수 계산
   */
  private async _getScenarioCount(packageId: string): Promise<number> {
    const scenariosDir = path.join(__dirname, '../../scenarios');

    try {
      const files = await fs.readdir(scenariosDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      let count = 0;
      for (const file of jsonFiles) {
        const filePath = path.join(scenariosDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const scenario = JSON.parse(content);
        if (scenario.packageId === packageId) {
          count++;
        }
      }
      return count;
    } catch {
      return 0;
    }
  }

  /**
   * 특정 패키지 조회
   */
  async getById(id: string): Promise<Package> {
    const filePath = this._getFilePath(id);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as Package;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        throw new Error(`패키지를 찾을 수 없습니다: ${id}`);
      }
      throw error;
    }
  }

  /**
   * 새 패키지 생성
   */
  async create(data: CreatePackageRequest): Promise<Package> {
    await this._ensureDir();

    // 패키지명 중복 체크
    const existing = await this.getAll();
    if (existing.some(p => p.packageName === data.packageName)) {
      throw new Error(`이미 존재하는 패키지명입니다: ${data.packageName}`);
    }

    const id = this._generateId();
    const now = new Date().toISOString();

    const pkg: Package = {
      id,
      name: data.name,
      packageName: data.packageName,
      description: data.description || '',
      createdAt: now,
      updatedAt: now,
    };

    const filePath = this._getFilePath(id);
    await fs.writeFile(filePath, JSON.stringify(pkg, null, 2), 'utf-8');

    console.log(`📦 패키지 생성: ${pkg.name} (${pkg.packageName})`);

    return pkg;
  }

  /**
   * 패키지 수정
   */
  async update(id: string, data: UpdatePackageRequest): Promise<Package> {
    const existing = await this.getById(id);

    // 패키지명 중복 체크 (자신 제외)
    if (data.packageName && data.packageName !== existing.packageName) {
      const all = await this.getAll();
      if (all.some(p => p.packageName === data.packageName && p.id !== id)) {
        throw new Error(`이미 존재하는 패키지명입니다: ${data.packageName}`);
      }
    }

    const updated: Package = {
      ...existing,
      name: data.name ?? existing.name,
      packageName: data.packageName ?? existing.packageName,
      description: data.description ?? existing.description,
      updatedAt: new Date().toISOString(),
    };

    const filePath = this._getFilePath(id);
    await fs.writeFile(filePath, JSON.stringify(updated, null, 2), 'utf-8');

    console.log(`✏️ 패키지 수정: ${updated.name} (${updated.packageName})`);

    return updated;
  }

  /**
   * 패키지 삭제
   */
  async delete(id: string): Promise<DeleteResult> {
    const filePath = this._getFilePath(id);

    // 해당 패키지에 속한 시나리오가 있는지 확인
    const scenarioCount = await this._getScenarioCount(id);
    if (scenarioCount > 0) {
      throw new Error(`이 패키지에 ${scenarioCount}개의 시나리오가 있습니다. 먼저 시나리오를 삭제하거나 이동해주세요.`);
    }

    try {
      await fs.access(filePath);
      await fs.unlink(filePath);

      console.log(`🗑️ 패키지 삭제: ID ${id}`);

      return { success: true, id, message: '패키지가 삭제되었습니다.' };
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        throw new Error(`패키지를 찾을 수 없습니다: ${id}`);
      }
      throw error;
    }
  }
}

// 싱글톤 인스턴스 export
const packageService = new PackageService();
export default packageService;
