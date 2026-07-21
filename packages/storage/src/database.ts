import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { SQLITE_DB_PATH, expandTilde } from '@crab-science/shared';
import { runMigrations } from './migrations/runner.js';

/**
 * SQLite 数据库管理器
 *
 * 职责：
 * 1. 管理 better-sqlite3 连接
 * 2. 开启 WAL 模式
 * 3. 执行数据库迁移
 * 4. 提供 getDatabase() 供 Repository 使用
 */
export class CrabDatabase {
  private db: Database.Database | null = null;
  private dbPath: string;

  /**
   * @param dbPath - 数据库文件路径（可选，默认 ~/.crab-science/crab-science.db）
   */
  constructor(dbPath?: string) {
    this.dbPath = expandTilde(dbPath ?? SQLITE_DB_PATH);
  }

  /**
   * 初始化数据库
   * - 确保目录存在
   * - 打开数据库连接
   * - 开启 WAL 模式
   * - 执行迁移
   */
  initialize(): void {
    // 确保目录存在
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // 打开数据库
    this.db = new Database(this.dbPath);

    // 开启 WAL 模式
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    // 执行迁移
    runMigrations(this.db);
  }

  /**
   * 获取底层 better-sqlite3 实例
   * @throws 如果数据库未初始化
   */
  getDatabase(): Database.Database {
    if (!this.db) {
      throw new Error('数据库未初始化，请先调用 initialize()');
    }
    return this.db;
  }

  /**
   * 关闭数据库连接
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /**
   * 检查数据库是否已初始化
   */
  isInitialized(): boolean {
    return this.db !== null;
  }

  /**
   * 获取数据库文件路径
   */
  getPath(): string {
    return this.dbPath;
  }
}
