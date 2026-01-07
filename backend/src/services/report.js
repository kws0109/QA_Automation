// backend/src/services/report.js

/**
 * 실행 결과 리포트 서비스
 * - 리포트 저장/조회/삭제
 * - JSON 파일로 저장
 */

const fs = require('fs').promises;
const path = require('path');

const REPORTS_DIR = path.join(__dirname, '../../reports');

class ReportService {
  /**
   * 리포트 저장 폴더 확인 및 생성
   */
  async _ensureDir() {
    try {
      await fs.access(REPORTS_DIR);
    } catch {
      await fs.mkdir(REPORTS_DIR, { recursive: true });
    }
  }

  /**
   * 리포트 파일 경로 생성
   */
  _getFilePath(id) {
    return path.join(REPORTS_DIR, `${id}.json`);
  }

  /**
   * 다음 ID 생성
   */
  async _generateId() {
    await this._ensureDir();
    
    const files = await fs.readdir(REPORTS_DIR);
    const jsonFiles = files.filter(f => f.endsWith('.json'));
    
    if (jsonFiles.length === 0) {
      return '1';
    }
    
    const ids = jsonFiles.map(f => {
      const id = f.replace('.json', '');
      const num = parseInt(id, 10);
      return isNaN(num) ? 0 : num;
    });
    
    const maxId = Math.max(...ids);
    return String(maxId + 1);
  }

  /**
   * 리포트 생성
   */
  async create(data) {
    await this._ensureDir();
    
    const id = await this._generateId();
    const now = new Date().toISOString();
    
    // 통계 계산
    const logs = data.log || [];
    const successCount = logs.filter(l => l.status === 'success').length;
    const errorCount = logs.filter(l => l.status === 'error').length;
    const totalDuration = this._calculateDuration(logs);
    
    const report = {
      id,
      scenarioId: data.scenarioId,
      scenarioName: data.scenarioName,
      success: data.success,
      error: data.error || null,
      logs,
      stats: {
        totalNodes: logs.length,
        successCount,
        errorCount,
        duration: totalDuration,
      },
      createdAt: now,
    };
    
    const filePath = this._getFilePath(id);
    await fs.writeFile(filePath, JSON.stringify(report, null, 2), 'utf-8');
    
    console.log(`📊 리포트 생성: ${report.scenarioName} (ID: ${id})`);
    
    return report;
  }

  /**
   * 실행 시간 계산
   */
  _calculateDuration(logs) {
    if (logs.length < 2) return 0;
    
    const firstTime = new Date(logs[0].timestamp).getTime();
    const lastTime = new Date(logs[logs.length - 1].timestamp).getTime();
    
    return lastTime - firstTime;
  }

  /**
   * 모든 리포트 목록 조회
   */
  async getAll() {
    await this._ensureDir();
    
    const files = await fs.readdir(REPORTS_DIR);
    const jsonFiles = files.filter(f => f.endsWith('.json'));
    
    const reports = await Promise.all(
      jsonFiles.map(async (file) => {
        const filePath = path.join(REPORTS_DIR, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const report = JSON.parse(content);
        
        // 목록에서는 요약 정보만 반환
        return {
          id: report.id,
          scenarioId: report.scenarioId,
          scenarioName: report.scenarioName,
          success: report.success,
          stats: report.stats,
          createdAt: report.createdAt,
        };
      })
    );
    
    // 최신순 정렬
    reports.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    return reports;
  }

  /**
   * 특정 리포트 조회
   */
  async getById(id) {
    const filePath = this._getFilePath(id);
    
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`리포트를 찾을 수 없습니다: ${id}`);
      }
      throw error;
    }
  }

  /**
   * 리포트 삭제
   */
  async delete(id) {
    const filePath = this._getFilePath(id);
    
    try {
      await fs.access(filePath);
      await fs.unlink(filePath);
      
      console.log(`🗑️ 리포트 삭제: ID ${id}`);
      
      return { success: true, id, message: '리포트가 삭제되었습니다.' };
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`리포트를 찾을 수 없습니다: ${id}`);
      }
      throw error;
    }
  }

  /**
   * 모든 리포트 삭제
   */
  async deleteAll() {
    await this._ensureDir();
    
    const files = await fs.readdir(REPORTS_DIR);
    const jsonFiles = files.filter(f => f.endsWith('.json'));
    
    await Promise.all(
      jsonFiles.map(file => fs.unlink(path.join(REPORTS_DIR, file)))
    );
    
    console.log(`🗑️ 모든 리포트 삭제: ${jsonFiles.length}개`);
    
    return { success: true, deletedCount: jsonFiles.length };
  }
}

module.exports = new ReportService();