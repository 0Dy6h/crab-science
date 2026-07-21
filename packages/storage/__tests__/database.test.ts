import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CrabDatabase } from '../src/database.js';
import { isSqliteAvailable } from './helpers.js';

describe.skipIf(!isSqliteAvailable())('CrabDatabase', () => {
  let db: CrabDatabase;
  let testDir: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crab-db-'));
    originalHome = process.env.HOME;
    process.env.HOME = testDir;
    db = new CrabDatabase();
    db.initialize();
  });

  afterEach(() => {
    db.close();
    if (originalHome !== undefined) {
      process.env.HOME = originalHome;
    } else {
      delete process.env.HOME;
    }
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('initialize', () => {
    it('应创建 SQLite 数据库文件', () => {
      const dbPath = path.join(testDir, '.crab-science', 'crab-science.db');
      expect(fs.existsSync(dbPath)).toBe(true);
    });

    it('应创建所有必要的表', () => {
      const database = db.getDatabase();
      const tables = database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
        )
        .all() as { name: string }[];

      const tableNames = tables.map((t) => t.name);
      expect(tableNames).toContain('skill_executions');
      expect(tableNames).toContain('skill_metrics');
      expect(tableNames).toContain('experiences');
      expect(tableNames).toContain('knowledge_edges');
      expect(tableNames).toContain('subagent_executions');
      expect(tableNames).toContain('migration_log');
    });

    it('WAL 模式应已启用', () => {
      const database = db.getDatabase();
      const result = database.pragma('journal_mode') as { journal_mode: string }[];
      expect(result[0]?.journal_mode).toBe('wal');
    });
  });

  describe('getDatabase', () => {
    it('应返回 better-sqlite3 Database 实例', () => {
      const database = db.getDatabase();
      expect(database).toBeDefined();
      expect(typeof database.prepare).toBe('function');
    });
  });

  describe('close', () => {
    it('应能正常关闭数据库', () => {
      db.close();
      // 关闭后不应崩溃
      expect(true).toBe(true);
    });
  });
});
