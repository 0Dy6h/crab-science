import type {
  TaskInfo,
  EvolutionEvent,
  EvolutionEventCallback,
  EvolutionConfig,
  SkillExecutionRecord,
  ChangeEntry,
  Experience,
  PatternMatch,
  AppConfig,
  GitLogEntry,
} from '@crab-science/shared';
import { nowISO } from '@crab-science/shared';
import type { LLMProvider } from '@crab-science/llm-layer';
import type {
  CrabDatabase,
  GitManager,
  KnowledgeRepository,
} from '@crab-science/storage';
import {
  ExperienceRepository,
  SkillMetricsRepository,
  KnowledgeRepository as KnowledgeRepoClass,
} from '@crab-science/storage';
import { SkillMetricsEvaluator } from './skill/metrics-evaluator.js';
import { SkillOptimizer } from './skill/skill-optimizer.js';
import { SkillVersioner } from './skill/skill-versioner.js';
import { SkillValidator } from './skill/skill-validator.js';
import { ExperienceExtractor } from './knowledge/experience-extractor.js';
import { KnowledgeGraph } from './knowledge/knowledge-graph.js';
import { KnowledgeRetriever } from './knowledge/knowledge-retriever.js';
import { PatternDetector } from './subagent/pattern-detector.js';
import { SubagentCreator } from './subagent/subagent-creator.js';
import type { SubagentDelegator } from './subagent/subagent-delegator.js';
import { SubagentEvaluator } from './subagent/subagent-evaluator.js';
import type { Session } from '@crab-science/shared';

/**
 * EvolutionEngine — 进化引擎中央调度器
 *
 * 职责：
 * 1. onTaskComplete() — 任务完成后异步触发进化流程（fire-and-forget）
 * 2. 协调 Skill 评估 → 优化 → 验证 → 回滚
 * 3. 协调 Subagent 模式检测 → 创建
 * 4. 协调 Knowledge 经验提取 → 知识图谱建边
 * 5. 通过事件回调通知 CLI 层
 *
 * 三层进化：
 * - Skill 层：指标评估 → 优化建议 → 版本迭代 → 验证窗口 → 自动回滚
 * - Subagent 层：模式检测 → 草案生成 → 用户确认 → 创建
 * - Knowledge 层：经验提取 → 知识图谱建边 → 检索注入
 */
export class EvolutionEngine {
  // 存储层
  private database: CrabDatabase;
  private gitManager: GitManager;
  private experienceRepo: ExperienceRepository;
  private skillMetricsRepo: SkillMetricsRepository;
  private knowledgeRepo: KnowledgeRepository;

  // Skill 进化模块
  private metricsEvaluator: SkillMetricsEvaluator;
  private skillOptimizer: SkillOptimizer;
  private skillVersioner: SkillVersioner;
  private skillValidator: SkillValidator;

  // Knowledge 模块
  private experienceExtractor: ExperienceExtractor;
  private knowledgeGraph: KnowledgeGraph;
  private knowledgeRetriever: KnowledgeRetriever;

  // Subagent 模块
  private patternDetector: PatternDetector;
  private subagentCreator: SubagentCreator;
  private subagentDelegator: SubagentDelegator | null;
  private subagentEvaluator: SubagentEvaluator;

  // 配置
  private config: EvolutionConfig;
  private evolutionProvider: LLMProvider;
  private evolutionModel: string;
  private workDir: string;

  // 状态
  private taskCounter = 0;
  private eventCallbacks: EvolutionEventCallback[] = [];
  private changelog: ChangeEntry[] = [];
  private isEvaluating = false;

  constructor(options: {
    database: CrabDatabase;
    gitManager: GitManager;
    evolutionProvider: LLMProvider;
    evolutionModel: string;
    config: EvolutionConfig;
    workDir?: string;
    subagentDelegator?: SubagentDelegator;
  }) {
    this.database = options.database;
    this.gitManager = options.gitManager;
    this.evolutionProvider = options.evolutionProvider;
    this.evolutionModel = options.evolutionModel;
    this.workDir = options.workDir ?? process.cwd();
    this.config = options.config;
    this.subagentDelegator = options.subagentDelegator ?? null;

    // 初始化 Repositories
    this.experienceRepo = new ExperienceRepository(this.database);
    this.skillMetricsRepo = new SkillMetricsRepository(this.database);
    this.knowledgeRepo = new KnowledgeRepoClass(this.database);

    // 初始化 Skill 进化模块
    this.metricsEvaluator = new SkillMetricsEvaluator(
      this.skillMetricsRepo,
      this.config,
    );
    this.skillOptimizer = new SkillOptimizer(
      this.evolutionProvider,
      this.skillMetricsRepo,
      this.evolutionModel,
      this.workDir,
    );
    this.skillVersioner = new SkillVersioner(this.gitManager, this.workDir);
    this.skillValidator = new SkillValidator(
      this.skillMetricsRepo,
      this.skillVersioner,
      this.config,
    );

    // 初始化 Knowledge 模块
    this.knowledgeGraph = new KnowledgeGraph(
      this.knowledgeRepo,
      this.experienceRepo,
    );
    this.experienceExtractor = new ExperienceExtractor(
      this.evolutionProvider,
      this.experienceRepo,
      this.knowledgeGraph,
      this.evolutionModel,
    );
    this.knowledgeRetriever = new KnowledgeRetriever(
      this.experienceRepo,
      this.knowledgeRepo,
      this.config,
    );

    // 初始化 Subagent 模块
    this.patternDetector = new PatternDetector(
      this.skillMetricsRepo,
      this.config,
    );
    this.subagentCreator = new SubagentCreator(
      this.evolutionProvider,
      this.gitManager,
      this.evolutionModel,
    );
    this.subagentEvaluator = new SubagentEvaluator(this.database);
  }

  // ============================================================
  // 事件系统
  // ============================================================

  /**
   * 注册事件回调
   * @param callback - 事件回调函数
   */
  onEvent(callback: EvolutionEventCallback): void {
    this.eventCallbacks.push(callback);
  }

  /**
   * 触发事件
   * @param event - 进化事件
   */
  private emit(event: EvolutionEvent): void {
    for (const callback of this.eventCallbacks) {
      try {
        callback(event);
      } catch (err) {
        console.error('[EvolutionEngine] 事件回调异常:', err);
      }
    }
  }

  // ============================================================
  // 核心入口：onTaskComplete
  // ============================================================

  /**
   * 任务完成后的异步触发（fire-and-forget）
   *
   * 流程：
   * 1. 记录执行到 SQLite
   * 2. 提取经验
   * 3. 递增任务计数器
   * 4. 每 taskInterval 次任务触发完整评估
   * 5. 检查 Skill 版本验证窗口
   * 6. 每 ratingInterval 次任务请求用户评分
   *
   * @param session - 当前 Session
   * @param taskInfo - 任务信息
   */
  async onTaskComplete(session: Session, taskInfo: TaskInfo): Promise<void> {
    // fire-and-forget：不阻塞主循环
    this.processTaskComplete(session, taskInfo).catch((err) => {
      console.error('[EvolutionEngine] onTaskComplete 异常:', err);
    });
  }

  /**
   * 实际处理任务完成（异步执行）
   */
  private async processTaskComplete(
    session: Session,
    taskInfo: TaskInfo,
  ): Promise<void> {
    // 1. 记录执行到 SQLite（如果有 skillUsed）
    if (taskInfo.skillUsed) {
      // 读取该 Skill 当前版本，避免所有执行都记为 v1（否则验证窗口永不闭合、自动回滚永不触发）
      let skillVersion = 1;
      try {
        skillVersion = this.skillMetricsRepo.getOrCreateSkillMetricRecord(
          taskInfo.skillUsed,
        ).currentVersion;
      } catch (err) {
        console.error('[EvolutionEngine] 读取 Skill 版本失败，回退到 v1:', err);
      }

      const executionRecord: Omit<SkillExecutionRecord, 'id' | 'timestamp'> = {
        skillName: taskInfo.skillUsed,
        task: taskInfo.task,
        steps: [],
        durationMs: taskInfo.duration,
        status:
          taskInfo.outcome === 'success'
            ? 'success'
            : taskInfo.outcome === 'partial'
              ? 'partial'
              : 'failed',
        tokenUsage: undefined,
        adopted: taskInfo.outcome === 'success',
        rating: 0,
        skillVersion,
        sessionId: taskInfo.sessionId,
      };

      try {
        this.skillMetricsRepo.insertExecution(executionRecord);
      } catch (err) {
        console.error('[EvolutionEngine] 记录执行失败:', err);
      }
    }

    // 2. 提取经验
    try {
      const experience = await this.experienceExtractor.extract(
        session,
        taskInfo,
      );

      if (experience) {
        this.emit({
          type: 'experience_extracted',
          experience,
        });
      }
    } catch (err) {
      console.error('[EvolutionEngine] 经验提取失败:', err);
    }

    // 3. 递增任务计数器
    this.taskCounter++;

    // 4. 检查是否需要触发完整评估
    const taskInterval = this.config.taskInterval ?? 10;
    if (this.taskCounter % taskInterval === 0) {
      await this.runFullEvaluation();
    }

    // 5. 检查 Skill 版本验证窗口
    await this.checkSkillValidations();

    // 6. 每 ratingInterval 次任务请求用户评分
    const ratingInterval = this.config.ratingInterval ?? 3;
    if (this.taskCounter % ratingInterval === 0) {
      this.emit({
        type: 'rating_request',
        taskDescription: taskInfo.task,
      });
    }
  }

  // ============================================================
  // 完整评估流程
  // ============================================================

  /**
   * 运行完整进化评估
   *
   * 1. Skill 评估 → 优化 → 验证
   * 2. Subagent 模式检测 → 创建
   * 3. 生成评估摘要
   */
  async runFullEvaluation(): Promise<void> {
    if (this.isEvaluating) {
      console.log('[EvolutionEngine] 评估正在进行中，跳过本次触发');
      return;
    }

    this.isEvaluating = true;

    try {
      const summaryParts: string[] = [];

      // 1. Skill 评估
      const skillResults = await this.evaluateAndOptimizeSkills();
      if (skillResults.length > 0) {
        summaryParts.push(`Skill 优化: ${skillResults.length} 个`);
      }

      // 2. Subagent 模式检测
      const subagentResults = await this.detectAndCreateSubagents();
      if (subagentResults.length > 0) {
        summaryParts.push(`Subagent 创建: ${subagentResults.length} 个`);
      }

      // 3. 生成评估摘要
      const summary =
        summaryParts.length > 0
          ? `进化评估完成 — ${summaryParts.join(', ')}`
          : '进化评估完成 — 无需优化';

      this.emit({
        type: 'evaluation_complete',
        summary,
      });
    } catch (err) {
      console.error('[EvolutionEngine] 完整评估失败:', err);
    } finally {
      this.isEvaluating = false;
    }
  }

  // ============================================================
  // Skill 进化
  // ============================================================

  /**
   * 评估所有 Skill 并优化需要优化的
   * @returns 优化操作列表
   */
  private async evaluateAndOptimizeSkills(): Promise<string[]> {
    const results: string[] = [];

    try {
      // 评估所有 Skill
      const evaluations = this.metricsEvaluator.evaluateAll();

      for (const evaluation of evaluations) {
        if (!evaluation.needsOptimization) continue;

        // 生成优化建议
        const suggestion = await this.skillOptimizer.generateSuggestion(
          evaluation.skillName,
          evaluation,
        );

        if (!suggestion) continue;

        this.emit({
          type: 'optimization_proposed',
          suggestion,
          skillName: evaluation.skillName,
        });

        // autoApplyMinorChanges 配置
        const autoApply = this.config.autoApplyMinorChanges ?? true;

        if (autoApply && suggestion.severity === 'minor') {
          // 自动应用 minor 优化
          try {
            const { newVersion, commitHash } =
              await this.skillVersioner.applySuggestion(suggestion);

            // 标记为待验证
            this.skillValidator.markPendingValidation(
              evaluation.skillName,
              newVersion,
            );

            this.emit({
              type: 'optimization_applied',
              skillName: evaluation.skillName,
              version: newVersion,
            });

            // 记录变更日志
            this.recordChangelog({
              type: 'skill_optimize',
              target: evaluation.skillName,
              version: newVersion,
              description: suggestion.suggestion,
              commitHash,
              timestamp: nowISO(),
            });

            results.push(
              `${evaluation.skillName} v${newVersion} (minor)`,
            );
          } catch (err) {
            console.error(
              `[EvolutionEngine] 应用优化失败 (${evaluation.skillName}):`,
              err,
            );
          }
        }
        // major 优化需要用户确认，仅记录建议
      }
    } catch (err) {
      console.error('[EvolutionEngine] Skill 评估失败:', err);
    }

    return results;
  }

  /**
   * 检查所有 Skill 的版本验证窗口
   */
  private async checkSkillValidations(): Promise<void> {
    try {
      const skillNames = this.skillMetricsRepo.getAllSkillNames();

      for (const skillName of skillNames) {
        const status = this.skillValidator.checkValidationStatus(skillName);

        if (!status.pending) continue;
        if (status.executionsSinceVersion < status.windowSize) continue;

        // 达到验证窗口，执行验证
        const result = await this.skillValidator.validate(skillName);

        if (result.rolledBack) {
          this.emit({
            type: 'rollback',
            skillName,
            version: 0, // 回滚后的版本号在 result.reason 中
            reason: result.reason ?? '自动回滚',
          });

          this.recordChangelog({
            type: 'skill_rollback',
            target: skillName,
            version: 0,
            description: result.reason ?? '自动回滚',
            timestamp: nowISO(),
          });
        }
      }
    } catch (err) {
      console.error('[EvolutionEngine] 版本验证检查失败:', err);
    }
  }

  // ============================================================
  // Subagent 进化
  // ============================================================

  /**
   * 检测重复模式并创建 Subagent
   * @returns 创建的 Subagent 名称列表
   */
  private async detectAndCreateSubagents(): Promise<string[]> {
    const results: string[] = [];

    try {
      const patterns = this.patternDetector.detect();

      for (const pattern of patterns) {
        this.emit({
          type: 'subagent_proposed',
          pattern,
        });

        // 检查是否已存在同名 Subagent
        const existingNames = this.subagentEvaluator.getAllSubagentNames();
        if (existingNames.includes(pattern.suggestedName)) {
          continue;
        }

        // 生成 Subagent 草案
        const draft = await this.subagentCreator.createDraft(pattern);

        // 自动创建（Phase 3: 简化流程，直接创建）
        try {
          const commitHash = await this.subagentCreator.create(draft);

          this.emit({
            type: 'subagent_created',
            name: draft.meta.name,
          });

          this.recordChangelog({
            type: 'subagent_create',
            target: draft.meta.name,
            version: 1,
            description: `自动创建 Subagent: ${draft.meta.description}`,
            commitHash,
            timestamp: nowISO(),
          });

          results.push(draft.meta.name);
        } catch (err) {
          console.error(
            `[EvolutionEngine] 创建 Subagent 失败 (${pattern.suggestedName}):`,
            err,
          );
        }
      }
    } catch (err) {
      console.error('[EvolutionEngine] 模式检测失败:', err);
    }

    return results;
  }

  // ============================================================
  // Knowledge 检索
  // ============================================================

  /**
   * 检索相关经验（供 ContextBuilder 注入）
   * @param taskDescription - 任务描述
   * @returns 格式化的经验注入文本
   */
  retrieveExperienceForInjection(taskDescription: string): string {
    try {
      const experiences = this.knowledgeRetriever.retrieve(taskDescription);
      return this.knowledgeRetriever.formatForInjection(experiences);
    } catch (err) {
      console.error('[EvolutionEngine] 经验检索失败:', err);
      return '';
    }
  }

  // ============================================================
  // 手动操作接口
  // ============================================================

  /**
   * 手动应用优化建议（用户确认后）
   * @param suggestion - 优化建议
   * @returns 新版本号
   */
  async applyOptimization(
    suggestion: import('@crab-science/shared').OptimizationSuggestion,
  ): Promise<{ newVersion: number; commitHash: string }> {
    const result = await this.skillVersioner.applySuggestion(suggestion);

    this.skillValidator.markPendingValidation(
      suggestion.skillName,
      result.newVersion,
    );

    this.emit({
      type: 'optimization_applied',
      skillName: suggestion.skillName,
      version: result.newVersion,
    });

    this.recordChangelog({
      type: 'skill_optimize',
      target: suggestion.skillName,
      version: result.newVersion,
      description: suggestion.suggestion,
      commitHash: result.commitHash,
      timestamp: nowISO(),
    });

    return result;
  }

  /**
   * 手动回滚 Skill 版本
   * @param skillName - Skill 名称
   * @param targetVersion - 目标版本
   */
  async rollbackSkill(
    skillName: string,
    targetVersion: number,
  ): Promise<void> {
    const commitHash = await this.skillVersioner.rollback(
      skillName,
      targetVersion,
    );

    this.skillMetricsRepo.updateSkillMetric(skillName, {
      pendingValidation: false,
      currentVersion: targetVersion,
    });

    this.emit({
      type: 'rollback',
      skillName,
      version: targetVersion,
      reason: `手动回滚到 v${targetVersion}`,
    });

    this.recordChangelog({
      type: 'skill_rollback',
      target: skillName,
      version: targetVersion,
      description: `手动回滚到 v${targetVersion}`,
      commitHash,
      timestamp: nowISO(),
    });
  }

  /**
   * 提交用户评分
   * @param skillName - Skill 名称
   * @param rating - 评分（1-5）
   * @param executionId - 执行记录 ID（可选）
   */
  submitRating(
    skillName: string,
    rating: number,
    executionId?: string,
  ): void {
    if (executionId) {
      this.skillMetricsRepo.updateExecution(executionId, { rating });
    } else {
      // 更新最近一条执行记录
      const recent = this.skillMetricsRepo.queryExecutions(skillName, {
        limit: 1,
      });
      if (recent.length > 0) {
        this.skillMetricsRepo.updateExecution(recent[0].id, { rating });
      }
    }
  }

  /**
   * 获取所有 Skill 评估结果
   */
  getAllEvaluations(): import('@crab-science/shared').SkillEvaluationResult[] {
    return this.metricsEvaluator.evaluateAll();
  }

  /**
   * 获取所有检测到的模式
   */
  getDetectedPatterns(): PatternMatch[] {
    return this.patternDetector.detect();
  }

  /**
   * 获取 Subagent 指标
   */
  getSubagentMetrics(
    subagentName: string,
  ): import('@crab-science/shared').SubagentMetrics {
    return this.subagentEvaluator.evaluate(subagentName);
  }

  /**
   * 获取最近经验
   */
  getRecentExperiences(limit = 10): Experience[] {
    return this.experienceRepo.getRecent(limit);
  }

  /**
   * 获取变更日志
   */
  getChangelog(): ChangeEntry[] {
    return [...this.changelog];
  }

  /**
   * 获取 Git-backed Skill 版本历史
   */
  async getSkillVersionHistory(skillName: string): Promise<GitLogEntry[]> {
    return this.skillVersioner.getVersionHistory(skillName);
  }

  /**
   * 获取任务计数器
   */
  getTaskCounter(): number {
    return this.taskCounter;
  }

  /**
   * 记录变更日志
   */
  private recordChangelog(entry: ChangeEntry): void {
    this.changelog.unshift(entry);
    // 最多保留 200 条
    if (this.changelog.length > 200) {
      this.changelog = this.changelog.slice(0, 200);
    }
  }

  /**
   * 获取 SubagentDelegator（供外部委派使用）
   */
  getSubagentDelegator(): SubagentDelegator | null {
    return this.subagentDelegator;
  }

  /**
   * 设置 SubagentDelegator（延迟注入，解决循环依赖）
   */
  setSubagentDelegator(delegator: SubagentDelegator): void {
    this.subagentDelegator = delegator;
  }

  /**
   * 记录 Subagent 执行
   */
  recordSubagentExecution(
    record: Omit<import('@crab-science/shared').SubagentExecutionRecord, 'id'>,
  ): void {
    this.subagentEvaluator.recordExecution(record);
  }
}
