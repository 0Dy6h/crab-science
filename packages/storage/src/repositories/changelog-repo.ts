import type Database from 'better-sqlite3';
import type { ChangeEntry } from '@crab-science/shared';
import { generateId } from '@crab-science/shared';
import type { CrabDatabase } from '../database.js';

/**
 * Changelog 仓库
 *
 * 管理进化变更日志的持久化存储。
 * 解决 P-02：将进程内数组替换为 SQLite 持久化，使 /changelog 和 /versions 重启后仍可读。
 */
export class ChangelogRepository {
  private db: Database.Database;

  constructor(database: CrabDatabase) {
    this.db = database.getDatabase();
  }

  /**
   * 记录变更日志（持久化到 SQLite）
   * @param entry - 变更条目（不含 id，由本方法生成）
   */
  record(entry: ChangeEntry): ChangeEntry {
    const id = generateId('cl');

    this.db
      .prepare(
        `INSERT INTO changelog (id, type, target, version, description, commitHash, timestamp)
         VALUES (@id, @type, @target, @version, @description, @commitHash, @timestamp)`,
      )
      .run({
        id,
        type: entry.type,
        target: entry.target,
        version: entry.version,
        description: entry.description,
        commitHash: entry.commitHash ?? null,
        timestamp: entry.timestamp,
      });

    return entry;
  }

  /**
   * 按目标（Skill / Subagent 名称）查询变更日志
   * @param target - 目标名称
   * @param limit - 返回条数上限（默认 100）
   */
  getByTarget(target: string, limit = 100): ChangeEntry[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM changelog WHERE target = ? ORDER BY timestamp DESC, rowid DESC LIMIT ?`,
      )
      .all(target, limit) as ChangelogRow[];

    return rows.map((r) => this.deserialize(r));
  }

  /**
   * 获取全部变更日志（按时间倒序）
   * @param limit - 返回条数上限（默认 200）
   */
  getAll(limit = 200): ChangeEntry[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM changelog ORDER BY timestamp DESC, rowid DESC LIMIT ?`,
      )
      .all(limit) as ChangelogRow[];

    return rows.map((r) => this.deserialize(r));
  }

  /**
   * 获取变更日志总数
   */
  count(): number {
    const row = this.db.prepare('SELECT COUNT(*) as n FROM changelog').get() as {
      n: number;
    };
    return row.n;
  }

  /**
   * 反序列化数据库行为 ChangeEntry
   */
  private deserialize(row: ChangelogRow): ChangeEntry {
    return {
      type: row.type as ChangeEntry['type'],
      target: row.target,
      version: row.version,
      description: row.description,
      commitHash: row.commitHash ?? undefined,
      timestamp: row.timestamp,
    };
  }
}

/** 数据库行类型 */
interface ChangelogRow {
  id: string;
  type: string;
  target: string;
  version: number;
  description: string;
  commitHash: string | null;
  timestamp: string;
}
