// backend/src/services/category.ts

import * as fs from 'fs/promises';
import * as path from 'path';
import { Category, CreateCategoryData, UpdateCategoryData } from '../types';

const CATEGORIES_DIR = path.join(__dirname, '../../categories');

// 한글 이름을 케밥케이스 ID로 변환
function toKebabCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9가-힣-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

class CategoryService {
  /**
   * 폴더 존재 확인 및 생성
   */
  private async _ensureDir(): Promise<void> {
    try {
      await fs.access(CATEGORIES_DIR);
    } catch {
      await fs.mkdir(CATEGORIES_DIR, { recursive: true });
    }
  }

  /**
   * 파일 경로 생성
   */
  private _getFilePath(id: string): string {
    return path.join(CATEGORIES_DIR, `${id}.json`);
  }

  /**
   * 모든 카테고리 조회
   */
  async getAll(): Promise<Category[]> {
    await this._ensureDir();

    try {
      const files = await fs.readdir(CATEGORIES_DIR);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      const categories = await Promise.all(
        jsonFiles.map(async file => {
          const filePath = path.join(CATEGORIES_DIR, file);
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
   * 단일 카테고리 조회
   */
  async getById(id: string): Promise<Category | null> {
    try {
      const filePath = this._getFilePath(id);
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
    await this._ensureDir();

    // ID 생성 (제공되지 않으면 이름에서 생성)
    const id = data.id || toKebabCase(data.name) || `cat_${Date.now()}`;

    // 중복 체크
    const existing = await this.getById(id);
    if (existing) {
      throw new Error(`카테고리 ID '${id}'가 이미 존재합니다.`);
    }

    // order 계산 (마지막 순서)
    const all = await this.getAll();
    const maxOrder = all.length > 0 ? Math.max(...all.map(c => c.order)) : 0;

    const now = new Date().toISOString();
    const category: Category = {
      id,
      name: data.name,
      description: data.description,
      order: maxOrder + 1,
      createdAt: now,
      updatedAt: now,
    };

    const filePath = this._getFilePath(id);
    await fs.writeFile(filePath, JSON.stringify(category, null, 2), 'utf-8');

    console.log(`카테고리 생성: ${id} (${data.name})`);
    return category;
  }

  /**
   * 카테고리 수정
   */
  async update(id: string, data: UpdateCategoryData): Promise<Category> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error(`카테고리 '${id}'를 찾을 수 없습니다.`);
    }

    const updated: Category = {
      ...existing,
      name: data.name ?? existing.name,
      description: data.description ?? existing.description,
      order: data.order ?? existing.order,
      updatedAt: new Date().toISOString(),
    };

    const filePath = this._getFilePath(id);
    await fs.writeFile(filePath, JSON.stringify(updated, null, 2), 'utf-8');

    console.log(`카테고리 수정: ${id}`);
    return updated;
  }

  /**
   * 카테고리 삭제
   */
  async delete(id: string): Promise<boolean> {
    try {
      const filePath = this._getFilePath(id);
      await fs.unlink(filePath);
      console.log(`카테고리 삭제: ${id}`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 카테고리 순서 변경
   */
  async reorder(items: { id: string; order: number }[]): Promise<void> {
    for (const item of items) {
      const category = await this.getById(item.id);
      if (category) {
        await this.update(item.id, { order: item.order });
      }
    }
    console.log('카테고리 순서 변경 완료');
  }

  /**
   * 기본 카테고리 초기화 (default 카테고리가 없으면 생성)
   */
  async ensureDefaultCategory(): Promise<Category> {
    const defaultCategory = await this.getById('default');
    if (defaultCategory) {
      return defaultCategory;
    }

    return this.create({
      id: 'default',
      name: '기본',
      description: '기본 카테고리',
    });
  }
}

export const categoryService = new CategoryService();
