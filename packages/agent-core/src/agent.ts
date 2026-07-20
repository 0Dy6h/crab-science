import type {
  Session,
  Message,
  ContentBlock,
  ToolResult,
  TokenUsage,
  AppConfig,
} from '@crab-science/shared';
import type { LLMProvider, LLMOptions, StreamEvent } from '@crab-science/llm-layer';
import type { ToolRegistry } from './tools/index.js';
import type { SkillLoader } from './skills/loader.js';
import { ContextBuilder } from './context-builder.js';
import { SessionManager } from './session/manager.js';

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

/**
 * Agent — 核心循环
 *
 * 职责：
 * 1. 构建上下文（系统提示 + 历史 + skills 元数据）
 * 2. 调用 LLM 流式获取响应
 * 3. 解析流式事件，yield AgentEvent 给 CLI
 * 4. 收集工具调用，串行执行
 * 5. 将工具结果回注 session，进入下一轮
 * 6. 无工具调用时结束循环
 */
export class Agent {
  constructor(
    private provider: LLMProvider,
    private toolRegistry: ToolRegistry,
    private sessionManager: SessionManager,
    private skillLoader: SkillLoader,
    private contextBuilder: ContextBuilder,
    private config: AppConfig,
  ) {}

  /**
   * 运行 Agent 循环
   * @param session - 当前 Session
   * @param userInput - 用户输入文本
   * @returns AsyncGenerator<AgentEvent>
   */
  async *run(session: Session, userInput: string): AsyncGenerator<AgentEvent> {
    // 1. 添加用户消息
    this.sessionManager.addMessage(session, {
      role: 'user',
      content: userInput,
    });

    let iterationCount = 0;
    const maxIterations = this.config.maxIterations;

    while (iterationCount < maxIterations) {
      iterationCount++;

      // 2. 构建 context
      const skills = this.skillLoader.discover();
      const { systemPrompt, messages } = this.contextBuilder.build(session, skills, this.config);

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
      // 用 Map 记录 toolCallId → toolName（从 tool_call_start 事件获取）
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
              // 记录工具名，等待 tool_call_end 时关联
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
        return;
      }

      // 更新 session token 统计
      this.sessionManager.updateUsage(session, usage.inputTokens, usage.outputTokens, usage.cost);

      // 5. 构建 assistant 消息（包含 text + tool_use blocks）
      const assistantBlocks: ContentBlock[] = [];
      if (textParts.length > 0) {
        assistantBlocks.push({ type: 'text', text: textParts.join('') });
      }
      for (const tc of pendingToolCalls) {
        assistantBlocks.push({
          type: 'tool_use',
          toolCallId: tc.id,
          toolName: tc.name,
          input: tc.input,
        });
      }

      // 添加 assistant 消息到 session
      if (assistantBlocks.length > 0) {
        this.sessionManager.addMessage(session, {
          role: 'assistant',
          content: assistantBlocks,
        });
      } else if (textParts.length > 0) {
        this.sessionManager.addMessage(session, {
          role: 'assistant',
          content: textParts.join(''),
        });
      }

      // 6. 检查是否有工具调用
      if (pendingToolCalls.length === 0) {
        // 无工具调用 → 循环结束
        this.sessionManager.save(session);
        yield { type: 'done', usage };
        return;
      }

      // 7. 串行执行工具调用
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

        // 将工具结果回注到 session
        this.sessionManager.addMessage(session, {
          role: 'tool',
          content: result.output,
          toolCallId: tc.id,
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
  }
}
