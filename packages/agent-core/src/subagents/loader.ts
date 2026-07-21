import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import matter from 'gray-matter';
import type {
  SubagentDefinition,
  SubagentFrontmatter,
} from '@crab-science/shared';
import { SUBAGENTS_DIR, expandTilde } from '@crab-science/shared';

/**
 * Subagent 加载器
 *
 * 从 ~/.crab-science/subagents/ 目录加载 Subagent 定义文件（.md）。
 * 类似 SkillLoader，使用 gray-matter 解析 YAML frontmatter。
 *
 * Progressive Disclosure:
 * - Level 0: discover() 返回 name + description（注入系统提示）
 * - Level 1: load(name) 返回完整定义（agent 委派时使用）
 */
export class SubagentLoader {
  private subagentsDir: string;
  private cache = new Map<string, SubagentDefinition>();

  constructor(subagentsDir?: string) {
    this.subagentsDir = expandTilde(subagentsDir ?? SUBAGENTS_DIR);
  }

  /**
   * 发现所有已定义的 Subagent（Level 0）
   * 扫描 subagentsDir 下的 .md 文件，解析 YAML frontmatter
   * @returns SubagentFrontmatter 数组
   */
  discover(): SubagentFrontmatter[] {
    if (!fs.existsSync(this.subagentsDir)) {
      return [];
    }

    const metas: SubagentFrontmatter[] = [];

    try {
      const entries = fs.readdirSync(this.subagentsDir, {
        withFileTypes: true,
      });

      for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (!entry.name.endsWith('.md')) continue;

        const filePath = path.join(this.subagentsDir, entry.name);

        try {
          const raw = fs.readFileSync(filePath, 'utf-8');
          const parsed = matter(raw);
          const data = parsed.data as Partial<SubagentFrontmatter>;

          const meta: SubagentFrontmatter = {
            name: data.name ?? entry.name.replace(/\.md$/, ''),
            description: data.description ?? '',
            mode: data.mode ?? 'autonomous',
            model: data.model ?? 'inherit',
            tools: data.tools ?? ['read', 'write', 'bash'],
            triggers: data.triggers,
          };

          metas.push(meta);
        } catch {
          // 跳过解析失败的文件
        }
      }
    } catch {
      // 目录读取失败，返回空
    }

    return metas;
  }

  /**
   * 加载完整 Subagent 定义（Level 1）
   * @param name - Subagent 名称
   * @returns SubagentDefinition，未找到返回 null
   */
  load(name: string): SubagentDefinition | null {
    // 检查缓存
    if (this.cache.has(name)) {
      return this.cache.get(name)!;
    }

    // 查找文件
    const filePath = path.join(this.subagentsDir, `${name}.md`);
    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = matter(raw);
      const data = parsed.data as Partial<SubagentFrontmatter>;

      const definition: SubagentDefinition = {
        meta: {
          name: data.name ?? name,
          description: data.description ?? '',
          mode: data.mode ?? 'autonomous',
          model: data.model ?? 'inherit',
          tools: data.tools ?? ['read', 'write', 'bash'],
          triggers: data.triggers,
        },
        path: filePath,
        content: parsed.content,
      };

      this.cache.set(name, definition);
      return definition;
    } catch {
      return null;
    }
  }

  /**
   * 获取 Subagent 元数据列表（用于系统提示注入）
   * @returns 格式化的 Subagent 描述字符串
   */
  getMetadataForPrompt(): string {
    const metas = this.discover();
    if (metas.length === 0) return '';

    const lines = metas.map(
      (m) =>
        `- ${m.name}: ${m.description} (mode: ${m.mode}, model: ${m.model})`,
    );
    return lines.join('\n');
  }

  /**
   * 获取 Subagent 目录路径
   */
  getDir(): string {
    return this.subagentsDir;
  }

  /** 清除缓存 */
  clearCache(): void {
    this.cache.clear();
  }
}
