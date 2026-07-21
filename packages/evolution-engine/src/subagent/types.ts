// ============================================================
// SubagentDelegator 依赖接口
// 为避免 evolution-engine → agent-core 循环依赖，
// 在此定义与 agent-core 类兼容的接口。
// ============================================================

import type {
  Session,
  Message,
  AppConfig,
  SkillMeta,
  ToolDefinition,
  ToolResult,
  ToolContext,
  SessionNode,
} from '@crab-science/shared';
import type { LLMProvider } from '@crab-science/llm-layer';

/** SessionManager 接口（与 agent-core 的 SessionManager 兼容） */
export interface ISessionManager {
  fork(session: Session, options?: { reason?: string; fromNodeId?: string }): string;
  summarize(
    session: Session,
    branchNodeId: string,
    targetNodeId?: string,
    provider?: LLMProvider,
  ): Promise<string>;
  addNode(
    session: Session,
    node: Omit<SessionNode, 'id' | 'parentId' | 'timestamp' | 'childrenIds'>,
  ): string;
  save(session: Session): void;
}

/** ToolRegistry 接口（与 agent-core 的 ToolRegistry 兼容） */
export interface IToolRegistry {
  getDefinitions(): ToolDefinition[];
  execute(
    name: string,
    params: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolResult>;
}

/** SkillLoader 接口（与 agent-core 的 SkillLoader 兼容） */
export interface ISkillLoader {
  discover(): SkillMeta[];
}

/** ContextBuilder 接口（与 agent-core 的 ContextBuilder 兼容） */
export interface IContextBuilder {
  build(
    session: Session,
    skills: SkillMeta[],
    config: AppConfig,
    extensionTools?: ToolDefinition[],
  ): { systemPrompt: string; messages: Message[] };
}

/** 重新导出共享类型，供 subagent 模块使用 */
export type {
  Session,
  Message,
  AppConfig,
  SkillMeta,
  ToolDefinition,
  ToolResult,
  ToolContext,
  SessionNode,
};
