// ============================================================
// Crab-Science 核心类型定义
// 所有跨包共享的类型都在这里定义
// Phase 2: Session Tree + Skills 增强 + Extensions
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

// ============ Session Tree 类型（Phase 2 新增） ============

/** Session 节点类型 */
export type NodeType = 'user' | 'assistant' | 'tool_call' | 'tool_result' | 'summary';

/** 节点元数据 */
export interface NodeMetadata {
  /** type=tool_call 时的工具名 */
  toolName?: string;
  /** type=tool_call 时的工具参数 */
  toolParams?: Record<string, unknown>;
  /** type=tool_result 时的工具输出 */
  toolResult?: string;
  /** type=tool_result 时是否为错误 */
  isError?: boolean;
  /** type=tool_call/tool_result 时的工具调用 ID */
  toolCallId?: string;
  /** type=summary 时的原分支引用（源分支叶节点 ID） */
  sourceBranchLeafId?: string;
  /** type=summary 时的摘要内容 */
  summaryText?: string;
  /** fork 时的分支原因 */
  branchReason?: string;
  /** 该节点的 token 使用量 */
  tokensUsed?: { inputTokens: number; outputTokens: number };
}

/** Session 树节点 */
export interface SessionNode {
  /** 节点唯一 ID */
  id: string;
  /** 父节点 ID（null 表示根节点） */
  parentId: string | null;
  /** 节点类型 */
  type: NodeType;
  /** 节点内容（文本或 ContentBlock 数组） */
  content: string | ContentBlock[];
  /** 创建时间戳（ISO 8601） */
  timestamp: string;
  /** 子节点 ID 列表 */
  childrenIds: string[];
  /** 节点元数据 */
  metadata: NodeMetadata;
}

// ============ Session 类型（Phase 2 升级为树形） ============

/** Session（树形，Phase 2） */
export interface Session {
  id: string;
  /** 扁平节点 Map */
  nodes: Record<string, SessionNode>;
  /** 根节点 ID */
  rootId: string;
  /** 当前所在节点 ID */
  currentNodeId: string;
  /** 模型 */
  model: string;
  /** Provider */
  provider: string;
  /** 创建时间 */
  createdAt: string;
  /** 更新时间 */
  updatedAt: string;
  /** 累计输入 token */
  totalInputTokens: number;
  /** 累计输出 token */
  totalOutputTokens: number;
  /** 累计成本 */
  totalCost: number;
  /** Session 版本（1=线性, 2=树形） */
  version: number;
}

/** Session 摘要（列表展示用，Phase 2 升级） */
export interface SessionMeta {
  id: string;
  createdAt: string;
  updatedAt: string;
  model: string;
  provider: string;
  /** 节点总数（替代 Phase 1 的 messageCount） */
  nodeCount: number;
  /** 版本号 */
  version: number;
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

// ============ Skill 类型（Phase 2 增强） ============

/** Skill 元数据（Phase 2 增强） */
export interface SkillMeta {
  name: string;
  description: string;
  version: number;
  /** 最后更新时间（Phase 2 新增） */
  lastUpdated?: string;
  /** 执行次数（Phase 2 新增） */
  executionCount?: number;
}

/** Skill 完整对象 */
export interface Skill {
  meta: SkillMeta;
  /** SKILL.md 文件路径 */
  path: string;
  /** SKILL.md 完整内容 */
  content: string;
}

/** Skill 附加文件信息 */
export interface SkillAttachment {
  /** 文件名 */
  name: string;
  /** 相对于 skill 目录的路径 */
  path: string;
  /** 文件大小（字节） */
  size: number;
}

/** Skill 脚本信息 */
export interface SkillScript {
  /** 脚本名（不含扩展名） */
  name: string;
  /** 完整路径 */
  path: string;
  /** 脚本语言（python/shell） */
  language: 'python' | 'shell';
}

/** Skill 执行记录 */
export interface SkillExecutionRecord {
  /** 记录 ID */
  id: string;
  /** Skill 名称 */
  skillName: string;
  /** 执行时间（ISO 8601） */
  timestamp: string;
  /** 任务描述 */
  task: string;
  /** 执行步骤 */
  steps: string[];
  /** 执行耗时（毫秒） */
  durationMs: number;
  /** 执行状态 */
  status: 'success' | 'failed' | 'partial';
  /** 错误信息（status != success 时） */
  error?: string;
  /** Token 使用量 */
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

// ============ Extension 类型（Phase 2 新增） ============

/** Extension 模块导出格式 */
export interface ExtensionModule {
  /** 导出的工具（可选） */
  tool?: ExtensionTool;
  /** 导出的命令（可选，Phase 2 预留） */
  command?: ExtensionCommand;
}

/** Extension 工具（扩展 Tool 接口） */
export interface ExtensionTool {
  name: string;
  description: string;
  parameters: ToolParameterSchema;
  execute: (params: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;
}

/** Extension 命令（Phase 2 预留，暂不实现） */
export interface ExtensionCommand {
  name: string;
  description: string;
  handler: (args: string[]) => string;
}

/** 已加载的 Extension 信息 */
export interface LoadedExtension {
  /** Extension 文件路径 */
  filePath: string;
  /** Extension 名称（文件名去扩展名） */
  name: string;
  /** 编译后的模块 */
  module: ExtensionModule;
  /** 加载状态 */
  status: 'loaded' | 'error';
  /** 错误信息 */
  error?: string;
  /** 加载时间 */
  loadedAt: string;
}

// ============ Token 使用量 ============

/** Token 使用量与成本 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cost: number;
}
