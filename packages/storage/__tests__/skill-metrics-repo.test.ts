import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CrabDatabase } from '../src/database.js';
import { SkillMetricsRepository } from '../src/repositories/skill-metrics-repo.js';
import { isSqliteAvailable } from './helpers.js';
import type { SkillExecutionRecord } from '@crab-science/shared';

describe.skipIf(!isSqliteAvailable())('SkillMetricsRepository', () => {
  let db: CrabDatabase;
  let repo: SkillMetricsRepository;
  let testDir: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crab-skm-'));
    originalHome = process.env.HOME;
    process.env.HOME = testDir;
    db = new CrabDatabase();
    db.initialize();
    repo = new SkillMetricsRepository(db);
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

  /** 创建测试执行记录 */
  function makeRecord(
    overrides: Partial<Omit<SkillExecutionRecord, 'id' | 'timestamp'>> = {},
  ): Omit<SkillExecutionRecord, 'id' | 'timestamp'> {
    return {
      skillName: 'test-skill',
      task: 'test task',
      steps: ['step1', 'step2'],
      durationMs: 1000,
      status: 'success',
      tokenUsage: undefined,
      adopted: true,
      rating: 0,
      skillVersion: 1,
      sessionId: 'session-1',
      ...overrides,
    };
  }

  describe('insertExecution', () => {
    it('应插入执行记录并返回 ID', () => {
      const id = repo.insertExecution(makeRecord());
      expect(id).toMatch(/^exec_/);
    });

    it('应插入多条执行记录', () => {
      repo.insertExecution(makeRecord({ task: 'task1' }));
      repo.insertExecution(makeRecord({ task: 'task2', status: 'failed' }));
      repo.insertExecution(makeRecord({ task: 'task3', status: 'partial' }));

      const records = repo.queryExecutions('test-skill', { limit: 10 });
      expect(records).toHaveLength(3);
    });
  });

  describe('queryExecutions', () => {
    it('应按 limit 限制返回数量', () => {
      for (let i = 0; i < 10; i++) {
        repo.insertExecution(makeRecord({ task: `task-${i}` }));
      }

      const records = repo.queryExecutions('test-skill', { limit: 5 });
      expect(records).toHaveLength(5);
    });

    it('应按 status 过滤', () => {
      repo.insertExecution(makeRecord({ status: 'success' }));
      repo.insertExecution(makeRecord({ status: 'failed' }));
      repo.insertExecution(makeRecord({ status: 'success' }));

      const records = repo.queryExecutions('test-skill', {
        status: 'success',
        limit: 10,
      });
      expect(records).toHaveLength(2);
      expect(records.every((r) => r.status === 'success')).toBe(true);
    });

    it('应按时间倒序返回', () => {
      repo.insertExecution(makeRecord({ task: 'first' }));
      repo.insertExecution(makeRecord({ task: 'second' }));
      repo.insertExecution(makeRecord({ task: 'third' }));

      const records = repo.queryExecutions('test-skill', { limit: 10 });
      expect(records[0].task).toBe('third');
      expect(records[2].task).toBe('first');
    });
  });

  describe('getMetrics', () => {
    it('应正确计算成功率', () => {
      repo.insertExecution(makeRecord({ status: 'success' }));
      repo.insertExecution(makeRecord({ status: 'success' }));
      repo.insertExecution(makeRecord({ status: 'failed' }));
      repo.insertExecution(makeRecord({ status: 'partial' }));

      const metrics = repo.getMetrics('test-skill');
      expect(metrics.successRate).toBe(0.5); // 2 success / 4 total
    });

    it('应正确计算平均耗时', () => {
      repo.insertExecution(makeRecord({ durationMs: 1000 }));
      repo.insertExecution(makeRecord({ durationMs: 3000 }));

      const metrics = repo.getMetrics('test-skill');
      expect(metrics.avgDuration).toBe(2000);
    });

    it('应返回使用次数', () => {
      repo.insertExecution(makeRecord());
      repo.insertExecution(makeRecord());

      const metrics = repo.getMetrics('test-skill');
      expect(metrics.usageCount).toBe(2);
    });

    it('无数据时返回零值指标', () => {
      const metrics = repo.getMetrics('nonexistent-skill');
      expect(metrics.successRate).toBe(0);
      expect(metrics.avgDuration).toBe(0);
      expect(metrics.usageCount).toBe(0);
    });
  });

  describe('getOrCreateSkillMetricRecord', () => {
    it('首次调用应创建记录', () => {
      const record = repo.getOrCreateSkillMetricRecord('new-skill');
      expect(record.pendingValidation).toBe(false);
      expect(record.currentVersion).toBe(1);
    });

    it('重复调用应返回已有记录', () => {
      const first = repo.getOrCreateSkillMetricRecord('my-skill');
      const second = repo.getOrCreateSkillMetricRecord('my-skill');
      expect(second.currentVersion).toBe(first.currentVersion);
      expect(second.pendingValidation).toBe(first.pendingValidation);
    });
  });

  describe('updateSkillMetric', () => {
    it('应更新指标字段', () => {
      repo.getOrCreateSkillMetricRecord('update-skill');

      repo.updateSkillMetric('update-skill', {
        currentVersion: 3,
        pendingValidation: true,
      });

      const record = repo.getOrCreateSkillMetricRecord('update-skill');
      expect(record.currentVersion).toBe(3);
      expect(record.pendingValidation).toBe(true);
    });
  });

  describe('getAllSkillNames', () => {
    it('应返回所有有执行记录的 Skill 名称', () => {
      repo.insertExecution(makeRecord({ skillName: 'skill-a' }));
      repo.insertExecution(makeRecord({ skillName: 'skill-b' }));

      const names = repo.getAllSkillNames();
      expect(names).toContain('skill-a');
      expect(names).toContain('skill-b');
    });
  });

  describe('getVersionComparison', () => {
    it('应比较不同版本的指标', () => {
      repo.insertExecution(
        makeRecord({ skillVersion: 1, status: 'failed' }),
      );
      repo.insertExecution(
        makeRecord({ skillVersion: 1, status: 'failed' }),
      );
      repo.insertExecution(
        makeRecord({ skillVersion: 2, status: 'success' }),
      );
      repo.insertExecution(
        makeRecord({ skillVersion: 2, status: 'success' }),
      );

      const comparison = repo.getVersionComparison('test-skill', 1, 2);
      expect(comparison.v1.successRate).toBe(0);
      expect(comparison.v2.successRate).toBe(1);
    });
  });

  describe('updateExecution', () => {
    it('应更新执行记录的 rating', () => {
      const id = repo.insertExecution(makeRecord({ rating: 0 }));
      repo.updateExecution(id, { rating: 5 });

      const records = repo.queryExecutions('test-skill', { limit: 1 });
      expect(records[0].rating).toBe(5);
    });
  });
});
