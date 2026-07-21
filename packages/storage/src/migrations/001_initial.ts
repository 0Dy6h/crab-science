import type Database from 'better-sqlite3';

/**
 * 初始 schema 迁移
 *
 * 创建以下表：
 * - migrations: 迁移记录
 * - experiences: 经验记录
 * - skill_executions: Skill 执行记录
 * - skill_metrics: Skill 指标聚合
 * - knowledge_edges: 知识图谱边
 * - subagent_executions: Subagent 执行记录
 * - changelog: 变更日志
 */

/** 迁移编号 */
export const MIGRATION_ID = '001_initial';

/**
 * 执行初始 schema 迁移
 * @param db - better-sqlite3 数据库实例
 */
export function up(db: Database.Database): void {
  // migrations 表（记录已执行的迁移）
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id TEXT PRIMARY KEY,
      executedAt TEXT NOT NULL
    );
  `);

  // experiences 表
  db.exec(`
    CREATE TABLE IF NOT EXISTS experiences (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      taskId TEXT NOT NULL,
      sessionId TEXT NOT NULL,
      task TEXT NOT NULL,
      skillUsed TEXT,
      subagentUsed TEXT,
      outcome TEXT NOT NULL,
      duration INTEGER NOT NULL,
      keyLearnings TEXT NOT NULL,
      tags TEXT NOT NULL,
      relatedExperiences TEXT NOT NULL
    );
  `);

  // skill_executions 表
  db.exec(`
    CREATE TABLE IF NOT EXISTS skill_executions (
      id TEXT PRIMARY KEY,
      skillName TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      task TEXT NOT NULL,
      steps TEXT NOT NULL,
      durationMs INTEGER NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      tokenUsage TEXT,
      adopted INTEGER,
      rating INTEGER,
      skillVersion INTEGER,
      sessionId TEXT
    );
  `);

  // skill_metrics 表（存储聚合指标和验证状态）
  db.exec(`
    CREATE TABLE IF NOT EXISTS skill_metrics (
      skillName TEXT PRIMARY KEY,
      successRate REAL NOT NULL DEFAULT 0,
      avgDuration INTEGER NOT NULL DEFAULT 0,
      usageCount INTEGER NOT NULL DEFAULT 0,
      userSatisfaction REAL NOT NULL DEFAULT 0,
      lastUsed TEXT,
      trend TEXT NOT NULL DEFAULT 'stable',
      pendingValidation INTEGER NOT NULL DEFAULT 0,
      versionCreatedAt TEXT,
      currentVersion INTEGER NOT NULL DEFAULT 1
    );
  `);

  // knowledge_edges 表
  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_edges (
      id TEXT PRIMARY KEY,
      sourceId TEXT NOT NULL,
      targetId TEXT NOT NULL,
      type TEXT NOT NULL,
      weight REAL NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      UNIQUE(sourceId, targetId, type)
    );
  `);

  // subagent_executions 表
  db.exec(`
    CREATE TABLE IF NOT EXISTS subagent_executions (
      id TEXT PRIMARY KEY,
      subagentName TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      task TEXT NOT NULL,
      sessionId TEXT NOT NULL,
      branchLeafId TEXT NOT NULL,
      duration INTEGER NOT NULL,
      outcome TEXT NOT NULL,
      summary TEXT NOT NULL
    );
  `);

  // changelog 表
  db.exec(`
    CREATE TABLE IF NOT EXISTS changelog (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      target TEXT NOT NULL,
      version INTEGER NOT NULL,
      description TEXT NOT NULL,
      commitHash TEXT,
      timestamp TEXT NOT NULL
    );
  `);

  // 创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_skill_executions_name_time
      ON skill_executions(skillName, timestamp);
    CREATE INDEX IF NOT EXISTS idx_experiences_tags
      ON experiences(tags);
    CREATE INDEX IF NOT EXISTS idx_knowledge_edges_source
      ON knowledge_edges(sourceId);
    CREATE INDEX IF NOT EXISTS idx_knowledge_edges_target
      ON knowledge_edges(targetId);
    CREATE INDEX IF NOT EXISTS idx_subagent_executions_name
      ON subagent_executions(subagentName);
    CREATE INDEX IF NOT EXISTS idx_changelog_target
      ON changelog(target);
  `);
}
