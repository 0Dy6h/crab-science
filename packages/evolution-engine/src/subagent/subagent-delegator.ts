import type { Session, SubagentDefinition, Message, ToolDefinition } from '@crab-science/shared';
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
  private workDir: string;

  constructor(
    sessionManager: ISessionManager,
    providerRegistry: ProviderRegistry,
    toolRegistry: IToolRegistry,
    skillLoader: ISkillLoader,
    contextBuilder: IContextBuilder,
    workDir?: string,
  ) {
    this.sessionManager = sessionManager;
    this.providerRegistry = providerRegistry;
    this.toolRegistry = toolRegistry;
    this.skillLoader = skillLoader;
    this.contextBuilder = contextBuilder;
    this.workDir = workDir ?? process.cwd();
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
    let provider: LLMProvider | undefined;
    let branchLeafId = originalCurrentNodeId;

    // 1. Fork session
    this.sessionManager.fork(session, {
      reason: `subagent: ${subagent.meta.name}`,
    });

    try {
      // 2. 构建 subagent context（保持主路径，不把委派任务重复注入历史）
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
          workDir: this.workDir,
        },
        subagentTools,
      );

      // 3. 在 fork 出的子分支上记录委派任务
      branchLeafId = this.sessionManager.addNode(session, {
        type: 'user',
        content: task,
        metadata: {},
      });

      // 4. 获取 subagent 的 Provider
      provider = this.getSubagentProvider(session, subagent);

      // 5. 构建 subagent 专用的系统提示
      const subagentSystemPrompt = this.buildSubagentSystemPrompt(
        subagent,
        systemPrompt,
      );

      // 6. 执行 Agent Loop（仅暴露 subagent 声明的工具）
      const result = await this.executeSubagentLoop(
        provider,
        messages,
        subagentSystemPrompt,
        task,
        session.model,
        subagentTools,
      );

      // 7. 将 subagent 结果写入子分支叶节点
      branchLeafId = this.sessionManager.addNode(session, {
        type: 'assistant',
        content: result,
        metadata: {},
      });

      // 8. 回到原始节点
      session.currentNodeId = originalCurrentNodeId;

      // 9. Summarize 子分支
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
      const errorMsg = err instanceof Error ? err.message : String(err);
      const failureSummary = `[Subagent ${subagent.meta.name} 执行失败: ${errorMsg}]`;

      // 在子分支上记录失败摘要，保证主 agent 不吞掉透明分支。
      try {
        branchLeafId = this.sessionManager.addNode(session, {
          type: 'assistant',
          content: failureSummary,
          metadata: { isError: true },
        });
      } catch {
        branchLeafId = session.currentNodeId || originalCurrentNodeId;
      }

      // 回到原始节点
      session.currentNodeId = originalCurrentNodeId;

      // 生成失败摘要
      try {
        await this.sessionManager.summarize(
          session,
          branchLeafId,
          originalCurrentNodeId,
          provider,
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
   * 简化版：直接调用 LLM，串行执行工具，直到无工具调用或达到迭代上限。
   *
   * @param allowedTools - subagent 声明的工具白名单（仅这些工具会暴露并被允许执行）
   */
  private async executeSubagentLoop(
    provider: LLMProvider,
    messages: Message[],
    systemPrompt: string,
    task: string,
    model: string,
    allowedTools: ToolDefinition[],
  ): Promise<string> {
    const allowedNames = new Set(allowedTools.map((t) => t.name));
    const options: LLMOptions = {
      model,
      systemPrompt,
      tools: allowedTools,
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
      const toolNameMap = new Map<string, string>();
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
            case 'tool_call_start':
              // 工具名仅在 start 事件携带，必须在此保存，否则 end 事件拿不到名字
              toolNameMap.set(event.toolCallId, event.toolName);
              break;
            case 'tool_call_end':
              pendingToolCalls.push({
                id: event.toolCallId,
                name: toolNameMap.get(event.toolCallId) ?? '',
                input: event.input,
              });
              break;
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`执行出错: ${msg}`);
      }

      result = textParts.join('');

      // 无工具调用 → 结束
      if (pendingToolCalls.length === 0) {
        return result;
      }

      // 先追加 assistant 轮次（含 tool_use），保证 provider 侧 tool_use / tool_result 配对
      taskMessages.push({
        role: 'assistant',
        content: [
          ...(result ? [{ type: 'text' as const, text: result }] : []),
          ...pendingToolCalls.map((tc) => ({
            type: 'tool_use' as const,
            toolCallId: tc.id,
            toolName: tc.name,
            input: tc.input,
          })),
        ],
      });

      // 执行工具调用（强制白名单）
      for (const tc of pendingToolCalls) {
        let output: string;
        if (!allowedNames.has(tc.name)) {
          // 未授权工具：拒绝执行，把原因回给模型而不是静默失败
          output = `[拒绝] 工具 "${tc.name || '(空)'}" 不在该 Subagent 的授权列表内`;
        } else {
          const toolResult = await this.toolRegistry.execute(tc.name, tc.input, {
            workDir: this.workDir,
            sessionId: 'subagent',
          });
          output = toolResult.success
            ? toolResult.output
            : toolResult.output || toolResult.error || '工具执行失败';
        }

        taskMessages.push({
          role: 'tool',
          content: output,
          toolCallId: tc.id,
        });
      }
    }

    return result || '达到最大迭代次数';
  }
}
