import Anthropic from '@anthropic-ai/sdk';
import type { Message, ContentBlock, ToolDefinition } from '@crab-science/shared';
import type { LLMProvider, LLMOptions, ModelInfo, StreamEvent } from '../types.js';
import { LLMError } from '../types.js';
import { AnthropicStreamParser } from '../stream-parser.js';
import { tokenCounter } from '../token-counter.js';

/** 从 MessageParam 中提取 content block 元素类型（兼容不同 SDK 版本） */
type ContentBlockParam = Exclude<Anthropic.MessageParam['content'], string>[number];

/**
 * Anthropic Provider 实现
 * 使用 @anthropic-ai/sdk，支持流式响应 + tool use
 */
export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  /**
   * 流式完成
   * 将统一 Message[] 转换为 Anthropic 格式，调用流式 API，yield 统一 StreamEvent
   */
  async *complete(messages: Message[], options: LLMOptions): AsyncGenerator<StreamEvent> {
    if (!options.model || !options.model.trim()) {
      throw new LLMError('model 不能为空：调用方必须传入具体模型名', this.name);
    }
    try {
      const { anthropicMessages } = this.convertMessages(messages);
      const anthropicTools = options.tools ? this.convertTools(options.tools) : undefined;

      const stream = await this.client.messages.stream({
        model: options.model,
        messages: anthropicMessages,
        system: options.systemPrompt,
        tools: anthropicTools,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 4096,
      });

      const parser = new AnthropicStreamParser();
      let inputTokens = 0;

      for await (const event of stream) {
        // message_start 携带 input usage
        if (event.type === 'message_start' && event.message?.usage) {
          inputTokens = event.message.usage.input_tokens ?? 0;
        }

        const events = parser.parse(event as Parameters<typeof parser.parse>[0]);
        for (const evt of events) {
          if (evt.type === 'message_end') {
            const cost = tokenCounter.estimateCost(
              inputTokens,
              evt.usage.outputTokens,
              options.model,
            );
            yield {
              type: 'message_end',
              usage: {
                inputTokens,
                outputTokens: evt.usage.outputTokens,
                cost,
              },
            };
          } else {
            yield evt;
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new LLMError(`Anthropic 调用失败: ${message}`, 'anthropic');
    }
  }

  /** 列出可用模型 */
  listModels(): ModelInfo[] {
    return [
      {
        id: 'claude-sonnet-4-20250514',
        name: 'Claude Sonnet 4',
        provider: 'anthropic',
        contextWindow: 200000,
        pricing: { inputPerMillion: 3, outputPerMillion: 15 },
      },
      {
        id: 'claude-opus-4-20250514',
        name: 'Claude Opus 4',
        provider: 'anthropic',
        contextWindow: 200000,
        pricing: { inputPerMillion: 15, outputPerMillion: 75 },
      },
      {
        id: 'claude-3-5-sonnet-20241022',
        name: 'Claude 3.5 Sonnet',
        provider: 'anthropic',
        contextWindow: 200000,
        pricing: { inputPerMillion: 3, outputPerMillion: 15 },
      },
      {
        id: 'claude-3-5-haiku-20241022',
        name: 'Claude 3.5 Haiku',
        provider: 'anthropic',
        contextWindow: 200000,
        pricing: { inputPerMillion: 0.8, outputPerMillion: 4 },
      },
    ];
  }

  /**
   * 将统一 Message[] 转换为 Anthropic 格式
   * Anthropic:
   * - system 消息单独传（不放入 messages 数组）
   * - tool_use 作为 assistant 消息的 content block
   * - tool_result 作为 user 消息的 content block
   */
  private convertMessages(messages: Message[]): {
    anthropicMessages: Anthropic.MessageParam[];
  } {
    const result: Anthropic.MessageParam[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') continue; // system 单独传

      if (msg.role === 'user') {
        if (typeof msg.content === 'string') {
          result.push({ role: 'user', content: msg.content });
        } else {
          // user 消息中的 tool_result block
          const blocks = msg.content as ContentBlock[];
          const content: ContentBlockParam[] = [];
          for (const block of blocks) {
            if (block.type === 'tool_result') {
              content.push({
                type: 'tool_result',
                tool_use_id: block.toolCallId ?? '',
                content: block.output ?? '',
                is_error: block.isError ?? false,
              });
            } else if (block.type === 'text' && block.text) {
              content.push({ type: 'text', text: block.text });
            }
          }
          if (content.length > 0) {
            result.push({ role: 'user', content });
          }
        }
      } else if (msg.role === 'assistant') {
        if (typeof msg.content === 'string') {
          result.push({ role: 'assistant', content: msg.content });
        } else {
          const blocks = msg.content as ContentBlock[];
          const content: ContentBlockParam[] = [];
          for (const block of blocks) {
            if (block.type === 'text' && block.text) {
              content.push({ type: 'text', text: block.text });
            } else if (block.type === 'tool_use') {
              content.push({
                type: 'tool_use',
                id: block.toolCallId ?? '',
                name: block.toolName ?? '',
                input: block.input ?? {},
              });
            }
          }
          if (content.length > 0) {
            result.push({ role: 'assistant', content });
          }
        }
      } else if (msg.role === 'tool') {
        // 统一格式中独立的 tool 消息 → Anthropic 转为 user 消息中的 tool_result block
        result.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: msg.toolCallId ?? '',
              content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
            },
          ],
        });
      }
    }

    return { anthropicMessages: result };
  }

  /**
   * 将统一 ToolDefinition 转换为 Anthropic tools 格式
   */
  private convertTools(tools: ToolDefinition[]): Anthropic.Tool[] {
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: 'object',
        properties: Object.fromEntries(
          Object.entries(tool.parameters.properties).map(([key, val]) => [
            key,
            { type: val.type, description: val.description, ...(val.enum ? { enum: val.enum } : {}) },
          ]),
        ),
        required: tool.parameters.required,
      },
    }));
  }
}
