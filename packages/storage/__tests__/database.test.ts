import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CrabDatabase } from '../src/database.js';
import { isSqliteAvailable } from './helpers.js';

describe.skipIf(!isSqliteAvailable())('CrabDatabase', () => {
  let db: CrabDatabase;
  let testDir: string;
  let originalHome: string | undefined;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crab-db-'));
    originalHome = process.env.HOME;
    process.env.HOME = testDir;
    process.chdir(testDir);
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
    process.chdir(originalCwd);
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
      expect(tableNames).toContain('migrations');
      expect(tableNames).toContain('changelog');
    });

    it('WAL 模式应已启用', () => {
      const database = db.getDatabase();
      const result = database.pragma('journal_mode') as { journal_mode: string }[];
      expect(result[0]?.journal_mode).toBe('wal');
    });

    it('应将 Phase 2 executions.jsonl 迁移到 SQLite 并保留 migrated 备份', () => {
      db.close();

      const skillDir = path.join(
        testDir,
        '.crab-science',
        'skills',
        'literature-search',
      );
      fs.mkdirSync(skillDir, { recursive: true });

      const jsonlPath = path.join(skillDir, 'executions.jsonl');
      const firstRecord = {
        id: 'exec_legacy_1',
        skillName: 'literature-search',
        timestamp: '2026-07-22T01:00:00.000Z',
        task: 'Search CRISPR safety literature',
        steps: ['search', 'dedupe'],
        durationMs: 1200,
        status: 'success',
        tokenUsage: { inputTokens: 100, outputTokens: 25 },
      };
      const secondRecord = {
        id: 'exec_legacy_2',
        skillName: 'literature-search',
        timestamp: '2026-07-22T02:00:00.000Z',
        task: 'Retry Semantic Scholar request',
        steps: ['retry'],
        durationMs: 800,
        status: 'partial',
        adopted: true,
        rating: 4,
        skillVersion: 2,
        sessionId: 'sess_legacy',
      };

      fs.writeFileSync(
        jsonlPath,
        [
          JSON.stringify(firstRecord),
          '{ broken json',
          JSON.stringify(secondRecord),
        ].join('\n'),
        'utf-8',
      );

      db = new CrabDatabase(path.join(testDir, '.crab-science', 'migration.db'));
      db.initialize();

      const rows = db.getDatabase()
        .prepare(
          'SELECT * FROM skill_executions WHERE skillName = ? ORDER BY timestamp ASC',
        )
        .all('literature-search') as Array<{
          id: string;
          task: string;
          steps: string;
          durationMs: number;
          status: string;
          tokenUsage: string | null;
          adopted: number;
          rating: number;
          skillVersion: number;
          sessionId: string | null;
        }>;

      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({
        id: 'exec_legacy_1',
        task: 'Search CRISPR safety literature',
        durationMs: 1200,
        status: 'success',
        adopted: 0,
        rating: 0,
        skillVersion: 1,
        sessionId: null,
      });
      expect(JSON.parse(rows[0]!.steps)).toEqual(['search', 'dedupe']);
      expect(JSON.parse(rows[0]!.tokenUsage!)).toEqual({
        inputTokens: 100,
        outputTokens: 25,
      });
      expect(rows[1]).toMatchObject({
        id: 'exec_legacy_2',
        task: 'Retry Semantic Scholar request',
        durationMs: 800,
        status: 'partial',
        adopted: 1,
        rating: 4,
        skillVersion: 2,
        sessionId: 'sess_legacy',
      });
      expect(JSON.parse(rows[1]!.steps)).toEqual(['retry']);
      expect(fs.existsSync(jsonlPath)).toBe(false);
      expect(fs.existsSync(`${jsonlPath}.migrated`)).toBe(true);
    });

    it('迁移插入失败时应保留 executions.jsonl 且不产生 migrated 备份', () => {
      db.close();

      const skillDir = path.join(
        testDir,
        '.crab-science',
        'skills',
        'broken-skill',
      );
      fs.mkdirSync(skillDir, { recursive: true });

      const jsonlPath = path.join(skillDir, 'executions.jsonl');
      fs.writeFileSync(
        jsonlPath,
        [
          JSON.stringify({
            id: 'exec_should_rollback_1',
            skillName: 'broken-skill',
            timestamp: '2026-07-22T03:00:00.000Z',
            task: 'Valid row before failing row',
            steps: ['prepare'],
            durationMs: 300,
            status: 'success',
          }),
          JSON.stringify({
            id: 'exec_should_fail_2',
            skillName: 'broken-skill',
            timestamp: '2026-07-22T03:01:00.000Z',
            task: 'Invalid row with unbindable duration',
            steps: ['fail'],
            durationMs: { bad: true },
            status: 'failed',
          }),
        ].join('\n'),
        'utf-8',
      );

      const errorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);

      try {
        db = new CrabDatabase(path.join(testDir, '.crab-science', 'failed.db'));
        db.initialize();
      } finally {
        errorSpy.mockRestore();
      }

      const rows = db.getDatabase()
        .prepare(
          'SELECT id FROM skill_executions WHERE id IN (?, ?) ORDER BY id ASC',
        )
        .all('exec_should_rollback_1', 'exec_should_fail_2');

      expect(rows).toHaveLength(0);
      expect(fs.existsSync(jsonlPath)).toBe(true);
      expect(fs.existsSync(`${jsonlPath}.migrated`)).toBe(false);
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
