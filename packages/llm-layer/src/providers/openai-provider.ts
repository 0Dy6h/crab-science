import OpenAI from 'openai';
import type { Message, ContentBlock, ToolDefinition } from '@crab-science/shared';
import type { LLMProvider, LLMOptions, ModelInfo, StreamEvent } from '../types.js';
import { LLMError } from '../types.js';
import { OpenAIStreamParser } from '../stream-parser.js';
import { tokenCounter } from '../token-counter.js';

/**
 * OpenAI Provider 实现
 * 使用 openai SDK，支持流式响应 + function calling
 */
export class OpenAIProvider implements LLMProvider {
  readonly name: string = 'openai';
  private client: OpenAI;

  constructor(apiKey: string, baseURL?: string) {
    this.client = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
  }

  /**
   * 流式完成
   * 将统一 Message[] 转换为 OpenAI 格式，调用流式 API，yield 统一 StreamEvent
   */
  async *complete(messages: Message[], options: LLMOptions): AsyncGenerator<StreamEvent> {
    try {
      const openaiMessages = this.convertMessages(messages, options.systemPrompt);
      const openaiTools = options.tools ? this.convertTools(options.tools) : undefined;

      const stream = await this.client.chat.completions.create({
        model: options.model,
        messages: openaiMessages,
        tools: openaiTools,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 4096,
        stream: true,
        stream_options: { include_usage: true },
      });

      const parser = new OpenAIStreamParser();

      for await (const chunk of stream) {
        const events = parser.parse(chunk);
        for (const event of events) {
          // 在 message_end 时计算成本
          if (event.type === 'message_end') {
            const cost = tokenCounter.estimateCost(
              event.usage.inputTokens,
              event.usage.outputTokens,
              options.model,
            );
            yield {
              type: 'message_end',
              usage: {
                inputTokens: event.usage.inputTokens,
                outputTokens: event.usage.outputTokens,
                cost,
              },
            };
          } else {
            yield event;
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new LLMError(`OpenAI 调用失败: ${message}`, 'openai');
    }
  }

  /** 列出可用模型 */
  listModels(): ModelInfo[] {
    return [
      {
        id: 'gpt-4o',
        name: 'GPT-4o',
        provider: 'openai',
        contextWindow: 128000,
        pricing: { inputPerMillion: 2.5, outputPerMillion: 10 },
      },
      {
        id: 'gpt-4o-mini',
        name: 'GPT-4o mini',
        provider: 'openai',
        contextWindow: 128000,
        pricing: { inputPerMillion: 0.15, outputPerMillion: 0.6 },
      },
      {
        id: 'gpt-4-turbo',
        name: 'GPT-4 Turbo',
        provider: 'openai',
        contextWindow: 128000,
        pricing: { inputPerMillion: 10, outputPerMillion: 30 },
      },
    ];
  }

  /**
   * 将统一 Message[] 转换为 OpenAI 格式
   * OpenAI: system 消息直接在 messages 数组中，tool 角色消息也直接在数组中
   */
  private convertMessages(
    messages: Message[],
    systemPrompt: string,
  ): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    const result: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

    // 系统提示放首位
    if (systemPrompt) {
      result.push({ role: 'system', content: systemPrompt });
    }

    for (const msg of messages) {
      if (msg.role === 'system') continue; // 已在 systemPrompt 中处理

      if (msg.role === 'tool') {
        // tool 结果消息
        result.push({
          role: 'tool',
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
          tool_call_id: msg.toolCallId ?? '',
        });
      } else if (msg.role === 'assistant') {
        // assistant 消息可能包含 text + tool_use
        if (typeof msg.content === 'string') {
          result.push({ role: 'assistant', content: msg.content });
        } else {
          const blocks = msg.content as ContentBlock[];
          const textParts: string[] = [];
          const toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] = [];

          for (const block of blocks) {
            if (block.type === 'text' && block.text) {
              textParts.push(block.text);
            } else if (block.type === 'tool_use') {
              toolCalls.push({
                id: block.toolCallId ?? '',
                type: 'function',
                function: {
                  name: block.toolName ?? '',
                  arguments: JSON.stringify(block.input ?? {}),
                },
              });
            }
          }

          result.push({
            role: 'assistant',
            content: textParts.join('') || null,
            tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
          });
        }
      } else {
        // user 消息
        if (typeof msg.content === 'string') {
          result.push({ role: 'user', content: msg.content });
        } else {
          // user 消息中的 tool_result block → 转换为 OpenAI tool 消息
          const blocks = msg.content as ContentBlock[];
          for (const block of blocks) {
            if (block.type === 'tool_result') {
              result.push({
                role: 'tool',
                content: block.output ?? '',
                tool_call_id: block.toolCallId ?? '',
              });
            } else if (block.type === 'text' && block.text) {
              result.push({ role: 'user', content: block.text });
            }
          }
        }
      }
    }

    return result;
  }

  /**
   * 将统一 ToolDefinition 转换为 OpenAI tools 格式
   */
  private convertTools(tools: ToolDefinition[]): OpenAI.Chat.Completions.ChatCompletionTool[] {
    return tools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters as unknown as Record<string, unknown>,
      },
    }));
  }
}
