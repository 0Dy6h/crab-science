import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import matter from 'gray-matter';
import type {
  PatternMatch,
  SubagentDefinition,
  SubagentFrontmatter,
} from '@crab-science/shared';
import { nowISO } from '@crab-science/shared';
import type { LLMProvider, LLMOptions } from '@crab-science/llm-layer';
import type { GitManager } from '@crab-science/storage';

/**
 * Subagent 创建器
 *
 * 从检测到的模式生成 Subagent 草案，
 * 用户确认后创建。
 */
export class SubagentCreator {
  private provider: LLMProvider;
  private gitManager: GitManager;

  constructor(provider: LLMProvider, gitManager: GitManager) {
    this.provider = provider;
    this.gitManager = gitManager;
  }

  /**
   * 从模式生成 Subagent 草案
   * @param pattern - 检测到的模式
   * @returns Subagent 定义草案
   */
  async createDraft(pattern: PatternMatch): Promise<SubagentDefinition> {
    // 调用 LLM 生成 Subagent 定义
    const markdown = await this.generateSubagentMarkdown(pattern);

    // 解析生成的 Markdown
    const parsed = matter(markdown);
    const frontmatter = parsed.data as Partial<SubagentFrontmatter>;

    const meta: SubagentFrontmatter = {
      name: frontmatter.name ?? pattern.suggestedName,
      description: frontmatter.description ?? pattern.suggestedDescription,
      mode: frontmatter.mode ?? 'autonomous',
      model: frontmatter.model ?? 'inherit',
      tools: frontmatter.tools ?? ['read', 'write', 'bash'],
      triggers: frontmatter.triggers,
    };

    return {
      meta,
      path: '',
      content: parsed.content,
    };
  }

  /**
   * 保存 Subagent 定义文件
   * @param subagent - Subagent 定义
   * @returns 文件路径
   */
  async save(subagent: SubagentDefinition): Promise<string> {
    const subagentsDir = path.join(os.homedir(), '.crab-science', 'subagents');

    if (!fs.existsSync(subagentsDir)) {
      fs.mkdirSync(subagentsDir, { recursive: true });
    }

    const fileName = `${subagent.meta.name}.md`;
    const filePath = path.join(subagentsDir, fileName);

    // 序列化为 Markdown
    const markdown = matter.stringify(subagent.content, subagent.meta);
    fs.writeFileSync(filePath, markdown, 'utf-8');

    subagent.path = filePath;
    return filePath;
  }

  /**
   * 用户确认后创建
   * 保存文件 + Git commit
   * @param subagent - Subagent 定义
   * @returns commit hash
   */
  async create(subagent: SubagentDefinition): Promise<string> {
    const filePath = await this.save(subagent);

    const commitMessage = `feat(subagent): create ${subagent.meta.name}`;
    const commitHash = await this.gitManager.commit(filePath, commitMessage);

    return commitHash;
  }

  /**
   * 调用 LLM 生成 Subagent Markdown
   */
  private async generateSubagentMarkdown(
    pattern: PatternMatch,
  ): Promise<string> {
    const sampleTasks = pattern.matchingTasks
      .slice(0, 5)
      .map((t, i) => `${i + 1}. ${t.task}`)
      .join('\n');

    const prompt = `你是一个 Subagent 设计专家。根据以下重复任务模式，设计一个 Subagent 的定义文件。

## 模式信息
- 签名: ${pattern.signature}
- 出现次数: ${pattern.count}
- 建议名称: ${pattern.suggestedName}
- 建议描述: ${pattern.suggestedDescription}

## 示例任务
${sampleTasks}

请生成一个 Markdown 文件，包含 YAML frontmatter 和正文。格式如下：

---
name: "${pattern.suggestedName}"
description: "简要描述这个 Subagent 的职责"
mode: "autonomous"
model: "inherit"
tools: ["read", "write", "bash"]
triggers: ["关键词1", "关键词2"]
---

# Subagent 指引

## 职责
（描述这个 Subagent 负责什么类型的任务）

## 工作流程
1. （步骤1）
2. （步骤2）
3. （步骤3）

## 注意事项
- （注意事项1）
- （注意事项2）

请直接返回 Markdown 内容，不要包含其他解释。`;

    const options: LLMOptions = {
      model: '',
      systemPrompt: '你是一个 Subagent 设计专家。请生成 Subagent 定义文件。',
      temperature: 0.5,
      maxTokens: 1024,
    };

    let result = '';
    try {
      const stream = this.provider.complete(
        [{ role: 'user', content: prompt }],
        options,
      );

      for await (const event of stream) {
        if (event.type === 'text_delta') {
          result += event.content;
        }
      }
    } catch (err) {
      console.error('[SubagentCreator] LLM 调用失败:', err);
      // 回退到模板
      return this.generateTemplate(pattern);
    }

    // 如果 LLM 没有返回 frontmatter，补充
    if (!result.includes('---')) {
      return this.generateTemplate(pattern);
    }

    return result;
  }

  /**
   * 生成模板 Subagent 定义（LLM 失败时的回退）
   */
  private generateTemplate(pattern: PatternMatch): string {
    return matter.stringify(
      `# Subagent 指引\n\n## 职责\n${pattern.suggestedDescription}\n\n## 工作流程\n1. 接收任务描述\n2. 执行任务\n3. 返回结果摘要\n\n## 注意事项\n- 保持简洁高效`,
      {
        name: pattern.suggestedName,
        description: pattern.suggestedDescription,
        mode: 'autonomous',
        model: 'inherit',
        tools: ['read', 'write', 'bash'],
      },
    );
  }
}
