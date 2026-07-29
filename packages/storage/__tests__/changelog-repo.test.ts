import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CrabDatabase } from '../src/database.js';
import { ChangelogRepository } from '../src/repositories/changelog-repo.js';
import { isSqliteAvailable } from './helpers.js';
import type { ChangeEntry } from '@crab-science/shared';
import { nowISO } from '@crab-science/shared';

describe.skipIf(!isSqliteAvailable())('ChangelogRepository', () => {
  let db: CrabDatabase;
  let repo: ChangelogRepository;
  let testDir: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crab-cl-'));
    originalHome = process.env.HOME;
    process.env.HOME = testDir;
    db = new CrabDatabase();
    db.initialize();
    repo = new ChangelogRepository(db);
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

  /** 创建测试变更条目 */
  function makeEntry(
    overrides: Partial<ChangeEntry> = {},
  ): ChangeEntry {
    return {
      type: 'skill_optimize',
      target: 'data-analysis',
      version: 2,
      description: '增加数据分布检查步骤',
      commitHash: 'abc1234',
      timestamp: nowISO(),
      ...overrides,
    };
  }

  it('record() 写入并返回 ChangeEntry', () => {
    const entry = makeEntry();
    const result = repo.record(entry);

    expect(result.type).toBe('skill_optimize');
    expect(result.target).toBe('data-analysis');
    expect(result.version).toBe(2);
    expect(result.description).toBe('增加数据分布检查步骤');
    expect(result.commitHash).toBe('abc1234');
    expect(result.timestamp).toBe(entry.timestamp);
  });

  it('getAll() 返回所有条目（按时间倒序）', () => {
    const e1 = makeEntry({ description: '第一次优化', timestamp: '2026-07-01T10:00:00Z' });
    const e2 = makeEntry({ description: '第二次优化', timestamp: '2026-07-02T10:00:00Z' });
    const e3 = makeEntry({ description: '第三次优化', timestamp: '2026-07-03T10:00:00Z' });

    repo.record(e1);
    repo.record(e2);
    repo.record(e3);

    const all = repo.getAll();
    expect(all).toHaveLength(3);
    // 倒序：最新的在前
    expect(all[0].description).toBe('第三次优化');
    expect(all[2].description).toBe('第一次优化');
  });

  it('getByTarget() 按目标过滤', () => {
    repo.record(makeEntry({ target: 'data-analysis', description: '优化1' }));
    repo.record(makeEntry({ target: 'literature-search', description: '优化2' }));
    repo.record(makeEntry({ target: 'data-analysis', description: '优化3' }));

    const daEntries = repo.getByTarget('data-analysis');
    expect(daEntries).toHaveLength(2);
    expect(daEntries.every((e) => e.target === 'data-analysis')).toBe(true);

    const lsEntries = repo.getByTarget('literature-search');
    expect(lsEntries).toHaveLength(1);
    expect(lsEntries[0].description).toBe('优化2');
  });

  it('count() 返回正确总数', () => {
    expect(repo.count()).toBe(0);

    repo.record(makeEntry());
    repo.record(makeEntry({ type: 'skill_rollback' }));
    repo.record(makeEntry({ type: 'subagent_create' }));

    expect(repo.count()).toBe(3);
  });

  it('commitHash 为 undefined 时正确存储为 null 并反序列化', () => {
    const entry = makeEntry({ commitHash: undefined });
    repo.record(entry);

    const all = repo.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].commitHash).toBeUndefined();
  });

  it('支持所有变更类型', () => {
    const types: ChangeEntry['type'][] = [
      'skill_optimize',
      'skill_rollback',
      'skill_validate',
      'subagent_create',
      'subagent_optimize',
    ];

    for (const type of types) {
      repo.record(makeEntry({ type }));
    }

    const all = repo.getAll();
    expect(all).toHaveLength(5);
    const resultTypes = all.map((e) => e.type).sort();
    expect(resultTypes).toEqual([...types].sort());
  });

  // ============================================================
  // P-02 核心验收：持久化 — 重启后仍可读
  // ============================================================
  it('P-02: 进程"重启"后 changelog 仍可读（持久化验证）', () => {
    // 写入 3 条变更
    repo.record(makeEntry({ description: '优化1', version: 2 }));
    repo.record(makeEntry({ description: '优化2', version: 3 }));
    repo.record(makeEntry({ description: '回滚', version: 2, type: 'skill_rollback' }));

    // 验证写入成功
    expect(repo.count()).toBe(3);

    // 模拟进程重启：关闭 DB，重新打开同一文件
    const dbPath = db.getPath();
    db.close();

    const db2 = new CrabDatabase(dbPath);
    db2.initialize();
    const repo2 = new ChangelogRepository(db2);

    // 验证重启后仍能读到全部 3 条
    const all = repo2.getAll();
    expect(all).toHaveLength(3);

    // 验证内容正确（倒序）
    expect(all[0].type).toBe('skill_rollback');
    expect(all[0].description).toBe('回滚');
    expect(all[1].description).toBe('优化2');
    expect(all[1].version).toBe(3);
    expect(all[2].description).toBe('优化1');
    expect(all[2].version).toBe(2);

    // getByTarget 也应正常工作
    const byTarget = repo2.getByTarget('data-analysis');
    expect(byTarget).toHaveLength(3);

    db2.close();
  });
});
