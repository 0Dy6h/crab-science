import type {
  Session,
  Message,
  SkillMeta,
  ToolDefinition,
  AppConfig,
} from '@crab-science/shared';
import { SystemPromptBuilder } from './system-prompt.js';
import { TreeUtils } from './session/tree-utils.js';

/**
 * Context 构建器（Phase 2 树形 Session 适配）
 *
 * 将系统提示 + 当前路径消息历史组装为 LLM 可用的 context
 * 从 root → currentNodeId 路径提取消息，分支中的消息不进入 context
 */
export class ContextBuilder {
  private systemPromptBuilder: SystemPromptBuilder;

  constructor(systemPromptBuilder?: SystemPromptBuilder) {
    this.systemPromptBuilder = systemPromptBuilder ?? new SystemPromptBuilder();
  }

  /**
   * 构建完整 context
   * @param session - 当前 Session（树形）
   * @param skills - 已发现的 Skill 元数据
   * @param config - 应用配置
   * @param extensionTools - Extension 注册的工具定义（可选）
   * @returns 系统提示 + 消息数组（从当前路径提取）
   */
  build(
    session: Session,
    skills: SkillMeta[],
    config: AppConfig,
    extensionTools?: ToolDefinition[],
  ): {
    systemPrompt: string;
    messages: Message[];
  } {
    const systemPrompt = this.systemPromptBuilder.build(
      skills,
      config,
      extensionTools,
    );
    const messages = this.extractPathMessages(session);
    return { systemPrompt, messages };
  }

  /**
   * 从当前路径提取消息
   * 从 root → currentNodeId 路径上的所有节点转换为 Message[]
   * @param session - 当前 Session
   * @returns 当前路径的 Message 数组
   */
  private extractPathMessages(session: Session): Message[] {
    if (!session.currentNodeId || !session.rootId) {
      return [];
    }

    const pathNodes = TreeUtils.getPath(
      session.nodes,
      session.rootId,
      session.currentNodeId,
    );

    return pathNodes
      .map((node) => TreeUtils.nodeToMessage(node))
      .filter(Boolean) as Message[];
  }

  /**
   * 获取系统提示词构建器（供外部使用）
   */
  getPromptBuilder(): SystemPromptBuilder {
    return this.systemPromptBuilder;
  }
}
