import type { Message, ToolDefinition, TokenUsage } from '@crab-science/shared';

// ============================================================
// LLM 层专属类型
// ============================================================

/** LLM 调用选项 */
export interface LLMOptions {
  model: string;
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  systemPrompt: string;
}

/** 流式事件（统一格式） */
export type StreamEvent =
  | { type: 'text_delta'; content: string }
  | { type: 'tool_call_start'; toolCallId: string; toolName: string }
  | { type: 'tool_call_delta'; toolCallId: string; delta: string }
  | { type: 'tool_call_end'; toolCallId: string; input: Record<string, unknown> }
  | { type: 'message_end'; usage: TokenUsage };

/** 模型信息 */
export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  contextWindow: number;
  pricing: { inputPerMillion: number; outputPerMillion: number };
}

/** LLM Provider 接口 */
export interface LLMProvider {
  /** Provider 名称 */
  name: string;
  /** 流式完成（返回统一 StreamEvent） */
  complete(messages: Message[], options: LLMOptions): AsyncGenerator<StreamEvent>;
  /** 列出可用模型 */
  listModels(): ModelInfo[];
}

/** 工具调用累积器（内部使用） */
export interface ToolCallAccumulator {
  id: string;
  name: string;
  argsBuffer: string;
}

/** LLM 错误 */
export class LLMError extends Error {
  constructor(message: string, public readonly provider?: string) {
    super(message);
    this.name = 'LLMError';
  }
}
