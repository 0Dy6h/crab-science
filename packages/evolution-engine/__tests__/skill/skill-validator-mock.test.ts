import { describe, it, expect, vi } from 'vitest';
import { SkillValidator } from '../../src/skill/skill-validator.js';
import type {
  SkillMetrics,
  SkillMetricsRepository,
  SkillExecutionRecord,
} from '@crab-science/shared';
import {
  SKILL_ROLLBACK_SUCCESS_RATE_DROP,
  SKILL_ROLLBACK_SATISFACTION_DROP,
  SKILL_VALIDATION_WINDOW,
} from '@crab-science/shared';
import type { SkillVersioner } from '../../src/skill/skill-versioner.js';

/**
 * SkillValidator 纯逻辑测试（使用 mock 仓库和 versioner）
 *
 * 重点测试：
 * - validate(): 未待验证、执行次数不足、达到窗口、回滚触发、回滚不触发
 * - checkValidationStatus(): pending 状态检查
 * - markPendingValidation(): 标记逻辑
 * - 回滚阈值边界条件（成功率下降 15%，满意度下降 0.5）
 */
describe('SkillValidator - mock-based tests', () => {
  function createMockRepo(
    options: {
      pendingValidation?: boolean;
      currentVersion?: number;
      executions?: SkillExecutionRecord[];
      versionComparison?: { v1: SkillMetrics; v2: SkillMetrics };
    } = {},
  ): SkillMetricsRepository {
    const pendingValidation = options.pendingValidation ?? false;
    const currentVersion = options.currentVersion ?? 1;
    const executions = options.executions ?? [];

    return {
      getOrCreateSkillMetricRecord: () => ({
        pendingValidation,
        versionCreatedAt: pendingValidation ? '2025-01-01T00:00:00Z' : null,
        currentVersion,
      }),
      queryExecutions: () => executions,
      getVersionComparison: () =>
        options.versionComparison || {
          v1: { skillName: 'test', successRate: 0.8, avgDuration: 1000, usageCount: 5, userSatisfaction: 4.0, lastUsed: '', trend: 'stable' as const },
          v2: { skillName: 'test', successRate: 0.8, avgDuration: 1000, usageCount: 5, userSatisfaction: 4.0, lastUsed: '', trend: 'stable' as const },
        },
      updateSkillMetric: () => {},
    } as unknown as SkillMetricsRepository;
  }

  function createMockVersioner(
    rollbackResult: string | Error = 'commit-hash-123',
  ): SkillVersioner {
    return {
      rollback: vi.fn().mockImplementation(async () => {
        if (rollbackResult instanceof Error) {
          throw rollbackResult;
        }
        return rollbackResult;
      }),
    } as unknown as SkillVersioner;
  }

  function makeExecutionRecord(
    overrides: Partial<SkillExecutionRecord> = {},
  ): SkillExecutionRecord {
    return {
      id: `exec_${Math.random().toString(36).substring(2, 8)}`,
      skillName: 'test-skill',
      timestamp: new Date().toISOString(),
      task: 'test task',
      steps: [],
      durationMs: 1000,
      status: 'success',
      skillVersion: 1,
      sessionId: 's1',
      ...overrides,
    };
  }

  // ============================================================
  // checkValidationStatus 测试
  // ============================================================
  describe('checkValidationStatus', () => {
    it('未标记待验证时应返回 pending=false', () => {
      const repo = createMockRepo({ pendingValidation: false });
      const versioner = createMockVersioner();
      const validator = new SkillValidator(repo, versioner, {});

      const status = validator.checkValidationStatus('test-skill');
      expect(status.pending).toBe(false);
      expect(status.executionsSinceVersion).toBe(0);
    });

    it('标记待验证且有执行记录时应返回正确的执行次数', () => {
      const executions = [
        makeExecutionRecord({ skillVersion: 2 }),
        makeExecutionRecord({ skillVersion: 2 }),
        makeExecutionRecord({ skillVersion: 2 }),
      ];
      const repo = createMockRepo({
        pendingValidation: true,
        currentVersion: 2,
        executions,
      });
      const versioner = createMockVersioner();
      const validator = new SkillValidator(repo, versioner, {});

      const status = validator.checkValidationStatus('test-skill');
      expect(status.pending).toBe(true);
      expect(status.executionsSinceVersion).toBe(3);
    });

    it('应使用配置中的 windowSize', () => {
      const repo = createMockRepo({ pendingValidation: false });
      const versioner = createMockVersioner();
      const validator = new SkillValidator(repo, versioner, {
        skillValidationWindow: 5,
      });

      const status = validator.checkValidationStatus('test-skill');
      expect(status.windowSize).toBe(5);
    });

    it('无配置时应使用默认 windowSize', () => {
      const repo = createMockRepo({ pendingValidation: false });
      const versioner = createMockVersioner();
      const validator = new SkillValidator(repo, versioner, {});

      const status = validator.checkValidationStatus('test-skill');
      expect(status.windowSize).toBe(SKILL_VALIDATION_WINDOW);
    });
  });

  // ============================================================
  // validate 测试
  // ============================================================
  describe('validate', () => {
    it('未待验证时应直接返回 passed=true', async () => {
      const repo = createMockRepo({ pendingValidation: false });
      const versioner = createMockVersioner();
      const validator = new SkillValidator(repo, versioner, {});

      const result = await validator.validate('test-skill');
      expect(result.passed).toBe(true);
      expect(result.rolledBack).toBe(false);
    });

    it('执行次数不足窗口大小时应返回 passed=true 并提示等待', async () => {
      const executions = [
        makeExecutionRecord({ skillVersion: 2 }),
      ];
      const repo = createMockRepo({
        pendingValidation: true,
        currentVersion: 2,
        executions,
      });
      const versioner = createMockVersioner();
      const validator = new SkillValidator(repo, versioner, {
        skillValidationWindow: 3,
      });

      const result = await validator.validate('test-skill');
      expect(result.passed).toBe(true);
      expect(result.rolledBack).toBe(false);
      expect(result.reason).toContain('等待');
    });

    it('previousVersion < 1 时应直接通过', async () => {
      const executions = [
        makeExecutionRecord({ skillVersion: 1 }),
        makeExecutionRecord({ skillVersion: 1 }),
        makeExecutionRecord({ skillVersion: 1 }),
      ];
      const repo = createMockRepo({
        pendingValidation: true,
        currentVersion: 1, // previousVersion = 0 < 1
        executions,
      });
      const versioner = createMockVersioner();
      const validator = new SkillValidator(repo, versioner, {
        skillValidationWindow: 3,
      });

      const result = await validator.validate('test-skill');
      expect(result.passed).toBe(true);
      expect(result.rolledBack).toBe(false);
    });

    it('成功率下降超过阈值时应触发回滚', async () => {
      const executions = [
        makeExecutionRecord({ skillVersion: 2 }),
        makeExecutionRecord({ skillVersion: 2 }),
        makeExecutionRecord({ skillVersion: 2 }),
      ];
      const repo = createMockRepo({
        pendingValidation: true,
        currentVersion: 2,
        executions,
        versionComparison: {
          v1: {
            skillName: 'test',
            successRate: 0.9,
            avgDuration: 1000,
            usageCount: 10,
            userSatisfaction: 4.0,
            lastUsed: '',
            trend: 'stable' as const,
          },
          v2: {
            skillName: 'test',
            successRate: 0.5, // 下降 (0.9-0.5)/0.9 = 44% > 15%
            avgDuration: 1000,
            usageCount: 3,
            userSatisfaction: 4.0,
            lastUsed: '',
            trend: 'stable' as const,
          },
        },
      });
      const versioner = createMockVersioner();
      const validator = new SkillValidator(repo, versioner, {
        skillValidationWindow: 3,
      });

      const result = await validator.validate('test-skill');
      expect(result.passed).toBe(false);
      expect(result.rolledBack).toBe(true);
      expect(result.reason).toContain('成功率下降');
      expect(versioner.rollback).toHaveBeenCalledWith('test-skill', 1);
    });

    it('成功率下降恰好等于阈值时不应触发回滚（> 不是 >=）', async () => {
      const executions = [
        makeExecutionRecord({ skillVersion: 2 }),
        makeExecutionRecord({ skillVersion: 2 }),
        makeExecutionRecord({ skillVersion: 2 }),
      ];
      // successRateDrop = (0.8 - 0.68) / 0.8 = 0.15 = SKILL_ROLLBACK_SUCCESS_RATE_DROP
      // 但 > 0.15 才回滚，= 0.15 不回滚
      const repo = createMockRepo({
        pendingValidation: true,
        currentVersion: 2,
        executions,
        versionComparison: {
          v1: {
            skillName: 'test',
            successRate: 0.8,
            avgDuration: 1000,
            usageCount: 10,
            userSatisfaction: 4.0,
            lastUsed: '',
            trend: 'stable' as const,
          },
          v2: {
            skillName: 'test',
            successRate: 0.68, // (0.8-0.68)/0.8 = 0.15 恰好等于阈值
            avgDuration: 1000,
            usageCount: 3,
            userSatisfaction: 4.0,
            lastUsed: '',
            trend: 'stable' as const,
          },
        },
      });
      const versioner = createMockVersioner();
      const validator = new SkillValidator(repo, versioner, {
        skillValidationWindow: 3,
      });

      const result = await validator.validate('test-skill');
      // 恰好等于阈值，不满足 > 条件，不回滚
      expect(result.rolledBack).toBe(false);
      expect(result.passed).toBe(true);
    });

    it('满意度下降超过阈值时应触发回滚', async () => {
      const executions = [
        makeExecutionRecord({ skillVersion: 2 }),
        makeExecutionRecord({ skillVersion: 2 }),
        makeExecutionRecord({ skillVersion: 2 }),
      ];
      const repo = createMockRepo({
        pendingValidation: true,
        currentVersion: 2,
        executions,
        versionComparison: {
          v1: {
            skillName: 'test',
            successRate: 0.9,
            avgDuration: 1000,
            usageCount: 10,
            userSatisfaction: 4.5,
            lastUsed: '',
            trend: 'stable' as const,
          },
          v2: {
            skillName: 'test',
            successRate: 0.9, // 成功率不变
            avgDuration: 1000,
            usageCount: 3,
            userSatisfaction: 3.0, // 下降 1.5 > 0.5
            lastUsed: '',
            trend: 'stable' as const,
          },
        },
      });
      const versioner = createMockVersioner();
      const validator = new SkillValidator(repo, versioner, {
        skillValidationWindow: 3,
      });

      const result = await validator.validate('test-skill');
      expect(result.passed).toBe(false);
      expect(result.rolledBack).toBe(true);
      expect(result.reason).toContain('满意度下降');
    });

    it('成功率和满意度都正常时不应回滚', async () => {
      const executions = [
        makeExecutionRecord({ skillVersion: 2 }),
        makeExecutionRecord({ skillVersion: 2 }),
        makeExecutionRecord({ skillVersion: 2 }),
      ];
      const repo = createMockRepo({
        pendingValidation: true,
        currentVersion: 2,
        executions,
        versionComparison: {
          v1: {
            skillName: 'test',
            successRate: 0.8,
            avgDuration: 1000,
            usageCount: 10,
            userSatisfaction: 4.0,
            lastUsed: '',
            trend: 'stable' as const,
          },
          v2: {
            skillName: 'test',
            successRate: 0.9, // 改善
            avgDuration: 1000,
            usageCount: 3,
            userSatisfaction: 4.5, // 改善
            lastUsed: '',
            trend: 'stable' as const,
          },
        },
      });
      const versioner = createMockVersioner();
      const validator = new SkillValidator(repo, versioner, {
        skillValidationWindow: 3,
      });

      const result = await validator.validate('test-skill');
      expect(result.passed).toBe(true);
      expect(result.rolledBack).toBe(false);
    });

    it('回滚失败时应返回 rolledBack=false 和错误信息', async () => {
      const executions = [
        makeExecutionRecord({ skillVersion: 2 }),
        makeExecutionRecord({ skillVersion: 2 }),
        makeExecutionRecord({ skillVersion: 2 }),
      ];
      const repo = createMockRepo({
        pendingValidation: true,
        currentVersion: 2,
        executions,
        versionComparison: {
          v1: {
            skillName: 'test',
            successRate: 0.9,
            avgDuration: 1000,
            usageCount: 10,
            userSatisfaction: 4.0,
            lastUsed: '',
            trend: 'stable' as const,
          },
          v2: {
            skillName: 'test',
            successRate: 0.1, // 大幅下降
            avgDuration: 1000,
            usageCount: 3,
            userSatisfaction: 4.0,
            lastUsed: '',
            trend: 'stable' as const,
          },
        },
      });
      const versioner = createMockVersioner(
        new Error('Git checkout failed'),
      );
      const validator = new SkillValidator(repo, versioner, {
        skillValidationWindow: 3,
      });

      const result = await validator.validate('test-skill');
      expect(result.passed).toBe(false);
      expect(result.rolledBack).toBe(false);
      expect(result.reason).toContain('回滚失败');
      expect(result.reason).toContain('Git checkout failed');
    });

    it('v1 成功率为 0 时 successRateDrop 应为 0（避免除零）', async () => {
      const executions = [
        makeExecutionRecord({ skillVersion: 2 }),
        makeExecutionRecord({ skillVersion: 2 }),
        makeExecutionRecord({ skillVersion: 2 }),
      ];
      const repo = createMockRepo({
        pendingValidation: true,
        currentVersion: 2,
        executions,
        versionComparison: {
          v1: {
            skillName: 'test',
            successRate: 0, // v1 成功率为 0
            avgDuration: 1000,
            usageCount: 10,
            userSatisfaction: 4.0,
            lastUsed: '',
            trend: 'stable' as const,
          },
          v2: {
            skillName: 'test',
            successRate: 0, // v2 也为 0
            avgDuration: 1000,
            usageCount: 3,
            userSatisfaction: 4.0,
            lastUsed: '',
            trend: 'stable' as const,
          },
        },
      });
      const versioner = createMockVersioner();
      const validator = new SkillValidator(repo, versioner, {
        skillValidationWindow: 3,
      });

      const result = await validator.validate('test-skill');
      // successRateDrop = 0 (因为 v1=0), satisfactionDrop = 0
      // 不应回滚
      expect(result.rolledBack).toBe(false);
      expect(result.passed).toBe(true);
    });
  });

  // ============================================================
  // markPendingValidation 测试
  // ============================================================
  describe('markPendingValidation', () => {
    it('应调用 updateSkillMetric 设置 pendingValidation=true', () => {
      const updateSkillMetric = vi.fn();
      const repo = {
        getOrCreateSkillMetricRecord: () => ({
          pendingValidation: false,
          versionCreatedAt: null,
          currentVersion: 1,
        }),
        updateSkillMetric,
      } as unknown as SkillMetricsRepository;
      const versioner = createMockVersioner();
      const validator = new SkillValidator(repo, versioner, {});

      validator.markPendingValidation('test-skill', 3);

      expect(updateSkillMetric).toHaveBeenCalledWith('test-skill', {
        pendingValidation: true,
        versionCreatedAt: expect.any(String),
        currentVersion: 3,
      });
    });
  });
});
