import type {
  TaskRecord,
  PatternMatch,
  EvolutionConfig,
} from '@crab-science/shared';
import { SUBAGENT_PATTERN_THRESHOLD } from '@crab-science/shared';
import type { SkillMetricsRepository } from '@crab-science/storage';

/**
 * Subagent 模式检测器
 *
 * 从 SQLite 查询最近任务记录，
 * 提取模式签名，聚合相同签名的任务，
 * count ≥ 阈值时生成 PatternMatch。
 */
export class PatternDetector {
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
   * 检测重复模式
   * @returns PatternMatch 数组
   */
  detect(): PatternMatch[] {
    const threshold =
      this.config.subagentPatternThreshold ?? SUBAGENT_PATTERN_THRESHOLD;

    // 获取最近任务记录
    const taskRecords = this.skillMetricsRepo.getRecentTaskRecords(200);

    if (taskRecords.length < threshold) return [];

    // 提取签名并聚合
    const signatureMap = new Map<string, TaskRecord[]>();

    for (const record of taskRecords) {
      const signature = this.extractSignature(record);
      if (!signatureMap.has(signature)) {
        signatureMap.set(signature, []);
      }
      signatureMap.get(signature)!.push(record);
    }

    // 筛选 count ≥ threshold 的模式
    const patterns: PatternMatch[] = [];

    for (const [signature, matchingTasks] of signatureMap) {
      if (matchingTasks.length >= threshold) {
        const pattern: PatternMatch = {
          signature,
          matchingTasks,
          count: matchingTasks.length,
          suggestedName: this.generateSuggestedName(signature),
          suggestedDescription: this.generateSuggestedDescription(matchingTasks),
        };
        patterns.push(pattern);
      }
    }

    // 按出现次数排序
    patterns.sort((a, b) => b.count - a.count);

    return patterns;
  }

  /**
   * 提取任务模式签名
   * 格式：{skillUsed}|{toolsUsed.sort().join(',')}|{taskType}
   *
   * @param task - 任务记录
   * @returns 模式签名
   */
  private extractSignature(task: TaskRecord): string {
    const skill = task.skillUsed ?? 'none';
    const tools = (task.toolsUsed || []).slice().sort().join(',') || 'none';
    const taskType = this.inferTaskType(task.task);

    return `${skill}|${tools}|${taskType}`;
  }

  /**
   * 通过简单关键词匹配推断任务类型
   */
  private inferTaskType(task: string): string {
    const lowerTask = task.toLowerCase();

    if (/搜索|检索|search|find|lookup/.test(lowerTask)) return 'search';
    if (/分析|analyze|analysis|统计/.test(lowerTask)) return 'analysis';
    if (/写|write|draft|撰写|编写/.test(lowerTask)) return 'write';
    if (/读|read|加载|load/.test(lowerTask)) return 'read';
    if (/测试|test|验证|verify/.test(lowerTask)) return 'test';
    if (/转换|convert|transform|格式化/.test(lowerTask)) return 'transform';

    return 'general';
  }

  /**
   * 生成建议的 Subagent 名称
   */
  private generateSuggestedName(signature: string): string {
    const parts = signature.split('|');
    const taskType = parts[2] || 'general';
    const skill = parts[0] !== 'none' ? parts[0] : '';

    const name = skill
      ? `${skill}-${taskType}-agent`
      : `${taskType}-agent`;

    return name.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  }

  /**
   * 生成建议的描述
   */
  private generateSuggestedDescription(tasks: TaskRecord[]): string {
    const sampleTask = tasks[0]?.task ?? '';
    const truncated =
      sampleTask.length > 60 ? sampleTask.substring(0, 60) + '...' : sampleTask;

    return `自动检测到的重复任务模式（出现 ${tasks.length} 次），典型任务: "${truncated}"`;
  }
}
