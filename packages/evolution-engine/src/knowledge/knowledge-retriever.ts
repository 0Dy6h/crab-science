import type { Experience, EvolutionConfig } from '@crab-science/shared';
import {
  EXPERIENCE_INJECTION_TOP_K,
  EXPERIENCE_INJECTION_TOKEN_BUDGET,
  estimateTokens,
} from '@crab-science/shared';
import type {
  ExperienceRepository,
  KnowledgeRepository,
} from '@crab-science/storage';

/** outcome 图标映射 */
const OUTCOME_ICONS: Record<string, string> = {
  success: '✓',
  partial: '◐',
  failure: '✗',
};

/** outcome 中文标签 */
const OUTCOME_LABELS: Record<string, string> = {
  success: '成功',
  partial: '部分',
  failure: '失败',
};

/**
 * 经验检索注入器
 *
 * 检索相关经验并格式化为注入文本，
 * 控制在 token 预算内。
 */
export class KnowledgeRetriever {
  private experienceRepo: ExperienceRepository;
  private knowledgeRepo: KnowledgeRepository;
  private config: EvolutionConfig;

  constructor(
    experienceRepo: ExperienceRepository,
    knowledgeRepo: KnowledgeRepository,
    config: EvolutionConfig = {},
  ) {
    this.experienceRepo = experienceRepo;
    this.knowledgeRepo = knowledgeRepo;
    this.config = config;
  }

  /**
   * 检索相关经验（top-K）
   * @param taskDescription - 任务描述
   * @param topK - 返回数量（可选，默认使用配置值）
   * @returns 相关经验数组
   */
  retrieve(taskDescription: string, topK?: number): Experience[] {
    const k = topK ?? this.config.experienceInjectionTopK ?? EXPERIENCE_INJECTION_TOP_K;

    // 从任务描述提取关键词
    const keywords = this.extractKeywords(taskDescription);

    if (keywords.length === 0) {
      // 无关键词，返回最近经验
      return this.experienceRepo.getRecent(k);
    }

    // 按关键词检索
    const keywordMatches = this.experienceRepo.findByTaskKeywords(keywords, 20);

    // 对每条匹配经验，通过知识图谱扩展相关经验
    const expanded = new Map<string, Experience>();
    for (const exp of keywordMatches) {
      if (!expanded.has(exp.id)) {
        expanded.set(exp.id, exp);
      }

      // 通过边扩展
      const related = this.knowledgeRepo.findRelated(exp.id, 3);
      for (const rel of related) {
        if (!expanded.has(rel.id)) {
          expanded.set(rel.id, rel);
        }
      }
    }

    // 按相关性排序（关键词匹配数 + 时间近度）
    const sorted = Array.from(expanded.values()).sort((a, b) => {
      // 先按 outcome 优先级：success > partial > failure
      const outcomeOrder = { success: 0, partial: 1, failure: 2 };
      const outcomeDiff =
        outcomeOrder[a.outcome] - outcomeOrder[b.outcome];
      if (outcomeDiff !== 0) return outcomeDiff;

      // 再按时间倒序
      return b.timestamp.localeCompare(a.timestamp);
    });

    return sorted.slice(0, k);
  }

  /**
   * 格式化经验为注入文本
   * @param experiences - 经验数组
   * @returns 格式化的注入文本
   */
  formatForInjection(experiences: Experience[]): string {
    if (experiences.length === 0) return '';

    const budget =
      this.config.experienceInjectionTokenBudget ??
      EXPERIENCE_INJECTION_TOKEN_BUDGET;

    const lines: string[] = ['# 相关经验（自动检索）'];

    for (const exp of experiences) {
      const icon = OUTCOME_ICONS[exp.outcome] ?? '•';
      const label = OUTCOME_LABELS[exp.outcome] ?? exp.outcome;

      // 截断 task
      const task = exp.task.length > 50
        ? exp.task.substring(0, 50) + '...'
        : exp.task;

      // 截断 keyLearnings
      const learnings = exp.keyLearnings
        .slice(0, 3)
        .map((l) => (l.length > 80 ? l.substring(0, 80) + '...' : l))
        .join('; ');

      const line = `- [${label}] ${task} → 关键经验: ${learnings || '无'}`;

      // token 预算检查
      const testText = lines.join('\n') + '\n' + line;
      if (!this.checkTokenBudget(testText, budget)) {
        // 超出预算，停止添加
        break;
      }

      lines.push(line);
    }

    return lines.join('\n');
  }

  /**
   * token 预算检查
   * @param text - 待检查文本
   * @param budget - token 预算
   * @returns 是否在预算内
   */
  private checkTokenBudget(text: string, budget: number): boolean {
    return estimateTokens(text) <= budget;
  }

  /**
   * 从任务描述提取关键词
   * 简单分词：按空格和标点分割，过滤停用词
   */
  private extractKeywords(text: string): string[] {
    if (!text) return [];

    // 按空格、标点分割
    const words = text
      .toLowerCase()
      .split(/[\s,，。.!！?？;；:："'""''()\[\]{}]+/)
      .filter((w) => w.length >= 2);

    // 停用词
    const stopWords = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
      '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都',
      '一', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着',
      'help', 'me', 'please', 'this', 'that', 'with', 'for', 'from',
      '帮我', '请', '可以', '需要', '什么', '怎么', '如何',
    ]);

    return words.filter((w) => !stopWords.has(w));
  }
}
