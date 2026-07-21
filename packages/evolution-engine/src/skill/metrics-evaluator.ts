import type {
  SkillMetrics,
  SkillEvaluationResult,
  EvolutionConfig,
} from '@crab-science/shared';
import {
  SKILL_OPTIMIZATION_SUCCESS_RATE_THRESHOLD,
  SKILL_OPTIMIZATION_DURATION_INCREASE_THRESHOLD,
  SKILL_OPTIMIZATION_SATISFACTION_THRESHOLD,
} from '@crab-science/shared';
import type { SkillMetricsRepository } from '@crab-science/storage';

/**
 * Skill 效果评估器
 *
 * 从 SkillMetricsRepository 获取指标，判断是否需要优化。
 */
export class SkillMetricsEvaluator {
  private skillMetricsRepo: SkillMetricsRepository;
  private config: EvolutionConfig;

  constructor(
    skillMetricsRepo: SkillMetricsRepository,
    config: EvolutionConfig = {},
  ) {
    this.skillMetricsRepo = skillMetricsRepo;
    this.config = config;
  }

  /**
   * 评估指定 Skill
   * @param skillName - Skill 名称
   * @returns 评估结果
   */
  evaluate(skillName: string): SkillEvaluationResult {
    const metrics = this.skillMetricsRepo.getMetrics(skillName);
    const { needed, reasons } = this.needsOptimization(metrics);

    return {
      skillName,
      metrics,
      needsOptimization: needed,
      triggerReasons: reasons,
    };
  }

  /**
   * 评估所有 Skill
   * @returns 所有 Skill 的评估结果数组
   */
  evaluateAll(): SkillEvaluationResult[] {
    const skillNames = this.skillMetricsRepo.getAllSkillNames();
    return skillNames.map((name) => this.evaluate(name));
  }

  /**
   * 检查是否需要优化（基于阈值）
   * @param metrics - Skill 指标
   * @returns 是否需要优化及触发原因
   */
  needsOptimization(metrics: SkillMetrics): {
    needed: boolean;
    reasons: string[];
  } {
    const reasons: string[] = [];

    // 成功率 < 70%
    if (
      metrics.usageCount >= 3 &&
      metrics.successRate < SKILL_OPTIMIZATION_SUCCESS_RATE_THRESHOLD
    ) {
      reasons.push(
        `success_rate_low: 成功率 ${(metrics.successRate * 100).toFixed(1)}% < ${(SKILL_OPTIMIZATION_SUCCESS_RATE_THRESHOLD * 100)}%`,
      );
    }

    // 耗时趋势上升 > 20%
    if (metrics.trend === 'declining') {
      reasons.push('duration_increasing: 耗时呈上升趋势');
    }

    // 满意度 < 3.5
    if (
      metrics.userSatisfaction > 0 &&
      metrics.userSatisfaction < SKILL_OPTIMIZATION_SATISFACTION_THRESHOLD
    ) {
      reasons.push(
        `satisfaction_low: 满意度 ${metrics.userSatisfaction.toFixed(1)} < ${SKILL_OPTIMIZATION_SATISFACTION_THRESHOLD}`,
      );
    }

    return {
      needed: reasons.length > 0,
      reasons,
    };
  }
}
