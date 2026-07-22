import type Database from 'better-sqlite3';
import type {
  SkillExecutionRecord,
  SkillMetrics,
} from '@crab-science/shared';
import { generateId, nowISO } from '@crab-science/shared';
import type { CrabDatabase } from '../database.js';

/**
 * Skill 指标仓库
 *
 * 管理 skill_executions 表的 CRUD 和 skill_metrics 表的聚合查询。
 */
export class SkillMetricsRepository {
  private db: Database.Database;

  constructor(database: CrabDatabase) {
    this.db = database.getDatabase();
  }

  /**
   * 记录 Skill 执行
   * @param record - 执行记录（不含 id 和 timestamp，由本方法生成）
   * @returns 完整的 SkillExecutionRecord
   */
  insertExecution(
    record: Omit<SkillExecutionRecord, 'id' | 'timestamp'>,
  ): SkillExecutionRecord {
    const id = generateId('exec');
    const timestamp = nowISO();

    const fullRecord: SkillExecutionRecord = {
      ...record,
      id,
      timestamp,
    };

    const stmt = this.db.prepare(`
      INSERT INTO skill_executions
        (id, skillName, timestamp, task, steps, durationMs, status,
         error, tokenUsage, adopted, rating, skillVersion, sessionId)
      VALUES
        (@id, @skillName, @timestamp, @task, @steps, @durationMs, @status,
         @error, @tokenUsage, @adopted, @rating, @skillVersion, @sessionId)
    `);

    stmt.run({
      id,
      skillName: record.skillName,
      timestamp,
      task: record.task,
      steps: JSON.stringify(record.steps || []),
      durationMs: record.durationMs,
      status: record.status,
      error: record.error ?? null,
      tokenUsage: record.tokenUsage ? JSON.stringify(record.tokenUsage) : null,
      adopted: record.adopted ? 1 : 0,
      rating: record.rating ?? 0,
      skillVersion: record.skillVersion ?? 1,
      sessionId: record.sessionId ?? null,
    });

    return fullRecord;
  }

  /**
   * 查询执行历史
   * @param skillName - Skill 名称
   * @param options - 查询选项
   */
  queryExecutions(
    skillName: string,
    options?: {
      limit?: number;
      status?: string;
      sinceVersion?: number;
    },
  ): SkillExecutionRecord[] {
    let sql = 'SELECT * FROM skill_executions WHERE skillName = ?';
    const params: (string | number)[] = [skillName];

    if (options?.status) {
      sql += ' AND status = ?';
      params.push(options.status);
    }

    if (options?.sinceVersion !== undefined) {
      sql += ' AND skillVersion >= ?';
      params.push(options.sinceVersion);
    }

    sql += ' ORDER BY timestamp DESC, rowid DESC';

    if (options?.limit && options.limit > 0) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as SkillExecutionRow[];
    return rows.map((r) => this.deserializeExecution(r));
  }

  /**
   * 计算聚合指标
   * @param skillName - Skill 名称
   * @returns SkillMetrics 对象
   */
  getMetrics(skillName: string): SkillMetrics {
    const rows = this.queryExecutions(skillName, { limit: 1000 });

    if (rows.length === 0) {
      return {
        skillName,
        successRate: 0,
        avgDuration: 0,
        usageCount: 0,
        userSatisfaction: 0,
        lastUsed: '',
        trend: 'stable',
      };
    }

    const successCount = rows.filter((r) => r.status === 'success').length;
    const successRate = successCount / rows.length;

    const avgDuration = Math.round(
      rows.reduce((sum, r) => sum + r.durationMs, 0) / rows.length,
    );

    const ratedRows = rows.filter((r) => r.rating && r.rating > 0);
    const userSatisfaction =
      ratedRows.length > 0
        ? ratedRows.reduce((sum, r) => sum + (r.rating ?? 0), 0) / ratedRows.length
        : 0;

    const lastUsed = rows[0]?.timestamp ?? '';

    // 趋势计算：对比最近 10 次与之前 10 次的成功率
    const trend = this.calculateTrend(rows);

    return {
      skillName,
      successRate,
      avgDuration,
      usageCount: rows.length,
      userSatisfaction,
      lastUsed,
      trend,
    };
  }

  /**
   * 更新执行记录（adopted/rating）
   * @param id - 执行记录 ID
   * @param updates - 要更新的字段
   */
  updateExecution(
    id: string,
    updates: Partial<SkillExecutionRecord>,
  ): void {
    const fields: string[] = [];
    const values: (string | number | null)[] = [];

    if (updates.adopted !== undefined) {
      fields.push('adopted = ?');
      values.push(updates.adopted ? 1 : 0);
    }
    if (updates.rating !== undefined) {
      fields.push('rating = ?');
      values.push(updates.rating);
    }
    if (updates.skillVersion !== undefined) {
      fields.push('skillVersion = ?');
      values.push(updates.skillVersion);
    }
    if (updates.sessionId !== undefined) {
      fields.push('sessionId = ?');
      values.push(updates.sessionId);
    }

    if (fields.length === 0) return;

    values.push(id);
    const sql = `UPDATE skill_executions SET ${fields.join(', ')} WHERE id = ?`;
    this.db.prepare(sql).run(...values);
  }

  /**
   * 获取版本对比数据
   * @param skillName - Skill 名称
   * @param version1 - 旧版本号
   * @param version2 - 新版本号
   */
  getVersionComparison(
    skillName: string,
    version1: number,
    version2: number,
  ): { v1: SkillMetrics; v2: SkillMetrics } {
    const v1Rows = this.queryExecutions(skillName, {
      sinceVersion: version1,
      limit: 1000,
    }).filter((r) => r.skillVersion === version1);

    const v2Rows = this.queryExecutions(skillName, {
      sinceVersion: version2,
      limit: 1000,
    }).filter((r) => r.skillVersion === version2);

    return {
      v1: this.calculateMetricsFromRows(skillName, v1Rows),
      v2: this.calculateMetricsFromRows(skillName, v2Rows),
    };
  }

  /**
   * 获取/创建 skill_metrics 记录
   */
  getOrCreateSkillMetricRecord(skillName: string): {
    pendingValidation: boolean;
    versionCreatedAt: string | null;
    currentVersion: number;
  } {
    const stmt = this.db.prepare(
      'SELECT * FROM skill_metrics WHERE skillName = ?',
    );
    const row = stmt.get(skillName) as SkillMetricRow | undefined;

    if (row) {
      return {
        pendingValidation: row.pendingValidation === 1,
        versionCreatedAt: row.versionCreatedAt,
        currentVersion: row.currentVersion,
      };
    }

    // 创建默认记录
    const insertStmt = this.db.prepare(`
      INSERT OR IGNORE INTO skill_metrics
        (skillName, currentVersion, pendingValidation, versionCreatedAt)
      VALUES (?, 1, 0, NULL)
    `);
    insertStmt.run(skillName);

    return {
      pendingValidation: false,
      versionCreatedAt: null,
      currentVersion: 1,
    };
  }

  /**
   * 更新 skill_metrics 表
   */
  updateSkillMetric(
    skillName: string,
    updates: {
      pendingValidation?: boolean;
      versionCreatedAt?: string | null;
      currentVersion?: number;
    },
  ): void {
    // 确保记录存在
    this.getOrCreateSkillMetricRecord(skillName);

    const fields: string[] = [];
    const values: (string | number | null)[] = [];

    if (updates.pendingValidation !== undefined) {
      fields.push('pendingValidation = ?');
      values.push(updates.pendingValidation ? 1 : 0);
    }
    if (updates.versionCreatedAt !== undefined) {
      fields.push('versionCreatedAt = ?');
      values.push(updates.versionCreatedAt);
    }
    if (updates.currentVersion !== undefined) {
      fields.push('currentVersion = ?');
      values.push(updates.currentVersion);
    }

    if (fields.length === 0) return;

    values.push(skillName);
    this.db.prepare(
      `UPDATE skill_metrics SET ${fields.join(', ')} WHERE skillName = ?`,
    ).run(...values);
  }

  /**
   * 获取所有 Skill 名称（从执行记录中）
   */
  getAllSkillNames(): string[] {
    const stmt = this.db.prepare(
      'SELECT DISTINCT skillName FROM skill_executions',
    );
    const rows = stmt.all() as { skillName: string }[];
    return rows.map((r) => r.skillName);
  }

  /**
   * 获取最近的任务记录（用于模式检测）
   */
  getRecentTaskRecords(limit = 100): Array<{
    taskId: string;
    task: string;
    toolsUsed: string[];
    skillUsed: string | null;
    outcome: string;
    timestamp: string;
  }> {
    const stmt = this.db.prepare(`
      SELECT * FROM skill_executions
      ORDER BY timestamp DESC, rowid DESC
      LIMIT ?
    `);

    const rows = stmt.all(limit) as SkillExecutionRow[];
    return rows.map((r) => ({
      taskId: r.id,
      task: r.task,
      toolsUsed: [], // skill_executions 不存储 toolsUsed，留空
      skillUsed: r.skillName,
      outcome: r.status,
      timestamp: r.timestamp,
    }));
  }

  // ============================================================
  // 私有方法
  // ============================================================

  /**
   * 计算趋势
   * 对比最近 10 次与之前 10 次的成功率
   */
  private calculateTrend(rows: SkillExecutionRecord[]): SkillMetrics['trend'] {
    if (rows.length < 4) return 'stable';

    const recent = rows.slice(0, Math.min(10, Math.floor(rows.length / 2)));
    const previous = rows.slice(
      Math.min(10, Math.floor(rows.length / 2)),
      Math.min(20, rows.length),
    );

    if (previous.length === 0) return 'stable';

    const recentSuccessRate =
      recent.filter((r) => r.status === 'success').length / recent.length;
    const previousSuccessRate =
      previous.filter((r) => r.status === 'success').length / previous.length;

    if (recentSuccessRate > previousSuccessRate + 0.1) return 'improving';
    if (recentSuccessRate < previousSuccessRate - 0.1) return 'declining';
    return 'stable';
  }

  /**
   * 从行数组计算指标
   */
  private calculateMetricsFromRows(
    skillName: string,
    rows: SkillExecutionRecord[],
  ): SkillMetrics {
    if (rows.length === 0) {
      return {
        skillName,
        successRate: 0,
        avgDuration: 0,
        usageCount: 0,
        userSatisfaction: 0,
        lastUsed: '',
        trend: 'stable',
      };
    }

    const successCount = rows.filter((r) => r.status === 'success').length;
    const ratedRows = rows.filter((r) => r.rating && r.rating > 0);

    return {
      skillName,
      successRate: successCount / rows.length,
      avgDuration: Math.round(
        rows.reduce((sum, r) => sum + r.durationMs, 0) / rows.length,
      ),
      usageCount: rows.length,
      userSatisfaction:
        ratedRows.length > 0
          ? ratedRows.reduce((sum, r) => sum + (r.rating ?? 0), 0) /
            ratedRows.length
          : 0,
      lastUsed: rows[0]?.timestamp ?? '',
      trend: this.calculateTrend(rows),
    };
  }

  /**
   * 反序列化执行记录
   */
  private deserializeExecution(row: SkillExecutionRow): SkillExecutionRecord {
    let tokenUsage: SkillExecutionRecord['tokenUsage'] | undefined;
    if (row.tokenUsage) {
      try {
        tokenUsage = JSON.parse(row.tokenUsage);
      } catch {
        tokenUsage = undefined;
      }
    }

    let steps: string[] = [];
    try {
      const parsed = JSON.parse(row.steps);
      if (Array.isArray(parsed)) steps = parsed;
    } catch {
      steps = [];
    }

    return {
      id: row.id,
      skillName: row.skillName,
      timestamp: row.timestamp,
      task: row.task,
      steps,
      durationMs: row.durationMs,
      status: row.status as SkillExecutionRecord['status'],
      error: row.error ?? undefined,
      tokenUsage,
      adopted: row.adopted !== null ? row.adopted === 1 : undefined,
      rating: row.rating ?? undefined,
      skillVersion: row.skillVersion ?? undefined,
      sessionId: row.sessionId ?? undefined,
    };
  }
}

/** skill_executions 表行类型 */
interface SkillExecutionRow {
  id: string;
  skillName: string;
  timestamp: string;
  task: string;
  steps: string;
  durationMs: number;
  status: string;
  error: string | null;
  tokenUsage: string | null;
  adopted: number | null;
  rating: number | null;
  skillVersion: number | null;
  sessionId: string | null;
}

/** skill_metrics 表行类型 */
interface SkillMetricRow {
  skillName: string;
  pendingValidation: number;
  versionCreatedAt: string | null;
  currentVersion: number;
}
