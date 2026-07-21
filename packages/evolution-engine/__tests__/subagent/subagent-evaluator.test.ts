import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CrabDatabase } from '@crab-science/storage';
import { SubagentEvaluator } from '../../src/subagent/subagent-evaluator.js';
import type { SubagentMetrics } from '@crab-science/shared';

// 纯逻辑测试
describe('SubagentEvaluator - pure logic', () => {
  // needsOptimization 不需要数据库实例
  const evaluator = new SubagentEvaluator({
    getDatabase: () => ({ prepare: () => ({ all: () => [], run: () => {} }) }),
  } as unknown as CrabDatabase);

  describe('needsOptimization', () => {
    it('委派准确率低于阈值时应触发优化', () => {
      const result = evaluator.needsOptimization({
        subagentName: 'test',
        delegationCount: 5,
        successRate: 0.4,
        avgDuration: 5000,
        delegationAccuracy: 0.6,
        lastUsed: new Date().toISOString(),
      } as SubagentMetrics);

      expect(result.needed).toBe(true);
      expect(result.reasons).toContainEqual(
        expect.stringContaining('delegation_accuracy_low'),
      );
    });

    it('成功率低于阈值时应触发优化', () => {
      const result = evaluator.needsOptimization({
        subagentName: 'test',
        delegationCount: 5,
        successRate: 0.5,
        avgDuration: 5000,
        delegationAccuracy: 0.9,
        lastUsed: new Date().toISOString(),
      } as SubagentMetrics);

      expect(result.needed).toBe(true);
      expect(result.reasons).toContainEqual(
        expect.stringContaining('success_rate_low'),
      );
    });

    it('指标正常时不应触发优化', () => {
      const result = evaluator.needsOptimization({
        subagentName: 'test',
        delegationCount: 10,
        successRate: 0.95,
        avgDuration: 3000,
        delegationAccuracy: 0.95,
        lastUsed: new Date().toISOString(),
      } as SubagentMetrics);

      expect(result.needed).toBe(false);
    });

    it('使用次数不足 3 次时不触发优化', () => {
      const result = evaluator.needsOptimization({
        subagentName: 'test',
        delegationCount: 2,
        successRate: 0.1,
        avgDuration: 10000,
        delegationAccuracy: 0.1,
        lastUsed: new Date().toISOString(),
      } as SubagentMetrics);

      expect(result.needed).toBe(false);
    });
  });
});

// 数据库集成测试
let sqliteAvailable = false;
try {
  const Database = require('better-sqlite3');
  const testDb = new Database(':memory:');
  testDb.close();
  sqliteAvailable = true;
} catch { sqliteAvailable = false; }

describe.skipIf(!sqliteAvailable)('SubagentEvaluator - integration', () => {
  let db: CrabDatabase;
  let evaluator: SubagentEvaluator;
  let testDir: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crab-se-'));
    originalHome = process.env.HOME;
    process.env.HOME = testDir;
    db = new CrabDatabase();
    db.initialize();
    evaluator = new SubagentEvaluator(db);
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

  describe('evaluate', () => {
    it('无执行记录时返回零值指标', () => {
      const metrics = evaluator.evaluate('nonexistent-subagent');
      expect(metrics.delegationCount).toBe(0);
      expect(metrics.successRate).toBe(0);
      expect(metrics.avgDuration).toBe(0);
    });

    it('应正确计算委派指标', () => {
      evaluator.recordExecution({
        subagentName: 'data-analyst',
        timestamp: new Date().toISOString(),
        task: '数据分析',
        sessionId: 's1',
        branchLeafId: 'n1',
        duration: 5000,
        outcome: 'success',
        summary: '分析完成',
      });
      evaluator.recordExecution({
        subagentName: 'data-analyst',
        timestamp: new Date().toISOString(),
        task: '数据清洗',
        sessionId: 's2',
        branchLeafId: 'n2',
        duration: 3000,
        outcome: 'failed',
        summary: '清洗失败',
      });

      const metrics = evaluator.evaluate('data-analyst');
      expect(metrics.delegationCount).toBe(2);
      expect(metrics.successRate).toBe(0.5);
      expect(metrics.avgDuration).toBe(4000);
    });
  });

  describe('recordExecution', () => {
    it('应记录执行到数据库', () => {
      evaluator.recordExecution({
        subagentName: 'code-reviewer',
        timestamp: new Date().toISOString(),
        task: '代码审查',
        sessionId: 's1',
        branchLeafId: 'n1',
        duration: 2000,
        outcome: 'success',
        summary: '审查完成',
      });

      const metrics = evaluator.evaluate('code-reviewer');
      expect(metrics.delegationCount).toBe(1);
    });
  });

  describe('getAllSubagentNames', () => {
    it('应返回所有有执行记录的 Subagent 名称', () => {
      evaluator.recordExecution({
        subagentName: 'agent-a',
        timestamp: new Date().toISOString(),
        task: 't1',
        sessionId: 's1',
        branchLeafId: 'n1',
        duration: 1000,
        outcome: 'success',
        summary: '',
      });
      evaluator.recordExecution({
        subagentName: 'agent-b',
        timestamp: new Date().toISOString(),
        task: 't2',
        sessionId: 's2',
        branchLeafId: 'n2',
        duration: 2000,
        outcome: 'failed',
        summary: '',
      });

      const names = evaluator.getAllSubagentNames();
      expect(names).toContain('agent-a');
      expect(names).toContain('agent-b');
    });

    it('无记录时返回空数组', () => {
      const names = evaluator.getAllSubagentNames();
      expect(names).toHaveLength(0);
    });
  });
});
