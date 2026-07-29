import type {
  Session,
  Message,
  ContentBlock,
  ToolResult,
  TokenUsage,
  AppConfig,
  ToolDefinition,
  TaskInfo,
  SubagentFrontmatter,
} from '@crab-science/shared';
import type { LLMProvider, LLMOptions } from '@crab-science/llm-layer';
import type { ToolRegistry } from './tools/index.js';
import type { SkillLoader } from './skills/loader.js';
import { ContextBuilder } from './context-builder.js';
import { SessionManager } from './session/manager.js';
import type { EvolutionEngine } from '@crab-science/evolution-engine';
import type { SubagentRegistry } from './subagents/registry.js';
import { DelegateTool } from './subagents/delegate-tool.js';

// ============================================================
// Agent 事件类型（Agent → CLI）
// ============================================================

export type AgentEvent =
  | { type: 'text'; content: string }
  | { type: 'tool_call'; name: string; params: Record<string, unknown> }
  | { type: 'tool_result'; name: string; result: ToolResult }
  | { type: 'error'; message: string }
  | { type: 'done'; usage: TokenUsage };

/** 工具调用累积器 */
interface PendingToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/** 内置工具名称集合（用于区分 extension 工具） */
const BUILTIN_TOOL_NAMES = new Set(['read', 'write', 'edit', 'bash']);

/**
 * Agent — 核心循环（Phase 3 进化机制集成）
 *
 * 职责：
 * 1. 构建上下文（系统提示 + 当前路径消息 + skills 元数据 + extension 工具 + subagent 元数据 + 经验注入）
 * 2. 调用 LLM 流式获取响应
 * 3. 解析流式事件，yield AgentEvent 给 CLI
 * 4. 收集工具调用，串行执行
 * 5. 将工具结果回注 session（树形节点），进入下一轮
 * 6. 无工具调用时结束循环
 * 7. 任务完成后触发 EvolutionEngine.onTaskComplete()（fire-and-forget）
 *
 * Phase 3 新增：
 * - Subagent 元数据注入系统提示
 * - 相关经验注入系统提示
 * - Delegate 工具注册
 * - onTaskComplete 异步触发进化引擎
 */
export class Agent {
  private evolutionEngine: EvolutionEngine | null;
  private subagentRegistry: SubagentRegistry | null;

  constructor(
    private provider: LLMProvider,
    private toolRegistry: ToolRegistry,
    private sessionManager: SessionManager,
    private skillLoader: SkillLoader,
    private contextBuilder: ContextBuilder,
    private config: AppConfig,
    evolutionEngine?: EvolutionEngine,
    subagentRegistry?: SubagentRegistry,
  ) {
    this.evolutionEngine = evolutionEngine ?? null;
    this.subagentRegistry = subagentRegistry ?? null;

    // 如果有 SubagentRegistry 和 EvolutionEngine，注册 delegate 工具
    if (this.subagentRegistry && this.evolutionEngine) {
      this.registerDelegateTool();
    }
  }

  /**
   * 注册 delegate 工具
   * 允许 Agent 通过工具调用委派任务给 Subagent
   */
  private registerDelegateTool(): void {
    if (!this.subagentRegistry || !this.evolutionEngine) return;

    const delegator = this.evolutionEngine.getSubagentDelegator();
    if (!delegator) return;

    const delegateTool = new DelegateTool(
      this.subagentRegistry,
      async (session, subagent, task) => {
        const result = await delegator.delegate(session, subagent, task);

        // 记录 Subagent 执行
        this.evolutionEngine!.recordSubagentExecution({
          subagentName: subagent.meta.name,
          timestamp: new Date().toISOString(),
          task,
          sessionId: session.id,
          branchLeafId: result.branchLeafId,
          duration: 0, // 简化：不记录精确耗时
          outcome: result.success ? 'success' : 'failure',
          summary: result.summary,
        });

        return { summary: result.summary, success: result.success };
      },
      () => this.getCurrentSession(),
    );

    this.toolRegistry.register(delegateTool);
  }

  /** 当前 Session 引用（供 delegate 工具使用） */
  private currentSession: Session | null = null;

  /** 获取当前 Session */
  private getCurrentSession(): Session | null {
    return this.currentSession;
  }

  /**
   * 运行 Agent 循环
   * @param session - 当前 Session（树形）
   * @param userInput - 用户输入文本
   * @returns AsyncGenerator<AgentEvent>
   */
  async *run(session: Session, userInput: string): AsyncGenerator<AgentEvent> {
    this.currentSession = session;
    const startTime = Date.now();
    const toolsUsed: string[] = [];
    let subagentUsed: string | null = null;

    // 1. 添加用户消息节点
    this.sessionManager.addNode(session, {
      type: 'user',
      content: userInput,
      metadata: {},
    });

    let iterationCount = 0;
    const maxIterations = this.config.maxIterations;

    while (iterationCount < maxIterations) {
      iterationCount++;

      // 2. 构建 context（从当前路径提取消息 + extension 工具 + subagent 元数据 + 经验注入）
      const skills = this.skillLoader.discover();
      const allTools = this.toolRegistry.getDefinitions();
      const extensionTools = allTools.filter(
        (t) => !BUILTIN_TOOL_NAMES.has(t.name),
      );

      // Phase 3: 获取 Subagent 元数据
      const subagents: SubagentFrontmatter[] | undefined =
        this.subagentRegistry ? this.subagentRegistry.list() : undefined;

      // Phase 3: 获取经验注入文本
      const experienceText: string | undefined =
        this.evolutionEngine
          ? this.evolutionEngine.retrieveExperienceForInjection(userInput)
          : undefined;

      const { systemPrompt, messages } = this.contextBuilder.build(
        session,
        skills,
        this.config,
        extensionTools,
        subagents,
        experienceText,
      );

      // 3. 构建 LLM 调用选项
      const options: LLMOptions = {
        model: session.model,
        systemPrompt,
        tools: this.toolRegistry.getDefinitions(),
        temperature: 0.7,
        maxTokens: 4096,
      };

      // 4. 调用 LLM 流式获取响应
      const textParts: string[] = [];
      const pendingToolCalls: PendingToolCall[] = [];
      const toolNameMap = new Map<string, string>();
      let usage: TokenUsage = { inputTokens: 0, outputTokens: 0, cost: 0 };

      try {
        const stream = this.provider.complete(messages, options);

        for await (const event of stream) {
          switch (event.type) {
            case 'text_delta': {
              textParts.push(event.content);
              yield { type: 'text', content: event.content };
              break;
            }
            case 'tool_call_start': {
              toolNameMap.set(event.toolCallId, event.toolName);
              break;
            }
            case 'tool_call_delta': {
              // 增量参数，StreamParser 内部累积，不需要处理
              break;
            }
            case 'tool_call_end': {
              const name = toolNameMap.get(event.toolCallId) ?? '';
              pendingToolCalls.push({
                id: event.toolCallId,
                name,
                input: event.input,
              });
              break;
            }
            case 'message_end': {
              usage = event.usage;
              break;
            }
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        yield { type: 'error', message: `LLM 调用失败: ${message}` };
        this.sessionManager.save(session);
        await this.triggerEvolution(session, userInput, toolsUsed, subagentUsed, 'failure', startTime);
        return;
      }

      // 更新 session token 统计
      this.sessionManager.updateUsage(
        session,
        usage.inputTokens,
        usage.outputTokens,
        usage.cost,
      );

      // 5. 添加 assistant 消息节点（文本部分）
      if (textParts.length > 0) {
        this.sessionManager.addNode(session, {
          type: 'assistant',
          content: textParts.join(''),
          metadata: {},
        });
      }

      // 6. 添加 tool_call 节点
      for (const tc of pendingToolCalls) {
        this.sessionManager.addNode(session, {
          type: 'tool_call',
          content: '',
          metadata: {
            toolName: tc.name,
            toolParams: tc.input,
            toolCallId: tc.id,
          },
        });

        // 记录使用的工具
        if (!toolsUsed.includes(tc.name)) {
          toolsUsed.push(tc.name);
        }

        // 检测 delegate 工具使用
        if (tc.name === 'delegate' && tc.input.subagent) {
          subagentUsed = tc.input.subagent as string;
        }
      }

      // 7. 检查是否有工具调用
      if (pendingToolCalls.length === 0) {
        // 无工具调用 → 循环结束
        this.sessionManager.save(session);
        yield { type: 'done', usage };

        // Phase 3: 触发进化引擎
        await this.triggerEvolution(
          session,
          userInput,
          toolsUsed,
          subagentUsed,
          'success',
          startTime,
        );
        return;
      }

      // 8. 串行执行工具调用
      for (const tc of pendingToolCalls) {
        yield {
          type: 'tool_call',
          name: tc.name,
          params: tc.input,
        };

        // 执行工具
        const result = await this.toolRegistry.execute(tc.name, tc.input, {
          workDir: this.config.workDir,
          sessionId: session.id,
        });

        yield {
          type: 'tool_result',
          name: tc.name,
          result,
        };

        // 将工具结果回注到 session（树形节点）
        this.sessionManager.addNode(session, {
          type: 'tool_result',
          content: result.success
            ? result.output
            : result.output || result.error || '工具执行失败',
          metadata: {
            toolCallId: tc.id,
            isError: !result.success,
            toolResult: result.output || result.error || '',
          },
        });
      }

      // 继续下一轮循环
    }

    // 达到最大迭代次数
    this.sessionManager.save(session);
    yield {
      type: 'error',
      message: `已达到最大迭代次数 ${maxIterations}，请尝试简化任务或增加配置中的 maxIterations。`,
    };
    yield {
      type: 'done',
      usage: { inputTokens: 0, outputTokens: 0, cost: 0 },
    };

    // Phase 3: 触发进化引擎（partial outcome）
    await this.triggerEvolution(
      session,
      userInput,
      toolsUsed,
      subagentUsed,
      'partial',
      startTime,
    );
  }

  /**
   * 触发进化引擎（fire-and-forget）
   * 在任务完成后异步执行，不阻塞主循环
   */
  private async triggerEvolution(
    session: Session,
    userInput: string,
    toolsUsed: string[],
    subagentUsed: string | null,
    outcome: 'success' | 'partial' | 'failure',
    startTime: number,
  ): Promise<void> {
    if (!this.evolutionEngine) return;

    // 检测使用的 Skill（从 toolsUsed 中推断：如果 read 了 SKILL.md）
    const skillUsed = this.inferSkillUsed(toolsUsed, userInput);

    const taskInfo: TaskInfo = {
      task: userInput,
      skillUsed,
      subagentUsed,
      outcome,
      duration: Date.now() - startTime,
      toolsUsed,
      sessionId: session.id,
    };

    // fire-and-forget
    await this.evolutionEngine.onTaskComplete(session, taskInfo);
  }

  /**
   * 推断使用的 Skill
   * 简化版：如果工具调用中包含 read 且路径含 SKILL.md，返回 skill 名称
   */
  private inferSkillUsed(toolsUsed: string[], userInput: string): string | null {
    // 如果使用了 read 工具，可能加载了 Skill
    if (toolsUsed.includes('read')) {
      // 从用户输入中尝试匹配已知的 skill 名称
      const skills = this.skillLoader.discover();
      for (const skill of skills) {
        if (userInput.toLowerCase().includes(skill.name.toLowerCase())) {
          return skill.name;
        }
      }
    }
    return null;
  }

  /**
   * 设置 EvolutionEngine（延迟注入）
   * 用于解决循环依赖：Agent 创建后，再注入 EvolutionEngine
   */
  setEvolutionEngine(engine: EvolutionEngine): void {
    this.evolutionEngine = engine;
    // 如果有 SubagentRegistry，注册 delegate 工具
    if (this.subagentRegistry && !this.toolRegistry.has('delegate')) {
      this.registerDelegateTool();
    }
  }

  /**
   * 设置 SubagentRegistry（延迟注入）
   */
  setSubagentRegistry(registry: SubagentRegistry): void {
    this.subagentRegistry = registry;
    // 如果有 EvolutionEngine，注册 delegate 工具
    if (this.evolutionEngine && !this.toolRegistry.has('delegate')) {
      this.registerDelegateTool();
    }
  }
}
