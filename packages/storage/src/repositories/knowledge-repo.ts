import type Database from 'better-sqlite3';
import type { KnowledgeEdge, Experience } from '@crab-science/shared';
import { generateId, nowISO } from '@crab-science/shared';
import type { CrabDatabase } from '../database.js';
import { ExperienceRepository } from './experience-repo.js';

/**
 * 知识图谱仓库
 *
 * 管理知识图谱边的 CRUD 操作。
 */
export class KnowledgeRepository {
  private db: Database.Database;

  constructor(database: CrabDatabase) {
    this.db = database.getDatabase();
  }

  /**
   * 添加边
   * @param edge - 边数据（不含 id 和 createdAt）
   * @returns 完整的 KnowledgeEdge 对象
   */
  addEdge(edge: Omit<KnowledgeEdge, 'id' | 'createdAt'>): KnowledgeEdge {
    const id = generateId('edge');
    const createdAt = nowISO();

    const fullEdge: KnowledgeEdge = { ...edge, id, createdAt };

    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO knowledge_edges
        (id, sourceId, targetId, type, weight, createdAt)
      VALUES
        (@id, @sourceId, @targetId, @type, @weight, @createdAt)
    `);

    stmt.run({
      id,
      sourceId: edge.sourceId,
      targetId: edge.targetId,
      type: edge.type,
      weight: edge.weight,
      createdAt,
    });

    return fullEdge;
  }

  /**
   * 查询经验的所有关联边
   * 查询 sourceId 或 targetId 匹配的边
   */
  findEdges(experienceId: string): KnowledgeEdge[] {
    const stmt = this.db.prepare(`
      SELECT * FROM knowledge_edges
      WHERE sourceId = ? OR targetId = ?
      ORDER BY weight DESC, createdAt DESC
    `);

    const rows = stmt.all(experienceId, experienceId) as KnowledgeEdgeRow[];
    return rows.map((r) => this.deserializeEdge(r));
  }

  /**
   * 按权重检索相关经验
   * 通过边查询关联的经验，按权重排序
   */
  findRelated(experienceId: string, limit = 10): Experience[] {
    const stmt = this.db.prepare(`
      SELECT e.* FROM experiences e
      INNER JOIN knowledge_edges k ON (
        (k.sourceId = ? AND k.targetId = e.id) OR
        (k.targetId = ? AND k.sourceId = e.id)
      )
      WHERE e.id != ?
      ORDER BY k.weight DESC, k.createdAt DESC
      LIMIT ?
    `);

    const rows = stmt.all(
      experienceId,
      experienceId,
      experienceId,
      limit,
    ) as ExperienceRow[];

    const expRepo = new ExperienceRepository(
      // 复用同一个 db 实例
      // 我们需要一个 CrabDatabase 包装器，但这里直接使用内部 db
      // 通过创建一个临时包装器来复用
      { getDatabase: () => this.db } as unknown as CrabDatabase,
    );

    return rows.map((r) =>
      expRepo.findById(r.id),
    ).filter((e): e is Experience => e !== null);
  }

  /**
   * 检查边是否已存在
   */
  edgeExists(sourceId: string, targetId: string, type: string): boolean {
    const stmt = this.db.prepare(`
      SELECT 1 FROM knowledge_edges
      WHERE sourceId = ? AND targetId = ? AND type = ?
      LIMIT 1
    `);

    const result = stmt.get(sourceId, targetId, type);
    return result !== undefined;
  }

  /**
   * 获取所有边（用于测试）
   */
  getAllEdges(): KnowledgeEdge[] {
    const stmt = this.db.prepare('SELECT * FROM knowledge_edges');
    const rows = stmt.all() as KnowledgeEdgeRow[];
    return rows.map((r) => this.deserializeEdge(r));
  }

  /**
   * 反序列化边
   */
  private deserializeEdge(row: KnowledgeEdgeRow): KnowledgeEdge {
    return {
      id: row.id,
      sourceId: row.sourceId,
      targetId: row.targetId,
      type: row.type as KnowledgeEdge['type'],
      weight: row.weight,
      createdAt: row.createdAt,
    };
  }
}

/** 知识图谱边行类型 */
interface KnowledgeEdgeRow {
  id: string;
  sourceId: string;
  targetId: string;
  type: string;
  weight: number;
  createdAt: string;
}

/** experiences 表行类型（用于 findRelated） */
interface ExperienceRow {
  id: string;
}
