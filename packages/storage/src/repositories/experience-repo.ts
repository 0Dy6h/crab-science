import type Database from 'better-sqlite3';
import type { Experience } from '@crab-science/shared';
import { generateId, nowISO } from '@crab-science/shared';
import type { CrabDatabase } from '../database.js';

/**
 * Experience 仓库
 *
 * 管理经验记录的 CRUD 操作。
 * JSON 数组字段（keyLearnings, tags, relatedExperiences）序列化为 JSON 字符串存储。
 */
export class ExperienceRepository {
  private db: Database.Database;

  constructor(database: CrabDatabase) {
    this.db = database.getDatabase();
  }

  /**
   * 插入经验
   * @param experience - 经验数据（不含 id，由本方法生成）
   * @returns 完整的 Experience 对象（含 id）
   */
  insert(experience: Omit<Experience, 'id'>): Experience {
    const id = generateId('exp');
    const fullExperience: Experience = { ...experience, id };

    const stmt = this.db.prepare(`
      INSERT INTO experiences
        (id, timestamp, taskId, sessionId, task, skillUsed, subagentUsed,
         outcome, duration, keyLearnings, tags, relatedExperiences)
      VALUES
        (@id, @timestamp, @taskId, @sessionId, @task, @skillUsed, @subagentUsed,
         @outcome, @duration, @keyLearnings, @tags, @relatedExperiences)
    `);

    stmt.run({
      id,
      timestamp: experience.timestamp,
      taskId: experience.taskId,
      sessionId: experience.sessionId,
      task: experience.task,
      skillUsed: experience.skillUsed,
      subagentUsed: experience.subagentUsed,
      outcome: experience.outcome,
      duration: experience.duration,
      keyLearnings: JSON.stringify(experience.keyLearnings),
      tags: JSON.stringify(experience.tags),
      relatedExperiences: JSON.stringify(experience.relatedExperiences),
    });

    return fullExperience;
  }

  /**
   * 按 ID 查询
   */
  findById(id: string): Experience | null {
    const stmt = this.db.prepare('SELECT * FROM experiences WHERE id = ?');
    const row = stmt.get(id) as ExperienceRow | undefined;
    return row ? this.deserialize(row) : null;
  }

  /**
   * 按 tag 检索
   * 使用 JSON 查询匹配 tags 数组
   */
  findByTags(tags: string[], limit = 20): Experience[] {
    if (tags.length === 0) return [];

    const stmt = this.db.prepare(`
      SELECT * FROM experiences
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    const rows = stmt.all(limit) as ExperienceRow[];
    return rows
      .map((r) => this.deserialize(r))
      .filter((exp) => {
        const expTags = exp.tags;
        return tags.some((t) => expTags.includes(t));
      });
  }

  /**
   * 按 Skill 检索
   */
  findBySkill(skillName: string, limit = 20): Experience[] {
    const stmt = this.db.prepare(`
      SELECT * FROM experiences
      WHERE skillUsed = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    const rows = stmt.all(skillName, limit) as ExperienceRow[];
    return rows.map((r) => this.deserialize(r));
  }

  /**
   * 按任务描述关键词检索
   * 使用 LIKE 查询 task 字段
   */
  findByTaskKeywords(keywords: string[], limit = 20): Experience[] {
    if (keywords.length === 0) return [];

    const conditions = keywords.map(() => 'task LIKE ?').join(' OR ');
    const params = keywords.map((k) => `%${k}%`);
    params.push(String(limit));

    const stmt = this.db.prepare(`
      SELECT * FROM experiences
      WHERE ${conditions}
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    const rows = stmt.all(...params) as ExperienceRow[];
    return rows.map((r) => this.deserialize(r));
  }

  /**
   * 更新关联经验
   */
  updateRelatedExperiences(id: string, relatedIds: string[]): void {
    const stmt = this.db.prepare(
      'UPDATE experiences SET relatedExperiences = ? WHERE id = ?',
    );
    stmt.run(JSON.stringify(relatedIds), id);
  }

  /**
   * 获取最近 N 条经验
   */
  getRecent(limit: number): Experience[] {
    const stmt = this.db.prepare(`
      SELECT * FROM experiences
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    const rows = stmt.all(limit) as ExperienceRow[];
    return rows.map((r) => this.deserialize(r));
  }

  /**
   * 获取所有经验（用于知识图谱建边时遍历）
   */
  getAll(): Experience[] {
    const stmt = this.db.prepare('SELECT * FROM experiences');
    const rows = stmt.all() as ExperienceRow[];
    return rows.map((r) => this.deserialize(r));
  }

  /**
   * 反序列化数据库行为 Experience 对象
   */
  private deserialize(row: ExperienceRow): Experience {
    return {
      id: row.id,
      timestamp: row.timestamp,
      taskId: row.taskId,
      sessionId: row.sessionId,
      task: row.task,
      skillUsed: row.skillUsed ?? null,
      subagentUsed: row.subagentUsed ?? null,
      outcome: row.outcome as Experience['outcome'],
      duration: row.duration,
      keyLearnings: this.parseJsonArray(row.keyLearnings),
      tags: this.parseJsonArray(row.tags),
      relatedExperiences: this.parseJsonArray(row.relatedExperiences),
    };
  }

  /**
   * 安全解析 JSON 数组
   */
  private parseJsonArray(json: string): string[] {
    try {
      const arr = JSON.parse(json);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }
}

/** 数据库行类型 */
interface ExperienceRow {
  id: string;
  timestamp: string;
  taskId: string;
  sessionId: string;
  task: string;
  skillUsed: string | null;
  subagentUsed: string | null;
  outcome: string;
  duration: number;
  keyLearnings: string;
  tags: string;
  relatedExperiences: string;
}
