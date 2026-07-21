import type Database from 'better-sqlite3';
import { nowISO } from '@crab-science/shared';
import * as initialMigration from './001_initial.js';
import * as jsonlImportMigration from './002_jsonl_import.js';

/**
 * 迁移定义
 */
interface Migration {
  id: string;
  up: (db: Database.Database) => void;
}

/** 迁移注册表（按顺序执行） */
const migrations: Migration[] = [
  { id: initialMigration.MIGRATION_ID, up: initialMigration.up },
  { id: jsonlImportMigration.MIGRATION_ID, up: jsonlImportMigration.up },
];

/**
 * 执行数据库迁移
 *
 * 1. 确保 migrations 表存在（由 001_initial 创建）
 * 2. 检查已执行的迁移
 * 3. 只执行未执行的迁移
 * 4. 每个迁移在事务中执行
 *
 * @param db - better-sqlite3 数据库实例
 */
export function runMigrations(db: Database.Database): void {
  // 先执行 001_initial（创建 migrations 表和其他表）
  // 直接调用，不通过 migrations 表检查（因为表此时可能还不存在）
  const firstMigration = migrations[0];
  if (!firstMigration) return;

  // 检查 migrations 表是否存在
  const tableExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='migrations'",
  ).get() as { name: string } | undefined;

  if (!tableExists) {
    // migrations 表不存在，执行第一个迁移
    initialMigration.up(db);
  }

  // 查询已执行的迁移
  const executedStmt = db.prepare('SELECT id FROM migrations');
  const executedSet = new Set<string>();

  try {
    const rows = executedStmt.all() as { id: string }[];
    for (const row of rows) {
      executedSet.add(row.id);
    }
  } catch {
    // migrations 表不存在时忽略
  }

  // 执行未执行的迁移
  for (const migration of migrations) {
    if (executedSet.has(migration.id)) continue;

    const insertMigration = db.prepare(
      'INSERT INTO migrations (id, executedAt) VALUES (?, ?)',
    );

    const runInTransaction = db.transaction(() => {
      // 001_initial 已经在上面执行过，跳过
      if (migration.id === initialMigration.MIGRATION_ID && !tableExists) {
        // 已执行，只记录
        insertMigration.run(migration.id, nowISO());
        return;
      }
      migration.up(db);
      insertMigration.run(migration.id, nowISO());
    });

    runInTransaction();
  }
}

/** 获取所有迁移 ID（用于测试） */
export function getMigrationIds(): string[] {
  return migrations.map((m) => m.id);
}
