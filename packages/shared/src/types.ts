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

/** 配置文件结构（Phase 3 升级） */
export interface AppConfig {
  defaultProvider: 'openai' | 'anthropic' | 'deepseek';
  defaultModel: string;
  maxIterations: number;
  bashTimeoutMs: number;
  workDir: string;
  /** Phase 3 新增：进化分析使用的模型 */
  evolutionModel?: string;
  /** Phase 3 新增：进化引擎配置 */
  evolutionConfig?: EvolutionConfig;
}

/** 进化引擎配置（Phase 3 新增） */
export interface EvolutionConfig {
  /** 进化评估触发间隔（任务数），默认 10 */
  taskInterval?: number;
  /** Skill 版本验证窗口（执行次数），默认 3 */
  skillValidationWindow?: number;
  /** 经验注入 top-K，默认 3 */
  experienceInjectionTopK?: number;
  /** 经验注入 token 预算，默认 500 */
  experienceInjectionTokenBudget?: number;
  /** 用户评分采集间隔（任务数），默认 3 */
  ratingInterval?: number;
  /** 是否自动应用小优化，默认 true */
  autoApplyMinorChanges?: boolean;
  /** Subagent 模式检测阈值（同类模式次数），默认 5 */
  subagentPatternThreshold?: number;
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

/** Skill 执行记录（Phase 3 增强） */
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
  /** Phase 3 新增：隐式反馈（用户是否采纳了结果） */
  adopted?: boolean;
  /** Phase 3 新增：显式评分（1-5，0 表示未评分） */
  rating?: number;
  /** Phase 3 新增：版本号（执行时的 Skill 版本） */
  skillVersion?: number;
  /** Phase 3 新增：关联的 Session ID */
  sessionId?: string;
}

// ============ Phase 3 新增类型 ============

/** Skill 效果指标（从 SQLite 聚合计算） */
export interface SkillMetrics {
  /** Skill 名称 */
  skillName: string;
  /** 成功率（0-1） */
  successRate: number;
  /** 平均耗时（毫秒） */
  avgDuration: number;
  /** 执行次数 */
  usageCount: number;
  /** 用户满意度（1-5 平均分，0 表示无评分） */
  userSatisfaction: number;
  /** 最后使用时间 */
  lastUsed: string;
  /** 趋势 */
  trend: 'improving' | 'stable' | 'declining';
}

/** Skill 评估结果 */
export interface SkillEvaluationResult {
  skillName: string;
  metrics: SkillMetrics;
  /** 是否需要优化 */
  needsOptimization: boolean;
  /** 触发原因 */
  triggerReasons: string[];
}

/** 优化建议 */
export interface OptimizationSuggestion {
  /** 建议 ID */
  id: string;
  /** Skill 名称 */
  skillName: string;
  /** 当前版本号 */
  currentVersion: number;
  /** 建议严重级别 */
  severity: 'minor' | 'major';
  /** 段落定位（SKILL.md 中的段落标识） */
  section: string;
  /** 修改建议 */
  suggestion: string;
  /** 理由 */
  rationale: string;
  /** 识别的失败模式 */
  failurePatterns: string[];
  /** 生成时间 */
  createdAt: string;
}

/** 经验记录（Phase 3 新增） */
export interface Experience {
  /** 经验 ID */
  id: string;
  /** 时间戳 */
  timestamp: string;
  /** 关联任务 ID */
  taskId: string;
  /** 关联 Session ID */
  sessionId: string;
  /** 任务描述 */
  task: string;
  /** 使用的 Skill（可为 null） */
  skillUsed: string | null;
  /** 使用的 Subagent（可为 null） */
  subagentUsed: string | null;
  /** 执行结果 */
  outcome: 'success' | 'partial' | 'failure';
  /** 执行耗时（毫秒） */
  duration: number;
  /** 关键学习点 */
  keyLearnings: string[];
  /** 标签 */
  tags: string[];
  /** 关联经验 ID 列表 */
  relatedExperiences: string[];
}

/** 知识图谱边（Phase 3 新增） */
export interface KnowledgeEdge {
  /** 边 ID */
  id: string;
  /** 源经验 ID */
  sourceId: string;
  /** 目标经验 ID */
  targetId: string;
  /** 边类型 */
  type: 'same_tag' | 'same_skill' | 'same_subagent';
  /** 权重（共享标签数等） */
  weight: number;
  /** 创建时间 */
  createdAt: string;
}

/** Subagent frontmatter（Phase 3 新增） */
export interface SubagentFrontmatter {
  name: string;
  description: string;
  /** 执行模式 */
  mode: 'autonomous' | 'guided';
  /** 模型（inherit 或具体模型名） */
  model: string;
  /** 可用工具列表 */
  tools: string[];
  /** 触发关键词（可选，辅助 LLM 判断） */
  triggers?: string[];
}

/** Subagent 完整定义（Phase 3 新增） */
export interface SubagentDefinition {
  meta: SubagentFrontmatter;
  /** Markdown 文件路径 */
  path: string;
  /** Markdown 正文内容（frontmatter 之后） */
  content: string;
}

/** Subagent 执行记录（Phase 3 新增） */
export interface SubagentExecutionRecord {
  id: string;
  subagentName: string;
  timestamp: string;
  task: string;
  sessionId: string;
  /** 分支叶节点 ID（fork 的子分支） */
  branchLeafId: string;
  duration: number;
  outcome: 'success' | 'partial' | 'failure';
  summary: string;
}

/** Subagent 指标（Phase 3 新增） */
export interface SubagentMetrics {
  subagentName: string;
  delegationCount: number;
  successRate: number;
  avgDuration: number;
  /** 委派准确率（LLM 判断是否正确的委派） */
  delegationAccuracy: number;
  lastUsed: string;
}

/** 模式检测结果（Phase 3 新增） */
export interface PatternMatch {
  /** 模式签名（任务类型 + 工具组合的 hash） */
  signature: string;
  /** 匹配的任务记录 */
  matchingTasks: TaskRecord[];
  /** 出现次数 */
  count: number;
  /** 建议的 Subagent 名称 */
  suggestedName: string;
  /** 建议的描述 */
  suggestedDescription: string;
}

/** 任务执行记录（用于模式检测，Phase 3 新增） */
export interface TaskRecord {
  taskId: string;
  task: string;
  toolsUsed: string[];
  skillUsed: string | null;
  outcome: string;
  timestamp: string;
}

/** 变更日志条目（Phase 3 新增） */
export interface ChangeEntry {
  /** 变更类型 */
  type: 'skill_optimize' | 'skill_rollback' | 'skill_validate' | 'subagent_create' | 'subagent_optimize';
  /** 目标名称（Skill 或 Subagent 名） */
  target: string;
  /** 版本号 */
  version: number;
  /** 变更描述 */
  description: string;
  /** Git commit hash */
  commitHash?: string;
  /** 时间戳 */
  timestamp: string;
}

/** 进化引擎事件（通知 CLI 层，Phase 3 新增） */
export type EvolutionEvent =
  | { type: 'optimization_proposed'; suggestion: OptimizationSuggestion; skillName: string }
  | { type: 'optimization_applied'; skillName: string; version: number }
  | { type: 'rollback'; skillName: string; version: number; reason: string }
  | { type: 'subagent_proposed'; pattern: PatternMatch }
  | { type: 'subagent_created'; name: string }
  | { type: 'experience_extracted'; experience: Experience }
  | { type: 'rating_request'; taskDescription: string }
  | { type: 'evaluation_complete'; summary: string };

/** 进化事件回调（Phase 3 新增） */
export type EvolutionEventCallback = (event: EvolutionEvent) => void;

/** 任务信息（传给 onTaskComplete，Phase 3 新增） */
export interface TaskInfo {
  task: string;
  skillUsed: string | null;
  subagentUsed: string | null;
  outcome: 'success' | 'partial' | 'failure';
  duration: number;
  toolsUsed: string[];
  sessionId: string;
}

/** Git 日志条目（Phase 3 新增） */
export interface GitLogEntry {
  hash: string;
  message: string;
  author: string;
  timestamp: string;
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
