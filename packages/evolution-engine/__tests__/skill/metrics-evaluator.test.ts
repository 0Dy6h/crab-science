import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CrabDatabase } from '@crab-science/storage';
import { SkillMetricsRepository } from '@crab-science/storage';
import { SkillMetricsEvaluator } from '../../src/skill/metrics-evaluator.js';
import type { SkillExecutionRecord, SkillMetrics } from '@crab-science/shared';

// 纯逻辑测试（不需要数据库）
describe('SkillMetricsEvaluator - pure logic', () => {
  const evaluator = new SkillMetricsEvaluator({} as SkillMetricsRepository, {});

  describe('needsOptimization', () => {
    it('成功率低于阈值时应触发优化', () => {
      const result = evaluator.needsOptimization({
        skillName: 'test',
        successRate: 0.5,
        avgDuration: 1000,
        usageCount: 5,
        userSatisfaction: 0,
        trend: 'stable',
      } as SkillMetrics);

      expect(result.needed).toBe(true);
      expect(result.reasons).toContainEqual(
        expect.stringContaining('success_rate_low'),
      );
    });

    it('使用次数不足 3 次时不触发成功率优化', () => {
      const result = evaluator.needsOptimization({
        skillName: 'test',
        successRate: 0.1,
        avgDuration: 1000,
        usageCount: 2,
        userSatisfaction: 0,
        trend: 'stable',
      } as SkillMetrics);

      expect(result.needed).toBe(false);
    });

    it('满意度低于阈值时应触发优化', () => {
      const result = evaluator.needsOptimization({
        skillName: 'test',
        successRate: 1.0,
        avgDuration: 1000,
        usageCount: 10,
        userSatisfaction: 2.0,
        trend: 'stable',
      } as SkillMetrics);

      expect(result.needed).toBe(true);
      expect(result.reasons).toContainEqual(
        expect.stringContaining('satisfaction_low'),
      );
    });

    it('耗时趋势下降时应触发优化', () => {
      const result = evaluator.needsOptimization({
        skillName: 'test',
        successRate: 1.0,
        avgDuration: 1000,
        usageCount: 10,
        userSatisfaction: 5.0,
        trend: 'declining',
      } as SkillMetrics);

      expect(result.needed).toBe(true);
      expect(result.reasons).toContainEqual(
        expect.stringContaining('duration_increasing'),
      );
    });

    it('所有指标正常时不应触发优化', () => {
      const result = evaluator.needsOptimization({
        skillName: 'test',
        successRate: 0.9,
        avgDuration: 1000,
        usageCount: 10,
        userSatisfaction: 4.5,
        trend: 'stable',
      } as SkillMetrics);

      expect(result.needed).toBe(false);
    });
  });
});

// 数据库集成测试（需要 better-sqlite3 原生模块）
let sqliteAvailable = false;
try {
  const Database = require('better-sqlite3');
  const testDb = new Database(':memory:');
  testDb.close();
  sqliteAvailable = true;
} catch { sqliteAvailable = false; }

describe.skipIf(!sqliteAvailable)('SkillMetricsEvaluator - integration', () => {
  let db: CrabDatabase;
  let repo: SkillMetricsRepository;
  let evaluator: SkillMetricsEvaluator;
  let testDir: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crab-eval-'));
    originalHome = process.env.HOME;
    process.env.HOME = testDir;
    db = new CrabDatabase();
    db.initialize();
    repo = new SkillMetricsRepository(db);
    evaluator = new SkillMetricsEvaluator(repo, {});
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

  describe('evaluate', () => {
    it('应返回指定 Skill 的评估结果', () => {
      insertRecord({ status: 'success' });
      insertRecord({ status: 'failed' });
      insertRecord({ status: 'success' });

      const result = evaluator.evaluate('test-skill');

      expect(result.skillName).toBe('test-skill');
      expect(result.metrics.usageCount).toBe(3);
    });

    it('无数据时返回零值指标', () => {
      const result = evaluator.evaluate('nonexistent');

      expect(result.metrics.usageCount).toBe(0);
      expect(result.needsOptimization).toBe(false);
    });
  });

  describe('evaluateAll', () => {
    it('应评估所有有执行记录的 Skill', () => {
      insertRecord({ skillName: 'skill-a' });
      insertRecord({ skillName: 'skill-b' });

      const results = evaluator.evaluateAll();

      expect(results).toHaveLength(2);
      const names = results.map((r) => r.skillName);
      expect(names).toContain('skill-a');
      expect(names).toContain('skill-b');
    });
  });
});
