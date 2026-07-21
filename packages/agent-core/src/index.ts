// Crab-Science Agent Core 统一导出
// Phase 2: 新增 TreeUtils, SkillExecutionLogger, Extension 相关
// Phase 3: 新增 Subagent 模块, EvolutionEngine 类型导出

// Agent
export { Agent } from './agent.js';
export type { AgentEvent } from './agent.js';

// Context Builder
export { ContextBuilder } from './context-builder.js';

// System Prompt Builder
export { SystemPromptBuilder } from './system-prompt.js';

// Session
export { SessionManager } from './session/manager.js';
export type { CreateSessionOptions, ForkOptions, BranchInfo, TreeStructure } from './session/types.js';
export { TreeUtils } from './session/tree-utils.js';

// Config
export { ConfigManager } from './config/manager.js';

// Tools
export { ToolRegistry } from './tools/index.js';
export type { Tool, ToolContext } from './tools/types.js';
export { ReadTool, WriteTool, EditTool, BashTool } from './tools/index.js';

// Skills
export { SkillLoader } from './skills/loader.js';
export type { Skill, SkillMeta, SkillFrontmatter } from './skills/types.js';
export { SkillExecutionLogger } from './skills/execution-logger.js';
export type { SkillExecutionRecord } from '@crab-science/shared';

// Extensions
export { ExtensionLoader } from './extensions/loader.js';
export type { LoadedExtension } from './extensions/types.js';

// Subagents (Phase 3 新增)
export { SubagentLoader } from './subagents/loader.js';
export { SubagentRegistry } from './subagents/registry.js';
export { DelegateTool } from './subagents/delegate-tool.js';
export type { DelegateFunction } from './subagents/delegate-tool.js';
export type { SubagentMeta } from './subagents/types.js';
export type {
  SubagentDefinition,
  SubagentFrontmatter,
  SubagentExecutionRecord,
  SubagentMetrics,
} from '@crab-science/shared';
