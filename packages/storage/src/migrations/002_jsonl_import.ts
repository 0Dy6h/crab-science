import type Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import type { SkillExecutionRecord } from '@crab-science/shared';
import { expandTilde, generateId, nowISO } from '@crab-science/shared';

/** 迁移编号 */
export const MIGRATION_ID = '002_jsonl_import';

/**
 * JSONL → SQLite 数据迁移
 *
 * 扫描所有 skill 目录的 executions.jsonl 文件，
 * 逐行解析并写入 skill_executions 表，
 * 成功后将原文件重命名为 .jsonl.migrated。
 *
 * 幂等：已迁移的文件（.migrated 后缀）不会再次处理。
 *
 * @param db - better-sqlite3 数据库实例
 */
export function up(db: Database.Database): void {
  const skillsDirs = [
    expandTilde('~/.crab-science/skills'),
    path.resolve('skills'),
  ];

  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO skill_executions
      (id, skillName, timestamp, task, steps, durationMs, status, error, tokenUsage, adopted, rating, skillVersion, sessionId)
    VALUES
      (@id, @skillName, @timestamp, @task, @steps, @durationMs, @status, @error, @tokenUsage, @adopted, @rating, @skillVersion, @sessionId)
  `);

  for (const skillsDir of skillsDirs) {
    if (!fs.existsSync(skillsDir)) continue;

    let entries: string[];
    try {
      entries = fs.readdirSync(skillsDir);
    } catch {
      continue;
    }

    for (const entry of entries) {
      const skillDir = path.join(skillsDir, entry);
      if (!fs.statSync(skillDir).isDirectory()) continue;

      const jsonlPath = path.join(skillDir, 'executions.jsonl');
      if (!fs.existsSync(jsonlPath)) continue;

      // 读取并解析 JSONL
      let raw: string;
      try {
        raw = fs.readFileSync(jsonlPath, 'utf-8');
      } catch {
        continue;
      }

      const lines = raw.split('\n').filter((l) => l.trim());
      const records: SkillExecutionRecord[] = [];

      for (const line of lines) {
        try {
          const record = JSON.parse(line) as SkillExecutionRecord;
          records.push(record);
        } catch {
          // 跳过损坏的行
        }
      }

      if (records.length === 0) {
        // 即使没有记录，也标记为已迁移
        try {
          fs.renameSync(jsonlPath, jsonlPath + '.migrated');
        } catch {
          // 忽略重命名失败
        }
        continue;
      }

      // 事务写入
      const insertMany = db.transaction((recs: SkillExecutionRecord[]) => {
        for (const rec of recs) {
          insertStmt.run({
            id: rec.id || generateId('exec'),
            skillName: rec.skillName,
            timestamp: rec.timestamp,
            task: rec.task,
            steps: JSON.stringify(rec.steps || []),
            durationMs: rec.durationMs,
            status: rec.status,
            error: rec.error ?? null,
            tokenUsage: rec.tokenUsage ? JSON.stringify(rec.tokenUsage) : null,
            adopted: rec.adopted ? 1 : 0,
            rating: rec.rating ?? 0,
            skillVersion: rec.skillVersion ?? 1,
            sessionId: rec.sessionId ?? null,
          });
        }
      });

      try {
        insertMany(records);
        // 成功后重命名原文件
        fs.renameSync(jsonlPath, jsonlPath + '.migrated');
      } catch (err) {
        // 迁移失败，保留原文件，下次重试
        console.error(`[Migration 002] 迁移 ${jsonlPath} 失败:`, err);
      }
    }
  }
}
