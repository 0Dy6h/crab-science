import { describe, it, expect } from 'vitest';
import { SkillMetricsEvaluator } from '../../src/skill/metrics-evaluator.js';
import type { SkillMetrics, SkillMetricsRepository } from '@crab-science/shared';
import {
  SKILL_OPTIMIZATION_SUCCESS_RATE_THRESHOLD,
  SKILL_OPTIMIZATION_SATISFACTION_THRESHOLD,
} from '@crab-science/shared';

/**
 * metrics-evaluator 边界条件补充测试
 *
 * 重点测试阈值边界值：
 * - 成功率 70% 边界（< 70% 触发，= 70% 不触发）
 * - 满意度 3.5 边界（< 3.5 触发，= 3.5 不触发）
 * - usageCount = 3 边界（>= 3 触发成功率检查）
 * - userSatisfaction = 0 边界（不触发满意度检查）
 * - 多个原因同时触发
 * - trend = 'improving' 不触发
 */
describe('SkillMetricsEvaluator - boundary conditions', () => {
  const evaluator = new SkillMetricsEvaluator(
    {} as SkillMetricsRepository,
    {},
  );

  function makeMetrics(overrides: Partial<SkillMetrics>): SkillMetrics {
    return {
      skillName: 'test-skill',
      successRate: 0.9,
      avgDuration: 1000,
      usageCount: 10,
      userSatisfaction: 4.5,
      lastUsed: '2025-01-01T00:00:00Z',
      trend: 'stable',
      ...overrides,
    };
  }

  describe('成功率阈值 70% 边界', () => {
    it('成功率恰好等于 70% 时不应触发优化', () => {
      const result = evaluator.needsOptimization(
        makeMetrics({
          successRate: SKILL_OPTIMIZATION_SUCCESS_RATE_THRESHOLD,
          usageCount: 5,
          userSatisfaction: 0,
          trend: 'stable',
        }),
      );
      expect(result.needed).toBe(false);
    });

    it('成功率略低于 70% 时应触发优化', () => {
      const result = evaluator.needsOptimization(
        makeMetrics({
          successRate: 0.699,
          usageCount: 5,
          userSatisfaction: 0,
          trend: 'stable',
        }),
      );
      expect(result.needed).toBe(true);
      expect(result.reasons).toContainEqual(
        expect.stringContaining('success_rate_low'),
      );
    });

    it('成功率为 0% 且使用次数足够时应触发优化', () => {
      const result = evaluator.needsOptimization(
        makeMetrics({
          successRate: 0,
          usageCount: 5,
          userSatisfaction: 0,
          trend: 'stable',
        }),
      );
      expect(result.needed).toBe(true);
      expect(result.reasons).toContainEqual(
        expect.stringContaining('success_rate_low'),
      );
    });
  });

  describe('usageCount 阈值 3 边界', () => {
    it('usageCount 恰好等于 3 且成功率低时应触发优化', () => {
      const result = evaluator.needsOptimization(
        makeMetrics({
          successRate: 0.3,
          usageCount: 3,
          userSatisfaction: 0,
          trend: 'stable',
        }),
      );
      expect(result.needed).toBe(true);
    });

    it('usageCount 等于 2 且成功率极低时不应触发成功率优化', () => {
      const result = evaluator.needsOptimization(
        makeMetrics({
          successRate: 0.0,
          usageCount: 2,
          userSatisfaction: 0,
          trend: 'stable',
        }),
      );
      expect(result.needed).toBe(false);
    });
  });

  describe('满意度阈值 3.5 边界', () => {
    it('满意度恰好等于 3.5 时不应触发优化', () => {
      const result = evaluator.needsOptimization(
        makeMetrics({
          successRate: 1.0,
          usageCount: 10,
          userSatisfaction: SKILL_OPTIMIZATION_SATISFACTION_THRESHOLD,
          trend: 'stable',
        }),
      );
      expect(result.needed).toBe(false);
    });

    it('满意度略低于 3.5 时应触发优化', () => {
      const result = evaluator.needsOptimization(
        makeMetrics({
          successRate: 1.0,
          usageCount: 10,
          userSatisfaction: 3.49,
          trend: 'stable',
        }),
      );
      expect(result.needed).toBe(true);
      expect(result.reasons).toContainEqual(
        expect.stringContaining('satisfaction_low'),
      );
    });

    it('满意度等于 0 时不应触发满意度优化（无评分数据）', () => {
      const result = evaluator.needsOptimization(
        makeMetrics({
          successRate: 1.0,
          usageCount: 10,
          userSatisfaction: 0,
          trend: 'stable',
        }),
      );
      expect(result.needed).toBe(false);
    });

    it('满意度为 1（最低有效评分）时应触发优化', () => {
      const result = evaluator.needsOptimization(
        makeMetrics({
          successRate: 1.0,
          usageCount: 10,
          userSatisfaction: 1.0,
          trend: 'stable',
        }),
      );
      expect(result.needed).toBe(true);
    });
  });

  describe('trend 边界', () => {
    it('trend 为 improving 时不应触发优化', () => {
      const result = evaluator.needsOptimization(
        makeMetrics({
          successRate: 1.0,
          usageCount: 10,
          userSatisfaction: 5.0,
          trend: 'improving',
        }),
      );
      expect(result.needed).toBe(false);
    });

    it('trend 为 stable 时不应触发耗时优化', () => {
      const result = evaluator.needsOptimization(
        makeMetrics({
          successRate: 1.0,
          usageCount: 10,
          userSatisfaction: 5.0,
          trend: 'stable',
        }),
      );
      expect(result.needed).toBe(false);
    });
  });

  describe('多个原因同时触发', () => {
    it('成功率低 + 满意度低 + declining 趋势应同时触发三个原因', () => {
      const result = evaluator.needsOptimization(
        makeMetrics({
          successRate: 0.3,
          usageCount: 10,
          userSatisfaction: 2.0,
          trend: 'declining',
        }),
      );
      expect(result.needed).toBe(true);
      expect(result.reasons).toHaveLength(3);
      expect(result.reasons).toContainEqual(
        expect.stringContaining('success_rate_low'),
      );
      expect(result.reasons).toContainEqual(
        expect.stringContaining('duration_increasing'),
      );
      expect(result.reasons).toContainEqual(
        expect.stringContaining('satisfaction_low'),
      );
    });

    it('成功率低 + declining 趋势（无满意度评分）应触发两个原因', () => {
      const result = evaluator.needsOptimization(
        makeMetrics({
          successRate: 0.3,
          usageCount: 10,
          userSatisfaction: 0,
          trend: 'declining',
        }),
      );
      expect(result.needed).toBe(true);
      expect(result.reasons).toHaveLength(2);
    });
  });

  describe('reasons 格式验证', () => {
    it('成功率原因应包含百分比数值', () => {
      const result = evaluator.needsOptimization(
        makeMetrics({
          successRate: 0.5,
          usageCount: 5,
          userSatisfaction: 0,
          trend: 'stable',
        }),
      );
      expect(result.reasons[0]).toContain('50.0%');
      expect(result.reasons[0]).toContain('70%');
    });

    it('满意度原因应包含数值', () => {
      const result = evaluator.needsOptimization(
        makeMetrics({
          successRate: 1.0,
          usageCount: 10,
          userSatisfaction: 2.5,
          trend: 'stable',
        }),
      );
      expect(result.reasons[0]).toContain('2.5');
      expect(result.reasons[0]).toContain('3.5');
    });
  });
});
