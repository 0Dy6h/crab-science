import type { SkillMeta, AppConfig } from '@crab-science/shared';
import { MAX_SYSTEM_PROMPT_TOKENS, estimateTokens } from '@crab-science/shared';

/**
 * 系统提示词构建器
 * 构建 < 1500 token 的系统提示词
 *
 * 结构：
 * - 角色定义（~100 token）
 * - 工具说明（~200 token）
 * - Skills 元数据（~50 token/skill）
 * - 工作原则（~150 token）
 */
export class SystemPromptBuilder {
  /**
   * 构建系统提示词
   * @param skills - 已发现的 Skill 元数据列表
   * @param config - 应用配置
   * @returns 系统提示词字符串
   */
  build(skills: SkillMeta[], config: AppConfig): string {
    const parts: string[] = [];

    // 1. 角色定义
    parts.push(this.buildRole());

    // 2. 工具说明
    parts.push(this.buildToolDescriptions());

    // 3. Skills 元数据
    if (skills.length > 0) {
      parts.push(this.buildSkillMetadata(skills));
    }

    // 4. 工作原则
    parts.push(this.buildPrinciples(config));

    const prompt = parts.join('\n\n');

    // Token 预算检查
    const tokenCount = estimateTokens(prompt);
    if (tokenCount > MAX_SYSTEM_PROMPT_TOKENS) {
      // 如果超预算，逐步减少 skills 描述
      return this.trimPrompt(parts, skills, config);
    }

    return prompt;
  }

  /** 角色定义 */
  private buildRole(): string {
    return `# 角色
你是 Crab-Science，一个科研 AI Agent。你能通过工具调用帮助科研人员完成文献检索、数据分析、论文撰写等任务。`;
  }

  /** 工具说明 */
  private buildToolDescriptions(): string {
    return `# 可用工具
- read: 读取文件内容，支持 glob 模式（如 **/*.csv）
- write: 创建或覆盖文件，自动创建父目录
- edit: 精确编辑文件（old_string → new_string，需唯一匹配）
- bash: 执行 shell 命令`;
  }

  /** Skills 元数据（Progressive Disclosure Level 0） */
  private buildSkillMetadata(skills: SkillMeta[]): string {
    const lines = skills.map((s) => `- ${s.name}: ${s.description}`);
    return `# 可用技能（用 read 工具加载 SKILL.md 获取详细指引）\n${lines.join('\n')}`;
  }

  /** 工作原则 */
  private buildPrinciples(config: AppConfig): string {
    const isWindows = process.platform === 'win32';
    const osInfo = isWindows
      ? `- 运行环境: Windows — 使用 python 而非 python3；路径用反斜杠 \\ 或正斜杠 /；shell 为 cmd.exe`
      : `- 运行环境: ${process.platform}`;

    return `# 工作原则
- 先理解任务，再行动
- 需要技能时先用 read 工具加载对应的 SKILL.md
- 每步操作后检查结果，调整策略
${osInfo}
- 工作目录: ${config.workDir}
- 最大迭代: ${config.maxIterations} 次`;
  }

  /**
   * 超预算时裁剪提示词
   * 策略：减少 skills 数量直到满足预算
   */
  private trimPrompt(parts: string[], skills: SkillMeta[], config: AppConfig): string {
    let trimmedSkills = [...skills];
    let prompt = parts.join('\n\n');

    while (estimateTokens(prompt) > MAX_SYSTEM_PROMPT_TOKENS && trimmedSkills.length > 0) {
      trimmedSkills = trimmedSkills.slice(0, -1);
      const newParts = [
        this.buildRole(),
        this.buildToolDescriptions(),
        ...(trimmedSkills.length > 0 ? [this.buildSkillMetadata(trimmedSkills)] : []),
        this.buildPrinciples(config),
      ];
      prompt = newParts.join('\n\n');
    }

    return prompt;
  }
}
