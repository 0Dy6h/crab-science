import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CrabDatabase, SkillMetricsRepository } from '@crab-science/storage';
import { PatternDetector } from '../../src/subagent/pattern-detector.js';
import type { SkillExecutionRecord } from '@crab-science/shared';

let sqliteAvailable = false;
try {
  const Database = require('better-sqlite3');
  const testDb = new Database(':memory:');
  testDb.close();
  sqliteAvailable = true;
} catch { sqliteAvailable = false; }

describe.skipIf(!sqliteAvailable)('PatternDetector', () => {
  let db: CrabDatabase;
  let repo: SkillMetricsRepository;
  let detector: PatternDetector;
  let testDir: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crab-pd-'));
    originalHome = process.env.HOME;
    process.env.HOME = testDir;
    db = new CrabDatabase();
    db.initialize();
    repo = new SkillMetricsRepository(db);
    detector = new PatternDetector(repo, {
      subagentPatternThreshold: 3,
    });
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

  function insertRecord(
    overrides: Partial<Omit<SkillExecutionRecord, 'id' | 'timestamp'>> = {},
  ): void {
    repo.insertExecution({
      skillName: 'test-skill',
      task: 'test task',
      steps: [],
      durationMs: 1000,
      status: 'success',
      tokenUsage: undefined,
      adopted: true,
      rating: 0,
      skillVersion: 1,
      sessionId: 's1',
      ...overrides,
    });
  }

  describe('detect', () => {
    it('任务数量不足阈值时返回空数组', () => {
      insertRecord({ task: '数据分析' });
      insertRecord({ task: '数据分析' });

      const patterns = detector.detect();
      expect(patterns).toHaveLength(0);
    });

    it('应检测到重复任务模式', () => {
      // 插入 4 条相似任务（超过阈值 3）
      insertRecord({ task: '数据分析报告生成', skillName: 'data-skill' });
      insertRecord({ task: '数据分析报告生成', skillName: 'data-skill' });
      insertRecord({ task: '数据分析报告生成', skillName: 'data-skill' });
      insertRecord({ task: '数据分析报告生成', skillName: 'data-skill' });

      const patterns = detector.detect();
      expect(patterns.length).toBeGreaterThan(0);
    });

    it('不同任务不应被聚合为同一模式', () => {
      insertRecord({ task: '数据分析' });
      insertRecord({ task: '模型训练' });
      insertRecord({ task: '报告撰写' });

      const patterns = detector.detect();
      expect(patterns).toHaveLength(0);
    });
  });
});
