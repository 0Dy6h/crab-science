import type { Session, SubagentDefinition, Message } from '@crab-science/shared';
import { nowISO } from '@crab-science/shared';
import type { LLMProvider, LLMOptions } from '@crab-science/llm-layer';
import type { ProviderRegistry } from '@crab-science/llm-layer';
import type {
  ISessionManager,
  IToolRegistry,
  ISkillLoader,
  IContextBuilder,
} from './types.js';

/**
 * Subagent 委派执行器
 *
 * 核心委派逻辑：
 * 1. Fork session 创建子分支
 * 2. 在子分支中执行 subagent
 * 3. Summarize 子分支
 * 4. 返回摘要给主 agent
 *
 * 使用本地接口（ISessionManager 等）避免与 agent-core 的循环依赖。
 */
export class SubagentDelegator {
  private sessionManager: ISessionManager;
  private providerRegistry: ProviderRegistry;
  private toolRegistry: IToolRegistry;
  private skillLoader: ISkillLoader;
  private contextBuilder: IContextBuilder;

  constructor(
    sessionManager: ISessionManager,
    providerRegistry: ProviderRegistry,
    toolRegistry: IToolRegistry,
    skillLoader: ISkillLoader,
    contextBuilder: IContextBuilder,
  ) {
    this.sessionManager = sessionManager;
    this.providerRegistry = providerRegistry;
    this.toolRegistry = toolRegistry;
    this.skillLoader = skillLoader;
    this.contextBuilder = contextBuilder;
  }

  /**
   * 委派任务给 Subagent
   *
   * 1. Fork session 创建子分支
   * 2. 在子分支中执行 subagent
   * 3. Summarize 子分支
   * 4. 返回摘要给主 agent
   *
   * @param session - 当前 Session
   * @param subagent - Subagent 定义
   * @param task - 委派任务
   * @returns 摘要和成功状态
   */
  async delegate(
    session: Session,
    subagent: SubagentDefinition,
    task: string,
  ): Promise<{ summary: string; success: boolean; branchLeafId: string }> {
    // 记录 fork 前的当前节点
    const originalCurrentNodeId = session.currentNodeId;

    // 1. Fork session
    const forkNodeId = this.sessionManager.fork(session, {
      reason: `subagent: ${subagent.meta.name}`,
    });

    try {
      // 2. 获取 subagent 的 Provider
      const provider = this.getSubagentProvider(session, subagent);

      // 3. 构建 subagent context
      const skills = this.skillLoader.discover();

      // 过滤工具：只保留 subagent 声明的工具
      const allTools = this.toolRegistry.getDefinitions();
      const subagentTools = subagent.meta.tools.length > 0
        ? allTools.filter((t) => subagent.meta.tools.includes(t.name))
        : allTools;

      const { systemPrompt, messages } = this.contextBuilder.build(
        session,
        skills,
        {
          defaultProvider: session.provider as 'openai' | 'anthropic' | 'deepseek',
          defaultModel: session.model,
          maxIterations: 20,
          bashTimeoutMs: 30000,
          workDir: process.cwd(),
        },
        subagentTools,
      );

      // 4. 构建 subagent 专用的系统提示
      const subagentSystemPrompt = this.buildSubagentSystemPrompt(
        subagent,
        systemPrompt,
      );

      // 5. 执行 Agent Loop（在子分支中）
      const result = await this.executeSubagentLoop(
        provider,
        messages,
        subagentSystemPrompt,
        task,
        session.model,
      );

      // 6. 记录分支叶节点
      const branchLeafId = session.currentNodeId;

      // 7. 回到原始节点
      session.currentNodeId = originalCurrentNodeId;

      // 8. Summarize 子分支
      const summaryNodeId = await this.sessionManager.summarize(
        session,
        branchLeafId,
        originalCurrentNodeId,
        provider,
      );

      // 获取摘要内容
      const summaryNode = session.nodes[summaryNodeId];
      const summaryText =
        summaryNode?.metadata.summaryText ??
        (typeof summaryNode?.content === 'string'
          ? summaryNode.content
          : result);

      return {
        summary: summaryText || result,
        success: true,
        branchLeafId,
      };
    } catch (err) {
      // 执行失败
      const branchLeafId = session.currentNodeId;

      // 回到原始节点
      session.currentNodeId = originalCurrentNodeId;

      const errorMsg = err instanceof Error ? err.message : String(err);
      const failureSummary = `[Subagent ${subagent.meta.name} 执行失败: ${errorMsg}]`;

      // 生成失败摘要
      try {
        await this.sessionManager.summarize(
          session,
          branchLeafId,
          originalCurrentNodeId,
        );
      } catch {
        // summarize 失败时忽略
      }

      return {
        summary: failureSummary,
        success: false,
        branchLeafId,
      };
    }
  }

  /**
   * 获取 Subagent 的 Provider
   * model: inherit → 复用主 Provider
   * model: 具体模型名 → 根据模型名前缀切换 Provider
   */
  private getSubagentProvider(
    session: Session,
    subagent: SubagentDefinition,
  ): LLMProvider {
    const model = subagent.meta.model;

    if (model === 'inherit' || !model) {
      // 复用主 Provider
      return this.providerRegistry.get(session.provider);
    }

    // 根据模型名前缀推断 provider
    let providerName: string;
    if (model.startsWith('claude')) {
      providerName = 'anthropic';
    } else if (model.startsWith('gpt')) {
      providerName = 'openai';
    } else if (model.startsWith('deepseek')) {
      providerName = 'deepseek';
    } else {
      // 无法推断，回退到 inherit
      console.warn(
        `[SubagentDelegator] 无法推断模型 ${model} 的 provider，回退到 inherit`,
      );
      return this.providerRegistry.get(session.provider);
    }

    // 检查 Provider 是否已注册
    if (this.providerRegistry.has(providerName)) {
      return this.providerRegistry.get(providerName);
    }

    // Provider 未注册，回退到 inherit
    console.warn(
      `[SubagentDelegator] Provider ${providerName} 未注册，回退到 inherit`,
    );
    return this.providerRegistry.get(session.provider);
  }

  /**
   * 构建 Subagent 专用系统提示
   */
  private buildSubagentSystemPrompt(
    subagent: SubagentDefinition,
    basePrompt: string,
  ): string {
    const parts: string[] = [];

    parts.push(`# Subagent: ${subagent.meta.name}`);
    parts.push(`## 职责\n${subagent.meta.description}`);
    if (subagent.content) {
      parts.push(`## 指引\n${subagent.content}`);
    }
    parts.push(`## 基础上下文\n${basePrompt}`);

    return parts.join('\n\n');
  }

  /**
   * 执行 Subagent Agent Loop
   * 简化版：直接调用 LLM，不使用完整 Agent 循环
   */
  private async executeSubagentLoop(
    provider: LLMProvider,
    messages: Message[],
    systemPrompt: string,
    task: string,
    model: string,
  ): Promise<string> {
    const options: LLMOptions = {
      model,
      systemPrompt,
      tools: this.toolRegistry.getDefinitions(),
      temperature: 0.7,
      maxTokens: 4096,
    };

    // 添加任务消息
    const taskMessages: Message[] = [
      ...messages,
      { role: 'user', content: task },
    ];

    let result = '';
    let iteration = 0;
    const maxIterations = 20;

    while (iteration < maxIterations) {
      iteration++;

      const textParts: string[] = [];
      const pendingToolCalls: Array<{
        id: string;
        name: string;
        input: Record<string, unknown>;
      }> = [];

      try {
        const stream = provider.complete(taskMessages, options);

        for await (const event of stream) {
          switch (event.type) {
            case 'text_delta':
              textParts.push(event.content);
              break;
            case 'tool_call_end':
              pendingToolCalls.push({
                id: event.toolCallId,
                name: '',
                input: event.input,
              });
              break;
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return `执行出错: ${msg}`;
      }

      result = textParts.join('');

      // 无工具调用 → 结束
      if (pendingToolCalls.length === 0) {
        return result;
      }

      // 执行工具调用
      for (const tc of pendingToolCalls) {
        const toolResult = await this.toolRegistry.execute(tc.name, tc.input, {
          workDir: process.cwd(),
          sessionId: 'subagent',
        });

        taskMessages.push({
          role: 'tool',
          content: toolResult.output,
          toolCallId: tc.id,
        });
      }
    }

    return result || '达到最大迭代次数';
  }
}
