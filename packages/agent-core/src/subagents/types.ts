// ============================================================
// Agent-Core Subagent 类型定义
// Re-export shared types + agent-core specific types
// ============================================================

export type {
  SubagentDefinition,
  SubagentFrontmatter,
  SubagentExecutionRecord,
  SubagentMetrics,
} from '@crab-science/shared';

/** Subagent 元数据（用于系统提示注入） */
export interface SubagentMeta {
  /** Subagent 名称 */
  name: string;
  /** 描述 */
  description: string;
  /** 执行模式 */
  mode: 'autonomous' | 'guided';
  /** 模型 */
  model: string;
  /** 触发关键词 */
  triggers: string[];
}
