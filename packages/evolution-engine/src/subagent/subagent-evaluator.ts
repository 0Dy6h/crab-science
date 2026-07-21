import type Database from 'better-sqlite3';
import type { SubagentMetrics, SubagentExecutionRecord } from '@crab-science/shared';
import type { CrabDatabase } from '@crab-science/storage';

/**
 * Subagent 效果评估器
 *
 * 从 SQLite 查询 subagent_executions，计算指标。
 */
export class SubagentEvaluator {
  private db: Database.Database;

  constructor(database: CrabDatabase) {
    this.db = database.getDatabase();
  }

  /**
   * 评估指定 Subagent
   * @param subagentName - Subagent 名称
   * @returns SubagentMetrics
   */
  evaluate(subagentName: string): SubagentMetrics {
    const stmt = this.db.prepare(`
      SELECT * FROM subagent_executions
      WHERE subagentName = ?
      ORDER BY timestamp DESC
    `);

    const rows = stmt.all(subagentName) as SubagentExecutionRow[];

    if (rows.length === 0) {
      return {
        subagentName,
        delegationCount: 0,
        successRate: 0,
        avgDuration: 0,
        delegationAccuracy: 0,
        lastUsed: '',
      };
    }

    const successCount = rows.filter((r) => r.outcome === 'success').length;
    const successRate = successCount / rows.length;

    const avgDuration = Math.round(
      rows.reduce((sum, r) => sum + r.duration, 0) / rows.length,
    );

    // 委派准确率：简化为成功率（Phase 4 可引入更精确的 LLM 判断）
    const delegationAccuracy = successRate;

    const lastUsed = rows[0]?.timestamp ?? '';

    return {
      subagentName,
      delegationCount: rows.length,
      successRate,
      avgDuration,
      delegationAccuracy,
      lastUsed,
    };
  }

  /**
   * 检查是否需要优化
   * @param metrics - Subagent 指标
   * @returns 是否需要优化及原因
   */
  needsOptimization(metrics: SubagentMetrics): {
    needed: boolean;
    reasons: string[];
  } {
    const reasons: string[] = [];

    // 委派准确率 < 80%
    if (
      metrics.delegationCount >= 3 &&
      metrics.delegationAccuracy < 0.8
    ) {
      reasons.push(
        `delegation_accuracy_low: 委派准确率 ${(metrics.delegationAccuracy * 100).toFixed(1)}% < 80%`,
      );
    }

    // 完成率 < 70%
    if (
      metrics.delegationCount >= 3 &&
      metrics.successRate < 0.7
    ) {
      reasons.push(
        `success_rate_low: 成功率 ${(metrics.successRate * 100).toFixed(1)}% < 70%`,
      );
    }

    return {
      needed: reasons.length > 0,
      reasons,
    };
  }

  /**
   * 记录 Subagent 执行
   * @param record - 执行记录
   */
  recordExecution(record: Omit<SubagentExecutionRecord, 'id'>): void {
    const stmt = this.db.prepare(`
      INSERT INTO subagent_executions
        (id, subagentName, timestamp, task, sessionId, branchLeafId, duration, outcome, summary)
      VALUES
        (@id, @subagentName, @timestamp, @task, @sessionId, @branchLeafId, @duration, @outcome, @summary)
    `);

    const id = `subexec_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    stmt.run({
      id,
      subagentName: record.subagentName,
      timestamp: record.timestamp,
      task: record.task,
      sessionId: record.sessionId,
      branchLeafId: record.branchLeafId,
      duration: record.duration,
      outcome: record.outcome,
      summary: record.summary,
    });
  }

  /**
   * 获取所有 Subagent 名称
   */
  getAllSubagentNames(): string[] {
    const stmt = this.db.prepare(
      'SELECT DISTINCT subagentName FROM subagent_executions',
    );
    const rows = stmt.all() as { subagentName: string }[];
    return rows.map((r) => r.subagentName);
  }
}

/** subagent_executions 表行类型 */
interface SubagentExecutionRow {
  id: string;
  subagentName: string;
  timestamp: string;
  task: string;
  sessionId: string;
  branchLeafId: string;
  duration: number;
  outcome: string;
  summary: string;
}
