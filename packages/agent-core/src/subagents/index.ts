// Subagent 模块统一导出

export type { SubagentMeta } from './types.js';
export type {
  SubagentDefinition,
  SubagentFrontmatter,
  SubagentExecutionRecord,
  SubagentMetrics,
} from '@crab-science/shared';

export { SubagentLoader } from './loader.js';
export { SubagentRegistry } from './registry.js';
export { DelegateTool } from './delegate-tool.js';
export type { DelegateFunction } from './delegate-tool.js';
