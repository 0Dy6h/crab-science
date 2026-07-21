import type {
  SkillMeta,
  AppConfig,
  ToolDefinition,
  SubagentFrontmatter,
} from '@crab-science/shared';
import {
  MAX_SYSTEM_PROMPT_TOKENS_PHASE3,
  estimateTokens,
} from '@crab-science/shared';

/** 内置工具名称集合 */
const BUILTIN_TOOL_NAMES = new Set(['read', 'write', 'edit', 'bash']);

/**
 * 系统提示词构建器（Phase 3 升级）
 *
 * 结构：
 * - 角色定义（~100 token）
 * - 工具说明（~250 token，含 extension 工具 + delegate 工具）
 * - Skills 元数据（~100 token）
 * - Subagent 元数据（~100 token，Phase 3 新增）
 * - 相关经验（~500 token，Phase 3 新增）
 * - 工作原则（~200 token）
 *
 * Token 预算：< 2000 token（Phase 3 上调）
 */
export class SystemPromptBuilder {
  /**
   * 构建系统提示词
   * @param skills - 已发现的 Skill 元数据列表
   * @param config - 应用配置
   * @param extensionTools - Extension 注册的工具定义（可选）
   * @param subagents - 已发现的 Subagent 元数据列表（可选，Phase 3 新增）
   * @param experienceText - 检索到的经验注入文本（可选，Phase 3 新增）
   * @returns 系统提示词字符串
   */
  build(
    skills: SkillMeta[],
    config: AppConfig,
    extensionTools?: ToolDefinition[],
    subagents?: SubagentFrontmatter[],
    experienceText?: string,
  ): string {
    const parts: string[] = [];

    // 1. 角色定义
    parts.push(this.buildRole());

    // 2. 工具说明（含 extension 工具 + delegate 工具）
    parts.push(this.buildToolDescriptions(extensionTools, subagents));

    // 3. Skills 元数据
    if (skills.length > 0) {
      parts.push(this.buildSkillMetadata(skills));
    }

    // 4. Subagent 元数据（Phase 3 新增）
    if (subagents && subagents.length > 0) {
      parts.push(this.buildSubagentMetadata(subagents));
    }

    // 5. 相关经验（Phase 3 新增）
    if (experienceText && experienceText.trim().length > 0) {
      parts.push(experienceText);
    }

    // 6. 工作原则
    parts.push(this.buildPrinciples(config));

    const prompt = parts.join('\n\n');

    // Token 预算检查（Phase 3: 2000 token）
    const tokenCount = estimateTokens(prompt);
    if (tokenCount > MAX_SYSTEM_PROMPT_TOKENS_PHASE3) {
      return this.trimPrompt(parts, skills, config, extensionTools, subagents, experienceText);
    }

    return prompt;
  }

  /** 角色定义 */
  private buildRole(): string {
    return `# 角色
你是 Crab-Science，一个可自我进化的科研 AI Agent。你能通过工具调用帮助科研人员完成文献检索、数据分析、论文撰写等任务。
你可以通过 delegate 工具将特定任务委派给专门的 Subagent 执行。`;
  }

  /**
   * 工具说明（含 extension 工具 + delegate 工具）
   */
  private buildToolDescriptions(
    extensionTools?: ToolDefinition[],
    subagents?: SubagentFrontmatter[],
  ): string {
    const builtinLines = [
      '- read: 读取文件内容，支持 glob 模式（如 **/*.csv）',
      '- write: 创建或覆盖文件，自动创建父目录',
      '- edit: 精确编辑文件（old_string → new_string，需唯一匹配）',
      '- bash: 执行 shell 命令',
    ];

    // 添加 extension 工具（过滤掉内置工具名）
    if (extensionTools && extensionTools.length > 0) {
      const extTools = extensionTools.filter(
        (t) => !BUILTIN_TOOL_NAMES.has(t.name),
      );
      for (const tool of extTools) {
        if (tool.name === 'delegate') continue; // delegate 单独添加
        builtinLines.push(`- ${tool.name}: ${tool.description}`);
      }
    }

    // 添加 delegate 工具（如果有 Subagent 可用）
    if (subagents && subagents.length > 0) {
      builtinLines.push(
        '- delegate: 将任务委派给指定的 Subagent 执行（参数: subagent, task）',
      );
    }

    return `# 可用工具\n${builtinLines.join('\n')}`;
  }

  /**
   * Skills 元数据（Progressive Disclosure Level 0）
   */
  private buildSkillMetadata(skills: SkillMeta[]): string {
    const lines = skills.map(
      (s) =>
        `- ${s.name}: ${s.description}${s.version > 1 ? ` (v${s.version})` : ''}`,
    );
    return `# 可用技能（用 read 工具加载 SKILL.md 获取详细指引）\n${lines.join('\n')}`;
  }

  /**
   * Subagent 元数据（Phase 3 新增）
   */
  private buildSubagentMetadata(subagents: SubagentFrontmatter[]): string {
    const lines = subagents.map((s) => {
      const triggers = s.triggers && s.triggers.length > 0
        ? ` [触发: ${s.triggers.join(', ')}]`
        : '';
      return `- ${s.name}: ${s.description}${triggers}`;
    });
    return `# 可用 Subagent（用 delegate 工具委派任务）\n${lines.join('\n')}`;
  }

  /**
   * 工作原则（Phase 3: 新增进化相关指引）
   */
  private buildPrinciples(config: AppConfig): string {
    const isWindows = process.platform === 'win32';
    const osInfo = isWindows
      ? `- 运行环境: Windows — 使用 python 而非 python3；路径用反斜杠 \\ 或正斜杠 /；shell 为 cmd.exe`
      : `- 运行环境: ${process.platform}`;

    return `# 工作原则
- 先理解任务，再行动
- 需要技能时先用 read 工具加载对应的 SKILL.md
- SKILL.md 中引用的附加文件按需用 read 加载
- skill 目录下的脚本用 bash 工具执行
- 遇到适合 Subagent 的任务时，优先使用 delegate 工具委派
- 每步操作后检查结果，调整策略
- 探索不同方案时可建议用户使用 /branch 命令 fork 分支
${osInfo}
- 工作目录: ${config.workDir}
- 最大迭代: ${config.maxIterations} 次`;
  }

  /**
   * 超预算时裁剪提示词
   * 策略：先减少经验注入，再减少 skills 数量
   */
  private trimPrompt(
    parts: string[],
    skills: SkillMeta[],
    config: AppConfig,
    extensionTools?: ToolDefinition[],
    subagents?: SubagentFrontmatter[],
    experienceText?: string,
  ): string {
    // 第一次尝试：去掉经验注入
    let trimmedParts = parts.filter(
      (p) => !p.startsWith('# 相关经验'),
    );
    let prompt = trimmedParts.join('\n\n');

    if (estimateTokens(prompt) <= MAX_SYSTEM_PROMPT_TOKENS_PHASE3) {
      return prompt;
    }

    // 第二次尝试：减少 skills 数量
    let trimmedSkills = [...skills];
    while (
      estimateTokens(prompt) > MAX_SYSTEM_PROMPT_TOKENS_PHASE3 &&
      trimmedSkills.length > 0
    ) {
      trimmedSkills = trimmedSkills.slice(0, -1);
      const newParts = [
        this.buildRole(),
        this.buildToolDescriptions(extensionTools, subagents),
        ...(trimmedSkills.length > 0
          ? [this.buildSkillMetadata(trimmedSkills)]
          : []),
        ...(subagents && subagents.length > 0
          ? [this.buildSubagentMetadata(subagents)]
          : []),
        this.buildPrinciples(config),
      ];
      prompt = newParts.join('\n\n');
    }

    return prompt;
  }
}
