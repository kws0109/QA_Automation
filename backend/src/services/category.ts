// backend/src/services/category.ts

import * as fs from 'fs/promises';
import * as path from 'path';
import { Category, CreateCategoryData, UpdateCategoryData } from '../types';

const CATEGORIES_DIR = path.join(__dirname, '../../categories');

// ID 생성 유틸리티
function generateId(): string {
  return `cat_${Date.now()}_${Math.random().toString(36).substr(2, 7)}`;
}

class CategoryService {
  /**
   * 패키지별 폴더 경로
   */
  private _getPackageDir(packageId: string): string {
    return path.join(CATEGORIES_DIR, packageId);
  }

  /**
   * 파일 경로 생성
   */
  private _getFilePath(packageId: string, categoryId: string): string {
    return path.join(this._getPackageDir(packageId), `${categoryId}.json`);
  }

  /**
   * 폴더 존재 확인 및 생성
   */
  private async _ensureDir(packageId: string): Promise<void> {
    const dir = this._getPackageDir(packageId);
    try {
      await fs.access(dir);
    } catch {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  /**
   * 패키지의 모든 카테고리 조회
   */
  async getByPackage(packageId: string): Promise<Category[]> {
    await this._ensureDir(packageId);

    try {
      const dir = this._getPackageDir(packageId);
      const files = await fs.readdir(dir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      const categories = await Promise.all(
        jsonFiles.map(async file => {
          const filePath = path.join(dir, file);
          const content = await fs.readFile(filePath, 'utf-8');
          return JSON.parse(content) as Category;
        })
      );

      // order 순서로 정렬
      return categories.sort((a, b) => a.order - b.order);
    } catch (err) {
      console.error('카테고리 목록 조회 실패:', err);
      return [];
    }
  }

  /**
   * 모든 카테고리 조회 (전체 패키지)
   */
  async getAll(): Promise<Category[]> {
    try {
      await fs.access(CATEGORIES_DIR);
    } catch {
      return [];
    }

    try {
      const packageDirs = await fs.readdir(CATEGORIES_DIR);
      const allCategories: Category[] = [];

      for (const pkgDir of packageDirs) {
        const pkgPath = path.join(CATEGORIES_DIR, pkgDir);
        const stat = await fs.stat(pkgPath);
        if (stat.isDirectory()) {
          const categories = await this.getByPackage(pkgDir);
          allCategories.push(...categories);
        }
      }

      return allCategories.sort((a, b) => a.order - b.order);
    } catch (err) {
      console.error('전체 카테고리 조회 실패:', err);
      return [];
    }
  }

  /**
   * 단일 카테고리 조회
   */
  async getById(packageId: string, categoryId: string): Promise<Category | null> {
    try {
      const filePath = this._getFilePath(packageId, categoryId);
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as Category;
    } catch {
      return null;
    }
  }

  /**
   * 카테고리 생성
   */
  async create(data: CreateCategoryData): Promise<Category> {
    if (!data.packageId) {
      throw new Error('packageId는 필수입니다.');
    }

    await this._ensureDir(data.packageId);

    const id = generateId();

    // order 계산 (마지막 순서)
    const all = await this.getByPackage(data.packageId);
    const maxOrder = all.length > 0 ? Math.max(...all.map(c => c.order)) : 0;

    const now = new Date().toISOString();
    const category: Category = {
      id,
      packageId: data.packageId,
      name: data.name,
      description: data.description,
      order: maxOrder + 1,
      createdAt: now,
      updatedAt: now,
    };

    const filePath = this._getFilePath(data.packageId, id);
    await fs.writeFile(filePath, JSON.stringify(category, null, 2), 'utf-8');

    console.log(`카테고리 생성: ${id} (${data.name}) in package ${data.packageId}`);
    return category;
  }

  /**
   * 카테고리 수정
   */
  async update(packageId: string, categoryId: string, data: UpdateCategoryData): Promise<Category> {
    const existing = await this.getById(packageId, categoryId);
    if (!existing) {
      throw new Error(`카테고리 '${categoryId}'를 찾을 수 없습니다.`);
    }

    const updated: Category = {
      ...existing,
      name: data.name ?? existing.name,
      description: data.description ?? existing.description,
      order: data.order ?? existing.order,
      updatedAt: new Date().toISOString(),
    };

    const filePath = this._getFilePath(packageId, categoryId);
    await fs.writeFile(filePath, JSON.stringify(updated, null, 2), 'utf-8');

    console.log(`카테고리 수정: ${categoryId}`);
    return updated;
  }

  /**
   * 카테고리 삭제
   */
  async delete(packageId: string, categoryId: string): Promise<boolean> {
    try {
      const filePath = this._getFilePath(packageId, categoryId);
      await fs.unlink(filePath);
      console.log(`카테고리 삭제: ${categoryId}`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 기본 카테고리 생성 (패키지별)
   */
  async ensureDefaultCategory(packageId: string): Promise<Category> {
    const categories = await this.getByPackage(packageId);
    const defaultCat = categories.find(c => c.name === '기본');
    if (defaultCat) {
      return defaultCat;
    }

    return this.create({
      packageId,
      name: '기본',
      description: '기본 카테고리',
    });
  }
}

export const categoryService = new CategoryService();
