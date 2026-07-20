import type { Session, Message, SkillMeta } from '@crab-science/shared';
import type { AppConfig } from '@crab-science/shared';
import { SystemPromptBuilder } from './system-prompt.js';

/**
 * Context 构建器
 * 将系统提示 + Session 消息历史组装为 LLM 可用的 context
 */
export class ContextBuilder {
  private systemPromptBuilder: SystemPromptBuilder;

  constructor(systemPromptBuilder?: SystemPromptBuilder) {
    this.systemPromptBuilder = systemPromptBuilder ?? new SystemPromptBuilder();
  }

  /**
   * 构建完整 context
   * @param session - 当前 Session
   * @param skills - 已发现的 Skill 元数据
   * @param config - 应用配置
   * @returns 系统提示 + 消息数组
   */
  build(session: Session, skills: SkillMeta[], config: AppConfig): {
    systemPrompt: string;
    messages: Message[];
  } {
    const systemPrompt = this.systemPromptBuilder.build(skills, config);
    return {
      systemPrompt,
      messages: session.messages,
    };
  }

  /**
   * 获取系统提示词构建器（供外部使用）
   */
  getPromptBuilder(): SystemPromptBuilder {
    return this.systemPromptBuilder;
  }
}
