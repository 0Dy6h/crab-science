import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import type { Skill, SkillMeta } from '@crab-science/shared';
import {
  GLOBAL_SKILLS_DIR,
  PROJECT_SKILLS_DIR,
  expandTilde,
} from '@crab-science/shared';
import type { SkillFrontmatter } from './types.js';

/**
 * Skill 加载器
 * 实现 Progressive Disclosure：
 * - Level 0: discover() 返回 skill name + description（注入系统提示）
 * - Level 1: load(name) 返回完整 SKILL.md 内容（agent 按需 read）
 */
export class SkillLoader {
  private skillsDirs: string[];
  private cache = new Map<string, Skill>();

  constructor(skillsDirs?: string[], projectRoot?: string) {
    if (skillsDirs && skillsDirs.length > 0) {
      this.skillsDirs = skillsDirs;
    } else {
      // 默认：项目级 skills + 全局 skills
      this.skillsDirs = [
        projectRoot ? path.join(projectRoot, PROJECT_SKILLS_DIR) : path.resolve(PROJECT_SKILLS_DIR),
        expandTilde(GLOBAL_SKILLS_DIR),
      ];
    }
  }

  /**
   * 发现所有 Skills（Level 0）
   * 扫描所有 skillsDirs 下的 SKILL.md 文件，解析 YAML frontmatter
   */
  discover(): SkillMeta[] {
    const metas: SkillMeta[] = [];
    const seen = new Set<string>();

    for (const dir of this.skillsDirs) {
      if (!fs.existsSync(dir)) continue;

      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const skillMdPath = path.join(dir, entry.name, 'SKILL.md');
        if (!fs.existsSync(skillMdPath)) continue;
        if (seen.has(entry.name)) continue; // 项目级优先

        try {
          const raw = fs.readFileSync(skillMdPath, 'utf-8');
          const parsed = matter(raw);
          const data = parsed.data as SkillFrontmatter;

          const meta: SkillMeta = {
            name: data.name ?? entry.name,
            description: data.description ?? '',
            version: data.version ?? 1,
          };

          metas.push(meta);
          seen.add(entry.name);
        } catch {
          // 跳过解析失败的文件
        }
      }
    }

    return metas;
  }

  /**
   * 加载完整 Skill（Level 1）
   * @param name - skill 名称
   * @returns Skill 完整对象，未找到返回 null
   */
  load(name: string): Skill | null {
    // 检查缓存
    if (this.cache.has(name)) {
      return this.cache.get(name)!;
    }

    // 在各目录中查找
    for (const dir of this.skillsDirs) {
      const skillMdPath = path.join(dir, name, 'SKILL.md');
      if (fs.existsSync(skillMdPath)) {
        try {
          const raw = fs.readFileSync(skillMdPath, 'utf-8');
          const parsed = matter(raw);
          const data = parsed.data as SkillFrontmatter;

          const skill: Skill = {
            meta: {
              name: data.name ?? name,
              description: data.description ?? '',
              version: data.version ?? 1,
            },
            path: skillMdPath,
            content: raw,
          };

          this.cache.set(name, skill);
          return skill;
        } catch {
          continue;
        }
      }
    }

    return null;
  }

  /**
   * 获取格式化的 skill 元数据字符串（用于系统提示注入）
   */
  getMetadataForPrompt(): string {
    const metas = this.discover();
    if (metas.length === 0) return '';
    const lines = metas.map((m) => `- ${m.name}: ${m.description}`);
    return lines.join('\n');
  }

  /**
   * 获取 skill 文件路径（供 read 工具使用）
   */
  getSkillPath(name: string): string | null {
    for (const dir of this.skillsDirs) {
      const skillMdPath = path.join(dir, name, 'SKILL.md');
      if (fs.existsSync(skillMdPath)) {
        return skillMdPath;
      }
    }
    return null;
  }

  /** 清除缓存 */
  clearCache(): void {
    this.cache.clear();
  }
}
