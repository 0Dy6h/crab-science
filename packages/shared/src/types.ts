// ============================================================
// Crab-Science 核心类型定义
// 所有跨包共享的类型都在这里定义
// ============================================================

// ============ 消息类型 ============

/** 消息角色 */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

/** 内容块类型 */
export interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  /** type=text 时的文本内容 */
  text?: string;
  /** type=tool_use|tool_result 时的调用 ID */
  toolCallId?: string;
  /** type=tool_use 时的工具名 */
  toolName?: string;
  /** type=tool_use 时的工具参数 */
  input?: Record<string, unknown>;
  /** type=tool_result 时的工具输出 */
  output?: string;
  /** type=tool_result 时是否为错误 */
  isError?: boolean;
}

/** 消息（统一内部格式） */
export interface Message {
  role: MessageRole;
  content: string | ContentBlock[];
  /** role=tool 时关联的工具调用 ID */
  toolCallId?: string;
}

// ============ 工具类型 ============

/** 工具参数 schema（JSON Schema 子集） */
export interface ToolParameterSchema {
  type: 'object';
  properties: Record<
    string,
    {
      type: string;
      description: string;
      enum?: string[];
    }
  >;
  required: string[];
}

/** 工具定义（传给 LLM 的格式） */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameterSchema;
}

/** 工具执行上下文 */
export interface ToolContext {
  /** 工作目录 */
  workDir: string;
  /** 当前 session ID */
  sessionId: string;
}

/** 工具执行结果 */
export interface ToolResult {
  success: boolean;
  /** 输出内容（文本） */
  output: string;
  /** 错误信息 */
  error?: string;
}

// ============ Session 类型 ============

/** Session（线性，Phase 1） */
export interface Session {
  id: string;
  messages: Message[];
  model: string;
  provider: string;
  createdAt: string;
  updatedAt: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
}

/** Session 摘要（列表展示用） */
export interface SessionMeta {
  id: string;
  createdAt: string;
  updatedAt: string;
  model: string;
  provider: string;
  messageCount: number;
}

// ============ 配置类型 ============

/** 配置文件结构 */
export interface AppConfig {
  defaultProvider: 'openai' | 'anthropic' | 'deepseek';
  defaultModel: string;
  maxIterations: number;
  bashTimeoutMs: number;
  workDir: string;
}

// ============ Skill 类型 ============

/** Skill 元数据（从 SKILL.md frontmatter 解析） */
export interface SkillMeta {
  name: string;
  description: string;
  version: number;
}

/** Skill 完整对象 */
export interface Skill {
  meta: SkillMeta;
  /** SKILL.md 文件路径 */
  path: string;
  /** SKILL.md 完整内容 */
  content: string;
}

// ============ Token 使用量 ============

/** Token 使用量与成本 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cost: number;
}
