import type { StreamEvent, ToolCallAccumulator } from './types.js';

// ============================================================
// 统一流式事件解析器
// 各 Provider 内部使用，将原始 SSE 事件转换为统一 StreamEvent
// ============================================================

/**
 * OpenAI 流式解析器
 * 解析 OpenAI SSE delta 格式：
 * - choices[0].delta.content → text_delta
 * - choices[0].delta.tool_calls[] → tool_call_start/delta/end
 */
export class OpenAIStreamParser {
  private toolCallMap = new Map<number, ToolCallAccumulator>();
  private emittedStart = new Set<number>();

  /**
   * 解析单个 OpenAI stream chunk
   * @returns 统一 StreamEvent 数组（可能为空）
   */
  parse(chunk: {
    choices?: Array<{
      delta?: {
        content?: string | null;
        tool_calls?: Array<{
          index: number;
          id?: string;
          function?: { name?: string; arguments?: string };
        }>;
      };
      finish_reason?: string | null;
    }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
  }): StreamEvent[] {
    const events: StreamEvent[] = [];

    const choice = chunk.choices?.[0];
    if (!choice) {
      // 可能有 usage 信息（stream_options.include_usage）
      if (chunk.usage) {
        events.push({
          type: 'message_end',
          usage: {
            inputTokens: chunk.usage.prompt_tokens ?? 0,
            outputTokens: chunk.usage.completion_tokens ?? 0,
            cost: 0,
          },
        });
      }
      return events;
    }

    const delta = choice.delta;

    // 文本输出
    if (delta?.content) {
      events.push({ type: 'text_delta', content: delta.content });
    }

    // 工具调用增量
    if (delta?.tool_calls) {
      for (const tc of delta.tool_calls) {
        const idx = tc.index;

        // 首次出现该 index → 初始化累积器
        if (!this.toolCallMap.has(idx)) {
          this.toolCallMap.set(idx, {
            id: tc.id ?? '',
            name: tc.function?.name ?? '',
            argsBuffer: '',
          });
        }

        const acc = this.toolCallMap.get(idx)!;

        // 更新 id 和 name（首个 chunk 携带）
        if (tc.id && !acc.id) {
          acc.id = tc.id;
        }
        if (tc.function?.name && !acc.name) {
          acc.name = tc.function.name;
        }

        // 发射 tool_call_start（仅一次）
        if (!this.emittedStart.has(idx) && acc.id && acc.name) {
          events.push({
            type: 'tool_call_start',
            toolCallId: acc.id,
            toolName: acc.name,
          });
          this.emittedStart.add(idx);
        }

        // 增量参数
        if (tc.function?.arguments) {
          acc.argsBuffer += tc.function.arguments;
          events.push({
            type: 'tool_call_delta',
            toolCallId: acc.id,
            delta: tc.function.arguments,
          });
        }
      }
    }

    // 完成
    if (choice.finish_reason === 'tool_calls' || choice.finish_reason === 'stop') {
      // 对所有累积的工具调用发射 tool_call_end
      for (const [idx, acc] of this.toolCallMap) {
        if (this.emittedStart.has(idx)) {
          let input: Record<string, unknown> = {};
          if (acc.argsBuffer) {
            try {
              input = JSON.parse(acc.argsBuffer);
            } catch {
              input = { _raw: acc.argsBuffer };
            }
          }
          events.push({
            type: 'tool_call_end',
            toolCallId: acc.id,
            input,
          });
        }
      }
    }

    // usage（某些 chunk 在 finish_reason 后单独发 usage）
    if (chunk.usage) {
      events.push({
        type: 'message_end',
        usage: {
          inputTokens: chunk.usage.prompt_tokens ?? 0,
          outputTokens: chunk.usage.completion_tokens ?? 0,
          cost: 0,
        },
      });
    }

    return events;
  }

  /** 重置解析器状态 */
  reset(): void {
    this.toolCallMap.clear();
    this.emittedStart.clear();
  }
}

/**
 * Anthropic 流式解析器
 * 解析 Anthropic SSE 事件序列：
 * - message_start → 初始化
 * - content_block_start → tool_use 开始
 * - content_block_delta (text_delta) → 文本增量
 * - content_block_delta (input_json_delta) → 工具参数增量
 * - content_block_stop → 工具调用结束
 * - message_delta → usage
 */
export class AnthropicStreamParser {
  private currentBlockIndex: number | null = null;
  private toolCallAcc = new Map<number, ToolCallAccumulator>();

  /**
   * 解析单个 Anthropic SSE 事件
   */
  parse(event: {
    type: string;
    message?: { usage?: { input_tokens?: number; output_tokens?: number } };
    index?: number;
    content_block?: { type: string; id?: string; name?: string; text?: string };
    delta?: { type?: string; text?: string; partial_json?: string; stop_reason?: string };
    usage?: { input_tokens?: number; output_tokens?: number };
  }): StreamEvent[] {
    const events: StreamEvent[] = [];

    switch (event.type) {
      case 'content_block_start': {
        const idx = event.index ?? 0;
        const block = event.content_block;
        if (block?.type === 'tool_use') {
          const acc: ToolCallAccumulator = {
            id: block.id ?? '',
            name: block.name ?? '',
            argsBuffer: '',
          };
          this.toolCallAcc.set(idx, acc);
          this.currentBlockIndex = idx;
          events.push({
            type: 'tool_call_start',
            toolCallId: acc.id,
            toolName: acc.name,
          });
        } else {
          this.currentBlockIndex = idx;
        }
        break;
      }

      case 'content_block_delta': {
        const delta = event.delta;
        if (delta?.type === 'text_delta' && delta.text) {
          events.push({ type: 'text_delta', content: delta.text });
        } else if (delta?.type === 'input_json_delta' && delta.partial_json) {
          const idx = this.currentBlockIndex ?? 0;
          const acc = this.toolCallAcc.get(idx);
          if (acc) {
            acc.argsBuffer += delta.partial_json;
            events.push({
              type: 'tool_call_delta',
              toolCallId: acc.id,
              delta: delta.partial_json,
            });
          }
        }
        break;
      }

      case 'content_block_stop': {
        const idx = event.index ?? this.currentBlockIndex ?? 0;
        const acc = this.toolCallAcc.get(idx);
        if (acc) {
          let input: Record<string, unknown> = {};
          if (acc.argsBuffer) {
            try {
              input = JSON.parse(acc.argsBuffer);
            } catch {
              input = { _raw: acc.argsBuffer };
            }
          }
          events.push({
            type: 'tool_call_end',
            toolCallId: acc.id,
            input,
          });
          this.toolCallAcc.delete(idx);
        }
        this.currentBlockIndex = null;
        break;
      }

      case 'message_delta': {
        const usage = event.usage;
        if (usage) {
          events.push({
            type: 'message_end',
            usage: {
              inputTokens: usage.input_tokens ?? 0,
              outputTokens: usage.output_tokens ?? 0,
              cost: 0,
            },
          });
        }
        break;
      }

      case 'message_start': {
        // message_start 携带 input usage，我们在 message_delta 时处理
        break;
      }

      case 'message_stop': {
        // 如果还没发 message_end（某些情况），补发
        break;
      }
    }

    return events;
  }

  /** 重置解析器状态 */
  reset(): void {
    this.currentBlockIndex = null;
    this.toolCallAcc.clear();
  }
}
