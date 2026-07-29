import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import matter from 'gray-matter';
import type {
  OptimizationSuggestion,
  SkillExecutionRecord,
  SkillEvaluationResult,
} from '@crab-science/shared';
import { generateId, nowISO } from '@crab-science/shared';
import type { LLMProvider, LLMOptions } from '@crab-science/llm-layer';
import type { SkillMetricsRepository } from '@crab-science/storage';

/**
 * Skill 优化建议生成器
 *
 * 调用 evolutionProvider LLM 分析历史执行记录，
 * 生成结构化的优化建议。
 */
export class SkillOptimizer {
  private provider: LLMProvider;
  private skillMetricsRepo: SkillMetricsRepository;
  private model: string;
  private workDir: string;

  constructor(
    provider: LLMProvider,
    skillMetricsRepo: SkillMetricsRepository,
    model: string,
    workDir?: string,
  ) {
    this.provider = provider;
    this.skillMetricsRepo = skillMetricsRepo;
    this.model = model;
    this.workDir = workDir ?? process.cwd();
  }

  /**
   * 生成优化建议
   * @param skillName - Skill 名称
   * @param evaluation - 评估结果
   * @returns 优化建议，生成失败返回 null
   */
  async generateSuggestion(
    skillName: string,
    evaluation: SkillEvaluationResult,
  ): Promise<OptimizationSuggestion | null> {
    try {
      // 查询最近 20 条执行记录
      const records = this.skillMetricsRepo.queryExecutions(skillName, {
        limit: 20,
      });

      // 识别失败模式
      const failurePatterns = this.identifyFailurePatterns(records);

      // 读取当前 SKILL.md 内容
      const skillContent = this.readSkillContent(skillName);

      // 构建 LLM prompt
      const prompt = this.buildPrompt(
        skillName,
        skillContent,
        evaluation,
        records,
        failurePatterns,
      );

      // 调用 LLM
      const response = await this.callLLM(prompt);

      if (!response) return null;

      // 解析 LLM 返回的 JSON
      const parsed = this.parseSuggestionResponse(response, skillName, evaluation);

      return parsed;
    } catch (err) {
      console.error(`[SkillOptimizer] 生成建议失败 (${skillName}):`, err);
      return null;
    }
  }

  /**
   * 从历史执行记录中识别失败模式
   * @param records - 执行记录数组
   * @returns 失败模式描述数组
   */
  private identifyFailurePatterns(records: SkillExecutionRecord[]): string[] {
    const patterns: string[] = [];

    // 筛选失败/部分成功的记录
    const failedRecords = records.filter(
      (r) => r.status === 'failed' || r.status === 'partial',
    );

    if (failedRecords.length === 0) return patterns;

    // 1. 相同 error 信息出现 ≥ 3 次 → failure pattern
    const errorMap = new Map<string, number>();
    for (const record of failedRecords) {
      if (record.error) {
        // 取 error 的前 80 字符作为 key
        const errorKey = record.error.substring(0, 80);
        errorMap.set(errorKey, (errorMap.get(errorKey) ?? 0) + 1);
      }
    }

    for (const [errorKey, count] of errorMap) {
      if (count >= 3) {
        patterns.push(`repeated_error: "${errorKey}" 出现 ${count} 次`);
      }
    }

    // 2. 相同步骤失败 → step-level pattern
    const stepFailMap = new Map<string, number>();
    for (const record of failedRecords) {
      if (record.steps && record.steps.length > 0) {
        // 取最后一步作为失败步骤
        const lastStep = record.steps[record.steps.length - 1];
        stepFailMap.set(lastStep, (stepFailMap.get(lastStep) ?? 0) + 1);
      }
    }

    for (const [step, count] of stepFailMap) {
      if (count >= 2) {
        patterns.push(`step_failure: 步骤 "${step}" 失败 ${count} 次`);
      }
    }

    // 3. 整体失败率
    if (records.length >= 5) {
      const failRate = failedRecords.length / records.length;
      if (failRate > 0.3) {
        patterns.push(
          `high_failure_rate: 失败率 ${(failRate * 100).toFixed(0)}% (${failedRecords.length}/${records.length})`,
        );
      }
    }

    return patterns;
  }

  /**
   * 读取 SKILL.md 内容
   */
  private readSkillContent(skillName: string): string {
    const possiblePaths = [
      path.join(this.workDir, 'skills', skillName, 'SKILL.md'),
      path.join(
        os.homedir(),
        '.crab-science',
        'skills',
        skillName,
        'SKILL.md',
      ),
    ];

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        return fs.readFileSync(p, 'utf-8');
      }
    }

    return `[SKILL.md not found for ${skillName}]`;
  }

  /**
   * 构建 LLM prompt
   */
  private buildPrompt(
    skillName: string,
    skillContent: string,
    evaluation: SkillEvaluationResult,
    records: SkillExecutionRecord[],
    failurePatterns: string[],
  ): string {
    const recentExecutions = records
      .slice(0, 10)
      .map(
        (r, i) =>
          `  ${i + 1}. [${r.status}] ${r.task} (${(r.durationMs / 1000).toFixed(1)}s)${r.error ? ` — 错误: ${r.error.substring(0, 100)}` : ''}`,
      )
      .join('\n');

    const metrics = evaluation.metrics;

    return `你是一个 Skill 优化专家。请分析以下 Skill 的执行数据，生成一个结构化的优化建议。

## Skill 名称
${skillName}

## 当前 SKILL.md 内容
${skillContent}

## 执行指标
- 成功率: ${(metrics.successRate * 100).toFixed(1)}%
- 平均耗时: ${(metrics.avgDuration / 1000).toFixed(1)}s
- 执行次数: ${metrics.usageCount}
- 用户满意度: ${metrics.userSatisfaction.toFixed(1)}/5
- 趋势: ${metrics.trend}

## 触发优化的原因
${evaluation.triggerReasons.join('\n') || '无'}

## 识别的失败模式
${failurePatterns.join('\n') || '无'}

## 最近执行记录
${recentExecutions || '无'}

请分析以上数据，返回一个 JSON 对象（不要包含其他文本），格式如下：
{
  "severity": "minor" 或 "major",
  "section": "要修改的段落标识（如 '工作流程' 或 '错误处理'）",
  "suggestion": "具体的修改建议（如果是 minor，描述具体的文本修改；如果是 major，描述步骤级变更）",
  "rationale": "修改理由"
}

注意：
- severity 为 "minor" 表示单段落修改、措辞调整、补充说明
- severity 为 "major" 表示修改核心步骤、新增/删除步骤、改变工具使用`;
  }

  /**
   * 调用 LLM
   */
  private async callLLM(prompt: string): Promise<string | null> {
    const options: LLMOptions = {
      model: this.model,
      systemPrompt:
        '你是一个 Skill 优化专家。请分析数据并返回 JSON 格式的优化建议。',
      temperature: 0.3,
      maxTokens: 1024,
    };

    let result = '';
    try {
      const stream = this.provider.complete(
        [{ role: 'user', content: prompt }],
        options,
      );

      for await (const event of stream) {
        if (event.type === 'text_delta') {
          result += event.content;
        }
      }
    } catch (err) {
      console.error('[SkillOptimizer] LLM 调用失败:', err);
      return null;
    }

    return result;
  }

  /**
   * 解析 LLM 返回的建议
   */
  private parseSuggestionResponse(
    response: string,
    skillName: string,
    evaluation: SkillEvaluationResult,
  ): OptimizationSuggestion | null {
    try {
      // 尝试提取 JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      const parsed = JSON.parse(jsonMatch[0]) as {
        severity: 'minor' | 'major';
        section: string;
        suggestion: string;
        rationale: string;
      };

      return {
        id: generateId('sug'),
        skillName,
        currentVersion: 1, // 将在 SkillVersioner 中更新
        severity: parsed.severity,
        section: parsed.section,
        suggestion: parsed.suggestion,
        rationale: parsed.rationale,
        failurePatterns: evaluation.triggerReasons,
        createdAt: nowISO(),
      };
    } catch {
      return null;
    }
  }
}
