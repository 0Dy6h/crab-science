import type { EvolutionConfig } from '@crab-science/shared';
import {
  SKILL_VALIDATION_WINDOW,
  SKILL_ROLLBACK_SUCCESS_RATE_DROP,
  SKILL_ROLLBACK_SATISFACTION_DROP,
} from '@crab-science/shared';
import type { SkillMetricsRepository } from '@crab-science/storage';
import type { SkillVersioner } from './skill-versioner.js';

/**
 * Skill 版本验证器
 *
 * 职责：
 * 1. 检查新版本是否在验证窗口内
 * 2. 累积 N 次执行后对比指标
 * 3. 不达标则触发回滚
 */
export class SkillValidator {
  private skillMetricsRepo: SkillMetricsRepository;
  private skillVersioner: SkillVersioner;
  private config: EvolutionConfig;

  constructor(
    skillMetricsRepo: SkillMetricsRepository,
    skillVersioner: SkillVersioner,
    config: EvolutionConfig = {},
  ) {
    this.skillMetricsRepo = skillMetricsRepo;
    this.skillVersioner = skillVersioner;
    this.config = config;
  }

  /**
   * 检查新版本是否需要验证
   * @param skillName - Skill 名称
   * @returns 验证状态和已累积的执行次数
   */
  checkValidationStatus(skillName: string): {
    pending: boolean;
    executionsSinceVersion: number;
    windowSize: number;
  } {
    const windowSize = this.config.skillValidationWindow ?? SKILL_VALIDATION_WINDOW;
    const metric = this.skillMetricsRepo.getOrCreateSkillMetricRecord(skillName);

    if (!metric.pendingValidation) {
      return {
        pending: false,
        executionsSinceVersion: 0,
        windowSize,
      };
    }

    // 查询自版本创建以来的执行次数
    const currentVersion = metric.currentVersion;
    const executions = this.skillMetricsRepo.queryExecutions(skillName, {
      sinceVersion: currentVersion,
      limit: 1000,
    });

    return {
      pending: true,
      executionsSinceVersion: executions.length,
      windowSize,
    };
  }

  /**
   * 执行验证判定
   * 累积 N 次执行后对比指标，不达标则触发回滚
   * @param skillName - Skill 名称
   * @returns 验证结果
   */
  async validate(skillName: string): Promise<{
    passed: boolean;
    rolledBack: boolean;
    reason?: string;
  }> {
    const status = this.checkValidationStatus(skillName);

    if (!status.pending) {
      return { passed: true, rolledBack: false };
    }

    // 未达到验证窗口，继续等待
    if (status.executionsSinceVersion < status.windowSize) {
      return {
        passed: true,
        rolledBack: false,
        reason: `等待更多执行数据 (${status.executionsSinceVersion}/${status.windowSize})`,
      };
    }

    // 获取指标对比
    const metric = this.skillMetricsRepo.getOrCreateSkillMetricRecord(skillName);
    const currentVersion = metric.currentVersion;
    const previousVersion = currentVersion - 1;

    if (previousVersion < 1) {
      // 没有前一版本可对比，直接通过
      this.skillMetricsRepo.updateSkillMetric(skillName, {
        pendingValidation: false,
      });
      return { passed: true, rolledBack: false };
    }

    const comparison = this.skillMetricsRepo.getVersionComparison(
      skillName,
      previousVersion,
      currentVersion,
    );

    // 计算成功率相对下降
    const v1SuccessRate = comparison.v1.successRate;
    const v2SuccessRate = comparison.v2.successRate;
    const successRateDrop =
      v1SuccessRate > 0
        ? (v1SuccessRate - v2SuccessRate) / v1SuccessRate
        : 0;

    // 计算满意度绝对下降
    const satisfactionDrop =
      comparison.v1.userSatisfaction - comparison.v2.userSatisfaction;

    // 判断回滚条件
    const shouldRollback =
      successRateDrop > SKILL_ROLLBACK_SUCCESS_RATE_DROP ||
      satisfactionDrop > SKILL_ROLLBACK_SATISFACTION_DROP;

    if (shouldRollback) {
      const reasons: string[] = [];
      if (successRateDrop > SKILL_ROLLBACK_SUCCESS_RATE_DROP) {
        reasons.push(
          `成功率下降 ${((successRateDrop * 100).toFixed(1))}% > ${(SKILL_ROLLBACK_SUCCESS_RATE_DROP * 100)}%`,
        );
      }
      if (satisfactionDrop > SKILL_ROLLBACK_SATISFACTION_DROP) {
        reasons.push(
          `满意度下降 ${satisfactionDrop.toFixed(1)} > ${SKILL_ROLLBACK_SATISFACTION_DROP}`,
        );
      }

      // 触发回滚
      try {
        await this.skillVersioner.rollback(skillName, previousVersion);

        // 更新指标状态
        this.skillMetricsRepo.updateSkillMetric(skillName, {
          pendingValidation: false,
          currentVersion: previousVersion,
        });

        return {
          passed: false,
          rolledBack: true,
          reason: `自动回滚到 v${previousVersion}: ${reasons.join(', ')}`,
        };
      } catch (err) {
        console.error(`[SkillValidator] 回滚失败 (${skillName}):`, err);
        return {
          passed: false,
          rolledBack: false,
          reason: `回滚失败: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }

    // 指标改善或持平，版本确认
    this.skillMetricsRepo.updateSkillMetric(skillName, {
      pendingValidation: false,
    });

    return { passed: true, rolledBack: false };
  }

  /**
   * 标记新版本为待验证
   * @param skillName - Skill 名称
   * @param version - 新版本号
   */
  markPendingValidation(skillName: string, version: number): void {
    this.skillMetricsRepo.updateSkillMetric(skillName, {
      pendingValidation: true,
      versionCreatedAt: new Date().toISOString(),
      currentVersion: version,
    });
  }
}
